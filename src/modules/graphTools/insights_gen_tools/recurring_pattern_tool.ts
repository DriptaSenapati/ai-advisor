import { tool } from "langchain";
import z from "zod";
import prisma from "../../../prismaClient.js";

type RecurringCandidate = {
    _id: { merchantName: string; debitAmount: number };
    months: string[];
    monthCount: number;
    lastTransactionDate: { '$date': string };
    category: string | null;
};

// Returns the longest consecutive month run (e.g. ["2025-01","2025-02","2025-03"] → 3)
// function longestConsecutiveRun(months: string[]): number {
//     const sorted = [...new Set(months)].sort();
//     let best = 1;
//     let current = 1;
//     for (let i = 1; i < sorted.length; i++) {
//         const [y1, m1] = sorted[i - 1]!.split("-").map(Number);
//         const [y2, m2] = sorted[i]!.split("-").map(Number);
//         const gap = (y2! - y1!) * 12 + (m2! - m1!);
//         if (gap === 1) {
//             current++;
//             if (current > best) best = current;
//         } else {
//             current = 1;
//         }
//     }
//     return best;
// }

function detectFrequency(months: string[], differenceInMonths: number): "monthly" | "quarterly" | "annually" | null {
    const sorted = [...new Set(months)].sort();
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
        const [y1, m1] = sorted[i - 1]!.split("-").map(Number);
        const [y2, m2] = sorted[i]!.split("-").map(Number);
        gaps.push((y2! - y1!) * 12 + (m2! - m1!));
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (avgGap <= 1.5) return "monthly";
    if (avgGap <= 3.5) return "quarterly";

    if (avgGap > 10 && differenceInMonths >= 24) {
        // Special case: if the average gap is around 12 months but all transactions happen in the same month across years, classify as annually
        return "annually";
    }

    return null;
}

function checkIsActive(months: string[], referenceDate: Date): boolean {
    const current = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}`;
    const prev = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
    const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    return months.includes(current) || months.includes(prevMonth);
}

// Only subscriptions are cancellable — EMI, bills, investments are obligations
function isCancellable(category: string | null): boolean {
    return category === "Entertainment & Subscriptions";
}

const recurringPatternTool = tool(async ({ monthToBeCovered, isFirstRun }) => {
    let windowStart: Date | null;
    let differenceInMonths: number;

    if (isFirstRun) {
        windowStart = null;
        console.log("Starting first run of recurringPatternTool for all available data...");

        const distinctMonths = await prisma.finalTransactionData.aggregateRaw({
            pipeline: [
                {
                    $group: {
                        _id: { year: { $year: "$date" }, month: { $month: "$date" } },
                    },
                },
                { $sort: { "_id.year": 1, "_id.month": 1 } },
            ],
        }) as unknown as { _id: { year: number; month: number } }[];

        if (distinctMonths.length === 0) return "No transactions to process.";

        const first = distinctMonths[0]!._id;
        const last = distinctMonths[distinctMonths.length - 1]!._id;
        differenceInMonths = (last.year - first.year) * 12 + (last.month - first.month);
        console.log(`First run: data spans ${differenceInMonths} months`);
    } else {
        const now = new Date();
        windowStart = new Date(now.getFullYear(), now.getMonth() - (monthToBeCovered! - 1), 1);
        differenceInMonths = monthToBeCovered! - 1;
    }

    const maxDateResult = await prisma.finalTransactionData.aggregateRaw({
        pipeline: [{ $group: { _id: null, maxDate: { $max: "$date" } } }],
    }) as unknown as { maxDate: { $date: string } }[];

    const maxTransactionDate = maxDateResult[0]?.maxDate
        ? new Date(maxDateResult[0].maxDate.$date)
        : new Date();


    const dateMatchClause = windowStart
        ? { date: { $gte: { $date: { $numberLong: String(windowStart.getTime()) } } } }
        : {};

    const candidates = await prisma.finalTransactionData.aggregateRaw({
        pipeline: [
            // Only debit transactions belonging to a cluster
            {
                $match: {
                    debitAmount: { $gt: 0 },
                    clusterId: { $exists: true, $ne: null },
                    ...dateMatchClause,
                },
            },
            // Join Cluster early to get merchantName and category
            {
                $lookup: {
                    from: "Cluster",
                    localField: "clusterId",
                    foreignField: "_id",
                    as: "cluster",
                },
            },
            { $unwind: "$cluster" },
            // Exclude transfers, ATM, salary etc. that have no merchantName
            { $match: { "cluster.merchantName": { $ne: null } } },
            // Add month string per transaction
            {
                $addFields: {
                    month: { $dateToString: { format: "%Y-%m", date: "$date" } },
                },
            },
            // Deduplicate: one entry per (merchantName, debitAmount, month)
            {
                $group: {
                    _id: {
                        merchantName: "$cluster.merchantName",
                        debitAmount: "$debitAmount",
                        month: "$month",
                    },
                    maxDateInMonth: { $max: "$date" },
                    category: { $first: "$cluster.category" },
                },
            },
            // For each (merchantName, exact amount) pair — collect the months it appeared in
            {
                $group: {
                    _id: {
                        merchantName: "$_id.merchantName",
                        debitAmount: "$_id.debitAmount",
                    },
                    months: { $push: "$_id.month" },
                    monthCount: { $sum: 1 },
                    lastTransactionDate: { $max: "$maxDateInMonth" },
                    category: { $first: "$category" },
                },
            },
            // Pre-filter: must appear in at least 3 months
            { $match: { monthCount: { $gte: 3 } } },
            {
                $project: {
                    _id: 1,
                    months: 1,
                    monthCount: 1,
                    lastTransactionDate: 1,
                    category: 1,
                },
            },
        ],
    }) as unknown as RecurringCandidate[];


    // Filter in TypeScript: consecutive run should be monthly, quarterly, or annually with tight month range. This is because doing the consecutive check in Mongo is complex and we want to leverage TypeScript for flexibility in tweaking the algorithm.
    const recurring = candidates.filter((c) => detectFrequency(c.months, differenceInMonths) !== null);

    let upserted = 0;

    for (const candidate of recurring) {
        const merchantName = candidate._id.merchantName;
        const estimatedMonthlyAmount = candidate._id.debitAmount;
        const frequency = detectFrequency(candidate.months, differenceInMonths)!;
        const isActive = checkIsActive(candidate.months, maxTransactionDate);
        const cancellable = isCancellable(candidate.category);
        const lastTransactionDate = new Date(candidate.lastTransactionDate.$date);

        await prisma.recurringPattern.upsert({
            where: { merchantName_estimatedMonthlyAmount: { merchantName, estimatedMonthlyAmount } },
            update: { category: candidate.category, frequency, monthsDetected: candidate.monthCount, isCancellable: cancellable, isActive, lastTransactionDate },
            create: { merchantName, category: candidate.category, estimatedMonthlyAmount, frequency, monthsDetected: candidate.monthCount, isCancellable: cancellable, isActive, lastTransactionDate },
        });

        upserted++;
    }

    return `Recurring patterns upserted: ${upserted}`;
}, {
    name: "recurringPatternTool",
    description: `Detects recurring payments from clustered transaction data.
                  A payment is recurring if the exact same debitAmount for a cluster
                  appears in 3+ consecutive months. Upserts RecurringPattern records
                  and refreshes isActive flags on each run.`,
    schema: z.object({
        monthToBeCovered: z.int().min(2).max(12).optional(),
        isFirstRun: z.boolean(),
    }),
});

export { recurringPatternTool };
