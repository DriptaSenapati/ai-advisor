/**
 * Robust descriptive statistics, shared by the goal advisor's Monte Carlo engine,
 * the red-flag detectors and the recovery projection.
 *
 * These lived inside `goal_advisor_nodes/goal_analysis_node.ts` and were lifted out
 * verbatim when a second and third caller appeared. That matters more than it looks:
 * `detectTrendShock` decides which months the simulation is allowed to learn from, and
 * a merchant-outlier detector that computed "typical" a slightly different way would
 * disagree with the goal advisor about the same account. One implementation, one answer.
 *
 * Every function here is pure and synchronous — no Prisma, no I/O — so it is safe to
 * call from a graph node, a service, or a script.
 */

/** Arithmetic mean. Empty input is 0, not NaN — callers treat "no data" as "no money". */
export function computeMean(data: number[]): number {
    if (data.length === 0) return 0;
    return data.reduce((a, b) => a + b, 0) / data.length;
}

/**
 * Mean, sample standard deviation (n−1) and skewness in one pass-ish.
 *
 * `std` uses the n−1 denominator because these are always samples of a longer
 * financial history, never the population. `skewness` needs at least 3 points and a
 * non-zero spread to mean anything, and returns 0 rather than NaN otherwise — the goal
 * advisor branches on `Math.abs(skewness) < 1.0` to pick normal vs empirical sampling,
 * and NaN would silently take the empirical path for every flat series.
 */
export function computeStats(data: number[]): { mean: number; std: number; skewness: number } {
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

/**
 * Nearest-rank percentile of an **already sorted ascending** array.
 *
 * The sorted precondition is the caller's job on purpose: the Monte Carlo runs call this
 * 10,000+ times over the same array and sorting inside would dominate the cost. Use
 * `quantile()` when you have unsorted input.
 */
export function percentile(sortedArr: number[], p: number): number {
    if (sortedArr.length === 0) return 0;
    const idx = Math.min(Math.floor((p / 100) * sortedArr.length), sortedArr.length - 1);
    return sortedArr[idx]!;
}

/** `percentile()` for unsorted input — copies and sorts first, so it never mutates. */
export function quantile(data: number[], p: number): number {
    if (data.length === 0) return 0;
    return percentile([...data].sort((a, b) => a - b), p);
}

/** The 50th percentile. Named separately because that is how every caller reads. */
export function median(data: number[]): number {
    return quantile(data, 50);
}

/**
 * Tukey fences. `iqr === 0` is a real and common answer here — a subscription charged
 * the same amount every month has no spread — and callers must treat it as "no outliers
 * are detectable" rather than "everything outside the median is an outlier".
 */
export function iqrBounds(data: number[]): {
    q1: number; q3: number; iqr: number; lowerFence: number; upperFence: number;
} {
    const sorted = [...data].sort((a, b) => a - b);
    const q1 = percentile(sorted, 25);
    const q3 = percentile(sorted, 75);
    const iqr = q3 - q1;
    return { q1, q3, iqr, lowerFence: q1 - 1.5 * iqr, upperFence: q3 + 1.5 * iqr };
}

/**
 * Indices of values below the lower Tukey fence — the "dip months" the goal advisor
 * excludes from its distribution fit.
 *
 * Returns `[]` when `iqr === 0`. Without that guard a perfectly flat series has
 * `lowerFence === q1 === median`, so roughly half of it is flagged as anomalous.
 */
export function lowOutlierIndices(data: number[]): number[] {
    const { iqr, lowerFence } = iqrBounds(data);
    if (iqr <= 0) return [];
    return data.map((v, i) => (v < lowerFence ? i : -1)).filter(i => i >= 0);
}

/**
 * Mean and std with low outliers removed.
 *
 * Falls back to the full series when fewer than 3 points survive: a 4-month history with
 * two dips has no robust estimate to give, and a mean of one month is worse than a noisy
 * mean of four. Mirrors `detectTrendShock`'s `cleanData.length >= 3` guard exactly.
 */
export function robustMeanStd(data: number[]): {
    mean: number; std: number; skewness: number; outlierIndices: number[];
} {
    const outlierIndices = lowOutlierIndices(data);
    const clean = data.filter((_, i) => !outlierIndices.includes(i));
    const effective = clean.length >= 3 ? clean : data;
    return { ...computeStats(effective), outlierIndices };
}
