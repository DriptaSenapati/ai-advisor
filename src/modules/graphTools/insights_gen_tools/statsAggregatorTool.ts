import { tool } from "langchain";
import z from "zod";
import prisma from "../../../prismaClient.js";

function getMonthBounds(month: string) {
    const [year, mon] = month.split("-").map(Number);
    return {
        start: new Date(year!, mon! - 1, 1),
        end: new Date(year!, mon!, 1),
    };
}

function nextMonth(month: string): string {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y!, m!, 1); // m is 1-indexed, so new Date(y, m, 1) = first of next month
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type AggregationResult = [{
    totals: { totalIncome: number; totalExpenses: number; closingBalance: number }[];
    refunds: { totalRefunds: number; refundCount: number }[];
    categoryBreakdown: { category: string; totalSpend: number; txnCount: number; avgTxnAmount: number }[];
    topMerchants: { merchantName: string; category: string; totalSpend: number; txnCount: number }[];
    weekdayVsWeekend: { _id: boolean; totalSpend: number; txnCount: number }[];
    timeOfMonth: { _id: string; totalSpend: number; txnCount: number }[];
}];

const statsAggregatorTool = tool(async ({ affectedMonths }) => {
    if (affectedMonths.length === 0) return "No months to process.";

    const sorted = [...affectedMonths].sort();

    // Cascade: recompute the month immediately after the last affected month
    // so its momDelta references up-to-date data
    const cascade = nextMonth(sorted[sorted.length - 1]!);
    const cascadeExists = await prisma.monthlyStats.findFirst({ where: { month: cascade } });
    const monthsToProcess = cascadeExists ? [...sorted, cascade] : sorted;

    console.log(`[Stats Aggregator] Processing: ${monthsToProcess.join(", ")}${cascadeExists ? ` (cascade: ${cascade})` : ""}`);

    for (const month of monthsToProcess) {
        const { start, end } = getMonthBounds(month);

        const result = await prisma.finalTransactionData.aggregateRaw({
            pipeline: [
                {
                    $match: {
                        date: {
                            $gte: { $date: { $numberLong: String(start.getTime()) } },
                            $lt: { $date: { $numberLong: String(end.getTime()) } },
                        },
                    },
                },
                {
                    $lookup: {
                        from: "Cluster",
                        localField: "clusterId",
                        foreignField: "_id",
                        as: "cluster",
                    },
                },
                { $unwind: { path: "$cluster", preserveNullAndEmptyArrays: true } },
                {
                    $addFields: {
                        category: { $ifNull: ["$cluster.category", "Other"] },
                        merchantName: "$cluster.merchantName",
                        isWeekend: { $in: [{ $dayOfWeek: "$date" }, [1, 7]] },
                        weekOfMonth: {
                            $switch: {
                                branches: [
                                    { case: { $lte: [{ $dayOfMonth: "$date" }, 7] }, then: "week1" },
                                    { case: { $lte: [{ $dayOfMonth: "$date" }, 14] }, then: "week2" },
                                    { case: { $lte: [{ $dayOfMonth: "$date" }, 21] }, then: "week3" },
                                ],
                                default: "week4",
                            },
                        },
                    },
                },
                {
                    $facet: {
                        totals: [
                            { $sort: { date: 1 } },
                            {
                                $group: {
                                    _id: null,
                                    totalIncome: { $sum: "$creditAmount" },
                                    totalExpenses: { $sum: "$debitAmount" },
                                    closingBalance: { $last: "$balance" },
                                },
                            },
                        ],
                        refunds: [
                            {
                                $match: {
                                    creditAmount: { $gt: 0 },
                                    merchantName: { $exists: true, $ne: null },
                                },
                            },
                            {
                                $group: {
                                    _id: null,
                                    totalRefunds: { $sum: "$creditAmount" },
                                    refundCount: { $sum: 1 },
                                },
                            },
                        ],
                        categoryBreakdown: [
                            { $match: { debitAmount: { $gt: 0 } } },
                            {
                                $group: {
                                    _id: "$category",
                                    totalSpend: { $sum: "$debitAmount" },
                                    txnCount: { $sum: 1 },
                                },
                            },
                            {
                                $project: {
                                    _id: 0,
                                    category: "$_id",
                                    totalSpend: 1,
                                    txnCount: 1,
                                    avgTxnAmount: { $divide: ["$totalSpend", "$txnCount"] },
                                },
                            },
                            { $sort: { totalSpend: -1 } },
                        ],
                        topMerchants: [
                            {
                                $match: {
                                    debitAmount: { $gt: 0 },
                                    merchantName: { $exists: true, $ne: null },
                                },
                            },
                            {
                                $group: {
                                    _id: { merchantName: "$merchantName", category: "$category" },
                                    totalSpend: { $sum: "$debitAmount" },
                                    txnCount: { $sum: 1 },
                                },
                            },
                            { $sort: { totalSpend: -1 } },
                            { $limit: 10 },
                            {
                                $project: {
                                    _id: 0,
                                    merchantName: "$_id.merchantName",
                                    category: "$_id.category",
                                    totalSpend: 1,
                                    txnCount: 1,
                                },
                            },
                        ],
                        weekdayVsWeekend: [
                            { $match: { debitAmount: { $gt: 0 } } },
                            {
                                $group: {
                                    _id: "$isWeekend",
                                    totalSpend: { $sum: "$debitAmount" },
                                    txnCount: { $sum: 1 },
                                },
                            },
                        ],
                        timeOfMonth: [
                            { $match: { debitAmount: { $gt: 0 } } },
                            {
                                $group: {
                                    _id: "$weekOfMonth",
                                    totalSpend: { $sum: "$debitAmount" },
                                    txnCount: { $sum: 1 },
                                },
                            },
                        ],
                    },
                },
            ],
        }) as unknown as AggregationResult;

        const raw = result[0];
        if (!raw || raw.totals.length === 0) {
            console.log(`[Stats Aggregator] No transactions for ${month}, skipping.`);
            continue;
        }

        const totals = raw.totals[0]!;
        const refundData = raw.refunds[0] ?? { totalRefunds: 0, refundCount: 0 };
        const totalIncome = totals.totalIncome;
        const totalExpenses = totals.totalExpenses;
        const netSavings = totalIncome - totalExpenses;
        const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

        const categoryBreakdown = raw.categoryBreakdown.map((c) => ({
            ...c,
            shareOfTotal: totalExpenses > 0 ? (c.totalSpend / totalExpenses) * 100 : 0,
        }));

        const wdEntry = raw.weekdayVsWeekend.find((w) => !w._id);
        const weEntry = raw.weekdayVsWeekend.find((w) => w._id);
        const weekdayVsWeekend = {
            weekday: {
                totalSpend: wdEntry?.totalSpend ?? 0,
                txnCount: wdEntry?.txnCount ?? 0,
                avgPerTxn: wdEntry && wdEntry.txnCount > 0 ? wdEntry.totalSpend / wdEntry.txnCount : 0,
            },
            weekend: {
                totalSpend: weEntry?.totalSpend ?? 0,
                txnCount: weEntry?.txnCount ?? 0,
                avgPerTxn: weEntry && weEntry.txnCount > 0 ? weEntry.totalSpend / weEntry.txnCount : 0,
            },
        };

        const tomMap = Object.fromEntries(
            raw.timeOfMonth.map((t) => [t._id, { totalSpend: t.totalSpend, txnCount: t.txnCount }])
        );
        const timeOfMonth = {
            week1: tomMap["week1"] ?? { totalSpend: 0, txnCount: 0 },
            week2: tomMap["week2"] ?? { totalSpend: 0, txnCount: 0 },
            week3: tomMap["week3"] ?? { totalSpend: 0, txnCount: 0 },
            week4: tomMap["week4"] ?? { totalSpend: 0, txnCount: 0 },
        };

        const historicalStats = await prisma.monthlyStats.findMany({
            where: { month: { lt: month } },
            orderBy: { month: "desc" },
            take: 6,
        });

        const enrichedCategoryBreakdown = categoryBreakdown.map((cat) => {
            const historical = historicalStats.map((s) => {
                const prev = (s.categoryBreakdown as any[]).find((c: any) => c.category === cat.category);
                return (prev?.totalSpend as number) ?? 0;
            });

            const prevMonthSpend = historical[0] ?? 0;
            const momDeltaAmount = cat.totalSpend - prevMonthSpend;
            const momDelta = prevMonthSpend > 0 ? (momDeltaAmount / prevMonthSpend) * 100 : 0;

            const rollingWindow = [cat.totalSpend, ...historical].slice(0, 6);
            const rollingAvg6m = rollingWindow.reduce((a, b) => a + b, 0) / rollingWindow.length;
            const isSpiked = cat.totalSpend > rollingAvg6m * 2;

            const last3 = [
                cat.totalSpend,
                historical[0] ?? cat.totalSpend,
                historical[1] ?? cat.totalSpend,
            ];
            const trendDirection =
                last3[0]! > last3[1]! && last3[1]! > last3[2]! ? "rising"
                    : last3[0]! < last3[1]! && last3[1]! < last3[2]! ? "falling"
                        : "stable";

            return { ...cat, momDelta, momDeltaAmount, rollingAvg6m, isSpiked, trendDirection };
        });

        const statsData = {
            totalIncome,
            totalExpenses,
            netSavings,
            savingsRate,
            closingBalance: totals.closingBalance,
            totalRefunds: refundData.totalRefunds,
            refundCount: refundData.refundCount,
            categoryBreakdown: enrichedCategoryBreakdown,
            topMerchants: raw.topMerchants,
            weekdayVsWeekend,
            timeOfMonth,
        };

        const existing = await prisma.monthlyStats.findFirst({ where: { month } });
        if (existing) {
            await prisma.monthlyStats.update({ where: { id: existing.id }, data: statsData });
        } else {
            await prisma.monthlyStats.create({ data: { month, ...statsData } });
        }

        console.log(`[Stats Aggregator] Upserted MonthlyStats for ${month}`);
    }

    return `MonthlyStats computed for: ${monthsToProcess.join(", ")}`;
}, {
    name: "statsAggregatorTool",
    description: "Recomputes MonthlyStats for the given affected months plus the immediately following month (momDelta cascade).",
    schema: z.object({
        affectedMonths: z.array(z.string()).describe("List of YYYY-MM months to recompute"),
    }),
});

export { statsAggregatorTool };
