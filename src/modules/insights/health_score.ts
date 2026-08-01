import { computeStats, median } from "../stats/robust.js";

/**
 * How an account is doing, as four drivers a person can act on.
 *
 * ---
 *
 * **Deterministic, and that is the entire point.** The LLM would happily produce a score, but a
 * number that moves between two runs over identical statements is not a measurement — it is a
 * mood, and nobody can audit it or watch it improve. Every driver is a stated arithmetic
 * condition over figures already on disk; `npm run check:health` computes the whole thing twice
 * over the real database and asserts equality.
 *
 * **Four drivers, not five components.** An earlier cut scored "months in deficit" and
 * "month-to-month swing" separately, which is correct arithmetic and the wrong unit of
 * explanation: both answer *is your cash flow reliable?*, and splitting them gave a reader two
 * bars to reconcile instead of one thing to fix. They are now the two halves of `cash_flow`,
 * weighted 60/40, and the detail line states both figures.
 *
 * **Every driver carries what would improve it, costed from the user's own numbers.** A score
 * that only grades is a report card; the point of this one is that each line ends in something
 * to do. Those sentences are computed, never written by a model, so they cannot recommend a
 * figure the score does not agree with.
 */

export type RiskLevel = "low" | "medium" | "high";

export type HealthDriverKey =
    | "savings"
    | "cash_flow"
    | "money_at_risk"
    | "committed_spending";

export interface HealthDriver {
    key: HealthDriverKey;
    /** Display name, safe to render as-is. */
    label: string;
    /** What this driver measures, in plain English. Constant per driver. */
    explanation: string;
    /** Share of the 100 points this driver can contribute. */
    weight: number;
    /** 0–100, before weighting. */
    score: number;
    /** `score × weight / 100`, rounded — the points this driver actually contributed. */
    contribution: number;
    /** The measured figure behind the score. */
    detail: string;
    /** One concrete thing that would move it, costed from this account's own figures. */
    improvement: string;
    /**
     * Change in `contribution` against the previous report, or `null` when there is no
     * previous report to compare with.
     *
     * **Null is not zero.** "Nothing to compare with" and "no change" are different facts and
     * only one of them deserves an arrow next to it.
     */
    trend: number | null;
}

export interface HealthScore {
    /** 0–100, rounded. */
    score: number;
    riskLevel: RiskLevel;
    drivers: HealthDriver[];
}

export interface HealthMonth {
    month: string;
    totalIncome: number;
    totalExpenses: number;
    netSavings: number;
    /** Percentage points, not a fraction — `(net / income) * 100`, negative when overspent. */
    savingsRate: number;
}

export interface HealthFlag {
    severity: string;
    /** Money at stake, which is not the transaction's value. See `TransactionFlag`. */
    amount: number;
    /** `null` for the two pattern-level kinds; those cannot collide and are counted whole. */
    transactionId: string | null;
}

export interface HealthScoreInput {
    monthly: HealthMonth[];
    /** Σ active recurring debits, already normalised to a month. */
    committedMonthly: number;
    /** The part of `committedMonthly` the detector marked `cancellable`. */
    cancellableMonthly: number;
    flags: HealthFlag[];
    /**
     * Extra monthly surplus to assume before scoring — the plan's total bounded impact.
     *
     * Used to answer "and what would this be if I did all of it", which is the number the
     * overview's hero leads with. See {@link scoreAfterPlan}.
     */
    planMonthlyImpact?: number;
}

/** Linear between two named thresholds, clamped to 0–100 outside them. */
function band(value: number, atZero: number, atHundred: number): number {
    if (atHundred === atZero) return 100;
    return Math.max(0, Math.min(100, ((value - atZero) / (atHundred - atZero)) * 100));
}

/**
 * **The sign goes before the symbol, and it is a real minus.**
 *
 * `₹${(-16564).toLocaleString()}` produces `₹-16,564` — the minus lands *inside* the amount,
 * after the currency symbol, which reads as a typo rather than as a negative. And a hyphen is
 * not a minus: U+2212 matches the width of the digits beside it in a `tabular-nums` column,
 * where a hyphen is visibly narrower. `formatSignedMoney` in the UI makes the same two choices.
 */
const money = (n: number) => {
    const rounded = Math.round(n);
    return `${rounded < 0 ? "−" : ""}₹${Math.abs(rounded).toLocaleString("en-IN")}`;
};
/** Same rule as {@link money}: a real minus (U+2212), not a hyphen. */
const pct = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;

/** Target savings rate, in percentage points. Full marks, and what `improvement` aims at. */
const TARGET_SAVINGS_RATE = 30;

/**
 * Total flagged money, deduplicated per transaction.
 *
 * **One payment can trip several detectors** — a large transfer is legitimately both a
 * `merchant_outlier` and a `large_opaque_transfer` — so summing every row double-counts it.
 * `getFlagSummary` made exactly this mistake once and overstated "at stake" by 81% on real
 * data; the fix there was to keep the largest flag per transaction, and this must agree with it
 * or the score and the figure beside it describe different accounts.
 */
function dedupedExposure(flags: HealthFlag[]): number {
    const largestPerTransaction = new Map<string, number>();
    let loose = 0;
    for (const f of flags) {
        const amount = Math.max(0, f.amount);
        if (f.transactionId === null) {
            loose += amount;
            continue;
        }
        largestPerTransaction.set(
            f.transactionId,
            Math.max(largestPerTransaction.get(f.transactionId) ?? 0, amount)
        );
    }
    let total = loose;
    for (const amount of largestPerTransaction.values()) total += amount;
    return total;
}

export function computeHealthScore(input: HealthScoreInput): HealthScore {
    const { committedMonthly, cancellableMonthly, flags } = input;
    const uplift = input.planMonthlyImpact ?? 0;

    /**
     * The plan's impact is applied to every month before anything is measured.
     *
     * It is counterfactual by construction — "what this year would have looked like had you
     * been doing this all along" — which is exactly what "43 after completing the plan" means.
     * Applying it to the *forward* months instead would need a forecast, and this scorer
     * deliberately has none: `recovery_projection.ts` owns the future.
     */
    const monthly = uplift
        ? input.monthly.map((m) => {
              const netSavings = m.netSavings + uplift;
              return {
                  ...m,
                  netSavings,
                  savingsRate: m.totalIncome > 0 ? (netSavings / m.totalIncome) * 100 : m.savingsRate,
              };
          })
        : input.monthly;

    const monthCount = monthly.length;
    const nets = monthly.map((m) => m.netSavings);
    const medianIncome = median(monthly.map((m) => m.totalIncome));
    const medianExpenses = median(monthly.map((m) => m.totalExpenses));

    /* ---- Savings (30) --------------------------------------------------------
       The median month, not the mean: one bonus month should not describe a year.
       0% is the floor because a month that saves nothing is the failure being
       measured; 30% is a strong personal rate and earns full marks. */
    const medianRate = median(monthly.map((m) => m.savingsRate));
    const savingsScore = band(medianRate, 0, TARGET_SAVINGS_RATE);
    /** What monthly increase would reach the target rate, from this account's own income. */
    const rateGap = Math.max(0, ((TARGET_SAVINGS_RATE - medianRate) / 100) * medianIncome);

    const savings: HealthDriver = {
        key: "savings",
        label: "Savings",
        explanation:
            "How much of what comes in you actually keep, in a typical month. This is the single biggest driver, because everything else is easier when there is a surplus.",
        weight: 30,
        score: savingsScore,
        contribution: 0,
        detail: `${pct(medianRate)} of income kept in the median month`,
        improvement:
            savingsScore >= 100
                ? "Already at the level this measures against — hold it."
                : `Keeping ${money(rateGap)} more a month would take this to full marks.`,
        trend: null,
    };

    /* ---- Cash flow (30) ------------------------------------------------------
       Two halves of one question: how often you go backwards, and how far the
       figure swings. An account that saves ₹20,000 every month and one that
       alternates ₹60,000 and −₹20,000 have the same mean and are not in the same
       situation — the second cannot be planned around. */
    const deficits = nets.filter((n) => n < 0).length;
    const deficitShare = monthCount > 0 ? deficits / monthCount : 0;
    const deficitScore = band(deficitShare, 0.5, 0);

    const { mean: meanNet, std: stdNet } = computeStats(nets);
    // Measured against |mean| so an overspending account is not rewarded for being
    // *consistently* bad. With no mean to divide by, spread has no scale and the honest
    // answer is to say nothing rather than guess.
    const cv = Math.abs(meanNet) > 0 ? stdNet / Math.abs(meanNet) : null;
    const swingScore = cv === null ? 50 : band(cv, 2, 0.5);

    const cashFlowScore = 0.6 * deficitScore + 0.4 * swingScore;
    /** What each deficit month was short by, on average — the figure that would close them. */
    const deficitMonths = nets.filter((n) => n < 0);
    const avgShortfall = deficitMonths.length
        ? Math.abs(deficitMonths.reduce((s, n) => s + n, 0) / deficitMonths.length)
        : 0;

    const cashFlow: HealthDriver = {
        key: "cash_flow",
        label: "Cash flow",
        explanation:
            "How often you end a month behind, and how much the figure jumps around. A predictable surplus can be planned with; a volatile one cannot, even when it averages out.",
        weight: 30,
        score: cashFlowScore,
        contribution: 0,
        detail:
            `${deficits} of ${monthCount} month${monthCount === 1 ? "" : "s"} spent more than came in` +
            (cv === null
                ? ""
                : `, swinging ±${money(stdNet)} around ${money(meanNet)}`),
        improvement:
            deficits === 0
                ? swingScore >= 100
                    ? "Steady and always in surplus — nothing to fix here."
                    : "Evening out the month-to-month swing is what is left to gain here."
                : `Finding ${money(avgShortfall)} in each of those ${deficits} month${deficits === 1 ? "" : "s"} would clear the deficits.`,
        trend: null,
    };

    /* ---- Money at risk (25) --------------------------------------------------
       What the detectors put at stake, as a share of a typical month's spending so
       it means the same thing on any size of account. A full month of expenses is
       the floor. High-severity findings take a further bite because severity is a
       statement about certainty as well as size — capped, so a long tail of small
       `high` flags cannot outweigh the amount itself. */
    const exposure = dedupedExposure(flags);
    const highCount = flags.filter((f) => f.severity === "high").length;
    const exposureShare = medianExpenses > 0 ? exposure / medianExpenses : 0;
    const severityPenalty = Math.min(20, highCount * 4);
    const riskScore = Math.max(0, band(exposureShare, 1, 0) - severityPenalty);

    const moneyAtRisk: HealthDriver = {
        key: "money_at_risk",
        label: "Money at risk",
        explanation:
            "Payments our checks flagged as recoverable or avoidable — duplicates, fees, price rises and transfers well outside your own pattern. Not money you have lost, money worth a second look.",
        weight: 25,
        score: riskScore,
        contribution: 0,
        detail:
            flags.length === 0
                ? "Nothing looked wrong"
                : `${money(exposure)} at stake across ${flags.length} finding${flags.length === 1 ? "" : "s"}` +
                  (highCount > 0 ? `, ${highCount} needing attention` : ""),
        improvement:
            flags.length === 0
                ? "Nothing flagged — this is as good as it gets."
                : highCount > 0
                  ? `Working through the ${highCount} marked "act on this" is where the recoverable money is.`
                  : "Reviewing the findings would confirm whether any of it is recoverable.",
        trend: null,
    };

    /* ---- Committed spending (15) ---------------------------------------------
       How much of a typical month's income is already spoken for before any
       decision is made. Under a fifth is comfortable; past three fifths there is
       very little left to steer with, whatever the savings rate looks like. */
    const committedShare = medianIncome > 0 ? committedMonthly / medianIncome : null;
    const committedScore = committedShare === null ? 50 : band(committedShare, 0.6, 0.2);

    const committedSpending: HealthDriver = {
        key: "committed_spending",
        label: "Committed spending",
        explanation:
            "Subscriptions, EMIs and standing commitments — money that leaves every month whether you decide anything or not. The lower this is, the more of your income you can actually steer.",
        weight: 15,
        score: committedScore,
        contribution: 0,
        detail:
            committedShare === null
                ? "No income detected to measure commitments against"
                : `${money(committedMonthly)} a month committed — ${pct(committedShare * 100)} of income`,
        improvement:
            cancellableMonthly > 0
                ? `${money(cancellableMonthly)} a month of this is cancellable.`
                : committedScore >= 100
                  ? "Comfortably low — nothing here is holding the score back."
                  : "None of it is marked cancellable, so this one moves slowly.",
        trend: null,
    };

    const drivers = [savings, cashFlow, moneyAtRisk, committedSpending];
    for (const d of drivers) d.contribution = Math.round((d.score * d.weight) / 100);

    // Summed from the unrounded scores, so the total is not the accumulation of four
    // rounding errors — `contribution` is for display and may differ from it by a point.
    const score = Math.round(
        drivers.reduce((sum, d) => sum + (d.score * d.weight) / 100, 0)
    );

    return { score, riskLevel: riskLevelFor(score), drivers };
}

/**
 * The same score with the plan's monthly impact applied — "15 → 43 after completing the plan".
 *
 * Thin on purpose: the counterfactual belongs inside `computeHealthScore` so there is exactly
 * one scoring implementation and the before/after figures cannot be computed two different ways.
 */
export function scoreAfterPlan(input: HealthScoreInput, planMonthlyImpact: number): HealthScore {
    return computeHealthScore({ ...input, planMonthlyImpact });
}

/**
 * Fill in each driver's `trend` from the previous report's drivers.
 *
 * Matched by `key`, never by position — a positional pairing between two stored arrays is the
 * failure the miscounted-batch incident was about, and a driver reordered in a later release
 * would silently attribute one driver's movement to another.
 */
export function withTrends(current: HealthScore, previous: HealthDriver[] | null): HealthScore {
    if (!previous?.length) return current;
    const byKey = new Map(previous.map((d) => [d.key, d]));
    return {
        ...current,
        drivers: current.drivers.map((d) => {
            const before = byKey.get(d.key);
            return before ? { ...d, trend: d.contribution - before.contribution } : d;
        }),
    };
}

/**
 * Bands on the score itself, so the word and the number can never disagree.
 *
 * 70 is where every driver would have to be at least adequate; below 45 at least two of them
 * are failing outright.
 */
export function riskLevelFor(score: number): RiskLevel {
    if (score >= 70) return "low";
    if (score >= 45) return "medium";
    return "high";
}
