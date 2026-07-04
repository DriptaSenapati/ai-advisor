import { tool } from "langchain";
import z from "zod";
import prisma from "../../../prismaClient.js";

type MerchantCandidate = {
    _id: { merchantName: string; debitAmount: number };
    months: string[];
    monthCount: number;
    lastTransactionDate: { '$date': string };
    category: string | null;
};

type PayeeCandidate = {
    _id: { payeeName: string; debitAmount: number };
    months: string[];
    monthCount: number;
    lastTransactionDate: { '$date': string };
    category: string | null;
};

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
    if (avgGap > 10 && differenceInMonths >= 24) return "annually";
    return null;
}

function checkIsActive(months: string[], referenceDate: Date): boolean {
    const current = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}`;
    const prev = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
    const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    return months.includes(current) || months.includes(prevMonth);
}

function getCancellability(category: string | null, isPayee: boolean): string {
    if (isPayee) return "obligation";
    switch (category) {
        case "Entertainment & Subscriptions": return "cancellable";
        case "Finance & Investments":         return "pausable";
        case "Bills & Utilities":             return "essential";
        case "Health & Medical":              return "essential";
        case "Groceries":                     return "essential";
        case "Transfers & Payments":          return "obligation";
        default:                              return "obligation";
    }
}

const recurringPatternTool = tool(async ({ affectedMonths }) => {
    if (affectedMonths.length === 0) return "No affected months.";

    const sorted = [...affectedMonths].sort();
    const firstMonth = sorted[0]!;
    const lastMonth = sorted[sorted.length - 1]!;

    const [fy, fm] = firstMonth.split("-").map(Number);
    const [ly, lm] = lastMonth.split("-").map(Number);
    const rangeStart = new Date(fy!, fm! - 1, 1);
    const rangeEnd = new Date(ly!, lm!, 1);

    // ── Shared: total months span + latest transaction date ──────────────────
    const distinctMonths = await prisma.finalTransactionData.aggregateRaw({
        pipeline: [
            { $group: { _id: { year: { $year: "$date" }, month: { $month: "$date" } } } },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
        ],
    }) as unknown as { _id: { year: number; month: number } }[];

    const differenceInMonths = distinctMonths.length >= 2
        ? (distinctMonths[distinctMonths.length - 1]!._id.year - distinctMonths[0]!._id.year) * 12 +
          (distinctMonths[distinctMonths.length - 1]!._id.month - distinctMonths[0]!._id.month)
        : 0;

    const maxDateResult = await prisma.finalTransactionData.aggregateRaw({
        pipeline: [{ $group: { _id: null, maxDate: { $max: "$date" } } }],
    }) as unknown as { maxDate: { $date: string } }[];

    const maxTransactionDate = maxDateResult[0]?.maxDate
        ? new Date(maxDateResult[0].maxDate.$date)
        : new Date();

    const dateRangeFilter = {
        $gte: { $date: { $numberLong: String(rangeStart.getTime()) } },
        $lt: { $date: { $numberLong: String(rangeEnd.getTime()) } },
    };

    let upserted = 0;

    // ── Pass 1: Merchant-based recurring patterns ─────────────────────────────
    const affectedMerchantResult = await prisma.finalTransactionData.aggregateRaw({
        pipeline: [
            { $match: { debitAmount: { $gt: 0 }, clusterId: { $exists: true, $ne: null }, date: dateRangeFilter } },
            { $lookup: { from: "Cluster", localField: "clusterId", foreignField: "_id", as: "cluster" } },
            { $unwind: "$cluster" },
            { $match: { "cluster.merchantName": { $ne: null } } },
            { $group: { _id: "$cluster.merchantName" } },
        ],
    }) as unknown as { _id: string }[];

    const merchantNames = affectedMerchantResult.map(m => m._id);

    if (merchantNames.length > 0) {
        console.log(`[Recurring] Re-evaluating ${merchantNames.length} merchant(s): ${merchantNames.join(", ")}`);

        const merchantCandidates = await prisma.finalTransactionData.aggregateRaw({
            pipeline: [
                { $match: { debitAmount: { $gt: 0 }, clusterId: { $exists: true, $ne: null } } },
                { $lookup: { from: "Cluster", localField: "clusterId", foreignField: "_id", as: "cluster" } },
                { $unwind: "$cluster" },
                { $match: { "cluster.merchantName": { $in: merchantNames } } },
                { $addFields: { month: { $dateToString: { format: "%Y-%m", date: "$date" } } } },
                {
                    $group: {
                        _id: { merchantName: "$cluster.merchantName", debitAmount: "$debitAmount", month: "$month" },
                        maxDateInMonth: { $max: "$date" },
                        category: { $first: "$cluster.category" },
                    },
                },
                {
                    $group: {
                        _id: { merchantName: "$_id.merchantName", debitAmount: "$_id.debitAmount" },
                        months: { $push: "$_id.month" },
                        monthCount: { $sum: 1 },
                        lastTransactionDate: { $max: "$maxDateInMonth" },
                        category: { $first: "$category" },
                    },
                },
                { $match: { monthCount: { $gte: 3 } } },
            ],
        }) as unknown as MerchantCandidate[];

        const recurringMerchants = merchantCandidates.filter(c => detectFrequency(c.months, differenceInMonths) !== null);

        for (const candidate of recurringMerchants) {
            const merchantName = candidate._id.merchantName;
            const estimatedMonthlyAmount = candidate._id.debitAmount;
            const frequency = detectFrequency(candidate.months, differenceInMonths)!;
            const isActive = checkIsActive(candidate.months, maxTransactionDate);
            const cancellability = getCancellability(candidate.category, false);
            const lastTransactionDate = new Date(candidate.lastTransactionDate.$date);

            const existing = await prisma.recurringPattern.findFirst({
                where: { merchantName, payeeName: null, estimatedMonthlyAmount }
            });
            if (existing) {
                await prisma.recurringPattern.update({
                    where: { id: existing.id },
                    data: { category: candidate.category, frequency, monthsDetected: candidate.monthCount, cancellability, isActive, lastTransactionDate },
                });
            } else {
                await prisma.recurringPattern.create({
                    data: { merchantName, payeeName: null, category: candidate.category, estimatedMonthlyAmount, frequency, monthsDetected: candidate.monthCount, cancellability, isActive, lastTransactionDate },
                });
            }
            upserted++;
        }
    }

    // ── Pass 2: Payee-based recurring patterns (P2P transfers) ────────────────
    const affectedPayeeResult = await prisma.finalTransactionData.aggregateRaw({
        pipeline: [
            { $match: { debitAmount: { $gt: 0 }, clusterId: { $exists: true, $ne: null }, date: dateRangeFilter } },
            { $lookup: { from: "Cluster", localField: "clusterId", foreignField: "_id", as: "cluster" } },
            { $unwind: "$cluster" },
            { $match: { "cluster.merchantName": null, "cluster.payeeName": { $ne: null } } },
            { $group: { _id: "$cluster.payeeName" } },
        ],
    }) as unknown as { _id: string }[];

    const payeeNames = affectedPayeeResult.map(p => p._id);

    if (payeeNames.length > 0) {
        console.log(`[Recurring] Re-evaluating ${payeeNames.length} payee(s): ${payeeNames.join(", ")}`);

        const payeeCandidates = await prisma.finalTransactionData.aggregateRaw({
            pipeline: [
                { $match: { debitAmount: { $gt: 0 }, clusterId: { $exists: true, $ne: null } } },
                { $lookup: { from: "Cluster", localField: "clusterId", foreignField: "_id", as: "cluster" } },
                { $unwind: "$cluster" },
                { $match: { "cluster.merchantName": null, "cluster.payeeName": { $in: payeeNames } } },
                { $addFields: { month: { $dateToString: { format: "%Y-%m", date: "$date" } } } },
                {
                    $group: {
                        _id: { payeeName: "$cluster.payeeName", debitAmount: "$debitAmount", month: "$month" },
                        maxDateInMonth: { $max: "$date" },
                        category: { $first: "$cluster.category" },
                    },
                },
                {
                    $group: {
                        _id: { payeeName: "$_id.payeeName", debitAmount: "$_id.debitAmount" },
                        months: { $push: "$_id.month" },
                        monthCount: { $sum: 1 },
                        lastTransactionDate: { $max: "$maxDateInMonth" },
                        category: { $first: "$category" },
                    },
                },
                { $match: { monthCount: { $gte: 3 } } },
            ],
        }) as unknown as PayeeCandidate[];

        const recurringPayees = payeeCandidates.filter(c => detectFrequency(c.months, differenceInMonths) !== null);

        for (const candidate of recurringPayees) {
            const payeeName = candidate._id.payeeName;
            const estimatedMonthlyAmount = candidate._id.debitAmount;
            const frequency = detectFrequency(candidate.months, differenceInMonths)!;
            const isActive = checkIsActive(candidate.months, maxTransactionDate);
            const cancellability = getCancellability(candidate.category, true);
            const lastTransactionDate = new Date(candidate.lastTransactionDate.$date);

            const existing = await prisma.recurringPattern.findFirst({
                where: { merchantName: null, payeeName, estimatedMonthlyAmount }
            });
            if (existing) {
                await prisma.recurringPattern.update({
                    where: { id: existing.id },
                    data: { category: candidate.category, frequency, monthsDetected: candidate.monthCount, cancellability, isActive, lastTransactionDate },
                });
            } else {
                await prisma.recurringPattern.create({
                    data: { merchantName: null, payeeName, category: candidate.category, estimatedMonthlyAmount, frequency, monthsDetected: candidate.monthCount, cancellability, isActive, lastTransactionDate },
                });
            }
            upserted++;
        }
    }

    return `Recurring patterns upserted: ${upserted} (${merchantNames.length} merchant(s), ${payeeNames.length} payee(s) evaluated)`;
}, {
    name: "recurringPatternTool",
    description: "Re-evaluates recurring payment patterns for merchants and payees that have transactions in the affected months.",
    schema: z.object({
        affectedMonths: z.array(z.string()).describe("YYYY-MM months whose transactions were affected by the new upload"),
    }),
});

export { recurringPatternTool };
