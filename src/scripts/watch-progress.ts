/**
 * Tail the progress pub/sub channel — what the SSE stream relays, verbatim.
 *
 *   npm run watch:progress
 *
 * Every frame the workers publish shows up here with its attached status
 * snapshot, so this answers "did an event actually fire at that boundary, and did
 * it carry the record?" without needing a browser session or a logged-in
 * `EventSource`. Run it in a second terminal alongside `npm run verify:gate`.
 */
import "../envConfig.js";
import { Redis } from "ioredis";

const sub = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

const t0 = Date.now();
const since = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`.padStart(7);

await sub.subscribe("sse:progress");
console.log("watching sse:progress — Ctrl+C to stop\n");

sub.on("message", (_channel, message) => {
    const e = JSON.parse(message) as Record<string, any>;
    const head = `${since()}  ${String(e["stage"]).padEnd(17)}${e["pct"] === undefined ? "    " : `${String(e["pct"]).padStart(3)}%`}`;

    const s = e["statement"];
    if (s === undefined) {
        console.log(`${head}  (no statement attached)${e["goalId"] ? ` goal=${e["goalId"]}` : ""}`);
        return;
    }
    if (s === null) {
        console.log(`${head}  statement is gone (deleted)`);
        return;
    }
    // The four fields the frontend actually derives its stage from.
    console.log(
        `${head}  ex=${s.extractionStatus} nz=${s.normalizerStatus} cat=${s.categorizationStatus} ins=${s.insightsStatus}` +
            `  gate=${s.gateDecision} raw=${s.rawRowCount} total=${s.totalTransactions}`
    );
});
