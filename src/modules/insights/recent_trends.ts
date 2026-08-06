import { computeMean } from "../stats/robust.js";

/**
 * "What's good now" and "what's bad now" — the last 6 months against everything before them.
 *
 * ---
 *
 * **This answers a question the lifetime health score can't.** `HealthDriver`s (savings, cash
 * flow, money at risk, committed spending) score the account's *whole* history in one number
 * each — real, but silent on direction: a driver stuck at a low score says nothing about
 * whether the last 6 months have been getting better or worse against the months before that.
 * This module is exactly that comparison, picked down to the one clearest improvement and the
 * one clearest deterioration, each as a single sentence for the verdict.
 *
 * **Two pools of candidates, each judged by its own rule for "good":**
 * - Every spend category — less money out is the improvement, more is the concern. One
 *   exception: `Finance & Investments` inverts (more going in is the improvement — it's
 *   contributions, not spend).
 * - Net savings — more money kept is the improvement, same as every category except that one.
 *
 * Both compare the mean of the most recent window against the mean of every month before it,
 * and only a candidate with **both** a real ₹ size and a real relative size counts — a category
 * that moved from ₹50 to ₹150 a month is a 200% change and financially nothing at all. Whichever
 * candidate improved the most becomes "good"; whichever worsened the most becomes "bad". Either
 * can come back `null` — an account with nothing that clearly improved, or nothing that clearly
 * worsened, gets silence instead of a manufactured claim.
 *
 * **The recent window itself has two tiers, so a newer account isn't silent for months longer
 * than it has to be.** At `LONG_FLOOR` (8) months or more, "recent" is the last `LONG_WINDOW` (6)
 * against everything before — the original comparison, kept because six months is long enough
 * that both halves are a real season, not a handful of transactions either way. Between
 * `SHORT_FLOOR` (5) and `LONG_FLOOR` months, "recent" narrows to the last `SHORT_WINDOW` (3)
 * against whatever's left — still at least 2 prior months to compare against, the same floor the
 * 6-month tier keeps. Below `SHORT_FLOOR`, there is no honest "before" left to compare against at
 * all, and both cards stay `null` rather than comparing 3 months against 1 or 2.
 */

export interface TrendHighlight {
    label: string;
    kind: "category" | "net_savings";
    recentAvg: number;
    priorAvg: number;
    sentence: string;
}

export interface RecentTrendSummary {
    good: TrendHighlight | null;
    bad: TrendHighlight | null;
}

type CategoryRow = { category: string; totalSpend: number };
type MonthlyStatsRow = { month: string; netSavings: number; categoryBreakdown: unknown };

function categoriesOf(row: MonthlyStatsRow): CategoryRow[] {
    return Array.isArray(row.categoryBreakdown) ? (row.categoryBreakdown as CategoryRow[]) : [];
}

const LONG_WINDOW = 6;
const LONG_FLOOR = LONG_WINDOW + 2;
const SHORT_WINDOW = 3;
const SHORT_FLOOR = 5;

/** A candidate must clear both bars to count — small money moving a lot, or big money moving
    a little, are both noise for this purpose. */
const MIN_ABSOLUTE_DELTA = 500;
const MIN_RELATIVE_DELTA = 0.15;

/** Which recent-window size applies, or `null` when even the short tier has no honest
    "before" to compare against. Exported so a test can assert the tier boundary directly. */
export function recentWindowFor(totalMonths: number): number | null {
    if (totalMonths >= LONG_FLOOR) return LONG_WINDOW;
    if (totalMonths >= SHORT_FLOOR) return SHORT_WINDOW;
    return null;
}

interface Candidate {
    label: string;
    kind: "category" | "net_savings";
    recentAvg: number;
    priorAvg: number;
    /** Positive = improvement, negative = deterioration, already sign-corrected per candidate. */
    improvement: number;
}

function sentenceFor(c: Candidate, direction: "good" | "bad", window: number): string {
    const fmt = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;
    if (c.kind === "net_savings") {
        return direction === "good"
            ? `Your net monthly savings have improved from ${fmt(c.priorAvg)} to ${fmt(c.recentAvg)} over the last ${window} months — real progress against where things stood before.`
            : `Your net monthly savings have slipped from ${fmt(c.priorAvg)} to ${fmt(c.recentAvg)} over the last ${window} months — worse than the months before that.`;
    }
    const risingIsGood = c.label === "Finance & Investments";
    const rose = c.recentAvg > c.priorAvg;
    if (risingIsGood) {
        return direction === "good"
            ? `${c.label} contributions have grown from ${fmt(c.priorAvg)}/mo to ${fmt(c.recentAvg)}/mo over the last ${window} months.`
            : `${c.label} contributions have dropped from ${fmt(c.priorAvg)}/mo to ${fmt(c.recentAvg)}/mo over the last ${window} months — investing less than before.`;
    }
    return direction === "good"
        ? `${c.label} spending has fallen from ${fmt(c.priorAvg)}/mo to ${fmt(c.recentAvg)}/mo over the last ${window} months.`
        : `${c.label} spending has ${rose ? "risen" : "stayed high, moving"} from ${fmt(c.priorAvg)}/mo to ${fmt(c.recentAvg)}/mo over the last ${window} months — a new pressure that wasn't there before.`;
}

export function computeRecentTrends(monthly: MonthlyStatsRow[]): RecentTrendSummary {
    const window = recentWindowFor(monthly.length);
    if (window === null) return { good: null, bad: null };

    const recent = monthly.slice(-window);
    const prior = monthly.slice(0, -window);

    const candidates: Candidate[] = [];

    // Net savings.
    const recentNet = computeMean(recent.map((m) => m.netSavings));
    const priorNet = computeMean(prior.map((m) => m.netSavings));
    candidates.push({
        label: "Net savings",
        kind: "net_savings",
        recentAvg: recentNet,
        priorAvg: priorNet,
        improvement: recentNet - priorNet,
    });

    // Every category that appears in either window.
    const categories = new Set<string>();
    for (const m of [...recent, ...prior]) for (const c of categoriesOf(m)) categories.add(c.category);

    for (const category of categories) {
        const recentVals = recent.map((m) => categoriesOf(m).find((c) => c.category === category)?.totalSpend ?? 0);
        const priorVals = prior.map((m) => categoriesOf(m).find((c) => c.category === category)?.totalSpend ?? 0);
        const recentAvg = computeMean(recentVals);
        const priorAvg = computeMean(priorVals);
        const risingIsGood = category === "Finance & Investments";
        const rawDelta = recentAvg - priorAvg;
        candidates.push({
            label: category,
            kind: "category",
            recentAvg,
            priorAvg,
            improvement: risingIsGood ? rawDelta : -rawDelta,
        });
    }

    const meaningful = candidates.filter((c) => {
        const absDelta = Math.abs(c.recentAvg - c.priorAvg);
        const base = Math.max(c.priorAvg, c.recentAvg, 1);
        return absDelta >= MIN_ABSOLUTE_DELTA && absDelta / base >= MIN_RELATIVE_DELTA;
    });

    const good = meaningful
        .filter((c) => c.improvement > 0)
        .sort((a, b) => b.improvement - a.improvement)[0];
    const bad = meaningful
        .filter((c) => c.improvement < 0)
        .sort((a, b) => a.improvement - b.improvement)[0];

    return {
        good: good
            ? { label: good.label, kind: good.kind, recentAvg: good.recentAvg, priorAvg: good.priorAvg, sentence: sentenceFor(good, "good", window) }
            : null,
        bad: bad
            ? { label: bad.label, kind: bad.kind, recentAvg: bad.recentAvg, priorAvg: bad.priorAvg, sentence: sentenceFor(bad, "bad", window) }
            : null,
    };
}
