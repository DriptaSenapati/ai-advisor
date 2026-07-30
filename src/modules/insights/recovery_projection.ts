import { computeStats, robustMeanStd } from "../stats/robust.js";

/**
 * The evidence behind a recommendation.
 *
 * A recommendation that says "save ₹4,000/month" is an assertion. This turns it into an
 * argument: here is what your savings have actually done, here is where they go if nothing
 * changes, and here is where they go if you do this — with the uncertainty drawn in rather
 * than hidden. The gap between the two forward paths is the whole point, which is why the
 * series are **cumulative**: two monthly-rate lines run parallel and prove nothing visually,
 * while two cumulative lines diverge and the divergence is the size of the decision.
 *
 * Deterministic on purpose. The goal advisor owns Monte Carlo (10,000 sims, bootstrap
 * fitting, feasibility bands) because a goal has a target and a deadline to be feasible
 * *against*. This has neither — it is a trajectory comparison — and a simulation here would
 * cost seconds per report to answer a question closed-form arithmetic answers exactly.
 *
 * Every series is precomputed, including one per recommendation. The frontend toggles
 * between them; it does not do arithmetic. Recomputing a projection client-side would put a
 * second implementation of this in the UI, which is the rule `CLAUDE.md` states plainly.
 */

const FORECAST_MONTHS = 12;

/** z-scores for the p10 / p90 edges of a normal distribution. */
const Z_P10 = -1.2816;
const Z_P90 = 1.2816;

export interface RecoveryProjection {
    /** "YYYY-MM" of the actual months, ascending. */
    historyMonths: string[];
    /** Cumulative net savings at the end of each actual month. */
    actualCumulative: number[];
    /** The 12 "YYYY-MM" months after the last actual one. */
    forecastMonths: string[];
    /** Forward cumulative paths, all anchored to the last `actualCumulative` value. */
    baselineP10: number[];
    baselineP50: number[];
    baselineP90: number[];
    /** Baseline plus every recommendation's monthly impact. */
    planP50: number[];
    /**
     * Baseline plus one recommendation, keyed by its slug.
     *
     * `impact` is the **bounded** monthly figure this path was built from, which may be less
     * than the recommendation's own `monthlySavingImpact`. Stated rather than left to be
     * inferred from the series: the UI needs it to print a figure that agrees with the chart,
     * and back-solving it out of `p50[0]` would put a copy of this arithmetic in the browser.
     */
    perRecommendation: { slug: string; p50: number[]; impact: number }[];
    /** Monthly surplus the baseline assumes, and what the full plan would make it. */
    monthlyBaseline: number;
    monthlyWithPlan: number;
    /** How much further ahead the full plan is at month 12 — the headline number. */
    gapAt12m: number;
    /** Months excluded from the baseline as IQR dips, as indices into `historyMonths`. */
    excludedDipMonths: string[];
    /**
     * Recommendations whose claimed impact was reduced to a defensible ceiling.
     *
     * Surfaced rather than applied silently: a reader comparing the card's ₹ figure with the
     * chart's would otherwise find them disagreeing with no explanation.
     */
    clampedSlugs: string[];
    /** False when there was too little history to project from; the UI hides the chart. */
    isProjectable: boolean;
}

function nextMonths(lastMonth: string, count: number): string[] {
    const [y, m] = lastMonth.split("-").map(Number) as [number, number];
    const out: string[] = [];
    for (let i = 1; i <= count; i++) {
        const d = new Date(y, m - 1 + i, 1);
        out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
}

/**
 * A straight cumulative path from `anchor`, adding `perMonth` each month.
 *
 * `spread` widens with √month rather than linearly: month-to-month savings are roughly
 * independent, so the variance of a sum grows with n and the standard deviation with √n.
 * A linear cone would overstate the uncertainty of month 12 by more than 3×.
 */
function cumulativePath(anchor: number, perMonth: number, months: number, spread = 0): number[] {
    const out: number[] = [];
    for (let i = 1; i <= months; i++) {
        out.push(Math.round(anchor + perMonth * i + spread * Math.sqrt(i)));
    }
    return out;
}

export interface MonthlyNet {
    month: string;
    netSavings: number;
}

export interface RecommendationImpact {
    slug: string;
    monthlySavingImpact: number;
    category?: string | null;
}

/**
 * Ceilings for what a recommendation may claim to save each month.
 *
 * `categoryMedians` is that category's median monthly spend; `medianMonthlyExpenses` is the
 * fallback for a recommendation that names no category.
 */
export interface ImpactBounds {
    medianMonthlyExpenses: number;
    categoryMedians: Record<string, number>;
}

/**
 * The most a recommendation can honestly claim, per month.
 *
 * **You cannot save more on a thing than you spend on it.** The prompt says so and the model
 * mostly obeys, but "mostly" is not good enough when the number becomes a *line on a chart*:
 * one run produced ₹1,00,250/month of claimed savings against a ₹862/month baseline — a 117×
 * jump — because it counted a one-off ₹1,00,000 transfer and a one-time ₹20,000 dispute
 * recovery as recurring monthly reductions. Rendered, that is a near-vertical plan line
 * against a flat baseline: not merely optimistic but visibly absurd, which discredits the
 * numbers on the page that are right.
 *
 * So the ceiling is enforced here, deterministically, from the user's own history. Bounding
 * to the *median* rather than the mean matters for the same reason the baseline is robust:
 * the single ₹3.14 lakh month that produced the inflated claim would otherwise raise the
 * ceiling that is supposed to catch it.
 */
function boundImpact(rec: RecommendationImpact, bounds: ImpactBounds): number {
    const claimed = Math.max(0, rec.monthlySavingImpact);
    const ceiling = rec.category
        ? bounds.categoryMedians[rec.category] ?? bounds.medianMonthlyExpenses
        : bounds.medianMonthlyExpenses;
    if (ceiling <= 0) return claimed;
    return Math.min(claimed, ceiling);
}

/**
 * @param monthly    every `MonthlyStats` row's `{month, netSavings}`, ascending by month
 * @param recommendations the LLM's recommendations; impacts are floored at 0 and capped by `bounds`
 * @param bounds     per-category and overall ceilings — see {@link boundImpact}
 */
export function buildRecoveryProjection(
    monthly: MonthlyNet[],
    recommendations: RecommendationImpact[],
    bounds: ImpactBounds,
): RecoveryProjection {
    const historyMonths = monthly.map(m => m.month);
    const nets = monthly.map(m => m.netSavings);

    let running = 0;
    const actualCumulative = nets.map(n => (running += n, Math.round(running)));

    const empty: RecoveryProjection = {
        historyMonths, actualCumulative,
        forecastMonths: [], baselineP10: [], baselineP50: [], baselineP90: [],
        planP50: [], perRecommendation: [],
        monthlyBaseline: 0, monthlyWithPlan: 0, gapAt12m: 0,
        excludedDipMonths: [], clampedSlugs: [], isProjectable: false,
    };

    // Three months is the floor for saying anything about a trend. Below that the "band"
    // would be wider than the projection and the chart would be an honest way of showing
    // that we don't know — which is still worse than not drawing it.
    if (monthly.length < 3) return empty;

    // Only the recent window. A 15-month account whose habits changed in month 9 should not
    // be projected from the year that preceded the change.
    const window = nets.slice(-6);
    const windowMonths = historyMonths.slice(-6);

    // Robust, so a single catastrophic month does not set the baseline for the next year.
    // `outlierIndices` are dips excluded from the mean — surfaced so the UI can say which
    // months were left out rather than presenting a baseline that silently ignores them.
    const { mean: robustMean, outlierIndices } = robustMeanStd(window);
    const excludedDipMonths = outlierIndices.map(i => windowMonths[i]!).filter(Boolean);

    // Spread comes from the *full* history, not the robust window: the band exists to show
    // how much this number actually moves month to month, and excluding the volatile months
    // from the volatility estimate would draw a confidently narrow band around a series
    // that has never behaved that way.
    const { std } = computeStats(nets);

    const monthlyBaseline = Math.round(robustMean);

    // Bound every claim before any of it reaches a series, so the cards and the chart cannot
    // tell different stories.
    const bounded = recommendations.map(r => ({
        slug: r.slug,
        impact: boundImpact(r, bounds),
        claimed: Math.max(0, r.monthlySavingImpact),
    }));
    const clampedSlugs = bounded.filter(b => b.impact < b.claimed).map(b => b.slug);

    const totalImpact = bounded.reduce((s, b) => s + b.impact, 0);
    const monthlyWithPlan = Math.round(monthlyBaseline + totalImpact);

    const anchor = actualCumulative[actualCumulative.length - 1] ?? 0;
    const lastMonth = historyMonths[historyMonths.length - 1]!;
    const forecastMonths = nextMonths(lastMonth, FORECAST_MONTHS);

    const baselineP50 = cumulativePath(anchor, monthlyBaseline, FORECAST_MONTHS);
    const baselineP10 = cumulativePath(anchor, monthlyBaseline, FORECAST_MONTHS, Z_P10 * std);
    const baselineP90 = cumulativePath(anchor, monthlyBaseline, FORECAST_MONTHS, Z_P90 * std);
    const planP50 = cumulativePath(anchor, monthlyWithPlan, FORECAST_MONTHS);

    const perRecommendation = bounded.map(b => ({
        slug: b.slug,
        p50: cumulativePath(anchor, monthlyBaseline + b.impact, FORECAST_MONTHS),
        impact: Math.round(b.impact),
    }));

    return {
        historyMonths, actualCumulative, forecastMonths,
        baselineP10, baselineP50, baselineP90, planP50, perRecommendation,
        monthlyBaseline, monthlyWithPlan,
        gapAt12m: Math.round(totalImpact * FORECAST_MONTHS),
        excludedDipMonths,
        clampedSlugs,
        isProjectable: true,
    };
}
