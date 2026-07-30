import type { Request, Response, NextFunction } from "express";
import prisma from "../../prismaClient.js";
import { PlanRequiredError } from "../errors.js";
import {
    DEFAULT_PLAN,
    hasFeature,
    minimumPlanFor,
    resolvePlan,
    type FeatureKey,
    type Plan,
    type PlanId,
} from "../../config/plans.js";
import type { AuthenticatedRequest } from "./authenticate.js";

/**
 * Plan enforcement.
 *
 * Runs after `requireAuth`, which has already put `req.user` in place. The plan
 * itself is read here rather than in `requireAuth` so that the ~30 endpoints
 * with no plan rule attached pay nothing for the ones that do.
 *
 * **The lookup is memoised on the request.** A route can carry a guard while its
 * service also checks a quota — `POST /statements/upload` does exactly that —
 * and without the memo that is two round trips to say one thing.
 */

/** The plan is attached here once resolved, so a controller can read it without a second query. */
export interface PlanAwareRequest extends AuthenticatedRequest {
    plan?: Plan;
}

export async function loadPlan(req: Request): Promise<Plan> {
    const typed = req as PlanAwareRequest;
    if (typed.plan) return typed.plan;

    const userId = typed.user?.id;
    // No authenticated user means this was mounted without `requireAuth` in
    // front of it. Resolving to free is the safe read; the 401 is not this
    // middleware's to raise.
    const plan = userId ? resolvePlan(await planIdFor(userId)) : resolvePlan(DEFAULT_PLAN);

    typed.plan = plan;
    return plan;
}

/**
 * The stored plan id for a user, or `null` when they have never had one set.
 *
 * A `cancelled` subscription reads as no subscription — which `resolvePlan` then
 * turns into the free plan. That is the documented downgrade behaviour: access
 * narrows, nothing already computed is destroyed.
 */
export async function planIdFor(userId: string): Promise<PlanId | null> {
    const row = await prisma.subscription.findUnique({
        where: { userId },
        select: { plan: true, status: true },
    });
    if (!row || row.status !== "active") return null;
    return resolvePlan(row.plan).id;
}

/**
 * Refuse the request unless the caller's plan includes `feature`.
 *
 * Mount it directly after `requireAuth` on a router, or per-route where only
 * some of a router's endpoints are gated (`/insights` — the flag endpoints are
 * gated, `/insights/latest` is projected instead).
 */
export function requireFeature(feature: FeatureKey, message?: string) {
    return async function entitlementGuard(req: Request, _res: Response, next: NextFunction) {
        try {
            const plan = await loadPlan(req);
            if (!hasFeature(plan.id, feature)) {
                throw new PlanRequiredError(feature, minimumPlanFor(feature), plan.id, message);
            }
            next();
        } catch (err) {
            next(err);
        }
    };
}
