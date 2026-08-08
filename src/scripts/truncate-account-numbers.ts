/**
 * One-shot: truncate every existing `StatementMetadata.accountNumber` to its
 * last 4 characters, discarding the rest.
 *
 * `pdf_extractor_tool_node.ts` now only ever writes the last 4 digits going
 * forward (see `lib/accountNumber.ts`) — this backfills every row written
 * before that change. The full number is genuinely discarded, not moved
 * anywhere else: it has no use in this app beyond display, so there is
 * nothing to preserve it for.
 *
 * Safe to re-run — a row already truncated to <=4 characters is a no-op
 * (`last4` of a 4-character string is itself), so this never needs a cutoff
 * timestamp the way the email-verification grandfathering script did.
 *
 *   npm run truncate:account-numbers            # report only
 *   npm run truncate:account-numbers -- --yes    # write
 */
import "../envConfig.js";
import prisma from "../prismaClient.js";
import { last4 } from "../lib/accountNumber.js";

const APPLY = process.argv.includes("--yes");

async function main(): Promise<void> {
    const candidates = await prisma.statementMetadata.findMany({
        where: { accountNumber: { not: null } },
        select: { id: true, accountNumber: true },
    });

    const toUpdate = candidates.filter((c) => c.accountNumber && c.accountNumber.length > 4);

    if (toUpdate.length === 0) {
        console.log(`${candidates.length} statement(s) have an account number; all are already <=4 characters. Nothing to do.`);
        return;
    }

    console.log(`${toUpdate.length} of ${candidates.length} statement(s) will be truncated to their last 4 characters:\n`);
    for (const c of toUpdate) {
        console.log(`  ${c.id}  (${c.accountNumber!.length} chars → •••${last4(c.accountNumber)})`);
    }

    if (!APPLY) {
        console.log("\nDry run — pass --yes to write.");
        return;
    }

    let updated = 0;
    for (const c of toUpdate) {
        await prisma.statementMetadata.update({
            where: { id: c.id },
            data: { accountNumber: last4(c.accountNumber) },
        });
        updated += 1;
    }
    console.log(`\nUpdated ${updated} statement(s).`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
