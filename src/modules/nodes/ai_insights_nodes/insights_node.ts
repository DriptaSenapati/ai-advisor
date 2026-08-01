import { GraphNode } from "@langchain/langgraph";
import { insightsAgentGraphSchema } from "../../../graph_state.js";
import prisma from "../../../prismaClient.js";
import { insightsGenLlm, insightSystemMessage } from "../../../models/index.js";
import { buildRecoveryProjection, type RecommendationImpact } from "../../insights/recovery_projection.js";
import {
    computeHealthScore,
    scoreAfterPlan,
    withTrends,
    type HealthDriver,
} from "../../insights/health_score.js";
import { median } from "../../stats/robust.js";
import type { BehaviourPattern } from "../../insights/behaviour_patterns.js";
import type { CategoryContext } from "../../insights/financial_context.js";
import { computeRecentTrends } from "../../insights/recent_trends.js";

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
    const userId = state.userId;

    const [monthlyStats, statements] = await Promise.all([
        prisma.monthlyStats.findMany({ where: { userId }, orderBy: { month: "asc" } }),
        prisma.statementMetadata.findMany({
            where: { userId },
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

    /**
     * **The window recommendations must be grounded in — the last 6 months, nothing older.**
     *
     * `categoryBreakdown` above is still the full history, because the prose sections
     * (trends, cash flow, income) legitimately describe the whole account. Recommendations are
     * different: advice built on a spike from eight months ago is advice about a version of
     * this account that may no longer exist. This block is deliberately the *only* category
     * data the recommendations prompt rule below points the model at.
     *
     * `recentCategories` is the matching deterministic guard — see the validator further down,
     * which rejects any recommendation whose category has no spend at all in this window,
     * regardless of what the prompt asked for.
     */
    const RECENT_MONTHS = 6;
    const recentMonthlyStats = monthlyStats.slice(-RECENT_MONTHS);
    const recentCategoryTotals = new Map<string, number>();
    for (const s of recentMonthlyStats) {
        for (const c of s.categoryBreakdown as unknown as CategoryBreakdown[]) {
            if (c.totalSpend <= 0) continue;
            recentCategoryTotals.set(c.category, (recentCategoryTotals.get(c.category) ?? 0) + c.totalSpend);
        }
    }
    const recentCategories = new Set(recentCategoryTotals.keys());
    const recentActivity = recentMonthlyStats.length > 0
        ? [...recentCategoryTotals.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([cat, total]) => `${cat}: ₹${fmt(total)} total, ₹${fmt(total / recentMonthlyStats.length)}/mo average`)
            .join("\n")
        : "No recent months available.";

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
        where: { userId, isActive: true, OR: [{ type: "debit" }, { type: null }] },
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
        where: { userId, isActive: true, type: "credit" },
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
                { $match: { userId, debitAmount: { $gt: 1000 }, clusterId: { $exists: true, $ne: null } } },
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
                where: { id: { in: clusterIds }, userId },
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

    // ── Flagged transactions ────────────────────────────────────────────────
    //
    // `redFlagDetectorToolNode` ran immediately before this node and has already written
    // every flag to `TransactionFlag`. What is assembled here is only the *summary* the LLM
    // narrates from — grouped by kind, with counts, totals and a few examples. The model
    // never sees a transaction id and never decides what is flagged; it writes one paragraph
    // per kind and the UI joins those back on the `kind` enum.
    //
    // Note the asymmetry with `duplicateSuspects` above, which is prose and nothing else.
    // That is the bug this section exists to stop repeating: duplicate detection has always
    // been algorithmic and correct, and its structured result was joined into a string and
    // dropped, so no UI could render it. It is now also a `duplicate_charge` flag row.
    let flaggedTransactions = "No flags detected.";
    /**
     * Hoisted out of the `try` because the health score reads the same rows.
     *
     * One query, deliberately: a second `findMany` could observe a different set if a
     * detector run landed between them, and the score would then describe an account the
     * prose beside it does not. Empty is the honest fallback for both — the catch below
     * already treats a failed read as "generate the report without this".
     */
    let flagRows: { severity: string; amount: number; transactionId: string | null }[] = [];
    try {
        const flags = await prisma.transactionFlag.findMany({
            where: { userId },
            orderBy: [{ severity: "asc" }, { amount: "desc" }],
        });
        flagRows = flags.map(f => ({
            severity: f.severity,
            amount: f.amount,
            transactionId: f.transactionId,
        }));

        if (flags.length > 0) {
            const grouped = new Map<string, typeof flags>();
            for (const f of flags) {
                const list = grouped.get(f.kind) ?? [];
                list.push(f);
                grouped.set(f.kind, list);
            }

            flaggedTransactions = [...grouped.entries()]
                .map(([kind, list]) => {
                    const total = list.reduce((s, f) => s + f.amount, 0);
                    const high = list.filter(f => f.severity === "high").length;
                    const examples = list.slice(0, 4).map(f => `    • ${f.title} (${f.month})`).join("\n");
                    return `  ${kind}: ${list.length} flag(s), ${high} high severity, ₹${fmt(total)} at stake\n${examples}`;
                })
                .join("\n");
        }
    } catch {
        // non-fatal: the report is worth generating without the narrative for these
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

    /**
     * **Read from graph state, not computed here.** `behaviourDetectionNode` and
     * `eventDetectionNode` run *before* this node, in parallel with
     * `redFlagDetectorToolNode` (opportunity detection) — see the fan-out/fan-in in
     * `graph.ts`, and `financialContextMergeNode` for the one place they're allowed to
     * disagree with each other. This node's job is to narrate what already exists, the same
     * relationship `flaggedTransactions` has with `redFlags.byKind` — never to invent a
     * pattern or a classification of its own.
     */
    const behaviourPatterns = (state.behaviourPatterns ?? []) as BehaviourPattern[];
    let behaviourFindings = "No behaviour patterns detected.";
    if (behaviourPatterns.length > 0) {
        behaviourFindings = behaviourPatterns
            .map(
                (p) =>
                    `  ${p.key}: ${p.label} — ${p.summary}\n` +
                    p.findings.map((f) => `    • ${f}`).join("\n") +
                    `\n    Impact: ${p.impactDetail}`
            )
            .join("\n");
    }

    /**
     * **Habit vs. event, for every category that shows an elevated month.** This is what stops
     * a single ₹3,50,000 wedding transfer from being read as "Transfers & Payments is
     * trending up" — see `financial_context.ts`'s docblock. Feeds the prompt as bias; the
     * `recommendations rules` below tell the model not to target an `event` category, and the
     * deterministic validator after the LLM call is what actually enforces it regardless of
     * whether the model listened.
     */
    const financialContext = (state.financialContext ?? []) as CategoryContext[];
    let financialContextBlock = "No elevated categories to classify.";
    try {
        if (financialContext.length > 0) {
            financialContextBlock = financialContext
                .map((c) => `  ${c.category}: ${c.classification.toUpperCase()} — ${c.note}`)
                .join("\n");
        }
    } catch (err) {
        console.error("[Insights] financial context failed:", err);
    }
    const eventCategories = new Set(
        financialContext.filter((c) => c.classification === "event").map((c) => c.category)
    );

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
        flaggedTransactions,
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
        flaggedTransactions,
        behaviourFindings,
        financialContext: financialContextBlock,
        recentActivity,
        dataQualityWarning: dataQualityWarning ?? "None",
    });

    const insightReport = await insightsGenLlm.invoke(prompt);

    /**
     * **`dataQualityWarning` is ours, not the model's — take it back.**
     *
     * It is computed above from a real threshold (any month over 15% uncategorised) and passed
     * into the prompt purely as context. The schema also asks the model for it, so the model
     * dutifully *echoes it back* — including the literal `"None"` this file substitutes when
     * there is nothing to warn about. That string is truthy, so the dashboard rendered an amber
     * "Heads up · None" caveat on every healthy account.
     *
     * Overwriting rather than deleting the schema field keeps the prompt's shape intact while
     * making the stored value the authoritative one. A caveat about the reader's own data is
     * the last thing that should be left to a model's paraphrase.
     */
    (insightReport as { dataQualityWarning?: string | null }).dataQualityWarning =
        dataQualityWarning;

    /**
     * **The narrative is the model's; every number stays the deterministic one from
     * `behaviourPatterns` above.** `insightReport.behaviourNarratives` is joined onto the
     * patterns by `key` — a closed enum, same anti-miscounted-batch-bug reasoning as
     * `redFlags.byKind` — never by array position. A pattern the model didn't narrate (or
     * mismatched) simply keeps its deterministic `summary`/`impactDetail` as its only prose;
     * it never goes unlabelled.
     *
     * Attached to the LLM's own output object (same pattern `dataQualityWarning` uses above)
     * because `insights` is a bare `Json` column with no schema enforced at write time — a key
     * the LLM schema doesn't declare is safe to add here.
     */
    const narrativesByKey = new Map(
        (
            (insightReport as { behaviourNarratives?: { key: string; narrative: string }[] })
                .behaviourNarratives ?? []
        ).map((n) => [n.key, n.narrative])
    );
    (insightReport as { behaviourPatterns?: unknown }).behaviourPatterns = behaviourPatterns.map((p) => ({
        ...p,
        narrative: narrativesByKey.get(p.key) ?? null,
    }));

    /**
     * Persisted so the Overview's "Events & Habits" section can render this directly — until
     * now it only ever steered the prompt and the validator below, never reached the reader.
     */
    (insightReport as { financialContext?: unknown }).financialContext = financialContext;

    /**
     * "What's good now" / "what's bad now" — the last 6 months against everything before them.
     * See `recent_trends.ts`'s docblock. Entirely deterministic and independent of the LLM
     * call; computed here rather than earlier only because it has nowhere to persist to until
     * this point, same reason `behaviourPatterns`/`financialContext` are attached here too.
     */
    try {
        (insightReport as { recentTrends?: unknown }).recentTrends = computeRecentTrends(monthlyStats);
    } catch (err) {
        console.error("[Insights] recent trends failed:", err);
        (insightReport as { recentTrends?: unknown }).recentTrends = { good: null, bad: null };
    }

    /**
     * **The recommendation validator — the guarantee, not the prompt instruction above it.**
     *
     * Two independent rules, both deterministic:
     *
     * 1. A recommendation whose `category` is in `eventCategories` — the wedding transfer, the
     *    medical bill — is dropped and rewritten as a one-line observation. The event still
     *    gets *acknowledged* ("this happened, it's already over"), it just never becomes an
     *    instruction to change a habit that doesn't exist.
     * 2. **A recommendation that names a recognised recurring payee is dropped, by name — not
     *    by category.** `payeePatterns` (built above, feeds the "RECURRING P2P OUTFLOWS"
     *    prompt section) is every individual the account sends money to repeatedly enough for
     *    `recurring_pattern_tool.ts` to have detected a pattern — a genuine relationship, not
     *    a one-off. Excluding all of `Transfers & Payments` used to be the rule here and it
     *    was too broad: it also silenced a real, sustained, changeable habit — steadily
     *    climbing transfers with no recognised payee behind them — that this account's own
     *    data showed. Matching on the payee's name in the recommendation's own `action`/
     *    `evidence` text is what lets those two cases split: a rise the model built around
     *    Dripta or Runu Senapati is dropped; a rise built around the category in general, or
     *    around a payee that has never recurred, is allowed through like anything else.
     *
     * `observations` is deliberately short strings, not another structured card: this is the
     * one thing on the report that is explicitly *not* asking for a decision, and treating it
     * with the same weight as a recommendation would undercut that.
     */
    const knownPayees = payeePatterns
        .map((p) => p.payeeName)
        .filter((name): name is string => Boolean(name && name.trim().length > 0));

    const rawRecommendations = (
        (insightReport as {
            recommendations?: { slug: string; action: string; category: string | null; evidence?: string; reasoning?: string }[];
        }).recommendations ?? []
    );
    /**
     * **Every word of the payee's name, not the name as one contiguous phrase.** A recommendation
     * naming two payees at once — "Log transfers to Runu and Dripta Senapati" — never contains
     * the literal substring "Runu Senapati", because the model (correctly, grammatically)
     * shares the surname across both first names instead of repeating it. Matching whole-string
     * missed exactly this on real output. Requiring every word of "Runu Senapati" to appear
     * *somewhere* in the text — not contiguously — catches that construction while still
     * requiring both the given name and the surname, not just a shared surname on its own.
     */
    const nameMatches = (name: string, text: string): boolean => {
        const words = name.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
        return words.length > 0 && words.every((w) => text.includes(w));
    };

    const observations: string[] = [];
    const validatedRecommendations = rawRecommendations.filter((r) => {
        if (!r.category) return true;

        /**
         * **Rule 0 — recency, and it runs before anything else.** `recentCategories` (built
         * above from `RECENT_MONTHS = 6`) is every category that actually spent money in the
         * last 6 months. A recommendation whose category isn't in that set was necessarily
         * built from older history — the prompt rule asked the model not to do this, this is
         * what actually stops it. Dropped silently into an observation rather than surfaced as
         * a "such-and-such was excluded" line, because unlike the event/family cases there is
         * nothing current to acknowledge — the category simply isn't part of the account any
         * more right now.
         */
        if (!recentCategories.has(r.category)) {
            observations.push(
                `${r.category}: left out of the plan — no meaningful activity in the last ${RECENT_MONTHS} months, even though it shows up earlier in your history.`
            );
            return false;
        }

        const text = `${r.action} ${r.evidence ?? ""} ${r.reasoning ?? ""}`.toLowerCase();
        const namedPayee = knownPayees.find((name) => nameMatches(name, text));
        if (namedPayee) {
            observations.push(
                `${r.category}: a recommendation built around payments to ${namedPayee} was left out — that's a recognised relationship, not a spending habit to change, whatever the amount.`
            );
            return false;
        }

        if (!eventCategories.has(r.category)) return true;
        const context = financialContext.find((c) => c.category === r.category);
        observations.push(
            context
                ? `${r.category}: ${context.note}`
                : `${r.category} was excluded from the plan — its recent increase looks like a one-off event, not a habit.`
        );
        return false;
    });
    (insightReport as { recommendations?: unknown }).recommendations = validatedRecommendations;
    (insightReport as { observations?: string[] }).observations = observations;

    // ── Recovery projection ─────────────────────────────────────────────────
    //
    // Built *after* the LLM call because it is built *from* it: each recommendation's
    // `monthlySavingImpact` becomes a forward path, and the chart is what turns "save
    // ₹4,000/month" from an assertion into an argument. Deterministic arithmetic over the
    // monthly history — no simulation; the goal advisor owns Monte Carlo, and a goal has a
    // target and deadline to be feasible against where this only compares trajectories.
    //
    // Best-effort: a malformed `recommendations` array must not cost the whole report,
    // which by this point is one paid LLM call already spent.
    let recoveryProjection = null;
    try {
        const recommendations = ((insightReport as { recommendations?: unknown }).recommendations ?? []) as RecommendationImpact[];

        /**
         * Ceilings for what each recommendation may claim, from this user's own history.
         *
         * Medians, not means, and for the same reason the baseline is robust: the outlier
         * month that produces an inflated claim must not also be what raises the ceiling
         * meant to catch it. See `boundImpact` for what went wrong without this.
         */
        const categorySpend = new Map<string, number[]>();
        for (const s of monthlyStats) {
            for (const c of (s.categoryBreakdown as unknown as CategoryBreakdown[])) {
                if (!c?.category) continue;
                const list = categorySpend.get(c.category) ?? [];
                list.push(c.totalSpend);
                categorySpend.set(c.category, list);
            }
        }
        const categoryMedians: Record<string, number> = {};
        const categorySeries: Record<string, number[]> = {};
        for (const [category, values] of categorySpend) {
            categoryMedians[category] = median(values);
            // The series itself, not just its median — `scoreConfidence` needs the spread
            // and the month count, and neither survives being reduced to one number.
            categorySeries[category] = values;
        }

        recoveryProjection = buildRecoveryProjection(
            monthlyStats.map(s => ({ month: s.month, netSavings: s.netSavings })),
            recommendations.filter(r => typeof r?.slug === "string" && typeof r?.monthlySavingImpact === "number"),
            {
                medianMonthlyExpenses: median(monthlyStats.map(s => s.totalExpenses)),
                categoryMedians,
                categorySeries,
            },
        );
    } catch (err) {
        console.error("[Insights] recovery projection failed:", err);
    }

    // ── Health score ────────────────────────────────────────────────────────
    //
    // Deterministic and independent of the LLM call above — it reads the same monthly rows,
    // recurring patterns and flags the prompt was built from, so the headline figure and the
    // prose under it describe one account. `redFlagDetectorToolNode` and
    // `recurringPatternToolNode` both run *before* this node, which is why the inputs are on
    // disk by now; reordering the graph would silently score every account as if it had no
    // commitments and nothing flagged.
    //
    // Best-effort like the projection: this is one paid LLM call in, and a report without a
    // score is worth far more than no report.
    let health = null;
    let healthAfterPlan = null;
    let scoreDelta: number | null = null;
    try {
        /** Recurring debits normalised to a month, matching `getRecurringSummary`'s `perMonth`. */
        const perMonth = (p: { estimatedMonthlyAmount: number; frequency: string }) =>
            p.frequency === "annually"
                ? p.estimatedMonthlyAmount / 12
                : p.frequency === "quarterly"
                  ? p.estimatedMonthlyAmount / 3
                  : p.estimatedMonthlyAmount;

        const committedMonthly = activeDebitPatterns.reduce((sum, p) => sum + perMonth(p), 0);
        const cancellableMonthly = activeDebitPatterns
            .filter(p => p.cancellability === "cancellable")
            .reduce((sum, p) => sum + perMonth(p), 0);

        const scoreInput = {
            monthly: monthlyStats.map(s => ({
                month: s.month,
                totalIncome: s.totalIncome,
                totalExpenses: s.totalExpenses,
                netSavings: s.netSavings,
                savingsRate: s.savingsRate,
            })),
            committedMonthly,
            cancellableMonthly,
            flags: flagRows,
        };

        health = computeHealthScore(scoreInput);

        /**
         * The same score with the plan applied, which is the number the overview leads with:
         * "15 → 43 after completing the plan".
         *
         * The uplift is the **bounded** total (`monthlyWithPlan − monthlyBaseline`), never the
         * sum of the model's raw claims — one run claimed ₹1,00,250/month against a ₹862
         * baseline, and an after-score built on that would have promised a jump from 15 to 100.
         * Falls back to the current score when there is no projection, which reads as "no
         * improvement to show" rather than as a fabricated one.
         */
        if (recoveryProjection) {
            const uplift = Math.max(
                0,
                recoveryProjection.monthlyWithPlan - recoveryProjection.monthlyBaseline
            );
            healthAfterPlan = uplift > 0 ? scoreAfterPlan(scoreInput, uplift) : health;
        }

        /**
         * The delta needs the report this one is about to replace, so it must be read
         * *before* the create below — afterwards the newest row is this one and every
         * report would score a delta of zero against itself.
         *
         * Null when there is no previous report, and that is deliberately not folded into
         * 0: "nothing to compare with" and "no change" are different facts, and only one of
         * them is worth putting a ↑ or ↓ next to.
         */
        const previous = await prisma.insightReport.findFirst({
            where: { userId, healthScore: { not: null } },
            orderBy: { generatedAt: "desc" },
            select: { healthScore: true, scoreBreakdown: true },
        });
        if (previous?.healthScore != null) {
            scoreDelta = health.score - previous.healthScore;
        }

        // Per-driver movement, matched on `key` rather than position — a driver reordered in a
        // later release would otherwise attribute one driver's change to another.
        health = withTrends(health, (previous?.scoreBreakdown ?? null) as HealthDriver[] | null);
    } catch (err) {
        console.error("[Insights] health score failed:", err);
    }

    await prisma.insightReport.create({
        data: {
            userId,
            monthsCovered,
            tier,
            insights: insightReport,
            rawStatsSnapshot,
            healthScore: health?.score ?? null,
            healthScoreAfterPlan: healthAfterPlan?.score ?? null,
            riskLevel: health?.riskLevel ?? null,
            scoreDelta,
            scoreBreakdown: (health?.drivers ?? null) as never,
            // `healthAfterPlan` already carries the full re-scored breakdown (`scoreAfterPlan`
            // re-runs `computeHealthScore` end to end) — this was computed and thrown away
            // before. `null` when there was no projection to derive an uplift from, same as
            // `healthScoreAfterPlan`.
            scoreBreakdownAfterPlan: (healthAfterPlan?.drivers ?? null) as never,
            // Cast because Prisma's `InputJsonValue` requires an index signature and
            // `RecoveryProjection` is a named interface. The shape is plain arrays,
            // numbers, strings and booleans — JSON-safe by construction.
            chartData: { ...chartData, recoveryProjection } as never,
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
