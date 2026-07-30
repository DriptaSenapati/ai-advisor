import prisma from "../../prismaClient.js";
import { gaussianSmooth } from "../../modules/stats/kernel.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { iqrBounds, median } from "../../modules/stats/robust.js";

const TXN_SELECT = {
    id: true,
    date: true,
    description: true,
    creditAmount: true,
    debitAmount: true,
    balance: true,
    clusterId: true,
    statementMetadataId: true,
    createdAt: true,
    cluster: {
        select: {
            id: true,
            merchantName: true,
            payeeName: true,
            category: true,
            confidence: true,
        },
    },
};

/**
 * Every function in this file takes `userId` and filters on it.
 *
 * They did not, and the four routes they back — `/transactions`,
 * `/transactions/summary`, `/transactions/categories`, `/transactions/merchants`
 * — returned the entire deployment's money to any authenticated caller. The
 * session was checked; the data was not scoped to it. `getMonthlyStats` was a
 * bare `findMany()` with no `where` at all.
 */
export async function listTransactions(opts: {
    userId: string;
    page: number;
    limit: number;
    month?: string;
    category?: string;
    minAmount?: number;
    maxAmount?: number;
}) {
    const { userId, page, limit, month, category, minAmount, maxAmount } = opts;

    const dateFilter: Record<string, unknown> = {};
    if (month) {
        const start = new Date(`${month}-01T00:00:00.000Z`);
        const end = new Date(start);
        end.setUTCMonth(end.getUTCMonth() + 1);
        dateFilter.date = { gte: start, lt: end };
    }

    const amountFilter: Record<string, unknown> = {};
    if (minAmount !== undefined || maxAmount !== undefined) {
        amountFilter.debitAmount = {
            ...(minAmount !== undefined ? { gte: minAmount } : {}),
            ...(maxAmount !== undefined ? { lte: maxAmount } : {}),
        };
    }

    const where = {
        userId,
        ...dateFilter,
        ...amountFilter,
        ...(category ? { cluster: { category } } : {}),
    };

    const [total, data] = await Promise.all([
        prisma.finalTransactionData.count({ where }),
        prisma.finalTransactionData.findMany({
            where,
            select: TXN_SELECT,
            orderBy: { date: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
    ]);

    return { data, total };
}

export async function getMonthlyStats(userId: string) {
    return prisma.monthlyStats.findMany({ where: { userId }, orderBy: { month: "asc" } });
}

/**
 * How many of the most recent months count as "lately".
 *
 * Three, because it is the shortest window that survives one unusual month: a
 * single month against history is a comparison of one number to an average, which
 * is what `momDelta` already is and why it swings wildly on lumpy categories like
 * Travel. It is also the window `detectTrendShock` uses for the same reason.
 */
const RECENT_MONTHS = 3;

/**
 * All-time spend per category, each with **how it is going lately**.
 *
 * The trend is the average of the last three months against the average of every
 * month before them, per category, and both sides are **monthly averages rather
 * than sums** — otherwise a 3-month window compared against a 12-month one would
 * read as a 75% collapse in spending that never happened.
 *
 * Months in which a category never appeared are counted as zeroes, not skipped.
 * That is the whole difference between "you spent less on Travel" and "you took
 * fewer trips": averaging only the months a category shows up in reports a
 * category that stopped entirely as perfectly stable.
 *
 * `deltaPct` is `null`, never `0`, when there is nothing honest to compare
 * against — fewer than one prior month, or a prior average of zero. `isNew`
 * separates the second case ("this is new") from silence.
 */
export async function getCategoryBreakdown(userId: string) {
    const stats = await prisma.monthlyStats.findMany({
        where: { userId },
        select: { month: true, categoryBreakdown: true },
        orderBy: { month: "asc" },
    });

    type Entry = { category: string; totalSpend: number; txnCount: number };

    const totals = new Map<string, { totalSpend: number; txnCount: number }>();
    /** Per category, one spend figure per month in the account — zeroes included. */
    const series = new Map<string, number[]>();

    stats.forEach((s, monthIndex) => {
        const breakdown = (s.categoryBreakdown as Entry[] | null) ?? [];
        for (const cat of breakdown) {
            const existing = totals.get(cat.category) ?? { totalSpend: 0, txnCount: 0 };
            existing.totalSpend += cat.totalSpend ?? 0;
            existing.txnCount += cat.txnCount ?? 0;
            totals.set(cat.category, existing);

            let months = series.get(cat.category);
            if (!months) {
                months = new Array(stats.length).fill(0);
                series.set(cat.category, months);
            }
            months[monthIndex] = (months[monthIndex] ?? 0) + (cat.totalSpend ?? 0);
        }
    });

    const mean = (values: number[]) =>
        values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

    return [...totals.entries()]
        .map(([category, v]) => {
            const months = series.get(category) ?? [];
            const cut = Math.max(months.length - RECENT_MONTHS, 0);
            const recent = months.slice(cut);
            const prior = months.slice(0, cut);

            const recentAvg = mean(recent);
            const priorAvg = mean(prior);
            const comparable = prior.length > 0 && priorAvg > 0;

            return {
                category,
                ...v,
                trend: {
                    recentMonths: recent.length,
                    priorMonths: prior.length,
                    recentAvg,
                    priorAvg,
                    deltaPct: comparable ? ((recentAvg - priorAvg) / priorAvg) * 100 : null,
                    /** Nothing before the recent window, but something in it. */
                    isNew: prior.length > 0 && priorAvg === 0 && recentAvg > 0,
                },
            };
        })
        .sort((a, b) => b.totalSpend - a.totalSpend);
}

/**
 * `aggregateRaw` answers in MongoDB extended JSON, not in the shapes Prisma's
 * typed client returns: an ObjectId arrives as `{ $oid }` and a date as
 * `{ $date }`. Serialising those straight to the client would put
 * `{"$date":"…"}` into the JSON where an ISO string belongs.
 */
type Oid = { $oid: string };
type BsonDate = { $date: string };

const iso = (value: BsonDate | null | undefined): string | null =>
    value ? new Date(value.$date).toISOString() : null;

interface MerchantRollup {
    name: string | null;
    kind: "merchant" | "person" | "unnamed";
    category: string;
    totalSpend: number;
    txnCount: number;
    lastDate: BsonDate;
}

/**
 * Outgoing money, with a category and a name attached — the stages every spend
 * aggregation in this file starts from.
 *
 * Deliberately identical to `statsAggregatorTool`'s opening: same `$lookup`,
 * same `$ifNull(cluster.category, "Other")`. Any drift here shows up as a
 * drill-down whose total disagrees with the dashboard bar it was reached from,
 * which is worse than having no drill-down at all.
 */
function spendStages(userId: string): Prisma.InputJsonValue[] {
    return [
        { $match: { userId, debitAmount: { $gt: 0 } } },
        { $lookup: { from: "Cluster", localField: "clusterId", foreignField: "_id", as: "cluster" } },
        { $unwind: { path: "$cluster", preserveNullAndEmptyArrays: true } },
        {
            $addFields: {
                category: { $ifNull: ["$cluster.category", "Other"] },
                /**
                 * Named merchant first, then the counterparty on a P2P transfer,
                 * then the cluster's representative description. `merchantName`
                 * is deliberately null for exactly the rows a spending view most
                 * needs to name — transfers, EMI, salary — so falling through to
                 * nothing would drop them from the ranking silently.
                 */
                label: {
                    $ifNull: ["$cluster.merchantName", { $ifNull: ["$cluster.payeeName", "$cluster.centroid"] }],
                },
                kind: {
                    $cond: [
                        { $ifNull: ["$cluster.merchantName", false] }, "merchant",
                        { $cond: [{ $ifNull: ["$cluster.payeeName", false] }, "person", "unnamed"] },
                    ],
                },
            },
        },
    ];
}

/** Group by counterparty, ranked by money rather than by transaction count. */
function merchantGroupStages(limit: number): Prisma.InputJsonValue[] {
    return [
        {
            $group: {
                _id: { label: "$label", kind: "$kind", category: "$category" },
                totalSpend: { $sum: "$debitAmount" },
                txnCount: { $sum: 1 },
                lastDate: { $max: "$date" },
            },
        },
        { $sort: { totalSpend: -1 } },
        { $limit: limit },
        {
            $project: {
                _id: 0,
                name: "$_id.label",
                kind: "$_id.kind",
                category: "$_id.category",
                totalSpend: 1,
                txnCount: 1,
                lastDate: 1,
            },
        },
    ];
}

/* --------------------------- the week pattern --------------------------- */

/** `$dayOfWeek` is 1 = Sunday … 7 = Saturday. Reordered to start the week on Monday. */
const DOW_MONDAY_FIRST = [2, 3, 4, 5, 6, 7, 1] as const;
const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEKEND_DOW = new Set([1, 7]);

/**
 * How much of a share has to differ before it counts as leaning, in percentage
 * points. Same spirit as `RHYTHM_MIN_DEVIATION`: without a floor, a category
 * sitting one point off the account's own split would be reported as a pattern.
 */
const LEAN_TOLERANCE = 5;

interface DowRollup {
    _id: number;
    totalSpend: number;
    txnCount: number;
}

function splitWeek(rows: DowRollup[]) {
    let weekdaySpend = 0, weekdayCount = 0, weekendSpend = 0, weekendCount = 0;
    for (const r of rows) {
        if (WEEKEND_DOW.has(r._id)) {
            weekendSpend += r.totalSpend;
            weekendCount += r.txnCount;
        } else {
            weekdaySpend += r.totalSpend;
            weekdayCount += r.txnCount;
        }
    }
    const total = weekdaySpend + weekendSpend;
    return {
        weekday: {
            totalSpend: weekdaySpend,
            txnCount: weekdayCount,
            avgPerTxn: weekdayCount > 0 ? weekdaySpend / weekdayCount : 0,
        },
        weekend: {
            totalSpend: weekendSpend,
            txnCount: weekendCount,
            avgPerTxn: weekendCount > 0 ? weekendSpend / weekendCount : 0,
        },
        weekendShare: total > 0 ? (weekendSpend / total) * 100 : 0,
    };
}

/**
 * Which half of the week a category actually happens in.
 *
 * **Raw totals cannot answer this and must not be presented as if they do.**
 * Saturday and Sunday are two days in seven, so all but the most lopsided
 * categories spend more from Monday to Friday — a bar chart of the two totals
 * says "weekday" for almost everything, which is a fact about the calendar rather
 * than about the user.
 *
 * So the figure that decides the verdict is a **share compared against this
 * user's own overall weekend share**, the same "unusual for *this* user" framing
 * `getSpendingRhythm` uses. Groceries at 34% weekend against an account at 22% is
 * a weekend habit; the same 34% in an account that sits at 36% is not.
 *
 * `byDayOfWeek` is returned alongside, Monday first and always seven entries —
 * a day with nothing on it is a real answer, and a gap in the row would read as
 * missing data.
 */
function shapeWeekPattern(rows: DowRollup[], accountRows: DowRollup[]) {
    const own = splitWeek(rows);
    const account = splitWeek(accountRows);
    const diff = own.weekendShare - account.weekendShare;
    const hasData = own.weekday.txnCount + own.weekend.txnCount > 0;

    const byIndex = new Map(rows.map((r) => [r._id, r]));

    return {
        ...own,
        accountWeekendShare: account.weekendShare,
        /** How many points above (or below) the user's own weekend share this category runs. */
        weekendShareDelta: diff,
        lean: (!hasData
            ? "unknown"
            : diff > LEAN_TOLERANCE
              ? "weekend"
              : diff < -LEAN_TOLERANCE
                ? "weekday"
                : "even") as "weekend" | "weekday" | "even" | "unknown",
        byDayOfWeek: DOW_MONDAY_FIRST.map((dow, i) => {
            const row = byIndex.get(dow);
            return {
                day: DOW_LABELS[i]!,
                isWeekend: WEEKEND_DOW.has(dow),
                totalSpend: row?.totalSpend ?? 0,
                txnCount: row?.txnCount ?? 0,
                avgPerTxn: row && row.txnCount > 0 ? row.totalSpend / row.txnCount : 0,
            };
        }),
    };
}

function shapeMerchants(rows: MerchantRollup[]) {
    return rows.map((m) => ({
        name: m.name ?? "Unnamed",
        kind: m.kind,
        category: m.category,
        totalSpend: m.totalSpend,
        txnCount: m.txnCount,
        avgTxnAmount: m.txnCount > 0 ? m.totalSpend / m.txnCount : 0,
        lastDate: iso(m.lastDate),
    }));
}

/**
 * Everything one category knows about itself — the drill-down behind a bar.
 *
 * Two halves, and they come from different places on purpose.
 *
 * **The monthly series is read back off `MonthlyStats`, not recomputed.**
 * `momDelta`, `rollingAvg6m` and `isSpiked` are derived against a rolling
 * six-month window in `statsAggregatorTool.ts`; recomputing them here would be a
 * second implementation of the same rule, free to drift from the one the
 * dashboard bar already rendered. Months where the category never appeared are
 * emitted as explicit zeroes rather than omitted — a month you spent nothing on
 * Travel is a real data point, and leaving a hole would let the chart imply the
 * timeline simply ended.
 *
 * **Per-merchant spend inside a category has no home in the schema**, so that
 * half is aggregated here. `Cluster` carries `clusterLength` (a transaction
 * count) and no money at all, and `MonthlyStats.topMerchants` is a per-month top
 * ten — union those across months and you get a ranking that silently omits
 * every merchant that never cracked a monthly top ten, which is exactly the long
 * tail a category page exists to show.
 *
 * The pipeline deliberately mirrors `statsAggregatorTool`'s: same `$lookup`,
 * same `$ifNull(cluster.category, "Other")`. A drill-down whose total disagreed
 * with the bar it was reached from would be worse than no drill-down.
 */
export async function getCategoryDetail(userId: string, category: string) {
    type DowRow = { _id: number; totalSpend: number; txnCount: number };
    type Facets = [{
        totals: { totalSpend: number; txnCount: number; largestTxnAmount: number }[];
        merchants: MerchantRollup[];
        largest: {
            _id: Oid;
            date: BsonDate;
            description: string;
            debitAmount: number;
            name: string | null;
        }[];
        byDayOfWeek: DowRow[];
        /** The same split across *every* category — the yardstick this one is read against. */
        accountByDayOfWeek: DowRow[];
    }];

    const [facets, monthly] = await Promise.all([
        prisma.finalTransactionData.aggregateRaw({
            pipeline: [
                ...spendStages(userId),
                /*
                 * `$dayOfWeek` — 1 = Sunday … 7 = Saturday, and weekend is [1, 7].
                 * Deliberately the identical expression `statsAggregatorTool` uses
                 * for `MonthlyStats.weekdayVsWeekend`: the account-wide split is
                 * already on the dashboard, and a per-category one that drew its
                 * week boundary differently would contradict it on the same data.
                 *
                 * Added *before* the category match, because the account-wide
                 * comparison below needs every category's rows.
                 */
                { $addFields: { dow: { $dayOfWeek: "$date" } } },
                {
                    $facet: {
                        totals: [
                            { $match: { category } },
                            {
                                $group: {
                                    _id: null,
                                    totalSpend: { $sum: "$debitAmount" },
                                    txnCount: { $sum: 1 },
                                    largestTxnAmount: { $max: "$debitAmount" },
                                },
                            },
                            { $project: { _id: 0 } },
                        ],
                        merchants: [{ $match: { category } }, ...merchantGroupStages(25)],
                        largest: [
                            { $match: { category } },
                            { $sort: { debitAmount: -1 } },
                            { $limit: 5 },
                            { $project: { date: 1, description: 1, debitAmount: 1, name: "$label" } },
                        ],
                        byDayOfWeek: [
                            { $match: { category } },
                            {
                                $group: {
                                    _id: "$dow",
                                    totalSpend: { $sum: "$debitAmount" },
                                    txnCount: { $sum: 1 },
                                },
                            },
                        ],
                        accountByDayOfWeek: [
                            {
                                $group: {
                                    _id: "$dow",
                                    totalSpend: { $sum: "$debitAmount" },
                                    txnCount: { $sum: 1 },
                                },
                            },
                        ],
                    },
                },
            ],
        }) as unknown as Promise<Facets>,
        prisma.monthlyStats.findMany({
            where: { userId },
            select: { month: true, totalExpenses: true, categoryBreakdown: true },
            orderBy: { month: "asc" },
        }),
    ]);

    const raw = facets[0];
    const totals = raw?.totals[0] ?? { totalSpend: 0, txnCount: 0, largestTxnAmount: 0 };

    const EMPTY = {
        totalSpend: 0, txnCount: 0, avgTxnAmount: 0, shareOfTotal: 0,
        momDelta: 0, momDeltaAmount: 0, rollingAvg6m: 0,
        isSpiked: false, trendDirection: "stable" as const,
    };

    const months = monthly.map((m) => {
        const entry = (m.categoryBreakdown as Array<Record<string, unknown>> | null)
            ?.find((c) => c["category"] === category);
        return { month: m.month, monthTotalExpenses: m.totalExpenses, ...EMPTY, ...(entry ?? {}) };
    });

    const allTimeExpenses = monthly.reduce((sum, m) => sum + m.totalExpenses, 0);

    /**
     * The smooth curve drawn over the monthly bars.
     *
     * Computed here rather than in the browser for the reason `rollingAvg6m` is:
     * "what is the underlying trend" is a modelling question with a bandwidth in
     * it, and two implementations of it would be two different answers to the
     * same chart. The response carries the curve already sampled four times per
     * month, so the UI plots a polyline and interpolates nothing.
     *
     * It answers a different question from the dashed baseline beside it:
     * `rollingAvg6m` is trailing and per-month ("what was normal *before* this
     * month"), the kernel curve is centred and continuous ("which way is this
     * going"). Both on one chart is deliberate.
     */
    const trendCurve = gaussianSmooth(months.map((m) => Number(m.totalSpend) || 0));

    return {
        category,
        totalSpend: totals.totalSpend,
        txnCount: totals.txnCount,
        avgTxnAmount: totals.txnCount > 0 ? totals.totalSpend / totals.txnCount : 0,
        largestTxnAmount: totals.largestTxnAmount,
        /** Share of *all* spending, every month — not of any single month. */
        shareOfTotal: allTimeExpenses > 0 ? (totals.totalSpend / allTimeExpenses) * 100 : 0,
        monthsActive: months.filter((m) => m.totalSpend > 0).length,
        months,
        trendCurve,
        weekPattern: shapeWeekPattern(raw?.byDayOfWeek ?? [], raw?.accountByDayOfWeek ?? []),
        merchants: shapeMerchants(raw?.merchants ?? []),
        largestTransactions: (raw?.largest ?? []).map((t) => ({
            id: t._id.$oid,
            date: iso(t.date),
            description: t.description,
            amount: t.debitAmount,
            name: t.name,
        })),
    };
}

/**
 * Who this user's money actually goes to, ranked by how much of it.
 *
 * **This used to return `Cluster` rows ordered by `clusterLength`** — a merchant
 * list ranked by *number of transactions*, carrying no money at all, because
 * `Cluster` stores none. That ordering answers a question nobody asks: forty
 * ₹80 bus fares outranked one ₹40,000 flight. It also filtered to
 * `merchantName != null`, which silently dropped every rent payment, EMI and
 * P2P transfer — `merchantName` is deliberately null for exactly those, with
 * `payeeName` carrying the counterparty instead.
 *
 * Nothing consumed the old shape (both frontend actions existed but were
 * unused), so it was changed rather than duplicated.
 */
export async function getMerchants(userId: string, category?: string, limit = 25) {
    const rows = await prisma.finalTransactionData.aggregateRaw({
        pipeline: [
            ...spendStages(userId),
            ...(category ? [{ $match: { category } }] : []),
            ...merchantGroupStages(limit),
        ],
    }) as unknown as MerchantRollup[];

    return shapeMerchants(rows);
}

/**
 * Which payee spellings were folded into which, keyed by the surviving name.
 *
 * Shaped for lookup rather than as a flat list, because that is how every consumer uses it:
 * a screen holds a payee name and needs to know whether *that* name is a merge. A flat array
 * would push the grouping into each client and invite four slightly different versions of it.
 *
 * `totalTxns` is the transactions the folded-in spellings carried — not the payee's total —
 * because the question the chip answers is "how much of this was previously filed elsewhere?".
 * Ordered by that count so the popup leads with the spelling that mattered most.
 */
export async function getPayeeAliases(userId: string) {
    const rows = await prisma.payeeAlias.findMany({
        where: { userId },
        select: { canonical: true, alias: true, txnCount: true },
        orderBy: [{ canonical: "asc" }, { txnCount: "desc" }],
    });

    const out: Record<string, { totalTxns: number; aliases: { name: string; txnCount: number }[] }> = {};
    for (const row of rows) {
        const entry = (out[row.canonical] ??= { totalTxns: 0, aliases: [] });
        entry.aliases.push({ name: row.alias, txnCount: row.txnCount });
        entry.totalTxns += row.txnCount;
    }
    return out;
}

/* --------------------------------- spending rhythm -------------------------------- */

export type RhythmAnomalyKind = "weekday_heavy" | "weekend_heavy" | "timing_shift";

export interface RhythmAnomaly {
    /** "YYYY-MM". */
    month: string;
    kind: RhythmAnomalyKind;
    /** This month's figure: weekend share of spend, or the leading week's share. */
    value: number;
    /** What that figure usually is, as a robust median across every month. */
    baseline: number;
    /** How far from usual, in percentage points — what the list is ranked on. */
    deviation: number;
    /** `timing_shift` only: which week led this month, and which usually leads. */
    week?: string;
    usualWeek?: string;
}

/** Fewer months than this and "usual" is not a thing that exists yet. */
const RHYTHM_MIN_MONTHS = 4;

/**
 * A deviation has to clear this many percentage points *and* the IQR test.
 *
 * The floor matters more than the statistical test on well-behaved data: a user whose weekend
 * share sits between 22% and 26% every month has a tiny IQR, so 1.5×IQR alone would flag a
 * 27% month as remarkable. It isn't. Twelve points is roughly "a different habit", not noise.
 */
const RHYTHM_MIN_DEVIATION = 0.12;

/** At most this many, worst first — a panel of exceptions is not a panel of exceptions. */
const RHYTHM_MAX_ANOMALIES = 3;

const WEEK_LABELS: Record<string, string> = {
    week1: "1st–7th",
    week2: "8th–14th",
    week3: "15th–21st",
    week4: "22nd on",
};

/**
 * Months whose spending rhythm broke the user's own pattern.
 *
 * ---
 *
 * **The panel this feeds shows all-time totals, which is exactly where an anomaly hides.**
 * Summed across a year, a single month where the habit inverted is a rounding error — the bar
 * still says "weekends cost more" and the one month that says otherwise is invisible. That
 * month is the interesting part: it is the one where something happened.
 *
 * Deterministic and read-time. **Not persisted on `MonthlyStats`**, unlike `isSpiked`, and the
 * difference is deliberate: `isSpiked` compares a category against its own trailing six months,
 * so it is a fact about that month that stays true. "Unusual for this user" is a fact about the
 * *whole* set and changes as months arrive — a persisted flag would need the cascade recompute
 * `rollingAvg6m` needs, and would silently go stale the moment it didn't run.
 *
 * Two kinds, both robust (median + IQR, from `stats/robust.ts`) so one extreme month cannot
 * define the baseline it is then measured against:
 *
 *  - **weekday/weekend inversion** — the share of spend landing at the weekend, against the
 *    median share. This is the one the user asked for: "weekends are usually dearer, but April
 *    went the other way".
 *  - **timing shift** — a different week of the month led the spending than usually leads it.
 *
 * Shares, never totals. A month with a big one-off transfer moves every total and no share, and
 * flagging that would report the size of a month rather than the shape of it.
 */
export async function getSpendingRhythm(userId: string) {
    const months = await prisma.monthlyStats.findMany({
        where: { userId },
        select: { month: true, weekdayVsWeekend: true, timeOfMonth: true },
        orderBy: { month: "asc" },
    });

    type Slice = { totalSpend?: number } | null | undefined;
    const spend = (s: Slice) => (typeof s?.totalSpend === "number" ? s.totalSpend : 0);

    const rows = months.map((m) => {
        const wvw = m.weekdayVsWeekend as { weekday?: Slice; weekend?: Slice } | null;
        const tom = m.timeOfMonth as Record<string, Slice> | null;
        const weekday = spend(wvw?.weekday);
        const weekend = spend(wvw?.weekend);
        const dayTotal = weekday + weekend;

        const weeks = (["week1", "week2", "week3", "week4"] as const).map((k) => ({
            key: k,
            total: spend(tom?.[k]),
        }));
        const weekTotal = weeks.reduce((s, w) => s + w.total, 0);
        const lead = weeks.reduce((best, w) => (w.total > best.total ? w : best), weeks[0]!);

        return {
            month: m.month,
            weekendShare: dayTotal > 0 ? weekend / dayTotal : null,
            leadWeek: weekTotal > 0 ? lead.key : null,
            leadShare: weekTotal > 0 ? lead.total / weekTotal : 0,
            /** Every week's share this month, so a shift can be judged *within* the month. */
            shares: Object.fromEntries(
                weeks.map((w) => [w.key, weekTotal > 0 ? w.total / weekTotal : 0])
            ) as Record<string, number>,
        };
    });

    const shares = rows.map((r) => r.weekendShare).filter((v): v is number => v !== null);
    if (shares.length < RHYTHM_MIN_MONTHS) return { anomalies: [] as RhythmAnomaly[], monthsCompared: shares.length };

    const baseline = median(shares);
    const { lowerFence, upperFence } = iqrBounds(shares);

    const anomalies: RhythmAnomaly[] = [];

    for (const row of rows) {
        if (row.weekendShare === null) continue;
        const deviation = row.weekendShare - baseline;
        const beyondIqr = row.weekendShare < lowerFence || row.weekendShare > upperFence;
        if (!beyondIqr || Math.abs(deviation) < RHYTHM_MIN_DEVIATION) continue;
        anomalies.push({
            month: row.month,
            kind: deviation > 0 ? "weekend_heavy" : "weekday_heavy",
            value: Math.round(row.weekendShare * 1000) / 1000,
            baseline: Math.round(baseline * 1000) / 1000,
            deviation: Math.round(Math.abs(deviation) * 1000) / 1000,
        });
    }

    /**
     * The usual leader is the mode, not the mean — "which week wins" is categorical, and an
     * average of week indices is a number no week corresponds to.
     */
    const leadCounts = new Map<string, number>();
    for (const r of rows) if (r.leadWeek) leadCounts.set(r.leadWeek, (leadCounts.get(r.leadWeek) ?? 0) + 1);
    const usualWeek = [...leadCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const usualWeekLabel = usualWeek ? WEEK_LABELS[usualWeek] : undefined;
    if (usualWeek && usualWeekLabel && (leadCounts.get(usualWeek) ?? 0) >= rows.length / 2) {
        for (const row of rows) {
            if (!row.leadWeek || row.leadWeek === usualWeek) continue;
            const weekLabel = WEEK_LABELS[row.leadWeek];
            if (!weekLabel) continue;

            /**
             * Compared **within the month**, against what the usual leader managed *that*
             * month — not against its typical share across the year.
             *
             * Measuring against the yearly figure produced a false positive on real data:
             * May led with "22nd on" at 50.7% where "1st–7th" usually takes 53%, which the
             * across-months test scored as a 2-point deviation and reported as an anomaly.
             * It isn't one — the month was just as concentrated as usual, in a week one
             * position over, and by that framing the "unusual" figure was *lower* than the
             * baseline it was flagged against. The question worth asking is whether the
             * habitual week actually gave way, and only a same-month comparison answers it:
             * in April "22nd on" took 71.8% while "1st–7th" took a fraction of that.
             */
            const usualShareThisMonth = row.shares[usualWeek] ?? 0;
            const gap = row.leadShare - usualShareThisMonth;
            if (gap < RHYTHM_MIN_DEVIATION) continue;

            anomalies.push({
                month: row.month,
                kind: "timing_shift",
                value: Math.round(row.leadShare * 1000) / 1000,
                baseline: Math.round(usualShareThisMonth * 1000) / 1000,
                deviation: Math.round(gap * 1000) / 1000,
                week: weekLabel,
                usualWeek: usualWeekLabel,
            });
        }
    }

    return {
        anomalies: anomalies.sort((a, b) => b.deviation - a.deviation).slice(0, RHYTHM_MAX_ANOMALIES),
        monthsCompared: shares.length,
    };
}
