import { tool } from "langchain";
import z from "zod";
import prisma from "../../../prismaClient.js";
import { median, quantile } from "../../stats/robust.js";

/**
 * Deterministic per-transaction risk detection.
 *
 * Before this existed nothing in the system flagged an individual transaction. The only
 * signals were prose: `keySummary.risks` (1–2 sentences), `anomalyAndRisk.unusualTransactions`
 * (one Tier-3-only paragraph), and a duplicate-charge aggregation whose structured result was
 * joined into a string inside `insights_node.ts` and thrown away. A UI could render none of it.
 *
 * Every detector here is a Mongo aggregation, **not an LLM call**. That is the whole design:
 * a flag carries a real transaction id, amount and date, so it can be ranked, filtered,
 * linked and counted. The LLM's job is narrating the *kinds* that fired (`insightsGenllmSchema
 * .redFlags.byKind`), joined back on a `z.enum` — never matching prose to rows, which is the
 * failure the miscounted-batch incident in CLAUDE.md was about.
 *
 * Thresholds are all relative to the user's own history. "₹8,000 is a lot" is not a fact about
 * a transaction, it is a fact about a person.
 */

const FLAG_KINDS = [
    "duplicate_charge",
    "merchant_outlier",
    "category_spike_contributor",
    "fee_or_interest",
    "subscription_price_hike",
    "balance_risk",
    "large_opaque_transfer",
] as const;

export type FlagKind = (typeof FLAG_KINDS)[number];
export type FlagSeverity = "high" | "medium" | "low";

/**
 * Kinds that are not scoped to a month and must be recomputed wholesale on every run.
 *
 * `subscription_price_hike` compares two `RecurringPattern` rows, which have no month.
 * `balance_risk` is scoped to a month but its *threshold* is derived from the user's whole
 * history — one new month of spending moves the runway floor, so last year's flags may no
 * longer be true and cannot be left in place.
 */
const GLOBAL_KINDS: FlagKind[] = ["subscription_price_hike", "balance_risk"];

/** Bank charges, penalties and interest — money paid for nothing but a mistake or a delay. */
const FEE_PATTERN = new RegExp(
    [
        "late\\s*fee", "late\\s*payment", "penal", "penalty", "fine",
        "bounce", "bounced", "return\\s*charge", "ecs\\s*(rtn|return)", "chq\\s*(rtn|return)",
        "cheque\\s*return", "insuff", "dishonour", "dishonor",
        "od\\s*interest", "overdraft", "over\\s*limit", "overlimit",
        "interest\\s*charge", "finance\\s*charge", "annual\\s*fee", "joining\\s*fee",
        "amc\\b", "service\\s*charge", "processing\\s*fee", "convenience\\s*fee",
        "min(imum)?\\s*due", "atm\\s*decl", "cash\\s*adv",
    ].join("|"),
    "i",
);

interface FlagDraft {
    dedupeKey: string;
    kind: FlagKind;
    severity: FlagSeverity;
    month: string;
    transactionId: string | null;
    clusterId: string | null;
    label: string;
    category: string | null;
    amount: number;
    occurredAt: Date | null;
    title: string;
    detail: string;
    evidence: Record<string, unknown>;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");
const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** `aggregateRaw` answers in MongoDB extended JSON — an ObjectId is `{$oid}`, a date `{$date}`. */
type Oid = { $oid: string };
type BsonDate = { $date: string };
const oid = (v: Oid | string): string => (typeof v === "string" ? v : v.$oid);
const bdate = (v: BsonDate | string): Date => new Date(typeof v === "string" ? v : v.$date);

/**
 * The `$lookup`/`$unwind`/`$addFields` opening every spend detector shares.
 *
 * Deliberately the same shape as `spendStages()` in `transactions.service.ts` and as
 * `statsAggregatorTool`'s opening: same join onto `Cluster`, same `$ifNull(category, "Other")`,
 * same `merchantName → payeeName → centroid` fallthrough for the label. A flag whose amount or
 * category disagreed with the dashboard bar it sits under would be worse than no flag.
 */
function spendStages(userId: string): Record<string, unknown>[] {
    return [
        { $match: { userId, debitAmount: { $gt: 0 } } },
        { $lookup: { from: "Cluster", localField: "clusterId", foreignField: "_id", as: "cluster" } },
        { $unwind: { path: "$cluster", preserveNullAndEmptyArrays: true } },
        {
            $addFields: {
                category: { $ifNull: ["$cluster.category", "Other"] },
                label: {
                    $ifNull: ["$cluster.merchantName", { $ifNull: ["$cluster.payeeName", { $ifNull: ["$cluster.centroid", "$description"] }] }],
                },
            },
        },
    ];
}

// ── Detector 1: duplicate charges ─────────────────────────────────────────────
//
// Lifted from `insights_node.ts`, where this exact pipeline ran and its result was joined
// into a prose string. Same thresholds so the numbers do not move: ≥₹1000, same cluster,
// same exact amount, twice or more inside one calendar month.

async function detectDuplicateCharges(userId: string, months: string[]): Promise<FlagDraft[]> {
    type Row = {
        _id: { clusterId: string; amount: number; month: string };
        count: number;
        dates: string[];
        txnIds: Oid[];
    };

    const rows = await prisma.finalTransactionData.aggregateRaw({
        pipeline: [
            { $match: { userId, debitAmount: { $gt: 1000 }, clusterId: { $exists: true, $ne: null } } },
            {
                $group: {
                    _id: {
                        clusterId: { $toString: "$clusterId" },
                        amount: "$debitAmount",
                        month: { $dateToString: { format: "%Y-%m", date: "$date" } },
                    },
                    count: { $sum: 1 },
                    dates: { $push: { $dateToString: { format: "%Y-%m-%d", date: "$date" } } },
                    txnIds: { $push: "$_id" },
                },
            },
            { $match: { count: { $gte: 2 }, "_id.month": { $in: months } } },
            { $sort: { "_id.amount": -1 } },
            { $limit: 40 },
        ],
    }) as unknown as Row[];

    if (rows.length === 0) return [];

    const clusters = await prisma.cluster.findMany({
        where: { id: { in: rows.map(r => r._id.clusterId) }, userId },
        select: { id: true, merchantName: true, payeeName: true, centroid: true, category: true },
    });
    const byId = new Map(clusters.map(c => [c.id, c]));

    return rows.map(r => {
        const c = byId.get(r._id.clusterId);
        const label = c?.merchantName ?? c?.payeeName ?? c?.centroid ?? "Unknown";
        const amount = Number(r._id.amount);
        return {
            dedupeKey: `duplicate_charge:${r._id.clusterId}:${amount}:${r._id.month}`,
            kind: "duplicate_charge" as const,
            severity: "high" as const,
            month: r._id.month,
            // The *first* of the pair — the flag is about the repeat, but a link has to
            // land on a row, and the earliest one is the charge the user recognises.
            transactionId: r.txnIds[0] ? oid(r.txnIds[0]) : null,
            clusterId: r._id.clusterId,
            label,
            category: c?.category ?? null,
            amount: amount * (r.count - 1), // the money at risk is the *extra* charges
            occurredAt: r.dates[0] ? new Date(`${r.dates[0]}T00:00:00Z`) : null,
            title: `${label} charged ₹${fmt(amount)} ${r.count}× in one month`,
            detail: `Identical amount on ${r.dates.join(", ")}. If only one was intended, ₹${fmt(amount * (r.count - 1))} is recoverable.`,
            evidence: { count: r.count, dates: r.dates, unitAmount: amount },
        };
    });
}

// ── Detector 2: merchant outliers ─────────────────────────────────────────────
//
// "Unusually large" measured against the merchant's own median, not a global number. A
// ₹4,000 grocery run is unremarkable; ₹4,000 at a coffee shop that normally takes ₹180 is
// the thing worth surfacing. Needs ≥4 transactions before "normally" means anything.

async function detectMerchantOutliers(userId: string, months: string[]): Promise<FlagDraft[]> {
    type Row = {
        _id: Oid | null;
        label: string;
        category: string | null;
        txns: { id: Oid; amount: number; date: BsonDate; month: string }[];
    };

    const rows = await prisma.finalTransactionData.aggregateRaw({
        pipeline: [
            ...spendStages(userId),
            { $match: { clusterId: { $ne: null } } },
            {
                $group: {
                    _id: "$clusterId",
                    label: { $first: "$label" },
                    category: { $first: "$category" },
                    txns: {
                        $push: {
                            id: "$_id",
                            amount: "$debitAmount",
                            date: "$date",
                            month: { $dateToString: { format: "%Y-%m", date: "$date" } },
                        },
                    },
                },
            },
            { $match: { $expr: { $gte: [{ $size: "$txns" }, 4] } } },
        ] as never,
    }) as unknown as Row[];

    const flags: FlagDraft[] = [];

    for (const row of rows) {
        const amounts = row.txns.map(t => t.amount);
        const med = median(amounts);
        if (med <= 0) continue;

        for (const t of row.txns) {
            if (!months.includes(t.month)) continue;
            const ratio = t.amount / med;
            if (ratio < 3) continue;
            // A merchant whose median is tiny makes any real purchase look like a 10×
            // outlier. Require the absolute amount to matter too.
            if (t.amount < 1000) continue;

            flags.push({
                dedupeKey: `merchant_outlier:${oid(t.id)}`,
                kind: "merchant_outlier",
                severity: ratio >= 5 ? "high" : "medium",
                month: t.month,
                transactionId: oid(t.id),
                clusterId: row._id ? oid(row._id) : null,
                label: row.label,
                category: row.category,
                amount: t.amount,
                occurredAt: bdate(t.date),
                title: `₹${fmt(t.amount)} at ${row.label} — ${ratio.toFixed(1)}× your usual`,
                detail: `You normally spend about ₹${fmt(med)} here across ${row.txns.length} visits. This one was ₹${fmt(t.amount - med)} more.`,
                evidence: { median: Math.round(med), ratio: Number(ratio.toFixed(2)), sampleSize: row.txns.length },
            });
        }
    }

    // Cap so one chaotic month cannot bury every other kind in the list.
    return flags.sort((a, b) => b.amount - a.amount).slice(0, 40);
}

// ── Detector 3: what actually caused a category spike ─────────────────────────
//
// `categoryBreakdown[].isSpiked` is already computed by `statsAggregatorTool` (spend > 2×
// the category's own six-month rolling average) and already rendered as a marker on the
// dashboard. What was never available is *which transactions did it* — so a user could see
// "Shopping spiked in March" and had no way to find out why.

async function detectSpikeContributors(userId: string, months: string[]): Promise<FlagDraft[]> {
    const stats = await prisma.monthlyStats.findMany({
        where: { userId, month: { in: months } },
        select: { month: true, categoryBreakdown: true },
    });

    type CategoryRow = { category: string; totalSpend: number; isSpiked?: boolean; rollingAvg6m?: number };
    const spiked: { month: string; category: string; totalSpend: number; rollingAvg6m: number }[] = [];

    for (const s of stats) {
        for (const c of (s.categoryBreakdown as unknown as CategoryRow[])) {
            if (c?.isSpiked) {
                spiked.push({
                    month: s.month,
                    category: c.category,
                    totalSpend: c.totalSpend,
                    rollingAvg6m: c.rollingAvg6m ?? 0,
                });
            }
        }
    }
    if (spiked.length === 0) return [];

    type Row = { _id: Oid; label: string; category: string; amount: number; date: BsonDate; month: string };
    const flags: FlagDraft[] = [];

    for (const s of spiked) {
        const rows = await prisma.finalTransactionData.aggregateRaw({
            pipeline: [
                ...spendStages(userId),
                { $addFields: { month: { $dateToString: { format: "%Y-%m", date: "$date" } } } },
                { $match: { month: s.month, category: s.category } },
                { $sort: { debitAmount: -1 } },
                { $limit: 3 },
                { $project: { _id: 1, label: 1, category: 1, amount: "$debitAmount", date: 1, month: 1 } },
            ] as never,
        }) as unknown as Row[];

        const excess = s.rollingAvg6m > 0 ? s.totalSpend - s.rollingAvg6m : 0;

        for (const r of rows) {
            flags.push({
                dedupeKey: `category_spike_contributor:${oid(r._id)}`,
                kind: "category_spike_contributor",
                severity: "medium",
                month: s.month,
                transactionId: oid(r._id),
                clusterId: null,
                label: r.label,
                category: s.category,
                amount: r.amount,
                occurredAt: bdate(r.date),
                title: `₹${fmt(r.amount)} to ${r.label} during the ${s.category} spike`,
                detail: excess > 0
                    ? `${s.category} came to ₹${fmt(s.totalSpend)} that month against a six-month average of ₹${fmt(s.rollingAvg6m)} — ₹${fmt(excess)} over. This was one of the three largest payments in it.`
                    : `${s.category} came to ₹${fmt(s.totalSpend)} that month, well above its usual level. This was one of the three largest payments in it.`,
                evidence: { categoryTotal: s.totalSpend, rollingAvg6m: s.rollingAvg6m, excess },
            });
        }
    }

    return flags;
}

// ── Detector 4: fees, penalties and interest ──────────────────────────────────
//
// The purest form of avoidable spend in the whole dataset: money that bought nothing.
// Description-matched, because none of it is categorised distinctly — it lands in
// "Bills & Utilities" or "Other" alongside legitimate charges.

async function detectFeesAndInterest(userId: string, months: string[]): Promise<FlagDraft[]> {
    const monthFilter = months.length > 0 ? { month: { $in: months } } : {};

    type Row = { _id: Oid; description: string; label: string; category: string; amount: number; date: BsonDate; month: string };
    const rows = await prisma.finalTransactionData.aggregateRaw({
        pipeline: [
            ...spendStages(userId),
            { $addFields: { month: { $dateToString: { format: "%Y-%m", date: "$date" } } } },
            { $match: { ...monthFilter, description: { $regex: FEE_PATTERN.source, $options: "i" } } },
            { $sort: { debitAmount: -1 } },
            { $limit: 40 },
            { $project: { _id: 1, description: 1, label: 1, category: 1, amount: "$debitAmount", date: 1, month: 1 } },
        ] as never,
    }) as unknown as Row[];

    return rows.map(r => ({
        dedupeKey: `fee_or_interest:${oid(r._id)}`,
        kind: "fee_or_interest" as const,
        severity: (r.amount > 500 ? "high" : "medium") as FlagSeverity,
        month: r.month,
        transactionId: oid(r._id),
        clusterId: null,
        label: r.label,
        category: r.category,
        amount: r.amount,
        occurredAt: bdate(r.date),
        title: `₹${fmt(r.amount)} in charges or interest`,
        detail: `"${r.description.trim()}" — a fee, penalty or interest charge rather than a purchase. This is spend that bought nothing.`,
        evidence: { description: r.description.trim() },
    }));
}

// ── Detector 5: subscription price rises ──────────────────────────────────────
//
// This one exists because of a quirk in how recurring debits are keyed. Passes 1 and 2 of
// `recurring_pattern_tool.ts` key on the EXACT `debitAmount`, so a subscription that raises
// its price does not update its row — it creates a second one, and the deactivation sweep then
// marks the old one inactive. Reading that pair gives a price history for free.
//
// **The retired/live split is what makes it a price change rather than two commitments**, and
// that distinction is the whole detector. A second row for the same counterparty is just as
// often a second parallel mandate: on real data "Indian Clearing" charges ₹4,000 *and* ₹2,000,
// both for eleven months and both still arriving, and "Google Play" bills ₹149 and ₹99 for two
// different subscriptions. Diffing the two most recent rows by date reported the first of those
// as a 100% price rise — and both rows even shared a `lastTransactionDate`, so which one came
// out "newer" was arbitrary.
//
// Overlap in time is the real signal, and `isActive` already encodes it: a superseded amount
// stops arriving and gets retired, while parallel mandates keep arriving together.

async function detectPriceHikes(userId: string): Promise<FlagDraft[]> {
    const patterns = await prisma.recurringPattern.findMany({
        where: { userId, OR: [{ type: "debit" }, { type: null }] },
        select: {
            id: true, merchantName: true, payeeName: true, category: true,
            estimatedMonthlyAmount: true, isActive: true, lastTransactionDate: true, frequency: true,
        },
    });

    const retired = new Map<string, typeof patterns>();
    const live = new Map<string, typeof patterns>();
    for (const p of patterns) {
        const name = p.merchantName ?? p.payeeName;
        if (!name) continue;
        const bucket = p.isActive ? live : retired;
        const list = bucket.get(name) ?? [];
        list.push(p);
        bucket.set(name, list);
    }

    const flags: FlagDraft[] = [];

    for (const [name, oldRows] of retired) {
        const currentRows = live.get(name);
        // Exactly one live amount. With two, which retired amount each replaced is a guess,
        // and a guess about someone's money is not worth flagging.
        if (!currentRows || currentRows.length !== 1) continue;
        const current = currentRows[0]!;

        const previous = [...oldRows].sort(
            (a, b) => (a.lastTransactionDate?.getTime() ?? 0) - (b.lastTransactionDate?.getTime() ?? 0)
        )[oldRows.length - 1]!;

        if (current.estimatedMonthlyAmount <= previous.estimatedMonthlyAmount) continue;
        if (!current.lastTransactionDate) continue;

        const delta = current.estimatedMonthlyAmount - previous.estimatedMonthlyAmount;
        const pct = (delta / previous.estimatedMonthlyAmount) * 100;
        // Rounding noise and one-rupee variations are not a price rise.
        if (delta < 20 || pct < 5) continue;

        const since = current.lastTransactionDate!;
        flags.push({
            dedupeKey: `subscription_price_hike:${name}:${previous.estimatedMonthlyAmount}:${current.estimatedMonthlyAmount}`,
            kind: "subscription_price_hike",
            severity: "medium",
            month: monthOf(since),
            transactionId: null,
            clusterId: null,
            label: name,
            category: current.category,
            amount: delta * 12,
            occurredAt: since,
            title: `${name} went from ₹${fmt(previous.estimatedMonthlyAmount)} to ₹${fmt(current.estimatedMonthlyAmount)}`,
            detail: `A ${pct.toFixed(0)}% rise on a ${current.frequency} charge — ₹${fmt(delta)} more each time, ₹${fmt(delta * 12)} over a year, unless you renegotiated it.`,
            evidence: {
                oldAmount: previous.estimatedMonthlyAmount,
                newAmount: current.estimatedMonthlyAmount,
                deltaPct: Number(pct.toFixed(1)),
                frequency: current.frequency,
            },
        });
    }

    return flags;
}

// ── Detector 6: balance risk ──────────────────────────────────────────────────
//
// `FinalTransactionData.balance` is stored on every row and rendered nowhere. The moments
// it went near zero are the most consequential events in the account and were completely
// invisible. The floor is five days of the user's own typical spending, so it scales with
// them rather than being an arbitrary rupee figure.

async function detectBalanceRisk(userId: string): Promise<FlagDraft[]> {
    const stats = await prisma.monthlyStats.findMany({
        where: { userId },
        select: { totalExpenses: true },
    });
    const monthlyExpenses = stats.map(s => s.totalExpenses).filter(v => v > 0);
    if (monthlyExpenses.length === 0) return [];

    const floor = (median(monthlyExpenses) / 30) * 5;
    if (floor <= 0) return [];

    type Row = { _id: Oid; label: string; category: string; amount: number; balance: number; date: BsonDate; month: string };
    const rows = await prisma.finalTransactionData.aggregateRaw({
        pipeline: [
            ...spendStages(userId),
            { $addFields: { month: { $dateToString: { format: "%Y-%m", date: "$date" } } } },
            { $match: { balance: { $lt: floor, $gte: 0 } } },
            { $sort: { balance: 1 } },
            { $limit: 25 },
            { $project: { _id: 1, label: 1, category: 1, amount: "$debitAmount", balance: 1, date: 1, month: 1 } },
        ] as never,
    }) as unknown as Row[];

    return rows.map(r => ({
        dedupeKey: `balance_risk:${oid(r._id)}`,
        kind: "balance_risk" as const,
        severity: "high" as const,
        month: r.month,
        transactionId: oid(r._id),
        clusterId: null,
        label: r.label,
        category: r.category,
        amount: r.amount,
        occurredAt: bdate(r.date),
        title: `Balance fell to ₹${fmt(r.balance)} after paying ${r.label}`,
        detail: `That is under five days of your typical spending (₹${fmt(floor)}). A ₹${fmt(r.amount)} payment landing here leaves no room for anything unexpected.`,
        evidence: { balanceAfter: r.balance, runwayFloor: Math.round(floor) },
    }));
}

// ── Detector 7: large opaque transfers ────────────────────────────────────────
//
// CLAUDE.md names transfer opacity as a live gap: "Transfers & Payments" holds UPI P2P,
// EMIs and card bills, and a one-off transfer carries no merchant and no explanation. These
// are the largest amounts in the account with the least attached to them. p95 of the user's
// own debits, so "large" means large for them.

async function detectLargeOpaqueTransfers(userId: string, months: string[]): Promise<FlagDraft[]> {
    const allDebits = await prisma.finalTransactionData.findMany({
        where: { userId, debitAmount: { gt: 0 } },
        select: { debitAmount: true },
    });
    if (allDebits.length < 20) return [];

    const p95 = quantile(allDebits.map(d => d.debitAmount), 95);
    if (p95 <= 0) return [];

    type Row = { _id: Oid; description: string; label: string; amount: number; date: BsonDate; month: string };
    const rows = await prisma.finalTransactionData.aggregateRaw({
        pipeline: [
            ...spendStages(userId),
            { $addFields: { month: { $dateToString: { format: "%Y-%m", date: "$date" } } } },
            {
                $match: {
                    category: "Transfers & Payments",
                    debitAmount: { $gt: p95 },
                    ...(months.length > 0 ? { month: { $in: months } } : {}),
                },
            },
            { $sort: { debitAmount: -1 } },
            { $limit: 25 },
            { $project: { _id: 1, description: 1, label: 1, amount: "$debitAmount", date: 1, month: 1 } },
        ] as never,
    }) as unknown as Row[];

    return rows.map(r => ({
        dedupeKey: `large_opaque_transfer:${oid(r._id)}`,
        kind: "large_opaque_transfer" as const,
        severity: "medium" as const,
        month: r.month,
        transactionId: oid(r._id),
        clusterId: null,
        label: r.label,
        category: "Transfers & Payments",
        amount: r.amount,
        occurredAt: bdate(r.date),
        title: `₹${fmt(r.amount)} transferred to ${r.label}`,
        detail: `In your largest 5% of payments, and a transfer carries no merchant to explain it. Worth confirming this was intended and recorded.`,
        evidence: { p95Threshold: Math.round(p95), description: r.description.trim() },
    }));
}

// ── The tool ──────────────────────────────────────────────────────────────────

const redFlagDetectorTool = tool(async ({ userId, affectedMonths }) => {
    if (!userId) throw new Error("userId is required for red flag detection.");

    const months = [...new Set(affectedMonths)].sort();

    // Each detector is independent and best-effort. One failing aggregation must not cost
    // the other six — and must not fail the pipeline run, since the insight report itself
    // does not depend on flags existing.
    const settled = await Promise.allSettled([
        detectDuplicateCharges(userId, months),
        detectMerchantOutliers(userId, months),
        detectSpikeContributors(userId, months),
        detectFeesAndInterest(userId, months),
        detectPriceHikes(userId),
        detectBalanceRisk(userId),
        detectLargeOpaqueTransfers(userId, months),
    ]);

    const drafts: FlagDraft[] = [];
    settled.forEach((r, i) => {
        if (r.status === "fulfilled") drafts.push(...r.value);
        else console.error(`[RedFlags] detector ${FLAG_KINDS[i]} failed:`, r.reason);
    });

    // Two drafts can share a dedupeKey only if a detector produced the same flag twice;
    // collapse them so `createMany` cannot trip the unique index.
    const unique = [...new Map(drafts.map(d => [d.dedupeKey, d])).values()];

    // Idempotence. The insights pipeline re-runs on every statement upload, so this must
    // replace rather than accumulate — but only within its own scope: a per-statement run
    // knows nothing about other months and must leave their flags standing.
    await prisma.transactionFlag.deleteMany({
        where: {
            userId,
            OR: [
                ...(months.length > 0 ? [{ month: { in: months } }] : []),
                { kind: { in: GLOBAL_KINDS } },
            ],
        },
    });

    if (unique.length > 0) {
        await prisma.transactionFlag.createMany({
            data: unique.map(d => ({ ...d, userId, evidence: d.evidence as never })),
        });
    }

    const byKind = FLAG_KINDS
        .map(k => `${k}: ${unique.filter(f => f.kind === k).length}`)
        .join(", ");
    const high = unique.filter(f => f.severity === "high").length;

    console.log(`[RedFlags] ${unique.length} flag(s) written for ${months.length} month(s) — ${byKind}`);

    return `Transaction flags written: ${unique.length} (${high} high severity). ${byKind}`;
}, {
    name: "redFlagDetectorTool",
    description: "Runs seven deterministic detectors over a user's transactions and recurring patterns, persisting each finding as a TransactionFlag row.",
    schema: z.object({
        userId: z.string().optional().describe("Owner whose transactions these are"),
        affectedMonths: z.array(z.string()).describe("YYYY-MM months to (re)detect; global-scope kinds are always recomputed"),
    }),
});

export { redFlagDetectorTool, FLAG_KINDS, GLOBAL_KINDS };
