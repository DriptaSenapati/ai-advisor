import { GraphNode } from "@langchain/langgraph";
import { insightsAgentGraphSchema } from "../../../graph_state.js";
import prisma from "../../../prismaClient.js";
import { insightsGenLlm, insightSystemMessage } from "../../../models/index.js";

type CategoryBreakdown = {
    category: string;
    totalSpend: number;
    txnCount: number;
    shareOfTotal: number;
    avgTxnAmount: number;
    momDelta: number;
    rollingAvg6m: number;
    isSpiked: boolean;
    trendDirection: string;
};

type TopMerchant = {
    merchantName: string;
    category: string;
    totalSpend: number;
    txnCount: number;
};

type WeekdayVsWeekend = {
    weekday: { totalSpend: number; txnCount: number; avgPerTxn: number };
    weekend: { totalSpend: number; txnCount: number; avgPerTxn: number };
};

type TimeOfMonth = {
    week1: { totalSpend: number; txnCount: number };
    week2: { totalSpend: number; txnCount: number };
    week3: { totalSpend: number; txnCount: number };
    week4: { totalSpend: number; txnCount: number };
};

function computeTier(monthCount: number): number {
    if (monthCount === 1) return 1;
    if (monthCount < 6) return 2;
    return 3;
}

const fmt = (n: number) => n.toFixed(0);
const fmtPct = (n: number) => n.toFixed(1);

const insightsNode: GraphNode<typeof insightsAgentGraphSchema> = async (state) => {
    const [monthlyStats, statements] = await Promise.all([
        prisma.monthlyStats.findMany({ orderBy: { month: "asc" } }),
        prisma.statementMetadata.findMany({
            select: { bankName: true, statementPeriodStart: true, statementPeriodEnd: true },
            orderBy: { statementPeriodStart: "asc" },
        }),
    ]);

    if (monthlyStats.length === 0) {
        console.log("No MonthlyStats found, skipping insights generation.");
        return {};
    }

    const tier = computeTier(monthlyStats.length);
    const monthsCovered = monthlyStats.map(s => s.month);
    const latestStats = monthlyStats[monthlyStats.length - 1]!;

    // ── Bank names + coverage ──
    const bankGroups = new Map<string, { start: Date; end: Date }>();
    for (const s of statements) {
        if (!s.statementPeriodStart || !s.statementPeriodEnd) continue;
        const existing = bankGroups.get(s.bankName);
        if (!existing) {
            bankGroups.set(s.bankName, { start: s.statementPeriodStart, end: s.statementPeriodEnd });
        } else {
            if (s.statementPeriodStart < existing.start) existing.start = s.statementPeriodStart;
            if (s.statementPeriodEnd > existing.end) existing.end = s.statementPeriodEnd;
        }
    }
    const banks = bankGroups.size > 0
        ? [...bankGroups.entries()]
            .map(([name, p]) => `${name} (${p.start.toISOString().slice(0, 7)} – ${p.end.toISOString().slice(0, 7)})`)
            .join(", ")
        : "Unknown";

    // ── Monthly overview ──
    const monthlyOverview = monthlyStats.map(s =>
        `${s.month}: income=₹${fmt(s.totalIncome)}, expenses=₹${fmt(s.totalExpenses)}, savings=₹${fmt(s.netSavings)}, savingsRate=${fmtPct(s.savingsRate)}%, balance=₹${fmt(s.closingBalance)}`
    ).join("\n");

    // ── Category breakdown (all months) ──
    const categoryBreakdown = monthlyStats.map(s => {
        const cats = s.categoryBreakdown as unknown as CategoryBreakdown[];
        return cats.map(c =>
            `[${s.month}] ${c.category}: spend=₹${fmt(c.totalSpend)}, share=${fmtPct(c.shareOfTotal)}%, txns=${c.txnCount}, avgTxn=₹${fmt(c.avgTxnAmount)}, momDelta=${fmtPct(c.momDelta)}%, rollingAvg6m=₹${fmt(c.rollingAvg6m)}, spiked=${c.isSpiked}, trend=${c.trendDirection}`
        ).join("\n");
    }).join("\n");

    // ── Top merchants — aggregate across all months, top 5 by total spend ──
    const merchantMap = new Map<string, TopMerchant>();
    for (const s of monthlyStats) {
        for (const m of s.topMerchants as unknown as TopMerchant[]) {
            const key = m.merchantName;
            const existing = merchantMap.get(key);
            if (existing) {
                existing.totalSpend += m.totalSpend;
                existing.txnCount += m.txnCount;
            } else {
                merchantMap.set(key, { ...m });
            }
        }
    }
    const topMerchants = [...merchantMap.values()]
        .sort((a, b) => b.totalSpend - a.totalSpend)
        .slice(0, 5)
        .map(m => `${m.merchantName} (${m.category}): ₹${fmt(m.totalSpend)} over ${m.txnCount} transactions`)
        .join("\n");

    // ── Finance & Investments merchants (named, separate from top-5) ──
    const financeInvestmentMerchants = [...merchantMap.values()]
        .filter(m => m.category === "Finance & Investments")
        .sort((a, b) => b.totalSpend - a.totalSpend)
        .map(m => `${m.merchantName} (${m.category}): ₹${fmt(m.totalSpend)} over ${m.txnCount} transactions`)
        .join("\n") || "None detected.";

    // ── Weekday vs weekend — aggregate across all months ──
    const wdweAgg = { weekdaySpend: 0, weekdayTxns: 0, weekendSpend: 0, weekendTxns: 0 };
    for (const s of monthlyStats) {
        const w = s.weekdayVsWeekend as unknown as WeekdayVsWeekend;
        wdweAgg.weekdaySpend += w.weekday.totalSpend;
        wdweAgg.weekdayTxns += w.weekday.txnCount;
        wdweAgg.weekendSpend += w.weekend.totalSpend;
        wdweAgg.weekendTxns += w.weekend.txnCount;
    }
    const weekdayVsWeekend = [
        `Weekday: ₹${fmt(wdweAgg.weekdaySpend)}, ${wdweAgg.weekdayTxns} txns, avg ₹${fmt(wdweAgg.weekdayTxns > 0 ? wdweAgg.weekdaySpend / wdweAgg.weekdayTxns : 0)}`,
        `Weekend: ₹${fmt(wdweAgg.weekendSpend)}, ${wdweAgg.weekendTxns} txns, avg ₹${fmt(wdweAgg.weekendTxns > 0 ? wdweAgg.weekendSpend / wdweAgg.weekendTxns : 0)}`,
    ].join("\n");

    // ── Time of month — from most recent month (for LLM prompt) ──
    const tom = latestStats.timeOfMonth as unknown as TimeOfMonth;
    const timeOfMonth = `Week1 (1–7): ₹${fmt(tom.week1.totalSpend)} | Week2 (8–14): ₹${fmt(tom.week2.totalSpend)} | Week3 (15–21): ₹${fmt(tom.week3.totalSpend)} | Week4 (22–end): ₹${fmt(tom.week4.totalSpend)}`;

    // ── Time of month — aggregated across all months (for UI charts) ──
    const tomAgg = { week1: { totalSpend: 0, txnCount: 0 }, week2: { totalSpend: 0, txnCount: 0 }, week3: { totalSpend: 0, txnCount: 0 }, week4: { totalSpend: 0, txnCount: 0 } };
    for (const s of monthlyStats) {
        const t = s.timeOfMonth as unknown as TimeOfMonth;
        tomAgg.week1.totalSpend += t.week1.totalSpend; tomAgg.week1.txnCount += t.week1.txnCount;
        tomAgg.week2.totalSpend += t.week2.totalSpend; tomAgg.week2.txnCount += t.week2.txnCount;
        tomAgg.week3.totalSpend += t.week3.totalSpend; tomAgg.week3.txnCount += t.week3.txnCount;
        tomAgg.week4.totalSpend += t.week4.totalSpend; tomAgg.week4.txnCount += t.week4.txnCount;
    }

    // ── Recurring patterns — debit expenses ──
    // OR clause to migrate existing records that were created before the `type` field was added
    const activeDebitPatterns = await prisma.recurringPattern.findMany({
        where: { isActive: true, OR: [{ type: "debit" }, { type: null }] },
    });
    const recurringPatterns = activeDebitPatterns.length > 0
        ? activeDebitPatterns.map(p =>
            `${p.merchantName ?? p.payeeName ?? "Unknown"} (${p.category ?? "Other"}): ₹${fmt(p.estimatedMonthlyAmount)}/mo, ${p.frequency}, cancellability=${p.cancellability}, detected ${p.monthsDetected} months`
          ).join("\n")
        : "No recurring expense patterns detected.";

    // ── Known P2P payees from recurring debit patterns ──
    const payeePatterns = activeDebitPatterns.filter(p => p.payeeName != null);
    const knownTransferPayees = payeePatterns.length > 0
        ? payeePatterns.map(p =>
            `→ ${p.payeeName}: ₹${fmt(p.estimatedMonthlyAmount)}/mo, ${p.frequency}, detected ${p.monthsDetected} months`
          ).join("\n")
        : "None identified.";

    // ── Recurring patterns — credit income ──
    const activeCreditPatterns = await prisma.recurringPattern.findMany({
        where: { isActive: true, type: "credit" },
    });
    const periodicIncome = activeCreditPatterns.length > 0
        ? activeCreditPatterns.map(p => {
            const lo = fmt(p.rangeMin ?? p.estimatedMonthlyAmount);
            const hi = fmt(p.rangeMax ?? p.estimatedMonthlyAmount);
            const source = p.merchantName ?? p.payeeName ?? "Unknown source";
            return `${source} (${p.creditLabel ?? "unknown"}): ₹${lo}–₹${hi}/mo, ${p.frequency}, detected ${p.monthsDetected} months`;
          }).join("\n")
        : "No periodic income patterns detected.";

    // ── Algorithmic duplicate detection: same cluster + same exact amount ≥ ₹1000, 2+ times in same month ──
    type DupRaw = { _id: { clusterId: string; amount: number; month: string }; count: number; dates: string[] };
    let duplicateSuspects = "None detected.";
    try {
        const dupRaw = await prisma.finalTransactionData.aggregateRaw({
            pipeline: [
                { $match: { debitAmount: { $gt: 1000 }, clusterId: { $exists: true, $ne: null } } },
                { $group: {
                    _id: {
                        clusterId: { $toString: "$clusterId" },
                        amount: "$debitAmount",
                        month: { $dateToString: { format: "%Y-%m", date: "$date" } },
                    },
                    count: { $sum: 1 },
                    dates: { $push: { $dateToString: { format: "%Y-%m-%d", date: "$date" } } },
                }},
                { $match: { count: { $gte: 2 } } },
                { $sort: { "_id.amount": -1 } },
                { $limit: 5 },
            ],
        }) as unknown as DupRaw[];

        if (dupRaw.length > 0) {
            const clusterIds = dupRaw.map(d => d._id.clusterId);
            const clusters = await prisma.cluster.findMany({
                where: { id: { in: clusterIds } },
                select: { id: true, merchantName: true, payeeName: true },
            });
            const clusterMap = new Map(clusters.map(c => [c.id, c]));
            duplicateSuspects = dupRaw.map(d => {
                const c = clusterMap.get(d._id.clusterId);
                const name = c?.merchantName ?? c?.payeeName ?? "Unknown";
                const amt = typeof d._id.amount === "number" ? d._id.amount : Number(d._id.amount);
                return `${name}: ₹${fmt(amt)} charged ${d.count}x in ${d._id.month} (dates: ${(d.dates as unknown as string[]).join(", ")})`;
            }).join("\n");
        }
    } catch {
        // non-fatal: duplicate detection is best-effort
    }

    // ── Refunds ──
    const refunds = monthlyStats.map(s =>
        `${s.month}: ₹${fmt(s.totalRefunds)} across ${s.refundCount} transactions`
    ).join("\n");

    const uncategorizedMonths: string[] = [];
    for (const s of monthlyStats) {
        const cats = s.categoryBreakdown as unknown as CategoryBreakdown[];
        const uncategorized = cats.find(c => c.category === "Uncategorized");
        if (uncategorized && uncategorized.shareOfTotal > 15) {
            uncategorizedMonths.push(`${s.month} (${fmtPct(uncategorized.shareOfTotal)}%)`);
        }
    }
    const dataQualityWarning: string | null = uncategorizedMonths.length > 0
        ? `${uncategorizedMonths.length} month(s) have >15% uncategorized spend: ${uncategorizedMonths.join(", ")}. Insights for these months may be incomplete.`
        : null;

    const rawStatsSnapshot = {
        tier,
        monthsCovered,
        banks,
        monthlyOverview,
        categoryBreakdown,
        topMerchants,
        financeInvestmentMerchants,
        weekdayVsWeekend,
        timeOfMonth,
        recurringPatterns,
        knownTransferPayees,
        periodicIncome,
        refunds,
        duplicateSuspects,
        dataQualityWarning,
    };

    const chartData = {
        monthlyOverview: monthlyStats.map(s => ({
            month: s.month,
            income: s.totalIncome,
            expenses: s.totalExpenses,
            netSavings: s.netSavings,
            savingsRate: s.savingsRate,
            closingBalance: s.closingBalance,
            totalRefunds: s.totalRefunds,
            refundCount: s.refundCount,
        })),
        categoryBreakdown: monthlyStats.map(s => ({
            month: s.month,
            categories: s.categoryBreakdown,
        })),
        topMerchants: [...merchantMap.values()]
            .sort((a, b) => b.totalSpend - a.totalSpend)
            .slice(0, 10),
        weekdayVsWeekend: {
            weekday: {
                totalSpend: wdweAgg.weekdaySpend,
                txnCount: wdweAgg.weekdayTxns,
                avgPerTxn: wdweAgg.weekdayTxns > 0 ? wdweAgg.weekdaySpend / wdweAgg.weekdayTxns : 0,
            },
            weekend: {
                totalSpend: wdweAgg.weekendSpend,
                txnCount: wdweAgg.weekendTxns,
                avgPerTxn: wdweAgg.weekendTxns > 0 ? wdweAgg.weekendSpend / wdweAgg.weekendTxns : 0,
            },
        },
        timeOfMonth: tomAgg,
        recurringPatterns: activeDebitPatterns.map(p => ({
            merchantName: p.merchantName,
            payeeName: p.payeeName,
            category: p.category,
            estimatedMonthlyAmount: p.estimatedMonthlyAmount,
            frequency: p.frequency,
            cancellability: p.cancellability,
            monthsDetected: p.monthsDetected,
            isActive: p.isActive,
        })),
        periodicIncome: activeCreditPatterns.map(p => ({
            merchantName: p.merchantName,
            payeeName: p.payeeName,
            clusterKey: p.clusterKey,
            creditLabel: p.creditLabel,
            estimatedMonthlyAmount: p.estimatedMonthlyAmount,
            rangeMin: p.rangeMin,
            rangeMax: p.rangeMax,
            frequency: p.frequency,
            monthsDetected: p.monthsDetected,
            isActive: p.isActive,
        })),
    };

    console.log(`Generating Tier ${tier} insights for ${monthlyStats.length} months: ${monthsCovered.join(", ")}`);

    const prompt = await insightSystemMessage.formatMessages({
        tier,
        monthsAvailable: monthlyStats.length,
        monthsCovered: monthsCovered.join(", "),
        banks,
        monthlyOverview,
        categoryBreakdown,
        topMerchants,
        financeInvestmentMerchants,
        weekdayVsWeekend,
        timeOfMonth,
        recurringPatterns,
        knownTransferPayees,
        periodicIncome,
        refunds,
        duplicateSuspects,
        dataQualityWarning: dataQualityWarning ?? "None",
    });

    const insightReport = await insightsGenLlm.invoke(prompt);

    await prisma.insightReport.create({
        data: {
            monthsCovered,
            tier,
            insights: insightReport,
            rawStatsSnapshot,
            chartData,
        },
    });

    if (state.statementMetadataId) {
        await prisma.statementMetadata.update({
            where: { id: state.statementMetadataId },
            data: { insightsStatus: "Completed" },
        });
    }

    console.log(`InsightReport saved for tier ${tier}, months: ${monthsCovered.join(", ")}`);

    return {
        rawStatsSnapshot,
        insightReports: insightReport,
    };
};

export { insightsNode };
