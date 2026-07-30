import "../envConfig.js";
import prisma from "../prismaClient.js";

/**
 * Dump the red flags the detectors wrote, grouped by kind and severity.
 *
 * The property worth checking with this script is **idempotence**: run the insights
 * pipeline twice over the same data and the counts here must not move. `dedupeKey` plus the
 * scoped `deleteMany` in `red_flag_detector_tool.ts` is what guarantees that, and a
 * create-only detector would silently double every number on the second pass.
 */

const flags = await prisma.transactionFlag.findMany({
    orderBy: [{ severity: "asc" }, { amount: "desc" }],
});

console.log(`\nTransaction flags: ${flags.length}\n`);
console.log("─".repeat(110));

const byKind = new Map<string, typeof flags>();
for (const f of flags) {
    const list = byKind.get(f.kind) ?? [];
    list.push(f);
    byKind.set(f.kind, list);
}

for (const [kind, list] of [...byKind.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const total = list.reduce((s, f) => s + f.amount, 0);
    const high = list.filter(f => f.severity === "high").length;
    console.log(`\n${kind}  —  ${list.length} flag(s), ${high} high, ₹${Math.round(total).toLocaleString("en-IN")} at stake`);
    for (const f of list.slice(0, 8)) {
        const when = f.occurredAt ? f.occurredAt.toISOString().slice(0, 10) : f.month;
        console.log(`   [${f.severity.padEnd(6)}] ${when}  ₹${Math.round(f.amount).toLocaleString("en-IN").padStart(10)}  ${f.title}`);
    }
    if (list.length > 8) console.log(`   … and ${list.length - 8} more`);
}

console.log("\n" + "─".repeat(110));

const dupes = new Map<string, number>();
for (const f of flags) dupes.set(f.dedupeKey, (dupes.get(f.dedupeKey) ?? 0) + 1);
const collisions = [...dupes.entries()].filter(([, n]) => n > 1);

console.log(
    collisions.length === 0
        ? `\n✔ every dedupeKey is unique across ${flags.length} row(s) — re-running the pipeline will replace, not accumulate\n`
        : `\n✘ ${collisions.length} duplicated dedupeKey(s) — the scoped deleteMany is not covering these:\n${collisions.map(([k, n]) => `   ${k} ×${n}`).join("\n")}\n`
);
