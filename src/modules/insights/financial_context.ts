import { median } from "../stats/robust.js";

/**
 * Habit vs. event, and which direction — the classification the recommendation pipeline was
 * missing, and the data behind the Overview's "Events & Habits" section.
 *
 * ---
 *
 * **The problem this exists to fix.** A single ₹3,50,000 transfer in one month — a wedding, a
 * house down payment, a medical bill — used to read to the LLM exactly like twelve months of
 * gradually creeping Shopping spend: both just show up as an elevated category total. The model
 * would recommend "reduce Transfers & Payments" against a one-time life event, which is advice
 * nobody can act on and every reader immediately distrusts, because it *is* wrong — you cannot
 * change a decision you already made once for reasons that no longer apply.
 *
 * **The fix is deterministic, not a prompt instruction alone.** This module classifies every
 * category that shows a notable month as either:
 * - `habit` — spend has moved the same direction for `MIN_SUSTAINED_MONTHS` **consecutive**
 *   months, counting back from the most recent one. A real, ongoing shift — up ("a rise") or
 *   down ("a pitfall" in the other direction, read as good news) — a recommendation can
 *   plausibly act on going forward.
 * - `event` — a single month (or a couple) spiked, driven by transactions far larger than the
 *   category's own typical one, with a normal transaction count otherwise. A recognisable
 *   one-off, not a new pace of spending. Events are always `direction: "up"` — a category
 *   dropping for one month is silence, not a finding; there is nothing there to warn about.
 * - Anything else (a spike with no strong signal either way, or a run under 3 months) gets no
 *   entry — there is nothing confident to say, so nothing is said.
 *
 * The result does three jobs:
 * 1. Feeds the LLM prompt as context (bias, not enforcement).
 * 2. Backs a **deterministic validator** in `insights_node.ts` that drops or demotes any
 *    recommendation the model wrote against a category classified `event`, regardless of what
 *    the prompt asked it to do.
 * 3. Persists onto `InsightReport.insights.financialContext` and renders directly on the
 *    Overview as "Events & Habits" — the only one of the three uses where this is shown to the
 *    reader rather than only steering the model.
 *
 * No new data is queried — every input here is already in `MonthlyStats.categoryBreakdown`.
 */

export type CategoryClassification = "habit" | "event";
export type TrendDirection = "up" | "down";

export interface CategoryContext {
    category: string;
    classification: CategoryClassification;
    direction: TrendDirection;
    /** One line, plain language, already fit to read on a card. */
    note: string;
    months: string[];
    amount: number;
}

type CategoryRow = {
    category: string;
    totalSpend: number;
    txnCount: number;
    avgTxnAmount: number;
    isSpiked: boolean;
    rollingAvg6m: number;
};

type MonthlyStatsRow = { month: string; categoryBreakdown: unknown };

function categoriesOf(row: MonthlyStatsRow): CategoryRow[] {
    return Array.isArray(row.categoryBreakdown) ? (row.categoryBreakdown as CategoryRow[]) : [];
}

/**
 * A run has to reach back this many **consecutive** months from the most recent one to count
 * as a habit — "lasts for at least 3 months", read literally. A month that breaks the run ends
 * it; there is no partial credit for "4 of the last 6", because the point of this bar is that
 * the reader can trust it describes *right now*, not a pattern that already ended.
 */
const MIN_SUSTAINED_MONTHS = 3;
/** How far above/below its own rolling average a month has to be to count as notable at all. */
const UP_RATIO = 1.3;
const DOWN_RATIO = 0.7;
/** A month's own average transaction at least this many times the category's typical one. */
const EVENT_TXN_RATIO = 2.2;

/** The longest run of consecutive months (from the end of `rows`) that all appear in `flagged`. */
function consecutiveRunFromEnd<T extends { month: string }>(rows: T[], flagged: Set<string>): T[] {
    const run: T[] = [];
    for (let i = rows.length - 1; i >= 0; i--) {
        if (!flagged.has(rows[i]!.month)) break;
        run.unshift(rows[i]!);
    }
    return run;
}

export function computeFinancialContext(monthly: MonthlyStatsRow[]): CategoryContext[] {
    const byCategory = new Map<string, { month: string; row: CategoryRow }[]>();
    for (const m of monthly) {
        for (const c of categoriesOf(m)) {
            if (c.totalSpend <= 0) continue;
            const list = byCategory.get(c.category) ?? [];
            list.push({ month: m.month, row: c });
            byCategory.set(c.category, list);
        }
    }

    const results: CategoryContext[] = [];

    for (const [category, rows] of byCategory) {
        const up = rows.filter(
            (r) => r.row.isSpiked || (r.row.rollingAvg6m > 0 && r.row.totalSpend > r.row.rollingAvg6m * UP_RATIO)
        );
        const down = rows.filter(
            (r) => r.row.rollingAvg6m > 0 && r.row.totalSpend < r.row.rollingAvg6m * DOWN_RATIO
        );

        const upRun = consecutiveRunFromEnd(rows, new Set(up.map((r) => r.month)));
        const downRun = consecutiveRunFromEnd(rows, new Set(down.map((r) => r.month)));

        if (upRun.length >= MIN_SUSTAINED_MONTHS) {
            results.push({
                category,
                classification: "habit",
                direction: "up",
                note: `Risen for ${upRun.length} months running, through ${upRun[upRun.length - 1]!.month} — a sustained rise, not a one-off month.`,
                months: upRun.map((r) => r.month),
                amount: Math.round(upRun.reduce((s, r) => s + r.row.totalSpend, 0)),
            });
            continue;
        }

        if (downRun.length >= MIN_SUSTAINED_MONTHS) {
            results.push({
                category,
                classification: "habit",
                direction: "down",
                note: `Down for ${downRun.length} months running, through ${downRun[downRun.length - 1]!.month} — a sustained pull-back, not a one-off month.`,
                months: downRun.map((r) => r.month),
                amount: Math.round(downRun.reduce((s, r) => s + r.row.totalSpend, 0)),
            });
            continue;
        }

        if (up.length === 0) continue;

        // Event candidate: an elevated month driven by transactions far bigger than this
        // category's own typical one, with a normal-or-lower transaction count — few large
        // payments, not many ordinary ones. Direction is always "up": a quiet month has no
        // transactions large enough to look like a one-off event in the first place.
        const typicalAvgTxn = median(
            rows.filter((r) => !up.includes(r) && r.row.avgTxnAmount > 0).map((r) => r.row.avgTxnAmount)
        );
        const typicalTxnCount = median(rows.map((r) => r.row.txnCount));

        const eventMonths = up.filter((r) => {
            if (typicalAvgTxn <= 0) return false;
            const bigTicket = r.row.avgTxnAmount >= typicalAvgTxn * EVENT_TXN_RATIO;
            const fewTxns = r.row.txnCount <= Math.max(2, typicalTxnCount * 0.6);
            return bigTicket && fewTxns;
        });

        if (eventMonths.length > 0) {
            const amount = Math.round(eventMonths.reduce((s, r) => s + r.row.totalSpend, 0));
            results.push({
                category,
                classification: "event",
                direction: "up",
                note: `₹${amount.toLocaleString("en-IN")} in ${eventMonths.map((r) => r.month).join(", ")} came from far fewer, larger payments than usual — reads as a one-off, not a new spending pace.`,
                months: eventMonths.map((r) => r.month),
                amount,
            });
        }
        // Neither sustained nor clearly event-shaped: no strong signal, so no entry — silence
        // is the honest answer when the evidence doesn't point either way.
    }

    return results;
}
