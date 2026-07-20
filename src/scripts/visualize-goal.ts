/**
 * Generates PNG charts for a goal's Monte Carlo simulation.
 *
 * Usage: npx tsx src/scripts/visualize-goal.ts <goalId>
 *
 * Outputs to: charts/goal-<goalId>/
 *   01-mc-paths.png          — 200 simulation path traces + p10/p50/p90 bands
 *   02-outcome-distribution.png — histogram of 10k final outcomes
 *   03-surplus-history.png   — historical monthly surplus bar chart
 *   04-suggestion-confidence.png — probability comparison: base vs each suggestion
 *   05-suggestion-outcomes.png  — p10/p50/p90 range for base + each suggestion (re-run)
 */

import "../envConfig.js";
import { createCanvas } from "@napi-rs/canvas";
import type { CanvasRenderingContext2D } from "@napi-rs/canvas";
import prisma from "../prismaClient.js";
import fs from "fs";
import path from "path";

// ── Colour palette ────────────────────────────────────────────────────────────

const C = {
    bg: "#FFFFFF",
    surface: "#F9FAFB",
    grid: "#E5E7EB",
    axis: "#D1D5DB",
    text: "#374151",
    textMuted: "#6B7280",
    title: "#111827",
    green: "#16A34A",
    red: "#DC2626",
    blue: "#2563EB",
    amber: "#D97706",
    emerald: "#059669",
    greenLight: "#DCFCE7",
    redLight: "#FEE2E2",
    blueLight: "#DBEAFE",
    p10: "#F59E0B",
    p50: "#2563EB",
    p90: "#10B981",
    target: "#DC2626",
} as const;

// ── Math helpers (mirrors goal_analysis_node.ts) ───────────────────────────

function computeMean(data: number[]) {
    if (data.length === 0) return 0;
    return data.reduce((a, b) => a + b, 0) / data.length;
}

function computeStats(data: number[]) {
    const n = data.length;
    const mean = computeMean(data);
    const variance = n > 1 ? data.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
    const std = Math.sqrt(variance);
    const skewness = std > 0 && n >= 3 ? data.reduce((s, x) => s + ((x - mean) / std) ** 3, 0) / n : 0;
    return { mean, std, skewness };
}

function sampleNormal(mean: number, std: number) {
    const u1 = Math.max(Number.EPSILON, Math.random());
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * Math.random());
    return mean + z * std;
}

function percentile(arr: number[], p: number) {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1)]!;
}

function detectTrendShock(surpluses: number[]) {
    const n = surpluses.length;
    const sorted = [...surpluses].sort((a, b) => a - b);
    const q1 = percentile(sorted, 25);
    const q3 = percentile(sorted, 75);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const dipIndices = iqr > 0
        ? surpluses.map((v, i) => (v < lowerFence ? i : -1)).filter(i => i >= 0)
        : [];
    const cleanData = surpluses.filter((_, i) => !dipIndices.includes(i));
    const effectiveData = cleanData.length >= 3 ? cleanData : surpluses;
    const { mean: robustMean, std: robustStd } = computeStats(effectiveData);
    const noShock = () => ({
        isEndShocked: false, hasMidDip: dipIndices.length > 0, dipIndices,
        reductionPct: 0, recentAvg: robustMean, historicalAvg: robustMean,
        robustMean, robustStd, trendAdjustedMean: robustMean,
    });
    if (n < 4) return noShock();
    const historicalAvg = computeMean(surpluses.slice(0, -3));
    const recentAvg = computeMean(surpluses.slice(-3));
    if (robustMean <= 0) return { ...noShock(), recentAvg, historicalAvg };
    const reductionPct = (robustMean - recentAvg) / Math.abs(robustMean);
    const isEndShocked = reductionPct > 0.70;
    return {
        isEndShocked, hasMidDip: dipIndices.length > 0, dipIndices,
        reductionPct, recentAvg, historicalAvg,
        robustMean, robustStd,
        trendAdjustedMean: isEndShocked ? robustMean * 0.5 + recentAvg * 0.5 : robustMean,
    };
}

interface DistFit { mean: number; std: number; sample: () => number; }

function fitDistribution(data: number[], shock?: ReturnType<typeof detectTrendShock>): DistFit {
    const cleanData = shock?.dipIndices?.length
        ? data.filter((_, i) => !shock.dipIndices.includes(i))
        : data;
    const effectiveData = cleanData.length >= 3 ? cleanData : data;
    const { skewness } = computeStats(effectiveData);
    const robustMean = shock?.robustMean ?? computeStats(effectiveData).mean;
    const robustStd = shock?.robustStd ?? computeStats(effectiveData).std;
    const n = data.length;
    const useNormal = n >= 6 && Math.abs(skewness) < 1.0 && robustStd > 0;
    const baseSample = useNormal
        ? () => sampleNormal(robustMean, robustStd)
        : () => effectiveData[Math.floor(Math.random() * effectiveData.length)]!;
    if (!shock?.isEndShocked) return { mean: robustMean, std: robustStd, sample: baseSample };
    const recentSample = () => sampleNormal(shock.recentAvg, robustStd);
    return { mean: shock.trendAdjustedMean, std: robustStd, sample: () => Math.random() < 0.5 ? baseSample() : recentSample() };
}

function buildAdjusted(base: DistFit, delta: number): DistFit {
    return { ...base, mean: base.mean + delta, sample: () => base.sample() + delta };
}

// Returns { paths: month-by-month cumulative for each sim, finals: final value per sim }
function runSimWithPaths(dist: DistFit, months: number, simCount: number) {
    const paths: number[][] = [];
    const finals: number[] = [];
    for (let s = 0; s < simCount; s++) {
        const path: number[] = [];
        let cum = 0;
        for (let m = 0; m < months; m++) {
            cum += dist.sample();
            path.push(cum);
        }
        paths.push(path);
        finals.push(cum);
    }
    return { paths, finals };
}

function runSimFinals(dist: DistFit, months: number, simCount: number, target: number) {
    const finals: number[] = [];
    const monthsReached: number[] = [];
    for (let s = 0; s < simCount; s++) {
        let cum = 0, reached: number | null = null;
        for (let m = 1; m <= months; m++) {
            cum += dist.sample();
            if (reached === null && cum >= target) reached = m;
        }
        finals.push(cum);
        if (reached !== null) monthsReached.push(reached);
    }
    finals.sort((a, b) => a - b);
    return {
        p10: percentile(finals, 10),
        p50: percentile(finals, 50),
        p90: percentile(finals, 90),
        probabilityOfSuccess: monthsReached.length / simCount,
    };
}

// ── Canvas drawing utilities ──────────────────────────────────────────────────

type M = { top: number; right: number; bottom: number; left: number };

function newCanvas(w: number, h: number) {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);
    return { canvas, ctx, w, h };
}

function drawTitle(ctx: CanvasRenderingContext2D, text: string, w: number, topY: number) {
    ctx.fillStyle = C.title;
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(text, w / 2, topY);
}

function drawGridlines(ctx: CanvasRenderingContext2D, m: M, w: number, h: number, yTicks: number[],
    yScale: (v: number) => number) {
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    for (const tick of yTicks) {
        const py = yScale(tick);
        ctx.beginPath();
        ctx.moveTo(m.left, py);
        ctx.lineTo(w - m.right, py);
        ctx.stroke();
    }
}

function drawXAxis(ctx: CanvasRenderingContext2D, m: M, w: number, h: number, labels: string[], xScale: (i: number) => number) {
    ctx.strokeStyle = C.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m.left, h - m.bottom);
    ctx.lineTo(w - m.right, h - m.bottom);
    ctx.stroke();

    ctx.fillStyle = C.textMuted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i < labels.length; i++) {
        ctx.fillText(labels[i]!, xScale(i), h - m.bottom + 8);
    }
}

function drawYAxis(ctx: CanvasRenderingContext2D, m: M, h: number, yTicks: number[], yScale: (v: number) => number,
    fmt: (v: number) => string) {
    ctx.strokeStyle = C.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m.left, m.top);
    ctx.lineTo(m.left, h - m.bottom);
    ctx.stroke();

    ctx.fillStyle = C.textMuted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const tick of yTicks) {
        ctx.fillText(fmt(tick), m.left - 8, yScale(tick));
    }
}

function niceNum(range: number, round: boolean) {
    const exp = Math.floor(Math.log10(range));
    const f = range / Math.pow(10, exp);
    let nf: number;
    if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
    else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf * Math.pow(10, exp);
}

function niceTicks(vmin: number, vmax: number, targetCount = 6) {
    const range = niceNum(vmax - vmin, false);
    const d = niceNum(range / (targetCount - 1), true);
    const gmin = Math.floor(vmin / d) * d;
    const gmax = Math.ceil(vmax / d) * d;
    const ticks: number[] = [];
    for (let v = gmin; v <= gmax + d * 0.5; v += d) ticks.push(parseFloat(v.toFixed(10)));
    return ticks;
}

function fmtInr(v: number) {
    const abs = Math.abs(v);
    const s = abs >= 1e7 ? `${(abs / 1e7).toFixed(1)}Cr` : abs >= 1e5 ? `${(abs / 1e5).toFixed(1)}L` : abs >= 1e3 ? `${(abs / 1e3).toFixed(0)}K` : abs.toFixed(0);
    return (v < 0 ? "-" : "") + "₹" + s;
}

function fmtPct(v: number) { return `${(v * 100).toFixed(1)}%`; }

function legend(ctx: CanvasRenderingContext2D, items: { color: string; label: string; dashed?: boolean }[], x: number, y: number) {
    ctx.font = "13px sans-serif";
    ctx.textBaseline = "middle";
    let cx = x;
    for (const item of items) {
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash(item.dashed ? [6, 4] : []);
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(cx + 24, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C.text;
        ctx.textAlign = "left";
        ctx.fillText(item.label, cx + 30, y);
        cx += 30 + ctx.measureText(item.label).width + 24;
    }
}

// ── Chart 1: Monte Carlo Paths ────────────────────────────────────────────────

function chartPaths(surpluses: number[], dist: DistFit, months: number, target: number, trendWarning: boolean, outDir: string) {
    const W = 1200, H = 620;
    const m: M = { top: 60, right: 60, bottom: 80, left: 110 };
    const IW = W - m.left - m.right;
    const IH = H - m.top - m.bottom;
    const { canvas, ctx } = newCanvas(W, H);

    // Run 200 path sims
    const { paths, finals } = runSimWithPaths(dist, months, 200);

    // Compute per-month percentile bands from paths
    const bandP10: number[] = [], bandP50: number[] = [], bandP90: number[] = [];
    for (let mo = 0; mo < months; mo++) {
        const monthVals = paths.map(p => p[mo]!).sort((a, b) => a - b);
        bandP10.push(percentile(monthVals, 10));
        bandP50.push(percentile(monthVals, 50));
        bandP90.push(percentile(monthVals, 90));
    }

    const allVals = [...finals, target, 0];
    const yMin = Math.min(...allVals) * 1.12;
    const yMax = Math.max(...allVals) * 1.12;
    const ticks = niceTicks(yMin, yMax, 7);

    const xScale = (mo: number) => m.left + ((mo + 1) / months) * IW;
    const yScale = (v: number) => m.top + (1 - (v - ticks[0]!) / (ticks[ticks.length - 1]! - ticks[0]!)) * IH;

    drawTitle(ctx as any, "Monte Carlo Simulation — 200 Path Traces", W, 18);
    drawGridlines(ctx as any, m, W, H, ticks, yScale);
    drawYAxis(ctx as any, m, H, ticks, yScale, fmtInr);

    const xLabels = Array.from({ length: months }, (_, i) => `M${i + 1}`);
    drawXAxis(ctx as any, m, W, H, xLabels, xScale);

    // X-axis label
    ctx.fillStyle = C.textMuted;
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Month", W / 2, H - 4);

    // Draw individual paths (semi-transparent gray)
    ctx.strokeStyle = "rgba(107,114,128,0.15)";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (const path of paths) {
        ctx.beginPath();
        for (let mo = 0; mo < months; mo++) {
            const px = xScale(mo), py = yScale(path[mo]!);
            mo === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
    }

    // Draw p10-p90 fill band
    ctx.fillStyle = "rgba(37,99,235,0.07)";
    ctx.beginPath();
    for (let mo = 0; mo < months; mo++) {
        const px = xScale(mo), py = yScale(bandP90[mo]!);
        mo === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    for (let mo = months - 1; mo >= 0; mo--) {
        ctx.lineTo(xScale(mo), yScale(bandP10[mo]!));
    }
    ctx.closePath();
    ctx.fill();

    // Draw p90 line
    (ctx as any).strokeStyle = C.p90;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    for (let mo = 0; mo < months; mo++) {
        const px = xScale(mo), py = yScale(bandP90[mo]!);
        mo === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Draw p10 line
    (ctx as any).strokeStyle = C.p10;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    for (let mo = 0; mo < months; mo++) {
        const px = xScale(mo), py = yScale(bandP10[mo]!);
        mo === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Draw p50 line
    (ctx as any).strokeStyle = C.p50;
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (let mo = 0; mo < months; mo++) {
        const px = xScale(mo), py = yScale(bandP50[mo]!);
        mo === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Zero line
    if (ticks[0]! < 0 && ticks[ticks.length - 1]! > 0) {
        (ctx as any).strokeStyle = "rgba(55,65,81,0.4)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        const py0 = yScale(0);
        ctx.beginPath();
        ctx.moveTo(m.left, py0);
        ctx.lineTo(W - m.right, py0);
        ctx.stroke();
    }

    // Target line
    const tyY = yScale(target);
    (ctx as any).strokeStyle = C.target;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.moveTo(m.left, tyY);
    ctx.lineTo(W - m.right, tyY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.target;
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`Target ${fmtInr(target)}`, m.left + 4, tyY - 4);

    // Shock annotation
    if (trendWarning) {
        ctx.fillStyle = "#92400E";
        ctx.font = "13px sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillText("⚠ Trend shock detected — last 3 months below historical", W - m.right - 4, m.top + 4);
    }

    legend(ctx as any, [
        { color: C.p90, label: "p90 (optimistic)", dashed: true },
        { color: C.p50, label: "p50 (median)" },
        { color: C.p10, label: "p10 (pessimistic)", dashed: true },
        { color: C.target, label: "Target", dashed: true },
    ], m.left, H - 22);

    const out = path.join(outDir, "01-mc-paths.png");
    fs.writeFileSync(out, canvas.toBuffer("image/png"));
    console.log("  ✓", out);
}

// ── Chart 2: Outcome Distribution Histogram ───────────────────────────────────

function chartHistogram(dist: DistFit, months: number, target: number, outDir: string) {
    const W = 1200, H = 580;
    const m: M = { top: 60, right: 60, bottom: 80, left: 110 };
    const IW = W - m.left - m.right;
    const IH = H - m.top - m.bottom;
    const { canvas, ctx } = newCanvas(W, H);

    // Run 10k for histogram
    const finals: number[] = [];
    let successCount = 0;
    for (let s = 0; s < 10_000; s++) {
        let cum = 0;
        for (let mo = 0; mo < months; mo++) cum += dist.sample();
        finals.push(cum);
        if (cum >= target) successCount++;
    }
    finals.sort((a, b) => a - b);

    const xMin = finals[0]!;
    const xMax = finals[finals.length - 1]!;
    const BINS = 60;
    const binW = (xMax - xMin) / BINS;
    const counts = new Array(BINS).fill(0);
    for (const v of finals) {
        const bi = Math.min(Math.floor((v - xMin) / binW), BINS - 1);
        counts[bi]++;
    }
    const maxCount = Math.max(...counts);

    const xScale = (v: number) => m.left + ((v - xMin) / (xMax - xMin)) * IW;
    const yScale = (c: number) => m.top + (1 - c / maxCount) * IH;
    const binPxW = IW / BINS;

    drawTitle(ctx as any, `Outcome Distribution — 10,000 Simulations  (P(success) = ${(successCount / 100).toFixed(1)}%)`, W, 18);

    // Gridlines on y
    const yTicks = niceTicks(0, maxCount, 6);
    drawGridlines(ctx as any, m, W, H, yTicks, yScale);
    drawYAxis(ctx as any, m, H, yTicks, yScale, v => v === 0 ? "0" : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v));

    // Draw bars
    for (let bi = 0; bi < BINS; bi++) {
        const bxMin = xMin + bi * binW;
        const bxMax = bxMin + binW;
        const success = bxMin >= target;
        ctx.fillStyle = success ? "rgba(22,163,74,0.75)" : "rgba(220,38,38,0.65)";
        const px = xScale(bxMin);
        const py = yScale(counts[bi]!);
        ctx.fillRect(px, py, binPxW - 1, H - m.bottom - py);
    }

    // X-axis ticks (use niceTicks on the value range)
    const xTicks = niceTicks(xMin, xMax, 7);
    ctx.strokeStyle = C.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m.left, H - m.bottom);
    ctx.lineTo(W - m.right, H - m.bottom);
    ctx.stroke();
    ctx.fillStyle = C.textMuted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const t of xTicks) {
        const px = xScale(t);
        if (px >= m.left && px <= W - m.right) {
            ctx.fillText(fmtInr(t), px, H - m.bottom + 8);
        }
    }
    ctx.fillStyle = C.textMuted;
    ctx.font = "13px sans-serif";
    ctx.textBaseline = "bottom";
    ctx.fillText("Accumulated Savings at Deadline", W / 2, H - 4);

    // Vertical lines: p10, p50, p90, target
    const pLines = [
        { v: percentile(finals, 10), color: C.p10, label: `p10 ${fmtInr(percentile(finals, 10))}` },
        { v: percentile(finals, 50), color: C.p50, label: `p50 ${fmtInr(percentile(finals, 50))}` },
        { v: percentile(finals, 90), color: C.p90, label: `p90 ${fmtInr(percentile(finals, 90))}` },
        { v: target, color: C.target, label: `Target ${fmtInr(target)}` },
    ];
    for (const pl of pLines) {
        const px = xScale(pl.v);
        (ctx as any).strokeStyle = pl.color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        ctx.moveTo(px, m.top);
        ctx.lineTo(px, H - m.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    legend(ctx as any, [
        { color: C.p10, label: `p10 ${fmtInr(percentile(finals, 10))}`, dashed: true },
        { color: C.p50, label: `p50 ${fmtInr(percentile(finals, 50))}`, dashed: true },
        { color: C.p90, label: `p90 ${fmtInr(percentile(finals, 90))}`, dashed: true },
        { color: C.target, label: `Target ${fmtInr(target)}`, dashed: true },
    ], m.left, H - 22);

    const out = path.join(outDir, "02-outcome-distribution.png");
    fs.writeFileSync(out, canvas.toBuffer("image/png"));
    console.log("  ✓", out);
}

// ── Chart 3: Surplus History ──────────────────────────────────────────────────

function chartSurplusHistory(
    months: { month: string; netSavings: number }[],
    trendWarning: boolean,
    outDir: string,
) {
    const W = 1200, H = 520;
    const m: M = { top: 60, right: 60, bottom: 90, left: 110 };
    const IW = W - m.left - m.right;
    const IH = H - m.top - m.bottom;
    const n = months.length;
    const { canvas, ctx } = newCanvas(W, H);

    const vals = months.map(s => s.netSavings);
    const yMin = Math.min(...vals, 0);
    const yMax = Math.max(...vals, 0);
    const ticks = niceTicks(yMin, yMax, 7);
    const yMin2 = ticks[0]!;
    const yMax2 = ticks[ticks.length - 1]!;
    const yScale = (v: number) => m.top + (1 - (v - yMin2) / (yMax2 - yMin2)) * IH;

    const bw = (IW / n) * 0.72;
    const xScale = (i: number) => m.left + (i + 0.5) * (IW / n);

    drawTitle(ctx as any, "Monthly Net Savings History", W, 18);
    drawGridlines(ctx as any, m, W, H, ticks, yScale);
    drawYAxis(ctx as any, m, H, ticks, yScale, fmtInr);

    // Shade last 3 months if shocked
    if (trendWarning && n >= 3) {
        const shockStart = xScale(n - 3) - bw / 2 - (IW / n) * 0.14;
        const shockEnd = xScale(n - 1) + bw / 2 + (IW / n) * 0.14;
        ctx.fillStyle = "rgba(251,191,36,0.13)";
        ctx.fillRect(shockStart, m.top, shockEnd - shockStart, IH);
        ctx.fillStyle = "#92400E";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText("⚠ trend shock zone", (shockStart + shockEnd) / 2, m.top + 6);
    }

    // Bars
    for (let i = 0; i < n; i++) {
        const v = vals[i]!;
        const cx = xScale(i);
        const isLastThree = i >= n - 3;
        ctx.fillStyle = v >= 0
            ? (isLastThree && trendWarning ? "#4ADE80" : C.green)
            : (isLastThree && trendWarning ? "#F87171" : C.red);
        const y0 = yScale(0);
        const yv = yScale(v);
        if (v >= 0) {
            ctx.fillRect(cx - bw / 2, yv, bw, y0 - yv);
        } else {
            ctx.fillRect(cx - bw / 2, y0, bw, yv - y0);
        }
    }

    // Zero line
    ctx.strokeStyle = "rgba(55,65,81,0.5)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    const py0 = yScale(0);
    ctx.beginPath();
    ctx.moveTo(m.left, py0);
    ctx.lineTo(W - m.right, py0);
    ctx.stroke();

    // X-axis
    ctx.strokeStyle = C.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m.left, H - m.bottom);
    ctx.lineTo(W - m.right, H - m.bottom);
    ctx.stroke();

    // X labels (rotated 45°)
    ctx.save();
    ctx.fillStyle = C.textMuted;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
        const cx = xScale(i);
        ctx.save();
        ctx.translate(cx, H - m.bottom + 12);
        ctx.rotate(-Math.PI / 4);
        ctx.fillText(months[i]!.month, 0, 0);
        ctx.restore();
    }
    ctx.restore();

    ctx.fillStyle = C.textMuted;
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Month", W / 2, H - 4);

    const out = path.join(outDir, "03-surplus-history.png");
    fs.writeFileSync(out, canvas.toBuffer("image/png"));
    console.log("  ✓", out);
}

// ── Chart 4: Suggestion Confidence Comparison ─────────────────────────────────

function chartSuggestionConfidence(
    baseProbability: number,
    suggestions: { action: string; confidence: number; monthlySavingImpact: number }[],
    outDir: string,
) {
    const ROW_H = 72;
    const W = 1200;
    const m: M = { top: 80, right: 180, bottom: 60, left: 420 };
    const H = m.top + m.bottom + suggestions.length * ROW_H + 20;
    const IW = W - m.left - m.right;
    const { canvas, ctx } = newCanvas(W, H);

    drawTitle(ctx as any, "Suggestion Confidence vs Base Probability", W, 18);

    // Subheader
    ctx.fillStyle = C.textMuted;
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`Base probability of success: ${fmtPct(baseProbability)}`, W / 2, 44);

    const xScale = (p: number) => m.left + p * IW;

    // Gridlines (every 20%)
    for (let p = 0; p <= 1; p += 0.2) {
        const px = xScale(p);
        ctx.strokeStyle = C.grid;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(px, m.top);
        ctx.lineTo(px, H - m.bottom);
        ctx.stroke();
        ctx.fillStyle = C.textMuted;
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(`${(p * 100).toFixed(0)}%`, px, H - m.bottom + 6);
    }

    // X-axis
    ctx.strokeStyle = C.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m.left, H - m.bottom);
    ctx.lineTo(W - m.right, H - m.bottom);
    ctx.stroke();

    // Base reference line
    const basePx = xScale(baseProbability);
    ctx.strokeStyle = "rgba(107,114,128,0.7)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.moveTo(basePx, m.top - 10);
    ctx.lineTo(basePx, H - m.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.textMuted;
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Base", basePx, m.top - 12);

    for (let i = 0; i < suggestions.length; i++) {
        const s = suggestions[i]!;
        const cy = m.top + i * ROW_H + ROW_H / 2;
        const barH = 32;

        // Label (left)
        ctx.fillStyle = C.text;
        ctx.font = "13px sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        const maxLabelW = m.left - 16;
        const label = `${i + 1}. ${s.action}`;
        // Truncate to fit
        let truncated = label;
        while (ctx.measureText(truncated).width > maxLabelW && truncated.length > 10) {
            truncated = truncated.slice(0, -4) + "…";
        }
        ctx.fillText(truncated, m.left - 8, cy);

        // Confidence bar
        const barW = s.confidence * IW;
        const barColor = s.confidence >= 0.70 ? C.green : s.confidence >= 0.40 ? C.amber : C.red;
        ctx.fillStyle = barColor;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(m.left, cy - barH / 2, barW, barH);
        ctx.globalAlpha = 1;

        // Base→confidence arrow connector
        if (basePx < m.left + barW) {
            ctx.strokeStyle = "rgba(55,65,81,0.3)";
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(basePx, cy);
            ctx.lineTo(m.left + barW, cy);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Value label on bar end
        ctx.fillStyle = C.text;
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`${(s.confidence * 100).toFixed(1)}%`, m.left + barW + 8, cy);

        // Impact label (right side)
        ctx.fillStyle = C.textMuted;
        ctx.font = "12px sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(`+${fmtInr(s.monthlySavingImpact)}/mo`, W - m.right + 170, cy);
    }

    // X-axis label
    ctx.fillStyle = C.textMuted;
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Probability of Success", W / 2, H - 4);

    const out = path.join(outDir, "04-suggestion-confidence.png");
    fs.writeFileSync(out, canvas.toBuffer("image/png"));
    console.log("  ✓", out);
}

// ── Chart 5: Suggestion Outcome Ranges (re-run with full p10/p50/p90) ─────────

function chartSuggestionOutcomes(
    baseResult: { p10: number; p50: number; p90: number; probabilityOfSuccess: number },
    suggestions: { action: string; monthlySavingImpact: number; confidence: number; p50AfterAction: number }[],
    sugResults: { p10: number; p50: number; p90: number }[],
    target: number,
    outDir: string,
) {
    const ROW_H = 76;
    const W = 1200;
    const m: M = { top: 80, right: 100, bottom: 80, left: 400 };
    const H = m.top + m.bottom + (suggestions.length + 1) * ROW_H + 20;
    const IW = W - m.left - m.right;
    const { canvas, ctx } = newCanvas(W, H);

    drawTitle(ctx as any, "Outcome Range by Suggestion (p10 → p50 → p90 at deadline)", W, 18);

    // All values for x-scale
    const allVals = [
        baseResult.p10, baseResult.p50, baseResult.p90,
        ...sugResults.flatMap(r => [r.p10, r.p50, r.p90]),
        target,
    ];
    const xMin = Math.min(...allVals);
    const xMax = Math.max(...allVals);
    const xTicks = niceTicks(xMin, xMax, 7);
    const xMin2 = xTicks[0]!;
    const xMax2 = xTicks[xTicks.length - 1]!;
    const xScale = (v: number) => m.left + ((v - xMin2) / (xMax2 - xMin2)) * IW;

    // Gridlines
    for (const t of xTicks) {
        const px = xScale(t);
        ctx.strokeStyle = C.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, m.top);
        ctx.lineTo(px, H - m.bottom);
        ctx.stroke();
        ctx.fillStyle = C.textMuted;
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(fmtInr(t), px, H - m.bottom + 8);
    }

    // Target line
    const tpx = xScale(target);
    ctx.strokeStyle = C.target;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.moveTo(tpx, m.top);
    ctx.lineTo(tpx, H - m.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.target;
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`Target ${fmtInr(target)}`, tpx, m.top - 4);

    const drawRow = (label: string, r: { p10: number; p50: number; p90: number }, rowY: number, isBase: boolean) => {
        // Label
        ctx.fillStyle = isBase ? C.title : C.text;
        ctx.font = isBase ? "bold 13px sans-serif" : "13px sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        let lbl = label;
        const maxW = m.left - 16;
        while (ctx.measureText(lbl).width > maxW && lbl.length > 10) lbl = lbl.slice(0, -4) + "…";
        ctx.fillText(lbl, m.left - 8, rowY);

        const p10x = xScale(r.p10);
        const p50x = xScale(r.p50);
        const p90x = xScale(r.p90);

        // Range line (p10 → p90)
        ctx.strokeStyle = isBase ? C.p50 : "rgba(37,99,235,0.4)";
        ctx.lineWidth = isBase ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(p10x, rowY);
        ctx.lineTo(p90x, rowY);
        ctx.stroke();

        // p10 dot
        ctx.fillStyle = C.p10;
        ctx.beginPath();
        ctx.arc(p10x, rowY, 6, 0, 2 * Math.PI);
        ctx.fill();

        // p90 dot
        ctx.fillStyle = C.p90;
        ctx.beginPath();
        ctx.arc(p90x, rowY, 6, 0, 2 * Math.PI);
        ctx.fill();

        // p50 dot (larger)
        ctx.fillStyle = isBase ? C.p50 : "#1D4ED8";
        ctx.beginPath();
        ctx.arc(p50x, rowY, 9, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("50", p50x, rowY);
    };

    // Base row
    drawRow("Base (no action)", baseResult, m.top + ROW_H / 2, true);

    // Suggestion rows
    for (let i = 0; i < suggestions.length; i++) {
        const cy = m.top + (i + 1) * ROW_H + ROW_H / 2;
        const s = suggestions[i]!;
        drawRow(`${i + 1}. ${s.action}`, sugResults[i]!, cy, false);
    }

    // X-axis
    ctx.strokeStyle = C.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m.left, H - m.bottom);
    ctx.lineTo(W - m.right, H - m.bottom);
    ctx.stroke();
    ctx.fillStyle = C.textMuted;
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Accumulated Savings at Deadline", W / 2, H - 4);

    legend(ctx as any, [
        { color: C.p10, label: "p10 (pessimistic)" },
        { color: C.p50, label: "p50 (median)" },
        { color: C.p90, label: "p90 (optimistic)" },
        { color: C.target, label: "Target", dashed: true },
    ], m.left, m.top - 28);

    const out = path.join(outDir, "05-suggestion-outcomes.png");
    fs.writeFileSync(out, canvas.toBuffer("image/png"));
    console.log("  ✓", out);
}

// ── Chart 6: Sensitivity Curve ────────────────────────────────────────────────

function chartSensitivityCurve(
    curve: { monthlySurplus: number; probabilityOfSuccess: number }[],
    optimal: {
        currentMeanSurplus: number;
        forP50: number; forP70: number; forP90: number;
        increaseForP50: number; increaseForP70: number; increaseForP90: number;
    },
    baseProbability: number,
    outDir: string,
) {
    const W = 1200, H = 600;
    const m: M = { top: 70, right: 200, bottom: 80, left: 120 };
    const IW = W - m.left - m.right;
    const IH = H - m.top - m.bottom;
    const { canvas, ctx } = newCanvas(W, H);

    drawTitle(ctx as any, "Sensitivity: Monthly Surplus vs Probability of Success", W, 18);

    const surpluses = curve.map(p => p.monthlySurplus);
    const xMin = surpluses[0]!;
    const xMax = surpluses[surpluses.length - 1]!;
    const xTicks = niceTicks(xMin, xMax, 8);
    const xMin2 = xTicks[0]!;
    const xMax2 = xTicks[xTicks.length - 1]!;

    const yTicks = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const xScale = (v: number) => m.left + ((v - xMin2) / (xMax2 - xMin2)) * IW;
    const yScale = (p: number) => m.top + (1 - p) * IH;

    // Grid
    for (const t of yTicks) {
        const py = yScale(t);
        ctx.strokeStyle = C.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(m.left, py);
        ctx.lineTo(W - m.right, py);
        ctx.stroke();
        ctx.fillStyle = C.textMuted;
        ctx.font = "12px sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(`${(t * 100).toFixed(0)}%`, m.left - 8, py);
    }
    for (const t of xTicks) {
        const px = xScale(t);
        if (px < m.left || px > W - m.right) continue;
        ctx.strokeStyle = C.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, m.top);
        ctx.lineTo(px, H - m.bottom);
        ctx.stroke();
        ctx.fillStyle = C.textMuted;
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(fmtInr(t), px, H - m.bottom + 8);
    }

    // Axes
    ctx.strokeStyle = C.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m.left, m.top);
    ctx.lineTo(m.left, H - m.bottom);
    ctx.lineTo(W - m.right, H - m.bottom);
    ctx.stroke();

    // Shaded region: below base probability → red tint
    const basePx = xScale(optimal.currentMeanSurplus);
    ctx.fillStyle = "rgba(220,38,38,0.05)";
    ctx.fillRect(m.left, m.top, basePx - m.left, IH);
    ctx.fillStyle = "rgba(22,163,74,0.05)";
    ctx.fillRect(basePx, m.top, W - m.right - basePx, IH);

    // Target probability horizontal lines: 50%, 70%, 90%
    const milestones = [
        { p: 0.50, color: C.p10, label: "50%", surplus: optimal.forP50 },
        { p: 0.70, color: C.amber, label: "70%", surplus: optimal.forP70 },
        { p: 0.90, color: C.p90, label: "90%", surplus: optimal.forP90 },
    ];
    for (const ms of milestones) {
        const py = yScale(ms.p);
        const vpx = xScale(ms.surplus);

        // Horizontal dashed line
        (ctx as any).strokeStyle = ms.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(m.left, py);
        ctx.lineTo(vpx, py);
        ctx.stroke();

        // Vertical dashed line
        ctx.beginPath();
        ctx.moveTo(vpx, py);
        ctx.lineTo(vpx, H - m.bottom);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label on right
        ctx.fillStyle = ms.color;
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`${ms.label} → ${fmtInr(ms.surplus)}/mo`, W - m.right + 8, py);
    }

    // The sensitivity curve itself
    ctx.strokeStyle = C.blue;
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (let i = 0; i < curve.length; i++) {
        const px = xScale(curve[i]!.monthlySurplus);
        const py = yScale(curve[i]!.probabilityOfSuccess);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Current position dot + annotation
    const curPx = xScale(optimal.currentMeanSurplus);
    const curPy = yScale(baseProbability);
    ctx.fillStyle = C.red;
    ctx.beginPath();
    ctx.arc(curPx, curPy, 8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = C.title;
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = curPx > W / 2 ? "right" : "left";
    ctx.textBaseline = "bottom";
    const curLabel = `Current ${fmtInr(optimal.currentMeanSurplus)}/mo → ${(baseProbability * 100).toFixed(1)}%`;
    ctx.fillText(curLabel, curPx + (curPx > W / 2 ? -14 : 14), curPy - 10);

    // Optimal dots
    for (const ms of milestones) {
        const px = xScale(ms.surplus);
        const py = yScale(ms.p);
        ctx.fillStyle = ms.color;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, 2 * Math.PI);
        ctx.fill();
    }

    // Summary table on right side
    const tableX = W - m.right + 8;
    const tableY = H - m.bottom - 110;
    ctx.fillStyle = C.surface;
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect?.(tableX - 4, tableY - 8, m.right - 4, 120, 6);
    ctx.fill();
    ctx.stroke();

    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = C.title;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Required increase:", tableX, tableY);
    const rows = [
        { label: "→ 50%", delta: optimal.increaseForP50, color: C.p10 },
        { label: "→ 70%", delta: optimal.increaseForP70, color: C.amber },
        { label: "→ 90%", delta: optimal.increaseForP90, color: C.p90 },
    ];
    rows.forEach((r, i) => {
        ctx.fillStyle = r.color;
        ctx.font = "bold 12px sans-serif";
        ctx.fillText(`${r.label}  +${fmtInr(r.delta)}/mo`, tableX, tableY + 20 + i * 28);
    });

    // Axis labels
    ctx.fillStyle = C.textMuted;
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Monthly Surplus", W / 2 - m.right / 2, H - 4);
    ctx.save();
    ctx.translate(18, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("P(success)", 0, 0);
    ctx.restore();

    const out = path.join(outDir, "06-sensitivity-curve.png");
    fs.writeFileSync(out, canvas.toBuffer("image/png"));
    console.log("  ✓", out);
}

// ── Chart 7: Distribution Fit ─────────────────────────────────────────────────

function chartDistributionFit(
    surpluses: number[],
    shock: ReturnType<typeof detectTrendShock>,
    outDir: string,
) {
    const W = 1200, H = 580;
    const m: M = { top: 60, right: 80, bottom: 100, left: 100 };
    const IW = W - m.left - m.right;
    const IH = H - m.top - m.bottom;
    const { canvas, ctx } = newCanvas(W, H);

    const { skewness } = computeStats(surpluses);
    const robustMean = shock.robustMean;
    const robustStd = shock.robustStd;
    const n = surpluses.length;
    const useNormal = n >= 6 && Math.abs(skewness) < 1.0 && robustStd > 0;

    // X range — data ± 1.5σ (use robustStd for padding)
    const stdPad = robustStd > 0 ? robustStd * 1.5 : Math.abs(robustMean) * 0.3 + 10_000;
    const xTicks = niceTicks(Math.min(...surpluses) - stdPad, Math.max(...surpluses) + stdPad, 7);
    const xMin = xTicks[0]!;
    const xMax = xTicks[xTicks.length - 1]!;
    const xScale = (v: number) => m.left + ((v - xMin) / (xMax - xMin)) * IW;

    // Histogram in frequency %
    const BINS = Math.max(8, Math.min(18, Math.ceil(Math.sqrt(n) + 3)));
    const dataMin = Math.min(...surpluses);
    const dataMax = Math.max(...surpluses);
    const histBinW = (dataMax - dataMin + 1) / BINS;
    const counts = new Array(BINS).fill(0);
    for (const v of surpluses) {
        const bi = Math.min(Math.floor((v - dataMin) / histBinW), BINS - 1);
        counts[bi]++;
    }
    const freqs = counts.map(c => (c / n) * 100);

    // PDF helpers scaled to % units (so they overlay the frequency histogram)
    const normalPdfPct = (x: number, mu: number, sigma: number) => {
        if (sigma <= 0) return 0;
        return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mu) / sigma) ** 2) * histBinW * 100;
    };

    // Dense x-values for smooth curves
    const PDF_PTS = 300;
    const pdfXs = Array.from({ length: PDF_PTS }, (_, i) => xMin + (i / (PDF_PTS - 1)) * (xMax - xMin));

    // Y range
    let yMax = Math.max(...freqs, 0.1);
    if (useNormal) {
        yMax = Math.max(yMax, normalPdfPct(robustMean, robustMean, robustStd));
        if (shock.isEndShocked) {
            yMax = Math.max(yMax, normalPdfPct(shock.robustMean, shock.robustMean, robustStd));
            yMax = Math.max(yMax, normalPdfPct(shock.recentAvg, shock.recentAvg, robustStd));
        }
    }
    yMax *= 1.25;
    const yTicks = niceTicks(0, yMax, 6);
    const yMax2 = yTicks[yTicks.length - 1]!;
    const yScale = (v: number) => m.top + (1 - v / yMax2) * IH;

    // Title
    const distLabel = useNormal
        ? (shock.isEndShocked ? "Normal Fit — End Shock (Blended)" : shock.hasMidDip ? "Normal Fit — Mid-Period Dip Corrected" : "Normal Distribution Fit")
        : "Empirical Bootstrap (KDE shown)";
    drawTitle(ctx as any, `Surplus Distribution Fit — ${distLabel}`, W, 16);

    // Grid + axes
    drawGridlines(ctx as any, m, W, H, yTicks, yScale);
    drawYAxis(ctx as any, m, H, yTicks, yScale, v => `${v.toFixed(1)}%`);
    ctx.strokeStyle = C.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m.left, H - m.bottom);
    ctx.lineTo(W - m.right, H - m.bottom);
    ctx.stroke();
    ctx.fillStyle = C.textMuted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const t of xTicks) {
        const px = xScale(t);
        if (px < m.left - 1 || px > W - m.right + 1) continue;
        ctx.fillText(fmtInr(t), px, H - m.bottom + 8);
    }

    // Histogram bars
    for (let bi = 0; bi < BINS; bi++) {
        const bxMin = dataMin + bi * histBinW;
        const px1 = xScale(bxMin);
        const px2 = xScale(bxMin + histBinW);
        const d = freqs[bi]!;
        if (d === 0) continue;
        const py = yScale(d);
        ctx.fillStyle = "rgba(37,99,235,0.2)";
        ctx.strokeStyle = "rgba(37,99,235,0.55)";
        ctx.lineWidth = 1;
        ctx.fillRect(px1, py, px2 - px1 - 1, H - m.bottom - py);
        ctx.strokeRect(px1, py, px2 - px1 - 1, H - m.bottom - py);
    }

    // Rug plot — actual data points; dip months in red
    ctx.lineWidth = 2;
    for (let i = 0; i < surpluses.length; i++) {
        const px = xScale(surpluses[i]!);
        if (px < m.left || px > W - m.right) continue;
        const isDip = shock.dipIndices.includes(i);
        ctx.strokeStyle = isDip ? "rgba(220,38,38,0.8)" : "rgba(37,99,235,0.65)";
        ctx.beginPath();
        ctx.moveTo(px, H - m.bottom);
        ctx.lineTo(px, H - m.bottom - (isDip ? 16 : 12));
        ctx.stroke();
    }

    // Zero line
    const zeroPx = xScale(0);
    if (zeroPx >= m.left && zeroPx <= W - m.right) {
        ctx.strokeStyle = "rgba(55,65,81,0.35)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(zeroPx, m.top);
        ctx.lineTo(zeroPx, H - m.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C.textMuted;
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText("₹0", zeroPx, m.top + 16);
    }

    // Curve drawing helper
    const drawCurve = (fn: (x: number) => number, color: string, lineW: number, dash: number[]) => {
        (ctx as any).strokeStyle = color;
        ctx.lineWidth = lineW;
        ctx.setLineDash(dash);
        ctx.beginPath();
        let first = true;
        for (const x of pdfXs) {
            const px = xScale(x);
            if (px < m.left || px > W - m.right) { first = true; continue; }
            const py = yScale(fn(x));
            if (py < m.top) { first = true; continue; }
            first ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            first = false;
        }
        ctx.stroke();
        ctx.setLineDash([]);
    };

    if (useNormal) {
        if (shock.isEndShocked) {
            // End-shock: show historical, recent, and blended distributions
            const shadeL = xScale(shock.trendAdjustedMean - robustStd);
            const shadeR = xScale(shock.trendAdjustedMean + robustStd);
            ctx.fillStyle = "rgba(5,150,105,0.06)";
            ctx.fillRect(shadeL, m.top, shadeR - shadeL, IH);

            drawCurve(x => normalPdfPct(x, shock.robustMean, robustStd), C.amber, 2, [8, 4]);
            drawCurve(x => normalPdfPct(x, shock.recentAvg, robustStd), C.red, 2, [4, 4]);
            drawCurve(
                x => 0.5 * normalPdfPct(x, shock.robustMean, robustStd) + 0.5 * normalPdfPct(x, shock.recentAvg, robustStd),
                C.emerald, 3, [],
            );
        } else {
            // ±1σ shading around robust mean
            const shadeL = xScale(robustMean - robustStd);
            const shadeR = xScale(robustMean + robustStd);
            ctx.fillStyle = "rgba(37,99,235,0.06)";
            ctx.fillRect(shadeL, m.top, shadeR - shadeL, IH);
            drawCurve(x => normalPdfPct(x, robustMean, robustStd), C.blue, 3, []);
        }
    } else {
        // KDE with Silverman's bandwidth (from clean non-dip data)
        const cleanSurpluses = surpluses.filter((_, i) => !shock.dipIndices.includes(i));
        const kdeData = cleanSurpluses.length >= 3 ? cleanSurpluses : surpluses;
        const bw = robustStd > 0 ? 1.06 * robustStd * Math.pow(kdeData.length, -0.2) : (dataMax - dataMin) / 5;
        drawCurve(x => {
            const kde = kdeData.reduce((s, xi) =>
                s + (1 / (bw * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - xi) / bw) ** 2), 0) / kdeData.length;
            return kde * histBinW * 100;
        }, C.blue, 2.5, [6, 3]);
    }

    // ±1σ dashed lines (from robust mean)
    for (const { v, label } of [{ v: robustMean - robustStd, label: "−1σ" }, { v: robustMean + robustStd, label: "+1σ" }]) {
        const px = xScale(v);
        if (px < m.left || px > W - m.right) continue;
        ctx.strokeStyle = "rgba(107,114,128,0.4)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(px, m.top + 24);
        ctx.lineTo(px, H - m.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C.textMuted;
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(label, px, m.top + 22);
    }

    // Mean + shock vertical lines
    const vAnnotations = shock.isEndShocked
        ? [
            { v: shock.robustMean, color: C.amber, label: `stable μ ${fmtInr(shock.robustMean)}` },
            { v: shock.recentAvg, color: C.red, label: `recent μ ${fmtInr(shock.recentAvg)}` },
            { v: shock.trendAdjustedMean, color: C.emerald, label: `blended ${fmtInr(shock.trendAdjustedMean)}` },
          ]
        : [{ v: robustMean, color: C.blue, label: `μ ${fmtInr(robustMean)}${shock.hasMidDip ? " (robust)" : ""}` }];

    for (const { v, color, label } of vAnnotations) {
        const px = xScale(v);
        if (px < m.left || px > W - m.right) continue;
        (ctx as any).strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(px, m.top);
        ctx.lineTo(px, H - m.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(label, px, m.top + 2);
    }

    // Stats callout box (top-right)
    const boxX = W - m.right - 310;
    const boxY = m.top + 12;
    const boxLines = [
        `n = ${n} months   robust μ = ${fmtInr(robustMean)}   σ = ${fmtInr(robustStd)}`,
        `Fit: ${useNormal ? "normal distribution" : "empirical bootstrap"}   skewness = ${skewness.toFixed(2)}`,
        ...(shock.hasMidDip ? [`⚠ ${shock.dipIndices.length} dip month(s) excluded (IQR outlier) — robust fit`] : []),
        ...(shock.isEndShocked ? [`⚠ ${(shock.reductionPct * 100).toFixed(0)}% drop in last 3 mo — blended sampler`] : []),
    ];
    const boxH = 14 + boxLines.length * 18;
    ctx.fillStyle = "rgba(249,250,251,0.9)";
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    (ctx as any).roundRect?.(boxX - 8, boxY - 6, 320, boxH, 6);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < boxLines.length; i++) {
        const isWarning = i >= (shock.hasMidDip || shock.isEndShocked ? boxLines.length - (shock.hasMidDip && shock.isEndShocked ? 2 : 1) : Infinity);
        ctx.fillStyle = isWarning ? "#92400E" : C.textMuted;
        ctx.font = "11px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(boxLines[i]!, boxX, boxY + i * 18);
    }

    // Axis labels
    ctx.fillStyle = C.textMuted;
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Monthly Net Savings (₹)", W / 2, H - 2);
    ctx.save();
    ctx.translate(16, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Frequency (% of months)", 0, 0);
    ctx.restore();

    // Legend
    const legendItems: { color: string; label: string; dashed?: boolean }[] = [
        { color: C.blue, label: "Historical data" },
    ];
    if (shock.hasMidDip) legendItems.push({ color: C.red, label: "Dip month (excluded)" });
    if (useNormal) {
        if (shock.isEndShocked) {
            legendItems.push({ color: C.amber, label: "Stable dist.", dashed: true });
            legendItems.push({ color: C.red, label: "Recent dist.", dashed: true });
            legendItems.push({ color: C.emerald, label: "Blended (effective)" });
        } else {
            legendItems.push({ color: C.blue, label: "Normal fit (robust)" });
        }
    } else {
        legendItems.push({ color: C.blue, label: "KDE (bootstrap)", dashed: true });
    }
    legend(ctx as any, legendItems, m.left, H - 22);

    const out = path.join(outDir, "07-distribution-fit.png");
    fs.writeFileSync(out, canvas.toBuffer("image/png"));
    console.log("  ✓", out);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const goalId = process.argv[2];
if (!goalId) {
    console.error("Usage: npx tsx src/scripts/visualize-goal.ts <goalId>");
    process.exit(1);
}

const goal = await prisma.goal.findUniqueOrThrow({ where: { id: goalId } });
const sim = goal.simulationResult as Record<string, any>;
if (!sim) {
    console.error("No simulationResult found. Run the goal advisor first:\n  npm run dev:checkpoint -- --graph=goal --goalId=<id>");
    process.exit(1);
}

const allStats = await prisma.monthlyStats.findMany({ orderBy: { month: "asc" } });
await prisma.$disconnect();

const surpluses = allStats.map(s => s.netSavings);
const shock = detectTrendShock(surpluses);
const dist = fitDistribution(surpluses, shock);
const months = sim.monthsRemaining as number;
const target = goal.targetAmount;
const trendWarning = sim.trendWarning as boolean;
const isEndShocked = (sim.isEndShocked ?? sim.trendWarning) as boolean;

const suggestions = (sim.llmOutput?.suggestions ?? []) as {
    action: string;
    monthlySavingImpact: number;
    confidence: number;
    p50AfterAction: number;
}[];

const outDir = path.join("charts", `goal-${goalId}`);
fs.mkdirSync(outDir, { recursive: true });
console.log(`\nGenerating charts for goal ${goalId} → ${outDir}/\n`);

// Chart 1: paths
console.log("1/7 Monte Carlo paths...");
chartPaths(surpluses, dist, months, target, isEndShocked, outDir);

// Chart 2: histogram
console.log("2/7 Outcome distribution...");
chartHistogram(dist, months, target, outDir);

// Chart 3: surplus history
console.log("3/7 Surplus history...");
chartSurplusHistory(allStats.map(s => ({ month: s.month, netSavings: s.netSavings })), isEndShocked, outDir);

// Chart 4: suggestion confidence
console.log("4/7 Suggestion confidence...");
chartSuggestionConfidence(
    (sim.monteCarlo as any).probabilityOfSuccess,
    suggestions,
    outDir,
);

// Chart 5: suggestion outcome ranges (re-run each to get p10/p50/p90)
console.log("5/7 Suggestion outcome ranges (re-running simulations)...");
const baseResult = {
    p10: (sim.monteCarlo as any).p10,
    p50: (sim.monteCarlo as any).p50,
    p90: (sim.monteCarlo as any).p90,
    probabilityOfSuccess: (sim.monteCarlo as any).probabilityOfSuccess,
};
const sugResults = suggestions.map(s => {
    const adj = buildAdjusted(dist, s.monthlySavingImpact);
    return runSimFinals(adj, months, 5_000, target);
});
chartSuggestionOutcomes(baseResult, suggestions, sugResults, target, outDir);

// Chart 6: sensitivity curve
console.log("6/7 Sensitivity curve...");
const optimalSavings = sim.optimalSavings as {
    currentMeanSurplus: number;
    forP50: number; forP70: number; forP90: number;
    increaseForP50: number; increaseForP70: number; increaseForP90: number;
} | undefined;
const sensitivityCurve = sim.sensitivityCurve as { monthlySurplus: number; probabilityOfSuccess: number }[] | undefined;

if (optimalSavings && sensitivityCurve && sensitivityCurve.length > 0) {
    chartSensitivityCurve(
        sensitivityCurve,
        optimalSavings,
        (sim.monteCarlo as any).probabilityOfSuccess,
        outDir,
    );
} else {
    console.log("  ⚠ No optimalSavings/sensitivityCurve in simulationResult — re-run the goal advisor pipeline first.");
}

// Chart 7: distribution fit
console.log("7/7 Distribution fit...");
chartDistributionFit(surpluses, shock, outDir);

console.log("\nDone. Open the charts folder:", outDir);
