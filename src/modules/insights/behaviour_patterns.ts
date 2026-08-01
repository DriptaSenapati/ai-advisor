import prisma from "../../prismaClient.js";
import { computeStats } from "../stats/robust.js";

/**
 * Four behavioural findings about spending *habits*, as opposed to amounts — a
 * complement to `health_score.ts` (the deterministic score) and the red-flag detectors
 * (individual suspicious transactions). This is the third leg: patterns that are neither
 * a single number nor a single transaction, but a shape across the whole account.
 *
 * ---
 *
 * **Deterministic, same rule as the health score.** Every `confidence` and every ₹ figure
 * here is computed from the user's own `MonthlyStats`/`TransactionFlag` rows or one raw
 * aggregation over their transactions — never an LLM guess. `confidence` reuses the health
 * score's own 40–97 band and the "evidence, not a probability" framing from
 * `recovery_projection.ts`'s `scoreConfidence()`: it answers "how much data supports this
 * finding", never "how likely is this to be true".
 *
 * Each detector returns `null` when there isn't enough to say anything — a pattern with no
 * evidence behind it is worse than no pattern at all.
 */

export type BadgeTone = "danger" | "amber" | "success" | "neutral";

export interface BehaviourPattern {
    key: "impulse_buying" | "spending_discipline" | "lifestyle_inflation" | "refund_recovery";
    label: string;
    summary: string;
    icon: "shopping-bag" | "check-circle" | "trending-up" | "repeat";
    badgeLabel: string;
    badgeTone: BadgeTone;
    /** 40–97, evidence-based — see the module docblock. */
    confidence: number;
    findings: string[];
    impactLabel: string;
    impactDetail: string;
    impactAmount: number | null;
    impactTone: BadgeTone;
    evidenceCount: number;
    category: string | null;
    /**
     * Filled in by `insights_node.ts` after this module runs, joining the LLM's
     * `behaviourNarratives` onto `key` — this module itself never calls the model. `null`
     * until that merge happens (and stays `null` if the model didn't narrate this key).
     */
    narrative?: string | null;
}

const CONFIDENCE_FLOOR = 40;
const CONFIDENCE_RANGE = 57;

function factor(value: number, atZero: number, atOne: number): number {
    if (atOne === atZero) return 1;
    return Math.max(0, Math.min(1, (value - atZero) / (atOne - atZero)));
}

function confidenceFrom(evidenceFactor: number): number {
    return Math.round(CONFIDENCE_FLOOR + CONFIDENCE_RANGE * Math.max(0, Math.min(1, evidenceFactor)));
}

type CategoryRow = {
    category: string;
    totalSpend: number;
    txnCount: number;
    isSpiked: boolean;
};

type MonthlyStatsRow = {
    month: string;
    totalRefunds: number;
    refundCount: number;
    categoryBreakdown: unknown;
};

function categoriesOf(row: MonthlyStatsRow): CategoryRow[] {
    return Array.isArray(row.categoryBreakdown) ? (row.categoryBreakdown as CategoryRow[]) : [];
}

const RECENT_MONTHS = 3;

/**
 * Dining and groceries — the two categories that recur regardless of what else is going
 * on — stayed steady, or they didn't. Framed positively (unlike the other three, which
 * flag a cost): a low coefficient of variation is the finding worth naming.
 */
function spendingDiscipline(monthly: MonthlyStatsRow[]): BehaviourPattern | null {
    const ESSENTIALS = ["Food & Dining", "Groceries"];
    const perMonth = monthly.map((m) =>
        categoriesOf(m)
            .filter((c) => ESSENTIALS.includes(c.category))
            .reduce((sum, c) => sum + c.totalSpend, 0)
    );
    const series = perMonth.filter((v) => v > 0);
    if (series.length < 3) return null;

    const { mean, std } = computeStats(series);
    const cv = mean > 0 ? std / mean : 0;
    const variationPct = Math.round(cv * 100);

    const txnCount = monthly.reduce(
        (sum, m) =>
            sum +
            categoriesOf(m)
                .filter((c) => ESSENTIALS.includes(c.category))
                .reduce((s, c) => s + c.txnCount, 0),
        0
    );
    const spikeMonths = monthly.filter((m) =>
        categoriesOf(m).some((c) => ESSENTIALS.includes(c.category) && c.isSpiked)
    ).length;

    const good = cv <= 0.2 && spikeMonths === 0;
    const badgeLabel = good ? "Good" : cv <= 0.4 ? "Fair" : "Volatile";
    const badgeTone: BadgeTone = good ? "success" : cv <= 0.4 ? "amber" : "danger";

    return {
        key: "spending_discipline",
        label: "Spending Discipline",
        summary: "Dining and daily essentials, and how consistent they've stayed month to month.",
        icon: "check-circle",
        badgeLabel,
        badgeTone,
        confidence: confidenceFrom(factor(series.length, 2, 12)),
        findings: [
            `Dining & groceries spend measured across ${series.length} months`,
            `Month-to-month variation of ±${variationPct}%`,
            spikeMonths === 0
                ? "No months where either category spiked"
                : `${spikeMonths} ${spikeMonths === 1 ? "month" : "months"} where one spiked`,
        ],
        impactLabel: good
            ? "You maintain good control over everyday spending."
            : "Essentials swing enough to make budgeting them harder than it should be.",
        impactDetail: good
            ? "Nothing to act on here — this is the part of the account already working."
            : `A ±${variationPct}% swing on spend that should be routine is worth a look.`,
        impactAmount: null,
        impactTone: badgeTone,
        evidenceCount: txnCount,
        category: null,
    };
}

/**
 * The category whose recent average has grown the most against its own prior average —
 * same recent-3-vs-prior-months comparison `GET /transactions/categories` already uses,
 * so this can't disagree with the trend arrow a reader sees on that screen.
 */
function lifestyleInflation(monthly: MonthlyStatsRow[]): BehaviourPattern | null {
    const EXCLUDE = ["Transfers & Payments", "Finance & Investments", "Food & Dining", "Groceries"];
    const byCategory = new Map<string, { month: string; totalSpend: number }[]>();
    for (const m of monthly) {
        for (const c of categoriesOf(m)) {
            if (EXCLUDE.includes(c.category) || c.totalSpend <= 0) continue;
            const list = byCategory.get(c.category) ?? [];
            list.push({ month: m.month, totalSpend: c.totalSpend });
            byCategory.set(c.category, list);
        }
    }

    let best: { category: string; recentAvg: number; priorAvg: number; deltaPct: number; months: string[] } | null =
        null;

    for (const [category, rows] of byCategory) {
        if (rows.length < 4) continue;
        const cut = Math.max(rows.length - RECENT_MONTHS, 0);
        const prior = rows.slice(0, cut);
        const recent = rows.slice(cut);
        if (prior.length === 0 || recent.length === 0) continue;

        const priorAvg = prior.reduce((s, r) => s + r.totalSpend, 0) / prior.length;
        const recentAvg = recent.reduce((s, r) => s + r.totalSpend, 0) / recent.length;
        if (priorAvg <= 0) continue;

        const deltaPct = ((recentAvg - priorAvg) / priorAvg) * 100;
        if (deltaPct > 30 && (!best || deltaPct > best.deltaPct)) {
            best = { category, recentAvg, priorAvg, deltaPct, months: rows.map((r) => r.month) };
        }
    }

    if (!best) return null;

    const monthlyIncrease = best.recentAvg - best.priorAvg;
    const projectedAnnualIncrease = Math.round(monthlyIncrease * 12);
    const txnCount = (byCategory.get(best.category) ?? []).length;

    return {
        key: "lifestyle_inflation",
        label: "Lifestyle Inflation",
        summary: `${best.category} spending has climbed and stayed up, not just spiked once.`,
        icon: "trending-up",
        badgeLabel: "Detected",
        badgeTone: "amber",
        confidence: confidenceFrom(factor(best.months.length, 4, 12)),
        findings: [
            `+${Math.round(best.deltaPct)}% versus this category's own earlier average`,
            `Averaging ₹${Math.round(best.recentAvg).toLocaleString("en-IN")}/month recently, up from ₹${Math.round(best.priorAvg).toLocaleString("en-IN")}/month`,
            `${best.category}`,
        ],
        impactLabel: "If this pace holds, next year costs more for the same habit.",
        impactDetail: `At the current gap, this category alone adds about ₹${projectedAnnualIncrease.toLocaleString("en-IN")} over the next year versus its earlier pace.`,
        impactAmount: projectedAnnualIncrease,
        impactTone: "amber",
        evidenceCount: txnCount,
        category: best.category,
    };
}

/** Money already recovered, against money still sitting in unresolved duplicate charges. */
async function refundRecovery(userId: string, monthly: MonthlyStatsRow[]): Promise<BehaviourPattern | null> {
    const totalRefunds = Math.round(monthly.reduce((s, m) => s + (m.totalRefunds ?? 0), 0));
    const refundCount = monthly.reduce((s, m) => s + (m.refundCount ?? 0), 0);
    if (refundCount === 0) return null;

    let largest: { month: string; amount: number } | null = null;
    for (const m of monthly) {
        if (!largest || (m.totalRefunds ?? 0) > largest.amount) {
            largest = { month: m.month, amount: m.totalRefunds ?? 0 };
        }
    }

    const duplicateFlags = await prisma.transactionFlag.aggregate({
        where: { userId, kind: "duplicate_charge" },
        _sum: { amount: true },
    });
    const stillUnrecovered = Math.max(0, Math.round((duplicateFlags._sum.amount ?? 0) - totalRefunds));

    const healthy = totalRefunds > 0;

    return {
        key: "refund_recovery",
        label: "Refund Recovery",
        summary: "Money that came back, against money still sitting in unresolved duplicate charges.",
        icon: "repeat",
        badgeLabel: healthy ? "Healthy" : "Watch",
        badgeTone: healthy ? "success" : "amber",
        confidence: confidenceFrom(factor(refundCount, 1, 10)),
        findings: [
            `₹${totalRefunds.toLocaleString("en-IN")} recovered across ${monthly.length} months`,
            largest ? `Largest refund ₹${Math.round(largest.amount).toLocaleString("en-IN")} in ${largest.month}` : "",
            `${refundCount} refund ${refundCount === 1 ? "transaction" : "transactions"} total`,
        ].filter(Boolean),
        impactLabel:
            stillUnrecovered > 0
                ? "You're getting money back, but some flagged duplicates look unresolved."
                : "Nothing flagged as an unresolved duplicate right now.",
        impactDetail:
            stillUnrecovered > 0
                ? `₹${stillUnrecovered.toLocaleString("en-IN")} in suspected duplicate charges hasn't shown up as a refund yet.`
                : "Every suspected duplicate this account has flagged already has a refund against it.",
        impactAmount: totalRefunds,
        impactTone: healthy ? "success" : "amber",
        evidenceCount: refundCount,
        category: null,
    };
}

/**
 * The one detector that needs its own query — `MonthlyStats.categoryBreakdown` has no
 * per-transaction detail, and "82% of the value from 5 transactions" is a distribution
 * question a monthly total can't answer.
 */
async function impulseBuying(userId: string): Promise<BehaviourPattern | null> {
    type Facets = [
        {
            totals: { total: number; count: number }[];
            top: { sum: number }[];
            byMonth: { _id: string; total: number }[];
        },
    ];

    const raw = (await prisma.finalTransactionData.aggregateRaw({
        pipeline: [
            { $match: { userId, debitAmount: { $gt: 0 } } },
            { $lookup: { from: "Cluster", localField: "clusterId", foreignField: "_id", as: "cluster" } },
            { $unwind: { path: "$cluster", preserveNullAndEmptyArrays: true } },
            { $addFields: { category: { $ifNull: ["$cluster.category", "Other"] } } },
            { $match: { category: "Shopping" } },
            { $addFields: { month: { $dateToString: { format: "%Y-%m", date: "$date" } } } },
            {
                $facet: {
                    totals: [{ $group: { _id: null, total: { $sum: "$debitAmount" }, count: { $sum: 1 } } }],
                    top: [
                        { $sort: { debitAmount: -1 } },
                        { $limit: 5 },
                        { $group: { _id: null, sum: { $sum: "$debitAmount" } } },
                    ],
                    byMonth: [
                        { $group: { _id: "$month", total: { $sum: "$debitAmount" } } },
                        { $sort: { total: -1 } },
                        { $limit: 2 },
                    ],
                },
            },
        ],
    })) as unknown as Facets;

    const facet = raw[0];
    const total = facet?.totals[0]?.total ?? 0;
    const count = facet?.totals[0]?.count ?? 0;
    if (count < 3 || total <= 0) return null;

    const top5Sum = facet.top[0]?.sum ?? 0;
    const share = top5Sum / total;
    const avgTxn = total / count;
    const topMonths = (facet.byMonth ?? []).map((m) => m._id);

    if (share < 0.45) return null;

    const badgeLabel = share >= 0.7 ? "High" : "Moderate";
    const badgeTone: BadgeTone = share >= 0.7 ? "danger" : "amber";

    return {
        key: "impulse_buying",
        label: "Impulse Buying",
        summary: "Shopping is concentrated in a handful of expensive purchases rather than regular smaller spends.",
        icon: "shopping-bag",
        badgeLabel,
        badgeTone,
        confidence: confidenceFrom(factor(count, 3, 20)),
        findings: [
            `${Math.round(share * 100)}% of shopping value from just ${Math.min(5, count)} transactions`,
            `Average shopping transaction ₹${Math.round(avgTxn).toLocaleString("en-IN")}`,
            topMonths.length > 0 ? `Most spikes in ${topMonths.join(", ")}` : "",
        ].filter(Boolean),
        impactLabel: "Occasional big-ticket purchases create cash-flow pressure in those months.",
        impactDetail: `The next purchase like the recent ones would run about ₹${Math.round(top5Sum / Math.min(5, count)).toLocaleString("en-IN")}.`,
        impactAmount: Math.round(top5Sum / Math.min(5, count)),
        impactTone: badgeTone,
        evidenceCount: count,
        category: "Shopping",
    };
}

export async function computeBehaviourPatterns(
    userId: string,
    monthly: MonthlyStatsRow[]
): Promise<BehaviourPattern[]> {
    const results = await Promise.allSettled([
        Promise.resolve(spendingDiscipline(monthly)),
        Promise.resolve(lifestyleInflation(monthly)),
        refundRecovery(userId, monthly),
        impulseBuying(userId),
    ]);

    return results
        .filter((r): r is PromiseFulfilledResult<BehaviourPattern | null> => r.status === "fulfilled")
        .map((r) => r.value)
        .filter((v): v is BehaviourPattern => v !== null);
}
