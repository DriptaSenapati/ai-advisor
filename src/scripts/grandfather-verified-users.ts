/**
 * One-shot: mark every pre-existing user as `emailVerified: true`.
 *
 * `src/auth.ts` now sets `emailAndPassword.requireEmailVerification: true`,
 * which blocks sign-in for any row still carrying `emailVerified: false`.
 * Every account created before this feature shipped has that value — no
 * verification flow existed for them to complete — so flipping the flag with
 * no migration would have locked out every existing user, real testers
 * included, on their next sign-in.
 *
 * This is a **cutoff-scoped** update, not a blanket one, and that scoping is
 * the reason it is safe to run only once: it only touches rows created
 * strictly before `--before`, so a genuinely unverified signup made *after*
 * the cutoff is left alone. Running this again later, with a later cutoff,
 * would wrongly verify real unverified accounts — don't.
 *
 *   npm run grandfather:verified-users -- --before=2026-08-06T00:00:00Z         # report only
 *   npm run grandfather:verified-users -- --before=2026-08-06T00:00:00Z --yes   # write
 *
 * Dry run by default, following `grant-plan.ts` / `backfill-user-scope.ts`.
 */
import "../envConfig.js";
import prisma from "../prismaClient.js";

const APPLY = process.argv.includes("--yes");

function arg(name: string): string | undefined {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit?.slice(name.length + 3);
}

async function main(): Promise<void> {
    const beforeRaw = arg("before");
    if (!beforeRaw) {
        console.error(
            "Usage: npm run grandfather:verified-users -- --before=<ISO timestamp> [--yes]"
        );
        process.exitCode = 1;
        return;
    }
    const before = new Date(beforeRaw);
    if (Number.isNaN(before.getTime())) {
        console.error(`Not a valid date: ${beforeRaw}`);
        process.exitCode = 1;
        return;
    }

    const candidates = await prisma.user.findMany({
        where: { emailVerified: false, createdAt: { lt: before } },
        select: { id: true, email: true, createdAt: true },
        orderBy: { createdAt: "asc" },
    });

    if (candidates.length === 0) {
        console.log(`No unverified users created before ${before.toISOString()}. Nothing to do.`);
        return;
    }

    console.log(
        `${candidates.length} user(s) created before ${before.toISOString()} will be marked emailVerified: true:\n`
    );
    for (const u of candidates) {
        console.log(`  ${u.email}  (created ${u.createdAt.toISOString()})`);
    }

    if (!APPLY) {
        console.log("\nDry run — pass --yes to write.");
        return;
    }

    const result = await prisma.user.updateMany({
        where: { id: { in: candidates.map((u) => u.id) } },
        data: { emailVerified: true },
    });
    console.log(`\nUpdated ${result.count} user(s).`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
