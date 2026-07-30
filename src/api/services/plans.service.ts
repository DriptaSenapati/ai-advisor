import prisma from "../../prismaClient.js";
import { planIdFor } from "../middleware/entitlement.js";
import {
    COMPARISON_ROWS,
    PLANS,
    PLAN_ORDER,
    resolvePlan,
    type Plan,
    type PlanId,
} from "../../config/plans.js";

/**
 * The public catalog, cheapest plan first.
 *
 * Served without authentication so the marketing site can render prices and the
 * comparison matrix from the same object that enforces them. There is nothing
 * user-specific in here by construction — do not be tempted to fold the caller's
 * current plan in, or this stops being cacheable and starts needing a session.
 */
export function getCatalog(): { plans: Plan[]; comparison: typeof COMPARISON_ROWS } {
    return {
        plans: PLAN_ORDER.map((id) => PLANS[id]),
        comparison: COMPARISON_ROWS,
    };
}

export interface Entitlements {
    plan: PlanId;
    planName: string;
    features: Plan["features"];
    limits: Plan["limits"];
    usage: {
        statements: number;
        banks: number;
        goals: number;
    };
}

/**
 * What this user may do, and how much of it they have used.
 *
 * One call, read once per session by the app shell and seeded into SWR — which
 * is why usage lives in the same response as the rules rather than in three
 * counters fetched per screen.
 *
 * `banks` counts *distinct* bank names, since that is what the `multi_bank`
 * rule is about; `distinct` on a Mongo `findMany` is applied by Prisma, so this
 * returns rows rather than a count and is only sane because a user has tens of
 * statements, not thousands.
 */
export async function getEntitlements(userId: string): Promise<Entitlements> {
    const plan = resolvePlan(await planIdFor(userId));

    const [statements, banks, goals] = await Promise.all([
        prisma.statementMetadata.count({ where: { userId } }),
        prisma.statementMetadata.findMany({
            where: { userId },
            select: { bankName: true },
            distinct: ["bankName"],
        }),
        prisma.goal.count({ where: { userId, status: { in: ["active", "checking"] } } }),
    ]);

    return {
        plan: plan.id,
        planName: plan.name,
        features: plan.features,
        limits: plan.limits,
        usage: { statements, banks: banks.length, goals },
    };
}

/**
 * Move a user onto a plan.
 *
 * There is no billing yet, so every write here is `source: "manual"` or `"dev"`.
 * The route that exposes this refuses to run in production — see
 * `users.routes.ts`.
 */
export async function setPlan(userId: string, plan: PlanId, source = "manual") {
    const row = await prisma.subscription.upsert({
        where: { userId },
        create: { userId, plan, source, status: "active" },
        update: { plan, source, status: "active", endsAt: null },
        select: { plan: true, status: true, startedAt: true },
    });
    return { plan: resolvePlan(row.plan).id, status: row.status, startedAt: row.startedAt };
}
