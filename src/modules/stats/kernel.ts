/**
 * Kernel smoothing over an evenly spaced series.
 *
 * Lives beside `robust.ts` for the same reason that file exists: the moment two
 * places smooth a series with slightly different weights, two charts of the same
 * data disagree and neither is wrong.
 */

export interface SmoothPoint {
    /** Position on the source index, fractional — `1.5` is halfway between the second and third point. */
    x: number;
    value: number;
}

export interface SmoothedSeries {
    kernel: "gaussian";
    bandwidth: number;
    points: SmoothPoint[];
}

/**
 * Bandwidth, in index steps — i.e. in months, for a monthly series.
 *
 * **This is a judgement, not a derivation, and worth being honest about.**
 * Silverman's rule estimates the bandwidth for a density over *sampled values*;
 * here the samples are one per month at fixed spacing, so there is no sampling
 * variance to plug into it. What is left is the question the curve is meant to
 * answer: over a year of spending, is the trend rising or falling? A bandwidth
 * near one month barely smooths at all (the curve just traces the bars, which the
 * bars already do); much past three and a genuine step change disappears.
 *
 * `√n / 3`, floored at 1, lands at ~1.15 months over a year and ~2 over three
 * years — wider windows for longer histories, which is the right direction: more
 * months means more noise to average out and more room to still show a turn.
 */
export function defaultBandwidth(n: number): number {
    return Math.max(1, Math.sqrt(Math.max(n, 1)) / 3);
}

/**
 * Nadaraya–Watson regression with a Gaussian kernel — the smooth curve to draw
 * over a bar chart.
 *
 * Each output point is a weighted mean of *every* input, with weights falling off
 * as `exp(-½(Δ/h)²)`. Two consequences worth knowing before changing anything:
 *
 * - **It never overshoots.** Every point is a convex combination of the data, so
 *   a spline's habit of dipping below zero between two low bars cannot happen —
 *   which matters when the quantity is money spent and negative is meaningless.
 * - **The ends are pulled inward.** Near the first and last index only one side
 *   has neighbours, so the curve is biased toward the interior. That is inherent
 *   to kernel regression, not a bug to patch: the alternative (reflecting the
 *   series at the boundary) invents data that would then be drawn as if measured.
 *
 * **Evaluated at `samplesPerStep` points per index, not once per index**, and that
 * is what keeps the client honest: the response carries a dense curve the UI
 * plots as a plain polyline, so no interpolation — no arithmetic on the data at
 * all — happens in the browser.
 */
export function gaussianSmooth(
    values: number[],
    options: { bandwidth?: number; samplesPerStep?: number } = {}
): SmoothedSeries {
    const n = values.length;
    const bandwidth = options.bandwidth ?? defaultBandwidth(n);
    const samplesPerStep = Math.max(1, Math.round(options.samplesPerStep ?? 4));

    // Two points cannot show a trend that the two bars do not already show.
    if (n < 3) return { kernel: "gaussian", bandwidth, points: [] };

    const points: SmoothPoint[] = [];
    const steps = (n - 1) * samplesPerStep;

    for (let s = 0; s <= steps; s++) {
        const x = s / samplesPerStep;
        let weighted = 0;
        let total = 0;
        for (let i = 0; i < n; i++) {
            const d = (x - i) / bandwidth;
            const w = Math.exp(-0.5 * d * d);
            weighted += w * values[i]!;
            total += w;
        }
        points.push({ x, value: total > 0 ? weighted / total : 0 });
    }

    return { kernel: "gaussian", bandwidth, points };
}
