import { tool } from "langchain";
import z from "zod";
import prisma from "../../../prismaClient.js";

const MIN_CREDIT_THRESHOLD = 500;

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

type CreditSourceCandidate = {
    _id: string;
    monthlyAmounts: { month: string; amount: number }[];
    monthCount: number;
    lastTransactionDate: { '$date': string };
    category: string | null;
};

type CreditClusterCandidate = {
    _id: string;  // clusterId hex string (after $toString)
    monthlyAmounts: { month: string; amount: number }[];
    monthCount: number;
    lastTransactionDate: { '$date': string };
    category: string | null;
    centroid: string;
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

function computeCreditRange(amounts: number[]): { median: number; rangeMin: number; rangeMax: number; cv: number } {
    const sorted = [...amounts].sort((a, b) => a - b);
    const n = sorted.length;
    const median = sorted[Math.min(Math.floor(0.5 * n), n - 1)]!;
    const q1 = sorted[Math.min(Math.floor(0.25 * n), n - 1)]!;
    const q3 = sorted[Math.min(Math.floor(0.75 * n), n - 1)]!;
    const iqr = q3 - q1;
    const rangeMin = iqr > 0 ? Math.max(0, q1 - 0.5 * iqr) : median * 0.95;
    const rangeMax = iqr > 0 ? q3 + 0.5 * iqr : median * 1.05;
    const mean = amounts.reduce((a, b) => a + b, 0) / n;
    const variance = amounts.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    return { median, rangeMin, rangeMax, cv };
}

function classifyCreditLabel(
    category: string | null,
    payeeName: string | null,
    median: number,
    cv: number,
): string {
    if (payeeName) return "transfer_in";
    if (category === "Finance & Investments") return "investment_return";
    if (median > 20000 && cv < 0.15) return "salary";
    if (median > 10000 && cv < 0.40) return "rental_income";
    if (cv > 0.40) return "freelance";
    return "unknown";
}

const recurringPatternTool = tool(async ({ affectedMonths, userId }) => {
    if (affectedMonths.length === 0) return "No affected months.";
    if (!userId) throw new Error("userId is required for recurring pattern detection.");

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
            { $match: { userId } },
            { $group: { _id: { year: { $year: "$date" }, month: { $month: "$date" } } } },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
        ],
    }) as unknown as { _id: { year: number; month: number } }[];

    const differenceInMonths = distinctMonths.length >= 2
        ? (distinctMonths[distinctMonths.length - 1]!._id.year - distinctMonths[0]!._id.year) * 12 +
          (distinctMonths[distinctMonths.length - 1]!._id.month - distinctMonths[0]!._id.month)
        : 0;

    const maxDateResult = await prisma.finalTransactionData.aggregateRaw({
        pipeline: [{ $match: { userId } }, { $group: { _id: null, maxDate: { $max: "$date" } } }],
    }) as unknown as { maxDate: { $date: string } }[];

    const maxTransactionDate = maxDateResult[0]?.maxDate
        ? new Date(maxDateResult[0].maxDate.$date)
        : new Date();

    const dateRangeFilter = {
        $gte: { $date: { $numberLong: String(rangeStart.getTime()) } },
        $lt: { $date: { $numberLong: String(rangeEnd.getTime()) } },
    };

    let debitMerchantCount = 0;
    let debitPayeeCount = 0;
    let creditMerchantCount = 0;
    let creditPayeeCount = 0;
    let creditClusterCount = 0;

    // ── Pass 1: Merchant-based recurring debit patterns ──────────────────────
    const affectedMerchantResult = await prisma.finalTransactionData.aggregateRaw({
        pipeline: [
            { $match: { userId, debitAmount: { $gt: 0 }, clusterId: { $exists: true, $ne: null }, date: dateRangeFilter } },
            { $lookup: { from: "Cluster", localField: "clusterId", foreignField: "_id", as: "cluster" } },
            { $unwind: "$cluster" },
            { $match: { "cluster.merchantName": { $ne: null } } },
            { $group: { _id: "$cluster.merchantName" } },
        ],
    }) as unknown as { _id: string }[];

    const merchantNames = affectedMerchantResult.map(m => m._id);

    if (merchantNames.length > 0) {
        console.log(`[Recurring] Re-evaluating ${merchantNames.length} debit merchant(s): ${merchantNames.join(", ")}`);

        const merchantCandidates = await prisma.finalTransactionData.aggregateRaw({
            pipeline: [
                { $match: { userId, debitAmount: { $gt: 0 }, clusterId: { $exists: true, $ne: null } } },
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
                where: { userId, merchantName, payeeName: null, estimatedMonthlyAmount, type: "debit" }
            });
            if (existing) {
                await prisma.recurringPattern.update({
                    where: { id: existing.id },
                    data: { type: "debit", category: candidate.category, frequency, monthsDetected: candidate.monthCount, cancellability, isActive, lastTransactionDate },
                });
            } else {
                await prisma.recurringPattern.create({
                    data: { userId, type: "debit", merchantName, payeeName: null, category: candidate.category, estimatedMonthlyAmount, frequency, monthsDetected: candidate.monthCount, cancellability, isActive, lastTransactionDate },
                });
            }
            debitMerchantCount++;
        }
    }

    // ── Pass 2: Payee-based recurring debit patterns (P2P transfers) ──────────
    const affectedPayeeResult = await prisma.finalTransactionData.aggregateRaw({
        pipeline: [
            { $match: { userId, debitAmount: { $gt: 0 }, clusterId: { $exists: true, $ne: null }, date: dateRangeFilter } },
            { $lookup: { from: "Cluster", localField: "clusterId", foreignField: "_id", as: "cluster" } },
            { $unwind: "$cluster" },
            { $match: { "cluster.merchantName": null, "cluster.payeeName": { $ne: null } } },
            { $group: { _id: "$cluster.payeeName" } },
        ],
    }) as unknown as { _id: string }[];

    const payeeNames = affectedPayeeResult.map(p => p._id);

    if (payeeNames.length > 0) {
        console.log(`[Recurring] Re-evaluating ${payeeNames.length} debit payee(s): ${payeeNames.join(", ")}`);

        const payeeCandidates = await prisma.finalTransactionData.aggregateRaw({
            pipeline: [
                { $match: { userId, debitAmount: { $gt: 0 }, clusterId: { $exists: true, $ne: null } } },
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
                where: { userId, merchantName: null, payeeName, estimatedMonthlyAmount, type: "debit" }
            });
            if (existing) {
                await prisma.recurringPattern.update({
                    where: { id: existing.id },
                    data: { type: "debit", category: candidate.category, frequency, monthsDetected: candidate.monthCount, cancellability, isActive, lastTransactionDate },
                });
            } else {
                await prisma.recurringPattern.create({
                    data: { userId, type: "debit", merchantName: null, payeeName, category: candidate.category, estimatedMonthlyAmount, frequency, monthsDetected: candidate.monthCount, cancellability, isActive, lastTransactionDate },
                });
            }
            debitPayeeCount++;
        }
    }

    // ── Pass 3: Merchant-based recurring credit patterns ─────────────────────
    const affectedCreditMerchantResult = await prisma.finalTransactionData.aggregateRaw({
        pipeline: [
            { $match: { userId, creditAmount: { $gt: MIN_CREDIT_THRESHOLD }, clusterId: { $exists: true, $ne: null }, date: dateRangeFilter } },
            { $lookup: { from: "Cluster", localField: "clusterId", foreignField: "_id", as: "cluster" } },
            { $unwind: "$cluster" },
            { $match: { "cluster.merchantName": { $ne: null } } },
            { $group: { _id: "$cluster.merchantName" } },
        ],
    }) as unknown as { _id: string }[];

    const creditMerchantNames = affectedCreditMerchantResult.map(m => m._id);

    if (creditMerchantNames.length > 0) {
        console.log(`[Recurring] Re-evaluating ${creditMerchantNames.length} credit merchant(s): ${creditMerchantNames.join(", ")}`);

        const creditMerchantCandidates = await prisma.finalTransactionData.aggregateRaw({
            pipeline: [
                { $match: { userId, creditAmount: { $gt: MIN_CREDIT_THRESHOLD }, clusterId: { $exists: true, $ne: null } } },
                { $lookup: { from: "Cluster", localField: "clusterId", foreignField: "_id", as: "cluster" } },
                { $unwind: "$cluster" },
                { $match: { "cluster.merchantName": { $in: creditMerchantNames } } },
                { $addFields: { month: { $dateToString: { format: "%Y-%m", date: "$date" } } } },
                {
                    $group: {
                        _id: { merchantName: "$cluster.merchantName", month: "$month" },
                        totalCredit: { $sum: "$creditAmount" },
                        maxDateInMonth: { $max: "$date" },
                        category: { $first: "$cluster.category" },
                    },
                },
                {
                    $group: {
                        _id: "$_id.merchantName",
                        monthlyAmounts: { $push: { month: "$_id.month", amount: "$totalCredit" } },
                        monthCount: { $sum: 1 },
                        lastTransactionDate: { $max: "$maxDateInMonth" },
                        category: { $first: "$category" },
                    },
                },
                { $match: { monthCount: { $gte: 3 } } },
            ],
        }) as unknown as CreditSourceCandidate[];

        for (const candidate of creditMerchantCandidates) {
            const amounts = candidate.monthlyAmounts.map(m => m.amount);
            const months = candidate.monthlyAmounts.map(m => m.month);
            const frequency = detectFrequency(months, differenceInMonths);
            if (!frequency) continue;
            const { median, rangeMin, rangeMax, cv } = computeCreditRange(amounts);
            const creditLabel = classifyCreditLabel(candidate.category, null, median, cv);
            const isActive = checkIsActive(months, maxTransactionDate);
            const lastTransactionDate = new Date(candidate.lastTransactionDate.$date);

            const existing = await prisma.recurringPattern.findFirst({
                where: { userId, merchantName: candidate._id, payeeName: null, type: "credit" }
            });
            if (existing) {
                await prisma.recurringPattern.update({
                    where: { id: existing.id },
                    data: { category: candidate.category, estimatedMonthlyAmount: median, rangeMin, rangeMax, creditLabel, frequency, monthsDetected: candidate.monthCount, isActive, lastTransactionDate },
                });
            } else {
                await prisma.recurringPattern.create({
                    data: { userId, type: "credit", merchantName: candidate._id, payeeName: null, category: candidate.category, estimatedMonthlyAmount: median, rangeMin, rangeMax, creditLabel, frequency, monthsDetected: candidate.monthCount, cancellability: null, isActive, lastTransactionDate },
                });
            }
            creditMerchantCount++;
        }
    }

    // ── Pass 4: Payee-based recurring credit patterns (P2P inflows) ───────────
    const affectedCreditPayeeResult = await prisma.finalTransactionData.aggregateRaw({
        pipeline: [
            { $match: { userId, creditAmount: { $gt: MIN_CREDIT_THRESHOLD }, clusterId: { $exists: true, $ne: null }, date: dateRangeFilter } },
            { $lookup: { from: "Cluster", localField: "clusterId", foreignField: "_id", as: "cluster" } },
            { $unwind: "$cluster" },
            { $match: { "cluster.merchantName": null, "cluster.payeeName": { $ne: null } } },
            { $group: { _id: "$cluster.payeeName" } },
        ],
    }) as unknown as { _id: string }[];

    const creditPayeeNames = affectedCreditPayeeResult.map(p => p._id);

    if (creditPayeeNames.length > 0) {
        console.log(`[Recurring] Re-evaluating ${creditPayeeNames.length} credit payee(s): ${creditPayeeNames.join(", ")}`);

        const creditPayeeCandidates = await prisma.finalTransactionData.aggregateRaw({
            pipeline: [
                { $match: { userId, creditAmount: { $gt: MIN_CREDIT_THRESHOLD }, clusterId: { $exists: true, $ne: null } } },
                { $lookup: { from: "Cluster", localField: "clusterId", foreignField: "_id", as: "cluster" } },
                { $unwind: "$cluster" },
                { $match: { "cluster.merchantName": null, "cluster.payeeName": { $in: creditPayeeNames } } },
                { $addFields: { month: { $dateToString: { format: "%Y-%m", date: "$date" } } } },
                {
                    $group: {
                        _id: { payeeName: "$cluster.payeeName", month: "$month" },
                        totalCredit: { $sum: "$creditAmount" },
                        maxDateInMonth: { $max: "$date" },
                        category: { $first: "$cluster.category" },
                    },
                },
                {
                    $group: {
                        _id: "$_id.payeeName",
                        monthlyAmounts: { $push: { month: "$_id.month", amount: "$totalCredit" } },
                        monthCount: { $sum: 1 },
                        lastTransactionDate: { $max: "$maxDateInMonth" },
                        category: { $first: "$category" },
                    },
                },
                { $match: { monthCount: { $gte: 3 } } },
            ],
        }) as unknown as CreditSourceCandidate[];

        for (const candidate of creditPayeeCandidates) {
            const amounts = candidate.monthlyAmounts.map(m => m.amount);
            const months = candidate.monthlyAmounts.map(m => m.month);
            const frequency = detectFrequency(months, differenceInMonths);
            if (!frequency) continue;
            const { median, rangeMin, rangeMax, cv } = computeCreditRange(amounts);
            const isActive = checkIsActive(months, maxTransactionDate);
            const lastTransactionDate = new Date(candidate.lastTransactionDate.$date);

            const existing = await prisma.recurringPattern.findFirst({
                where: { userId, merchantName: null, payeeName: candidate._id, type: "credit" }
            });
            if (existing) {
                await prisma.recurringPattern.update({
                    where: { id: existing.id },
                    data: { category: candidate.category, estimatedMonthlyAmount: median, rangeMin, rangeMax, creditLabel: "transfer_in", frequency, monthsDetected: candidate.monthCount, isActive, lastTransactionDate },
                });
            } else {
                await prisma.recurringPattern.create({
                    data: { userId, type: "credit", merchantName: null, payeeName: candidate._id, category: candidate.category, estimatedMonthlyAmount: median, rangeMin, rangeMax, creditLabel: "transfer_in", frequency, monthsDetected: candidate.monthCount, cancellability: null, isActive, lastTransactionDate },
                });
            }
            creditPayeeCount++;
        }
    }

    // ── Pass 5: Unnamed cluster credit patterns (e.g. salary w/o employer name) ──
    const affectedClusterResult = await prisma.finalTransactionData.aggregateRaw({
        pipeline: [
            { $match: { userId, creditAmount: { $gt: MIN_CREDIT_THRESHOLD }, clusterId: { $exists: true, $ne: null }, date: dateRangeFilter } },
            { $lookup: { from: "Cluster", localField: "clusterId", foreignField: "_id", as: "cluster" } },
            { $unwind: "$cluster" },
            { $match: { "cluster.merchantName": null, "cluster.payeeName": null } },
            { $addFields: { clusterIdStr: { $toString: "$clusterId" } } },
            { $group: { _id: "$clusterIdStr" } },
        ],
    }) as unknown as { _id: string }[];

    const affectedClusterIds = affectedClusterResult.map(r => r._id);

    if (affectedClusterIds.length > 0) {
        console.log(`[Recurring] Re-evaluating ${affectedClusterIds.length} unnamed credit cluster(s)`);

        const creditClusterCandidates = await prisma.finalTransactionData.aggregateRaw({
            pipeline: [
                { $match: { userId, creditAmount: { $gt: MIN_CREDIT_THRESHOLD }, clusterId: { $exists: true, $ne: null } } },
                { $addFields: { clusterIdStr: { $toString: "$clusterId" } } },
                { $match: { clusterIdStr: { $in: affectedClusterIds } } },
                { $lookup: { from: "Cluster", localField: "clusterId", foreignField: "_id", as: "cluster" } },
                { $unwind: "$cluster" },
                { $match: { "cluster.merchantName": null, "cluster.payeeName": null } },
                { $addFields: { month: { $dateToString: { format: "%Y-%m", date: "$date" } } } },
                {
                    $group: {
                        _id: { clusterId: "$clusterIdStr", month: "$month" },
                        totalCredit: { $sum: "$creditAmount" },
                        maxDateInMonth: { $max: "$date" },
                        category: { $first: "$cluster.category" },
                        centroid: { $first: "$cluster.centroid" },
                    },
                },
                {
                    $group: {
                        _id: "$_id.clusterId",
                        monthlyAmounts: { $push: { month: "$_id.month", amount: "$totalCredit" } },
                        monthCount: { $sum: 1 },
                        lastTransactionDate: { $max: "$maxDateInMonth" },
                        category: { $first: "$category" },
                        centroid: { $first: "$centroid" },
                    },
                },
                { $match: { monthCount: { $gte: 3 } } },
            ],
        }) as unknown as CreditClusterCandidate[];

        for (const candidate of creditClusterCandidates) {
            const amounts = candidate.monthlyAmounts.map(m => m.amount);
            const months = candidate.monthlyAmounts.map(m => m.month);
            const frequency = detectFrequency(months, differenceInMonths);
            if (!frequency) continue;
            const { median, rangeMin, rangeMax, cv } = computeCreditRange(amounts);
            const creditLabel = classifyCreditLabel(candidate.category, null, median, cv);
            const isActive = checkIsActive(months, maxTransactionDate);
            const lastTransactionDate = new Date(candidate.lastTransactionDate.$date);

            const existing = await prisma.recurringPattern.findFirst({
                where: { userId, clusterKey: candidate._id, type: "credit" }
            });
            if (existing) {
                await prisma.recurringPattern.update({
                    where: { id: existing.id },
                    data: { category: candidate.category, estimatedMonthlyAmount: median, rangeMin, rangeMax, creditLabel, frequency, monthsDetected: candidate.monthCount, isActive, lastTransactionDate },
                });
            } else {
                await prisma.recurringPattern.create({
                    data: { userId, type: "credit", merchantName: null, payeeName: null, clusterKey: candidate._id, category: candidate.category, estimatedMonthlyAmount: median, rangeMin, rangeMax, creditLabel, frequency, monthsDetected: candidate.monthCount, cancellability: null, isActive, lastTransactionDate },
                });
            }
            creditClusterCount++;
        }
    }

    // ── Deactivation sweep ───────────────────────────────────────────────────
    //
    // `isActive` was only ever written on rows this run happened to touch, and nothing
    // deactivated the rest — so a stale pattern stayed "active" forever. That is not a
    // cosmetic flag: passes 1 and 2 key on the EXACT debit amount, so a subscription
    // whose price changes creates a *second* row and leaves the old one behind. Both
    // then read as active, the committed-monthly total double-counts the subscription,
    // and nothing anywhere says the price went up.
    //
    // The rule is `checkIsActive`'s own definition applied to the persisted date: a
    // pattern is active if it was last seen in the current or previous month, measured
    // against the latest transaction in the database (never `Date.now()` — a statement
    // uploaded months late must not mark a live subscription dead).
    //
    // `lastTransactionDate: null` rows are left alone rather than guessed at; they
    // predate that field and there is nothing to judge them by.
    const prevMonthStart = new Date(maxTransactionDate.getFullYear(), maxTransactionDate.getMonth() - 1, 1);
    const { count: deactivated } = await prisma.recurringPattern.updateMany({
        where: {
            userId,
            isActive: true,
            lastTransactionDate: { not: null, lt: prevMonthStart },
        },
        data: { isActive: false },
    });

    const total = debitMerchantCount + debitPayeeCount + creditMerchantCount + creditPayeeCount + creditClusterCount;
    return `Recurring patterns upserted: ${total} (${debitMerchantCount} debit merchants, ${debitPayeeCount} debit payees, ${creditMerchantCount} credit merchants, ${creditPayeeCount} credit payees, ${creditClusterCount} unnamed credit clusters); ${deactivated} stale pattern(s) deactivated`;
}, {
    name: "recurringPatternTool",
    description: "Re-evaluates recurring payment and income patterns for merchants and payees that have transactions in the affected months.",
    schema: z.object({
        affectedMonths: z.array(z.string()).describe("YYYY-MM months whose transactions were affected by the new upload"),
        userId: z.string().optional().describe("Owner whose transactions and patterns these are"),
    }),
});

export { recurringPatternTool };
