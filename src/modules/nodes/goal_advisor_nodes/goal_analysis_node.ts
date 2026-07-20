import { GraphNode } from "@langchain/langgraph";
import { goalAdvisorGraphSchema } from "../../../graph_state.js";
import { goalAdvisorLlm, goalAdvisorSystemMessage } from "../../../models/index.js";
import prisma from "../../../prismaClient.js";

// ── Statistics helpers ────────────────────────────────────────────────────────

function computeMean(data: number[]): number {
    if (data.length === 0) return 0;
    return data.reduce((a, b) => a + b, 0) / data.length;
}

function computeStats(data: number[]): { mean: number; std: number; skewness: number } {
    const n = data.length;
    const mean = computeMean(data);
    const variance = n > 1
        ? data.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1)
        : 0;
    const std = Math.sqrt(variance);
    const skewness = std > 0 && n >= 3
        ? data.reduce((sum, x) => sum + ((x - mean) / std) ** 3, 0) / n
        : 0;
    return { mean, std, skewness };
}

function percentile(sortedArr: number[], p: number): number {
    const idx = Math.min(Math.floor((p / 100) * sortedArr.length), sortedArr.length - 1);
    return sortedArr[idx]!;
}

function computeMonthsRemaining(deadline: Date, now: Date): number {
    const months =
        (deadline.getFullYear() - now.getFullYear()) * 12 +
        (deadline.getMonth() - now.getMonth());
    return Math.max(0, months);
}

// How many calendar months have elapsed since the last data month.
// gap=0 → data is current month; gap=1 → data is last month (normal lag); gap≥2 → stale.
function computeDataGapMonths(lastDataMonth: string, now: Date): number {
    const [ly, lm] = lastDataMonth.split("-").map(Number) as [number, number];
    return Math.max(0, (now.getFullYear() - ly) * 12 + (now.getMonth() + 1 - lm));
}

type DataFreshnessStatus = "current" | "slightly_stale" | "stale" | "very_stale";

function classifyFreshness(gapMonths: number): DataFreshnessStatus {
    if (gapMonths <= 1) return "current";
    if (gapMonths <= 3) return "slightly_stale";
    if (gapMonths <= 6) return "stale";
    return "very_stale";
}

// ── Normal sampler (Box-Muller) ───────────────────────────────────────────────

function sampleNormal(mean: number, std: number): number {
    const u1 = Math.max(Number.EPSILON, Math.random());
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * std;
}

// ── Trend shock detection ─────────────────────────────────────────────────────

interface TrendShockResult {
    isEndShocked: boolean;   // last 3 months are a persistent new lower regime
    hasMidDip: boolean;      // outlier dip months detected within historical period
    dipIndices: number[];    // indices of IQR-flagged outlier months
    reductionPct: number;
    recentAvg: number;
    historicalAvg: number;   // raw mean of all-but-last-3 (reference only)
    robustMean: number;      // mean excluding dip-month outliers
    robustStd: number;       // std excluding dip-month outliers
    trendAdjustedMean: number;
}

function detectTrendShock(surpluses: number[]): TrendShockResult {
    const n = surpluses.length;

    // IQR-based outlier detection for dip months anywhere in the series
    const sorted = [...surpluses].sort((a, b) => a - b);
    const q1 = percentile(sorted, 25);
    const q3 = percentile(sorted, 75);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    // Only flag as dips when IQR is meaningful (avoid flagging all months when data is flat)
    const dipIndices = iqr > 0
        ? surpluses.map((v, i) => (v < lowerFence ? i : -1)).filter(i => i >= 0)
        : [];

    // Robust mean/std from non-dip months
    const cleanData = surpluses.filter((_, i) => !dipIndices.includes(i));
    const effectiveData = cleanData.length >= 3 ? cleanData : surpluses;
    const { mean: robustMean, std: robustStd } = computeStats(effectiveData);

    const noShock = (): TrendShockResult => ({
        isEndShocked: false, hasMidDip: dipIndices.length > 0, dipIndices,
        reductionPct: 0, recentAvg: robustMean, historicalAvg: robustMean,
        robustMean, robustStd, trendAdjustedMean: robustMean,
    });

    if (n < 4) return noShock();

    const historicalAvg = computeMean(surpluses.slice(0, -3));
    const recentAvg = computeMean(surpluses.slice(-3));

    // Compare last-3 against the robust baseline (not raw historicalAvg)
    if (robustMean <= 0) return { ...noShock(), recentAvg, historicalAvg };

    const reductionPct = (robustMean - recentAvg) / Math.abs(robustMean);
    const isEndShocked = reductionPct > 0.70;
    const trendAdjustedMean = isEndShocked
        ? robustMean * 0.5 + recentAvg * 0.5
        : robustMean;

    return {
        isEndShocked, hasMidDip: dipIndices.length > 0, dipIndices,
        reductionPct, recentAvg, historicalAvg,
        robustMean, robustStd, trendAdjustedMean,
    };
}

// ── Distribution fitting ──────────────────────────────────────────────────────

interface DistFit {
    type: "normal" | "empirical";
    mean: number;
    std: number;
    skewness: number;
    sample: () => number;
}

function fitDistribution(data: number[], shock?: TrendShockResult): DistFit {
    // Use robust estimates (dip-corrected) when available
    const cleanData = shock?.dipIndices?.length
        ? data.filter((_, i) => !shock.dipIndices.includes(i))
        : data;
    const effectiveData = cleanData.length >= 3 ? cleanData : data;

    const { skewness } = computeStats(effectiveData);
    const robustMean = shock?.robustMean ?? computeStats(effectiveData).mean;
    const robustStd = shock?.robustStd ?? computeStats(effectiveData).std;
    const n = data.length;
    const useNormal = n >= 6 && Math.abs(skewness) < 1.0 && robustStd > 0;

    const baseSample: () => number = useNormal
        ? () => sampleNormal(robustMean, robustStd)
        : () => effectiveData[Math.floor(Math.random() * effectiveData.length)]!;

    if (!shock?.isEndShocked) {
        return { type: useNormal ? "normal" : "empirical", mean: robustMean, std: robustStd, skewness, sample: baseSample };
    }

    // End-shocked: 50/50 blend between robust historical normal and recent normal
    const recentSample = () => sampleNormal(shock.recentAvg, robustStd);
    return {
        type: useNormal ? "normal" : "empirical",
        mean: shock.trendAdjustedMean,
        std: robustStd,
        skewness,
        sample: () => Math.random() < 0.5 ? baseSample() : recentSample(),
    };
}

function buildAdjustedDistFit(base: DistFit, delta: number): DistFit {
    // Shifts the entire distribution by delta without altering variance or shape.
    return { ...base, mean: base.mean + delta, sample: () => base.sample() + delta };
}

// ── Monte Carlo engine ────────────────────────────────────────────────────────

interface MonteCarloResult {
    probabilityOfSuccess: number;
    p10: number;
    p50: number;
    p90: number;
    monthsToGoalP50: number | null;
    monthsToGoalP90: number | null;
    finalAmounts?: number[] | undefined; // only populated when returnFinals=true
}

function runAccumulationMC(
    distFit: DistFit,
    monthsRemaining: number,
    targetAmount: number,
    simCount: number,
    returnFinals = false,
): MonteCarloResult {
    const finalAmounts: number[] = [];
    const monthsReached: number[] = [];

    for (let s = 0; s < simCount; s++) {
        let cumulative = 0;
        let reached: number | null = null;
        for (let m = 1; m <= monthsRemaining; m++) {
            cumulative += distFit.sample();
            if (reached === null && cumulative >= targetAmount) {
                reached = m;
            }
        }
        finalAmounts.push(cumulative);
        if (reached !== null) monthsReached.push(reached);
    }

    finalAmounts.sort((a, b) => a - b);
    monthsReached.sort((a, b) => a - b);
    const pSuccess = monthsReached.length / simCount;

    return {
        probabilityOfSuccess: pSuccess,
        p10: percentile(finalAmounts, 10),
        p50: percentile(finalAmounts, 50),
        p90: percentile(finalAmounts, 90),
        monthsToGoalP50: pSuccess >= 0.50 ? percentile(monthsReached, 50) : null,
        monthsToGoalP90: pSuccess >= 0.10 ? percentile(monthsReached, 90) : null,
        finalAmounts: returnFinals ? finalAmounts : undefined,
    };
}

// ── Chart data helpers ────────────────────────────────────────────────────────

// Per-month cumulative p10/p50/p90 bands for the path traces chart
function computeMcBands(
    distFit: DistFit,
    monthsRemaining: number,
): { month: number; p10: number; p50: number; p90: number }[] {
    const SIM = 500;
    const monthlyVals: number[][] = Array.from({ length: monthsRemaining }, () => []);
    for (let s = 0; s < SIM; s++) {
        let cum = 0;
        for (let m = 0; m < monthsRemaining; m++) {
            cum += distFit.sample();
            monthlyVals[m]!.push(cum);
        }
    }
    return monthlyVals.map((vals, i) => {
        const sorted = [...vals].sort((a, b) => a - b);
        return {
            month: i + 1,
            p10: Math.round(percentile(sorted, 10)),
            p50: Math.round(percentile(sorted, 50)),
            p90: Math.round(percentile(sorted, 90)),
        };
    });
}

// Histogram of final-outcome amounts for the outcome distribution chart
function computeHistogram(
    sortedFinals: number[],
    targetAmount: number,
    bins = 50,
): { binMin: number; binMax: number; count: number; isSuccess: boolean }[] {
    if (sortedFinals.length === 0) return [];
    const xMin = sortedFinals[0]!;
    const xMax = sortedFinals[sortedFinals.length - 1]!;
    if (xMin === xMax) return [{ binMin: xMin, binMax: xMax, count: sortedFinals.length, isSuccess: xMin >= targetAmount }];
    const binW = (xMax - xMin) / bins;
    const histogram = Array.from({ length: bins }, (_, i) => ({
        binMin: Math.round(xMin + i * binW),
        binMax: Math.round(xMin + (i + 1) * binW),
        count: 0,
        isSuccess: (xMin + (i + 0.5) * binW) >= targetAmount,
    }));
    for (const v of sortedFinals) {
        const bi = Math.min(Math.floor((v - xMin) / binW), bins - 1);
        histogram[bi]!.count++;
    }
    return histogram;
}

function runReduceCategoryMC(
    distFit: DistFit,
    monthsRemaining: number,
    successThreshold: number,
    simCount: number,
): MonteCarloResult {
    const allSpends: number[] = [];
    let successfulMonths = 0;
    const totalMonths = simCount * monthsRemaining;

    for (let s = 0; s < simCount; s++) {
        for (let m = 0; m < monthsRemaining; m++) {
            const spend = distFit.sample();
            allSpends.push(spend);
            if (spend <= successThreshold) successfulMonths++;
        }
    }

    allSpends.sort((a, b) => a - b);

    return {
        probabilityOfSuccess: totalMonths > 0 ? successfulMonths / totalMonths : 0,
        p10: percentile(allSpends, 10),
        p50: percentile(allSpends, 50),
        p90: percentile(allSpends, 90),
        monthsToGoalP50: null,
        monthsToGoalP90: null,
    };
}

// ── Optimal savings (binary search) ──────────────────────────────────────────

interface OptimalSavings {
    currentMeanSurplus: number;
    forP50: number;
    forP70: number;
    forP90: number;
    increaseForP50: number;
    increaseForP70: number;
    increaseForP90: number;
}

function findSurplusForProbability(
    distFit: DistFit,
    monthsRemaining: number,
    targetAmount: number,
    targetProbability: number,
): number {
    const SIM = 3_000;
    const required = targetAmount / Math.max(monthsRemaining, 1);
    let lo = required - 4 * distFit.std;
    let hi = required + 4 * distFit.std;

    // Expand hi until P(success) clearly exceeds target
    for (let guard = 0; guard < 8; guard++) {
        const adj = buildAdjustedDistFit(distFit, hi - distFit.mean);
        if (runAccumulationMC(adj, monthsRemaining, targetAmount, SIM).probabilityOfSuccess >= targetProbability) break;
        hi += 2 * distFit.std;
    }

    for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const adj = buildAdjustedDistFit(distFit, mid - distFit.mean);
        if (runAccumulationMC(adj, monthsRemaining, targetAmount, SIM).probabilityOfSuccess >= targetProbability) hi = mid;
        else lo = mid;
    }
    return Math.round(hi);
}

function computeOptimalSavings(
    distFit: DistFit,
    monthsRemaining: number,
    targetAmount: number,
): OptimalSavings {
    const current = distFit.mean;
    const forP50 = findSurplusForProbability(distFit, monthsRemaining, targetAmount, 0.50);
    const forP70 = findSurplusForProbability(distFit, monthsRemaining, targetAmount, 0.70);
    const forP90 = findSurplusForProbability(distFit, monthsRemaining, targetAmount, 0.90);
    return {
        currentMeanSurplus: Math.round(current),
        forP50,
        forP70,
        forP90,
        increaseForP50: forP50 - Math.round(current),
        increaseForP70: forP70 - Math.round(current),
        increaseForP90: forP90 - Math.round(current),
    };
}

// ── Sensitivity curve ─────────────────────────────────────────────────────────

interface SensitivityPoint {
    monthlySurplus: number;
    probabilityOfSuccess: number;
}

function computeSensitivityCurve(
    distFit: DistFit,
    monthsRemaining: number,
    targetAmount: number,
    forP90: number,
    numPoints = 40,
): SensitivityPoint[] {
    // Cover from slightly below current mean to above forP90
    const xMin = Math.min(distFit.mean - distFit.std * 0.5, targetAmount / Math.max(monthsRemaining, 1) - distFit.std);
    const xMax = forP90 + distFit.std * 0.3;
    const step = (xMax - xMin) / (numPoints - 1);

    return Array.from({ length: numPoints }, (_, i) => {
        const surplus = xMin + i * step;
        const adj = buildAdjustedDistFit(distFit, surplus - distFit.mean);
        const result = runAccumulationMC(adj, monthsRemaining, targetAmount, 2_000);
        return { monthlySurplus: Math.round(surplus), probabilityOfSuccess: result.probabilityOfSuccess };
    });
}

// ── Category spend extractor ──────────────────────────────────────────────────

type CategoryBreakdown = {
    category: string;
    totalSpend: number;
    txnCount: number;
    shareOfTotal: number;
    avgTxnAmount: number;
};

function extractCategorySpend(
    stats: { categoryBreakdown: unknown[] }[],
    categoryTarget: string,
): number[] {
    return stats.map(s => {
        const cats = s.categoryBreakdown as CategoryBreakdown[];
        return cats.find(c => c.category === categoryTarget)?.totalSpend ?? 0;
    });
}

// ── Node ──────────────────────────────────────────────────────────────────────

const goalAnalysisNode: GraphNode<typeof goalAdvisorGraphSchema> = async (state) => {
    const { goalId } = state;
    const now = new Date();

    // Step 1: Load goal
    const goal = await prisma.goal.findUniqueOrThrow({ where: { id: goalId } });
    const monthsRemaining = computeMonthsRemaining(goal.deadline, now);

    // Step 2: Past-deadline short-circuit
    if (monthsRemaining <= 0) {
        const result = {
            computedAt: now.toISOString(),
            pastDeadline: true,
            monthsRemaining: 0,
            llmOutput: {
                goalFeasibility: "not_feasible",
                narrative: `The deadline (${goal.deadline.toISOString().slice(0, 7)}) has passed. Consider resetting this goal with a new target date.`,
                suggestions: [],
                quickWins: [],
                timelineNote: "Deadline has passed.",
            },
        };
        await prisma.goal.update({ where: { id: goalId }, data: { simulationResult: result as any } });
        return { goalAnalysisResult: result };
    }

    // Step 3: Load data
    const allStats = await prisma.monthlyStats.findMany({ orderBy: { month: "asc" } });
    if (allStats.length === 0) {
        throw new Error("[GoalAdvisor] No MonthlyStats found. Run the stats pipeline first.");
    }
    const activePatterns = await prisma.recurringPattern.findMany({ where: { isActive: true, OR: [{ type: "debit" }, { type: null }] } });

    // Step 3b: Data freshness check
    const lastDataMonth = allStats[allStats.length - 1]!.month;
    const dataGapMonths = computeDataGapMonths(lastDataMonth, now);
    const freshnessStatus = classifyFreshness(dataGapMonths);

    if (freshnessStatus === "very_stale") {
        const result = {
            computedAt: now.toISOString(),
            pastDeadline: false,
            dataStale: true,
            freshnessStatus,
            dataGapMonths,
            lastDataMonth,
            freshnessWarning: `Your most recent statement covers ${lastDataMonth} — ${dataGapMonths} months ago. The simulation cannot produce reliable results with data this old. Please upload statements up to the current month and re-run.`,
            llmOutput: null,
        };
        await prisma.goal.update({ where: { id: goalId }, data: { simulationResult: result as any } });
        return { goalAnalysisResult: result };
    }

    const freshnessWarning = dataGapMonths <= 1 ? null
        : dataGapMonths <= 3
            ? `Data is ${dataGapMonths} month(s) behind current (last: ${lastDataMonth}). Results are indicative — upload recent statements for higher accuracy.`
            : `Data is ${dataGapMonths} months behind current (last: ${lastDataMonth}). Projections may be significantly off. Upload recent statements for reliable results.`;

    // Step 4: Build random variable array
    const surpluses = allStats.map(s => s.netSavings);
    const isReduceCategory = goal.goalType === "reduce_category";

    let data: number[];
    let historicalCategoryAvg: number | undefined;

    if (isReduceCategory) {
        if (!goal.categoryTarget) {
            throw new Error("[GoalAdvisor] reduce_category goal requires categoryTarget to be set.");
        }
        data = extractCategorySpend(allStats, goal.categoryTarget);
        historicalCategoryAvg = computeMean(data);
    } else {
        data = surpluses;
    }

    // Step 5: Trend shock (always computed on surplus, regardless of goal type)
    const shock = detectTrendShock(surpluses);

    // Step 6: Fit distribution
    const distFit = isReduceCategory
        ? fitDistribution(data)
        : fitDistribution(data, shock);

    // Step 7: Pre-metrics
    const avgMonthlySurplus = computeMean(surpluses);
    const requiredMonthlySaving = isReduceCategory
        ? null
        : goal.targetAmount / monthsRemaining;
    const gapPerMonth = requiredMonthlySaving !== null
        ? requiredMonthlySaving - avgMonthlySurplus
        : null;

    // Step 8: Base Monte Carlo
    const successThreshold = historicalCategoryAvg !== undefined
        ? historicalCategoryAvg - goal.targetAmount
        : 0;

    const SIM_COUNT = 10_000;
    const mcResult = isReduceCategory
        ? runReduceCategoryMC(distFit, monthsRemaining, successThreshold, SIM_COUNT)
        : runAccumulationMC(distFit, monthsRemaining, goal.targetAmount, SIM_COUNT, true);

    const feasibility =
        mcResult.probabilityOfSuccess >= 0.70 ? "achievable"
        : mcResult.probabilityOfSuccess >= 0.40 ? "stretch"
        : "not_feasible";

    // Step 9: Optimal savings thresholds + sensitivity curve (accumulation goals only)
    let optimalSavings: OptimalSavings | null = null;
    let sensitivityCurve: SensitivityPoint[] | null = null;
    if (!isReduceCategory) {
        console.log("[GoalAdvisor] Computing optimal savings thresholds...");
        optimalSavings = computeOptimalSavings(distFit, monthsRemaining, goal.targetAmount);
        sensitivityCurve = computeSensitivityCurve(distFit, monthsRemaining, goal.targetAmount, optimalSavings.forP90);
    }

    // Step 11: Build LLM context strings
    const cancellableRecurring = activePatterns
        .filter(p => p.cancellability === "cancellable" || p.cancellability === "pausable")
        .map(p =>
            `${p.merchantName ?? p.payeeName ?? "Unknown"} (${p.category ?? "Other"}): ₹${p.estimatedMonthlyAmount.toFixed(0)}/mo — ${p.cancellability}`
        )
        .join("\n") || "None";

    const latestStats = allStats[allStats.length - 1]!;
    const topCategories = (latestStats.categoryBreakdown as unknown as CategoryBreakdown[])
        .slice(0, 5)
        .map(c => `${c.category}: ₹${c.totalSpend.toFixed(0)}/mo (${c.shareOfTotal.toFixed(1)}% of expenses)`)
        .join("\n");

    const surplusTrend = allStats.slice(-6)
        .map(s => `${s.month}: ₹${s.netSavings.toFixed(0)}`)
        .join(", ");

    const trendWarningParts: string[] = [];
    if (shock.hasMidDip)
        trendWarningParts.push(`MID-PERIOD DIP: ${shock.dipIndices.length} anomalous month(s) excluded from distribution fit (IQR outlier)`);
    if (shock.isEndShocked)
        trendWarningParts.push(`END-SHOCK: recent 3-month avg ₹${shock.recentAvg.toFixed(0)} is ${(shock.reductionPct * 100).toFixed(0)}% below robust baseline ₹${shock.robustMean.toFixed(0)}`);
    const trendWarning = trendWarningParts.length > 0 ? trendWarningParts.join("; ") : "None";

    const dipMonths = shock.hasMidDip
        ? shock.dipIndices
            .map(i => `${allStats[i]!.month}: ₹${allStats[i]!.netSavings.toFixed(0)}`)
            .join(" | ")
        : "None";
    const robustBaseline = shock.hasMidDip || shock.isEndShocked
        ? `₹${shock.robustMean.toFixed(0)}/mo (simulation uses this, not the raw average)`
        : "N/A (no anomalies detected)";

    // Step 12: Invoke LLM
    const prompt = await goalAdvisorSystemMessage.formatMessages({
        goalType: goal.goalType,
        targetAmount: goal.targetAmount.toFixed(0),
        deadline: goal.deadline.toISOString().slice(0, 7),
        categoryTarget: goal.categoryTarget ?? "N/A",
        monthsRemaining,
        monthsOfData: allStats.length,
        avgMonthlySurplus: avgMonthlySurplus.toFixed(0),
        requiredMonthlySaving: requiredMonthlySaving?.toFixed(0) ?? "N/A (reduce_category goal)",
        gapPerMonth: gapPerMonth !== null ? `₹${gapPerMonth.toFixed(0)}` : "N/A",
        trendWarning,
        dipMonths,
        robustBaseline,
        dataFreshnessWarning: freshnessWarning ?? "None",
        probabilityOfSuccess: (mcResult.probabilityOfSuccess * 100).toFixed(1),
        feasibility,
        p10: mcResult.p10.toFixed(0),
        p50: mcResult.p50.toFixed(0),
        p90: mcResult.p90.toFixed(0),
        monthsToGoalP50: mcResult.monthsToGoalP50?.toString() ?? "Goal not reached in >50% of simulations",
        cancellableRecurring,
        topCategories,
        surplusTrend,
    });

    const llmOutput = await goalAdvisorLlm.invoke(prompt);

    // Step 11: Re-run Monte Carlo for each suggestion with adjusted distribution
    const suggestionsWithConfidence = await Promise.all(
        llmOutput.suggestions.map(async suggestion => {
            // For reduce_category: spend decreases → negate the delta
            const delta = isReduceCategory
                ? -suggestion.monthlySavingImpact
                : suggestion.monthlySavingImpact;

            const adjustedDist = buildAdjustedDistFit(distFit, delta);
            const adjustedMc = isReduceCategory
                ? runReduceCategoryMC(adjustedDist, monthsRemaining, successThreshold, 5_000)
                : runAccumulationMC(adjustedDist, monthsRemaining, goal.targetAmount, 5_000);

            return {
                ...suggestion,
                confidence: adjustedMc.probabilityOfSuccess,
                p10AfterAction: adjustedMc.p10,
                p50AfterAction: adjustedMc.p50,
                p90AfterAction: adjustedMc.p90,
            };
        })
    );

    // Step 14: Assemble chart data
    const charts = {
        // Chart 01: per-month cumulative p10/p50/p90 bands (path traces)
        mcBands: !isReduceCategory
            ? computeMcBands(distFit, monthsRemaining)
            : null,

        // Chart 02: binned outcome distribution histogram
        outcomeHistogram: !isReduceCategory && mcResult.finalAmounts
            ? computeHistogram(mcResult.finalAmounts, goal.targetAmount)
            : null,

        // Chart 03: surplus history snapshot (avoids a second API call from frontend)
        surplusHistory: allStats.map(s => ({
            month: s.month,
            netSavings: Math.round(s.netSavings),
        })),

        // Charts 04 + 05: suggestion confidence & ranges
        // → covered by llmOutput.suggestions[].{confidence, p10/p50/p90AfterAction}

        // Chart 06: sensitivity curve + optimal savings
        // → covered by top-level sensitivityCurve + optimalSavings fields

        // Chart 07: distribution fit parameters
        distributionParams: {
            type: distFit.type,
            robustMean: Math.round(shock.robustMean),
            robustStd: Math.round(shock.robustStd),
            skewness: parseFloat(distFit.skewness.toFixed(3)),
            hasMidDip: shock.hasMidDip,
            isEndShocked: shock.isEndShocked,
            dipMonths: shock.dipIndices.map(i => ({
                month: allStats[i]!.month,
                netSavings: Math.round(allStats[i]!.netSavings),
            })),
        },
    };

    // Step 15: Assemble and persist
    const { finalAmounts: _drop, ...mcResultClean } = mcResult;
    const simulationResult = {
        computedAt: now.toISOString(),
        monthsOfDataUsed: allStats.length,
        pastDeadline: false,
        distributionUsed: distFit.type,
        dataStale: dataGapMonths > 1,
        freshnessStatus,
        dataGapMonths,
        lastDataMonth,
        freshnessWarning,
        trendWarning: shock.isEndShocked || shock.hasMidDip,
        isEndShocked: shock.isEndShocked,
        hasMidDip: shock.hasMidDip,
        dipMonthsDetected: shock.dipIndices.length,
        trendReductionPct: shock.isEndShocked ? shock.reductionPct : null,
        monteCarlo: mcResultClean,
        avgMonthlySurplus,
        monthsRemaining,
        requiredMonthlySaving,
        gapPerMonth,
        feasibility,
        optimalSavings,
        sensitivityCurve,
        charts,
        llmOutput: { ...llmOutput, suggestions: suggestionsWithConfidence },
    };

    await prisma.goal.update({
        where: { id: goalId },
        data: { simulationResult: simulationResult as any },
    });

    console.log(
        `[GoalAdvisor] goalId=${goalId} feasibility=${llmOutput.goalFeasibility} P(success)=${(mcResult.probabilityOfSuccess * 100).toFixed(1)}% dist=${distFit.type} endShock=${shock.isEndShocked} midDip=${shock.hasMidDip}(${shock.dipIndices.length}mo)`
    );

    return { goalAnalysisResult: simulationResult };
};

export { goalAnalysisNode };
