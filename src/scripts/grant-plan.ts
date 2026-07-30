/**
 * Put a user on a subscription plan.
 *
 * There is no billing integration, so this is the ops path for a real
 * deployment — `POST /users/me/plan` exists too but is mounted only outside
 * production, deliberately.
 *
 *   npm run grant:plan -- --email=someone@example.com --plan=glow      # report only
 *   npm run grant:plan -- --email=someone@example.com --plan=glow --yes
 *   npm run grant:plan -- --user=<userId> --plan=radiant --yes
 *   npm run grant:plan -- --list                                       # who is on what
 *
 * Dry run by default, following `backfill-user-scope.ts`: it prints the change
 * it would make and writes nothing without `--yes`.
 *
 * **Downgrading is a supported, non-destructive operation.** Nothing already
 * computed is deleted — access narrows and every report, statement and goal
 * stays in the database. That is the behaviour the pricing page's FAQ promises,
 * and it is what makes an upgrade instant rather than a recompute.
 */
import "../envConfig.js";
import prisma from "../prismaClient.js";
import { PLAN_IDS, isPlanId, resolvePlan } from "../config/plans.js";

const APPLY = process.argv.includes("--yes");
const LIST = process.argv.includes("--list");

function arg(name: string): string | undefined {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit?.slice(name.length + 3);
}

async function list(): Promise<void> {
    const [users, subs] = await Promise.all([
        prisma.user.findMany({ select: { id: true, email: true }, orderBy: { createdAt: "asc" } }),
        prisma.subscription.findMany({ select: { userId: true, plan: true, status: true } }),
    ]);
    const byUser = new Map(subs.map((s) => [s.userId, s]));

    console.log(`${users.length} user(s):\n`);
    for (const u of users) {
        const sub = byUser.get(u.id);
        const plan = resolvePlan(sub?.status === "active" ? sub.plan : null);
        const note = !sub ? " (no row — default)" : sub.status !== "active" ? ` (${sub.status})` : "";
        console.log(`  ${plan.id.padEnd(8)} ${u.email}${note}`);
    }
}

async function main(): Promise<void> {
    if (LIST) return list();

    const plan = arg("plan");
    const email = arg("email");
    const userId = arg("user");

    if (!plan || !isPlanId(plan)) {
        console.error(`--plan is required and must be one of: ${PLAN_IDS.join(", ")}`);
        process.exitCode = 1;
        return;
    }
    if (!email && !userId) {
        console.error("Identify the user with --email=<address> or --user=<id>.");
        process.exitCode = 1;
        return;
    }

    const user = await prisma.user.findFirst({
        where: email ? { email } : { id: userId! },
        select: { id: true, email: true },
    });
    if (!user) {
        console.error(`No user matching ${email ?? userId}.`);
        process.exitCode = 1;
        return;
    }

    const existing = await prisma.subscription.findUnique({
        where: { userId: user.id },
        select: { plan: true, status: true },
    });
    const from = resolvePlan(existing?.status === "active" ? existing.plan : null);

    if (from.id === plan) {
        console.log(`${user.email} is already on ${plan}. Nothing to do.`);
        return;
    }

    console.log(`${user.email}: ${from.id} → ${plan}`);

    if (!APPLY) {
        console.log("\nDry run — nothing written. Re-run with -- --yes to apply.");
        return;
    }

    await prisma.subscription.upsert({
        where: { userId: user.id },
        create: { userId: user.id, plan, source: "manual", status: "active" },
        update: { plan, source: "manual", status: "active", endsAt: null },
    });
    console.log("Done.");
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
