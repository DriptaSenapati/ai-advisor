/**
 * Manual trigger for the same 3-day retention sweep the `statements.cleanup`
 * BullMQ job runs daily (see `worker.ts` / `sweepExpiredRetainedFiles` in
 * `statements.service.ts`). Exists for ops (force a sweep without waiting for
 * the daily schedule) and for verifying the sweep end-to-end without standing
 * up a full worker process.
 *
 * Dry run by default, following `grandfather-verified-users.ts` — this
 * permanently deletes statement rows and their storage objects, so seeing
 * what would go before it goes matters here too.
 *
 *   npm run sweep:retained-files            # report only
 *   npm run sweep:retained-files -- --yes   # actually delete
 */
import "../envConfig.js";
import prisma from "../prismaClient.js";
import { sweepExpiredRetainedFiles } from "../api/services/statements.service.js";

const APPLY = process.argv.includes("--yes");
const RETAINED_FILE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
    const cutoff = new Date(Date.now() - RETAINED_FILE_TTL_MS);
    const candidates = await prisma.statementMetadata.findMany({
        where: { retainedFile: { not: null }, retainedFileSince: { lte: cutoff } },
        select: { id: true, userId: true, bankName: true, retainedFileSince: true },
        orderBy: { retainedFileSince: "asc" },
    });

    if (candidates.length === 0) {
        console.log(`No retained files older than ${cutoff.toISOString()}. Nothing to do.`);
        return;
    }

    console.log(`${candidates.length} retained file(s) older than ${cutoff.toISOString()} will be discarded:\n`);
    for (const c of candidates) {
        console.log(`  ${c.id}  userId=${c.userId ?? "(none)"}  ${c.bankName}  since ${c.retainedFileSince?.toISOString()}`);
    }

    if (!APPLY) {
        console.log("\nDry run — pass --yes to delete.");
        return;
    }

    const result = await sweepExpiredRetainedFiles();
    console.log(`\nSwept ${result.swept} statement(s).`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect())
    // `sweepExpiredRetainedFiles` pulls in `queue/index.ts` (via
    // `statements.service.ts`), whose open Redis connections otherwise keep
    // the process alive forever — see `drain-queues.ts` for the same fix.
    .then(() => process.exit(process.exitCode ?? 0));
