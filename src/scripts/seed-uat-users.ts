/**
 * Creates the 3 UAT tester accounts (one per plan) — idempotent, safe to
 * re-run against any environment.
 *
 * There is no admin "create user" route in this codebase — the supported way
 * to create a User+Account outside the HTTP signup flow is better-auth's own
 * server API, `auth.api.signUpEmail()`, which writes a correctly hashed
 * password. Plan assignment reuses the same `Subscription.upsert` shape
 * `grant-plan.ts` and `setPlan()` (plans.service.ts) both use.
 *
 *   npm run seed:uat-users                 # dry run — reports what would change
 *   npm run seed:uat-users -- --yes         # applies it
 *
 * To seed production: cross-env NODE_ENV=production tsx src/scripts/seed-uat-users.ts -- --yes
 * (confirm DATABASE_URL resolves to the prod cluster first).
 */
import "../envConfig.js";
import prisma from "../prismaClient.js";
import { auth } from "../auth.js";
import { UAT_TESTERS, UAT_TEST_PASSWORD } from "../config/uat.js";

const APPLY = process.argv.includes("--yes");

async function main(): Promise<void> {
    if (!UAT_TEST_PASSWORD) {
        console.error("UAT_TEST_PASSWORD is not set — nothing to seed with.");
        process.exitCode = 1;
        return;
    }

    for (const tester of UAT_TESTERS) {
        const existing = await prisma.user.findFirst({ where: { email: tester.email }, select: { id: true } });

        if (!existing) {
            console.log(`${tester.email}: no account — will create + set plan "${tester.plan}"`);
            if (!APPLY) continue;
            await auth.api.signUpEmail({
                body: { email: tester.email, password: UAT_TEST_PASSWORD, name: tester.label },
            });
        } else {
            console.log(`${tester.email}: account exists — will ensure plan "${tester.plan}"`);
        }

        if (!APPLY) continue;

        const user = existing ?? (await prisma.user.findFirst({ where: { email: tester.email }, select: { id: true } }));
        if (!user) {
            console.error(`  failed to locate ${tester.email} after signup — skipping plan assignment`);
            continue;
        }

        await prisma.subscription.upsert({
            where: { userId: user.id },
            create: { userId: user.id, plan: tester.plan, status: "active", source: "dev" },
            update: { plan: tester.plan, status: "active", source: "dev", endsAt: null },
        });
        console.log(`  done.`);
    }

    if (!APPLY) {
        console.log("\nDry run — nothing written. Re-run with -- --yes to apply.");
    }
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
