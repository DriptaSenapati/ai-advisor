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
    const { isFirstRun, monthToBeCovered } = state;

    let monthlyStats;

    if (isFirstRun) {
        monthlyStats = await prisma.monthlyStats.findMany({ orderBy: { month: "asc" } });
    } else {
        monthlyStats = (await prisma.monthlyStats.findMany({
            orderBy: { month: "desc" },
            take: monthToBeCovered,
        })).reverse();
    }

    if (monthlyStats.length === 0) {
        console.log("No MonthlyStats found, skipping insights generation.");
        return {};
    }

    const tier = computeTier(monthlyStats.length);
    const monthsCovered = monthlyStats.map(s => s.month);
    const latestStats = monthlyStats[monthlyStats.length - 1]!;

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

    // ── Time of month — from most recent month ──
    const tom = latestStats.timeOfMonth as unknown as TimeOfMonth;
    const timeOfMonth = `Week1 (1–7): ₹${fmt(tom.week1.totalSpend)} | Week2 (8–14): ₹${fmt(tom.week2.totalSpend)} | Week3 (15–21): ₹${fmt(tom.week3.totalSpend)} | Week4 (22–end): ₹${fmt(tom.week4.totalSpend)}`;

    // ── Recurring patterns ──
    const activePatterns = await prisma.recurringPattern.findMany({ where: { isActive: true } });
    const recurringPatterns = activePatterns.length > 0
        ? activePatterns.map(p =>
            `${p.merchantName ?? "Unknown"} (${p.category ?? "Other"}): ₹${fmt(p.estimatedMonthlyAmount)}/mo, ${p.frequency}, cancellable=${p.isCancellable}, active=${p.isActive}, detected ${p.monthsDetected} months`
          ).join("\n")
        : "No recurring patterns detected.";

    // ── Refunds ──
    const refunds = monthlyStats.map(s =>
        `${s.month}: ₹${fmt(s.totalRefunds)} across ${s.refundCount} transactions`
    ).join("\n");

    const rawStatsSnapshot = {
        tier,
        monthsCovered,
        monthlyOverview,
        categoryBreakdown,
        topMerchants,
        weekdayVsWeekend,
        timeOfMonth,
        recurringPatterns,
        refunds,
    };

    console.log(`Generating Tier ${tier} insights for ${monthlyStats.length} months: ${monthsCovered.join(", ")}`);

    const prompt = await insightSystemMessage.formatMessages({
        tier,
        monthsAvailable: monthlyStats.length,
        monthsCovered: monthsCovered.join(", "),
        monthlyOverview,
        categoryBreakdown,
        topMerchants,
        weekdayVsWeekend,
        timeOfMonth,
        recurringPatterns,
        refunds,
    });

    const insightReport = await insightsGenLlm.invoke(prompt);

    await prisma.insightReport.create({
        data: {
            monthsCovered,
            tier,
            insights: insightReport,
            rawStatsSnapshot,
        },
    });

    console.log(`InsightReport saved for tier ${tier}, months: ${monthsCovered.join(", ")}`);

    return {
        rawStatsSnapshot,
        insightReports: insightReport,
    };
};

export { insightsNode };
