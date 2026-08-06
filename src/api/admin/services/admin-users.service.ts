import prisma from "../../../prismaClient.js";
import { NotFoundError } from "../../errors.js";
import { resolvePlan, type PlanId } from "../../../config/plans.js";
import { setPlan } from "../../services/plans.service.js";

export interface AdminUserRow {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
    plan: string;
    subscriptionStatus: string | null;
    statementCount: number;
}

export async function listAdminUsers(page: number, limit: number, search?: string) {
    const where = search
        ? {
              OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { email: { contains: search, mode: "insensitive" as const } },
              ],
          }
        : {};

    const [total, users] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
            select: { id: true, name: true, email: true, createdAt: true },
        }),
    ]);

    const userIds = users.map((u) => u.id);
    // Batched, not N+1: one round of parallel per-id queries rather than a
    // sequential loop — the page is capped at 100 rows.
    const [subscriptions, statementCounts] = await Promise.all([
        prisma.subscription.findMany({ where: { userId: { in: userIds } } }),
        Promise.all(userIds.map((id) => prisma.statementMetadata.count({ where: { userId: id } }))),
    ]);
    const subByUser = new Map(subscriptions.map((s) => [s.userId, s]));

    const data: AdminUserRow[] = users.map((u, i) => {
        const sub = subByUser.get(u.id);
        return {
            id: u.id,
            name: u.name,
            email: u.email,
            createdAt: u.createdAt,
            plan: resolvePlan(sub?.plan).id,
            subscriptionStatus: sub?.status ?? null,
            statementCount: statementCounts[i] ?? 0,
        };
    });

    return { data, total };
}

export async function getAdminUserDetail(id: string) {
    const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, emailVerified: true, createdAt: true, image: true },
    });
    if (!user) throw new NotFoundError("User", id);

    const [subscription, statements, transactionCount, activeGoalCount] = await Promise.all([
        prisma.subscription.findUnique({ where: { userId: id } }),
        prisma.statementMetadata.findMany({
            where: { userId: id },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                bankName: true,
                fileName: true,
                createdAt: true,
                extractionStatus: true,
                normalizerStatus: true,
                categorizationStatus: true,
                insightsStatus: true,
                gateDecision: true,
                totalTransactions: true,
            },
        }),
        prisma.finalTransactionData.count({ where: { userId: id } }),
        prisma.goal.count({ where: { userId: id, status: { in: ["active", "checking"] } } }),
    ]);

    return {
        user,
        plan: resolvePlan(subscription?.plan).id,
        subscription,
        statements,
        transactionCount,
        activeGoalCount,
    };
}

/**
 * Reuses `plansService.setPlan`, which already accepts a `source` — no
 * duplicated upsert. `User.id` is a better-auth-generated string, not a Mongo
 * ObjectId, so it is looked up directly rather than validated as one.
 */
export async function setAdminUserPlan(id: string, plan: PlanId) {
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundError("User", id);
    return setPlan(id, plan, "admin");
}
