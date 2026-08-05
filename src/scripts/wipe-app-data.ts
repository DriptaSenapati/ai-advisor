/**
 * Empty every application collection, keeping the signed-in user intact.
 *
 *   npm run wipe:app-data -- --yes
 *
 * Distinct from `reset:db`, which only covers the advisor/insights graphs and
 * leaves `Goal`, `MonthlyStats`, `InsightReport` and `StatementGateDecision`
 * behind, so "clear everything" did not actually clear everything.
 *
 * **`User`, `Account` and `Session` are preserved.** The first two by request;
 * `Session` because dropping it signs the user out for no benefit — the point of
 * this script is to clear *data*, and forcing a fresh OAuth round trip is a chore,
 * not a safeguard. `Verification` is better-auth's machinery and is left alone for
 * the same reason.
 *
 * Requires `--yes`. Everything here is irreversible and there is no dry run worth
 * having: the counts it prints before deleting are the dry run.
 */
import "../envConfig.js";
import prisma from "../prismaClient.js";
import fs from "fs";
import path from "path";
import { extractQueue, pdfQueue, insightsQueue, goalQueue } from "../queue/index.js";

/** Order matters only for readability — MongoDB has no FK constraints to satisfy. */
const collections = [
    ["FinalTransactionData", () => prisma.finalTransactionData],
    ["Cluster", () => prisma.cluster],
    ["NormalizedTransactions", () => prisma.normalizedTransactions],
    ["ExceptionTransactions", () => prisma.exceptionTransactions],
    ["ErrorPdfExtract", () => prisma.errorPdfExtract],
    ["StatementExtractedData", () => prisma.statementExtractedData],
    ["StatementGateDecision", () => prisma.statementGateDecision],
    ["StatementMetadata", () => prisma.statementMetadata],
    ["MonthlyStats", () => prisma.monthlyStats],
    ["RecurringPattern", () => prisma.recurringPattern],
    ["TransactionFlag", () => prisma.transactionFlag],
    /**
     * Must be wiped with the clusters it describes, and is easy to forget precisely because
     * nothing references it: `PayeeAlias` rows survive a wipe harmlessly right up until the
     * moment new data arrives, at which point the merge chips name payees that no longer
     * exist — and claim transaction counts belonging to a deleted account's history.
     */
    ["PayeeAlias", () => prisma.payeeAlias],
    ["InsightReport", () => prisma.insightReport],
    ["Goal", () => prisma.goal],
] as const;

if (!process.argv.includes("--yes")) {
    console.log("Refusing to run without --yes. Current contents:\n");
    for (const [name, model] of collections) {
        console.log(`  ${name.padEnd(24)} ${await (model() as any).count()}`);
    }
    process.exit(1);
}

console.log("Deleting:\n");
for (const [name, model] of collections) {
    const { count } = await (model() as any).deleteMany();
    console.log(`  ${name.padEnd(24)} -${count}`);
}

// In-flight jobs reference statements that no longer exist; leaving them queued
// means a worker wakes up and fails on a record it cannot find.
await Promise.all([
    extractQueue.obliterate({ force: true }),
    pdfQueue.obliterate({ force: true }),
    insightsQueue.obliterate({ force: true }),
    goalQueue.obliterate({ force: true }),
]);
console.log("\n  queues                   drained");

// Any PDF still on disk belongs to a statement that is now gone. `.gitkeep` stays.
// Only meaningful under the local storage driver (STORAGE_DRIVER=s3 keeps
// nothing here) — dev-only script, so that is always what is running.
const statementUploads = path.join(process.cwd(), "uploads", "statements");
let files = 0;
if (fs.existsSync(statementUploads)) {
    for (const f of fs.readdirSync(statementUploads).filter((f) => f.toLowerCase().endsWith(".pdf"))) {
        fs.rmSync(path.join(statementUploads, f), { force: true });
        files++;
    }
}
console.log(`  uploads/statements/*.pdf -${files}`);

console.log("\nKept:");
console.log(`  User                     ${await prisma.user.count()}`);
console.log(`  Account                  ${await prisma.account.count()}`);
console.log(`  Session                  ${await prisma.session.count()}   (so you stay signed in)`);

await Promise.all([extractQueue.close(), pdfQueue.close(), insightsQueue.close(), goalQueue.close()]);
process.exit(0);
