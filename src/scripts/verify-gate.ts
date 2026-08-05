/**
 * End-to-end check of the two-phase Illuminate gate.
 *
 * Drives the real service layer rather than HTTP, so it needs no session — but
 * every path it exercises is the one the controllers call. The worker must be
 * running (`npm run dev:all`); this script only enqueues.
 *
 *   npm run verify:gate -- assets/hsbc_Statement_1.pdf
 *
 * It costs one real extraction (a vision call on page 1, more if the PDF is
 * scanned) and, at the end, a full categorisation + insights run. Pass
 * `--no-process` to stop before approving.
 */
import "../envConfig.js";
import fs from "fs";
import path from "path";
import prisma from "../prismaClient.js";
import { extractQueue, pdfQueue } from "../queue/index.js";
import {
    uploadStatement,
    startProcessing,
    declineProcessing,
} from "../api/services/statements.service.js";

const source = process.argv[2] ?? "assets/hsbc_Statement_1.pdf";
const skipProcess = process.argv.includes("--no-process");
/**
 * Approve a statement parked by an earlier `--no-process` run, uploading nothing.
 *
 * This is the "closed the tab, came back tomorrow" case, and running it as a
 * separate invocation is the point: no in-memory state from phase 1 survives, the
 * uploaded PDF was deleted when extraction finished, and phase 2 still has to work.
 */
const resume = process.argv.includes("--resume");
const USER = "verify-gate-user";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
    console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail === undefined ? "" : `  → ${JSON.stringify(detail)}`}`);
    if (!ok) failures++;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function poll(id: string, until: (s: any) => boolean, timeoutMs = 240_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const s = await prisma.statementMetadata.findUnique({ where: { id } });
        if (s && until(s)) return s;
        await wait(3000);
    }
    throw new Error(`Timed out waiting on statement ${id}`);
}

if (resume) {
    const parked = await prisma.statementMetadata.findFirst({
        where: { userId: USER, extractionStatus: "Completed", normalizerStatus: "Not Started" },
    });
    if (!parked) throw new Error("Nothing parked at the gate — run with --no-process first.");

    console.log(`\n── resuming ${parked.id} in a fresh process ──`);
    console.log(`  bank=${parked.bankName} rawRows=${parked.rawRowCount} image=${parked.isImageBased} gate=${parked.gateDecision}`);
    // `.gitkeep` lives here permanently — count PDFs, not entries.
    const leftovers = fs
        .readdirSync(path.join(process.cwd(), "uploads"))
        .filter((f) => f.toLowerCase().endsWith(".pdf"));
    check("uploaded PDF is already gone", leftovers.length === 0, leftovers);

    await startProcessing(parked.id, USER);
    const finished = await poll(
        parked.id,
        (s) => s.insightsStatus === "Completed" || s.normalizerStatus === "Error" || s.insightsStatus === "Error",
        900_000
    );
    check("normalisation completed without the original file", finished.normalizerStatus === "Completed", finished.normalizerError);
    check("insights completed", finished.insightsStatus === "Completed", finished.insightsError);
    check("every extracted row survived the gap", finished.totalTransactions === parked.rawRowCount, {
        rawAtGate: parked.rawRowCount,
        normalisedAfter: finished.totalTransactions,
    });
    const n = await prisma.finalTransactionData.count({ where: { statementMetadataId: parked.id } });
    check("transactions categorised", n > 0, n);

    console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILURES`}`);
    process.exit(failures === 0 ? 0 : 1);
}

/**
 * Clear anything this script left behind previously, so a re-run starts from the
 * same state as the first one. Scoped to the synthetic user, so real data is
 * untouched — and the queues are drained because two of the assertions below are
 * about jobs *not* existing.
 */
const previous = await prisma.statementMetadata.findMany({ where: { userId: USER }, select: { id: true } });
if (previous.length > 0) {
    const ids = previous.map((s) => s.id);
    await Promise.all([
        prisma.statementExtractedData.deleteMany({ where: { statementMetadataId: { in: ids } } }),
        prisma.finalTransactionData.deleteMany({ where: { statementMetadataId: { in: ids } } }),
        prisma.normalizedTransactions.deleteMany({ where: { statementMetadataId: { in: ids } } }),
        prisma.exceptionTransactions.deleteMany({ where: { statementMetadataId: { in: ids } } }),
        prisma.errorPdfExtract.deleteMany({ where: { statementMetadataId: { in: ids } } }),
        prisma.statementGateDecision.deleteMany({ where: { userId: USER } }),
    ]);
    await prisma.statementMetadata.deleteMany({ where: { userId: USER } });
    // Scoped now that `Cluster` carries a `userId` — this used to empty the
    // collection for every user in the database.
    await prisma.cluster.deleteMany({ where: { userId: USER } });
    console.log(`  (cleared ${ids.length} statement(s) from a previous run)`);
}
await extractQueue.obliterate({ force: true });
await pdfQueue.obliterate({ force: true });

console.log(`\n── phase 1: upload should extract and stop ──`);
const { statementId } = await uploadStatement(fs.readFileSync(source), "VerifyBank", USER);
console.log(`  statement ${statementId}`);

const extracted = await poll(statementId, (s) => s.extractionStatus !== "Processing");
check("extractionStatus is Completed", extracted.extractionStatus === "Completed", extracted.extractionError);
if (extracted.extractionStatus !== "Completed") {
    console.log(`\n${failures} FAILURES`);
    process.exit(1);
}

check("normalizerStatus still Not Started", extracted.normalizerStatus === "Not Started", extracted.normalizerStatus);
check("gateDecision is pending", extracted.gateDecision === "pending", extracted.gateDecision);
check("rawRowCount populated", extracted.rawRowCount !== null, extracted.rawRowCount);
check("totalTransactions still null (normalisation has not run)", extracted.totalTransactions === null);
check("isImageBased persisted", typeof extracted.isImageBased === "boolean", extracted.isImageBased);
check("bank name read", !!extracted.bankName && extracted.bankName !== "Unknown Bank", extracted.bankName);
// Not an assertion: `extractBasicDetails` asks a vision model for the period and
// sometimes gets nothing. Before the split, normalisation back-filled it from the
// transaction dates; that now runs after the gate, so the receipt has to render a
// null period as "couldn't read the dates" rather than waiting on it.
console.log(
    `  info  statement period → ${extracted.statementPeriodStart?.toISOString().slice(0, 10) ?? "null"} … ${extracted.statementPeriodEnd?.toISOString().slice(0, 10) ?? "null"}`
);

const [finals, clusters, norms] = await Promise.all([
    prisma.finalTransactionData.count({ where: { statementMetadataId: statementId } }),
    // Scoped, so this asserts "the gate created no clusters" rather than "the
    // database contains no clusters". Counted globally it reported a failure
    // whenever any real user had data — which is exactly what it did.
    prisma.cluster.count({ where: { userId: USER } }),
    prisma.normalizedTransactions.count({ where: { statementMetadataId: statementId } }),
]);
check("no transactions normalised yet", norms === 0, norms);
check("no transactions categorised yet", finals === 0, finals);
check("no clusters created yet", clusters === 0, clusters);

const processCounts = await pdfQueue.getJobCounts();
check(
    "pdf.process queue is empty",
    (processCounts["waiting"] ?? 0) + (processCounts["active"] ?? 0) + (processCounts["completed"] ?? 0) === 0,
    processCounts
);
// This script always runs against the local storage driver (dev-only), which
// writes statement uploads under uploads/statements/.
const leftoverStatements = fs.existsSync(path.join(process.cwd(), "uploads", "statements"))
    ? fs.readdirSync(path.join(process.cwd(), "uploads", "statements")).filter((f) => f.toLowerCase().endsWith(".pdf"))
    : [];
check("uploaded file cleaned up", leftoverStatements.length === 0, leftoverStatements);

console.log(`\n── decline is recorded, reversible, and starts nothing ──`);
await declineProcessing(statementId, USER, "verify script");
const declined = await prisma.statementMetadata.findUnique({ where: { id: statementId } });
check("gateDecision is declined", declined?.gateDecision === "declined", declined?.gateDecision);
check("normalizerStatus untouched by decline", declined?.normalizerStatus === "Not Started");
const afterDecline = await pdfQueue.getJobCounts();
check("still nothing enqueued", (afterDecline["waiting"] ?? 0) + (afterDecline["active"] ?? 0) === 0, afterDecline);

if (skipProcess) {
    const rows = await prisma.statementGateDecision.findMany({ where: { statementMetadataId: statementId } });
    check("one decision row logged", rows.length === 1, rows.map((r) => r.decision));
    console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILURES`} (stopped before processing)`);
    process.exit(failures === 0 ? 0 : 1);
}

console.log(`\n── approving a declined statement works ──`);
const accepted = await startProcessing(statementId, USER);
check("202 shape", accepted.jobStarted === true && accepted.statementId === statementId, accepted);

let idempotent = "no error";
try {
    await startProcessing(statementId, USER);
} catch (err: any) {
    idempotent = err?.code ?? err?.message;
}
check("second approval is ALREADY_STARTED", idempotent === "ALREADY_STARTED", idempotent);

const decisions = await prisma.statementGateDecision.findMany({
    where: { statementMetadataId: statementId },
    orderBy: { decidedAt: "asc" },
});
check(
    "both answers logged in order",
    decisions.map((d) => d.decision).join(",") === "declined,approved",
    decisions.map((d) => d.decision)
);
check("snapshot captured on the audit rows", decisions.every((d) => d.bankName !== null), {
    bankName: decisions[0]?.bankName,
    rawRowCount: decisions[0]?.rawRowCount,
});

console.log(`\n── phase 2 runs to completion ──`);
const done = await poll(
    statementId,
    (s) => s.insightsStatus === "Completed" || s.normalizerStatus === "Error" || s.insightsStatus === "Error",
    900_000
);
check("normalisation completed", done.normalizerStatus === "Completed", done.normalizerError);
check("categorisation completed", done.categorizationStatus === "Completed");
check("insights completed", done.insightsStatus === "Completed", done.insightsError);
check("totalTransactions now set", done.totalTransactions !== null, {
    raw: done.rawRowCount,
    normalised: done.totalTransactions,
});
const finalCount = await prisma.finalTransactionData.count({ where: { statementMetadataId: statementId } });
check("transactions categorised", finalCount > 0, finalCount);

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILURES`}`);
await extractQueue.close();
await pdfQueue.close();
process.exit(failures === 0 ? 0 : 1);
