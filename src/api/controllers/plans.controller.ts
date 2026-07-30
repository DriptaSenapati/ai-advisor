import type { Request, Response, NextFunction } from "express";
import * as plansService from "../services/plans.service.js";
import { ok } from "../response.js";
import type { AuthenticatedRequest } from "../middleware/authenticate.js";

/** The public plan catalog. No auth — the marketing site renders from this. */
export function listPlans(_req: Request, res: Response, next: NextFunction) {
    try {
        ok(res, plansService.getCatalog());
    } catch (err) {
        next(err);
    }
}

export async function getMyEntitlements(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        ok(res, await plansService.getEntitlements(userId));
    } catch (err) {
        next(err);
    }
}

/**
 * Move the caller onto a plan. Development only — the route refuses to mount
 * this handler in production.
 */
export async function setMyPlan(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        ok(res, await plansService.setPlan(userId, req.body.plan, "dev"));
    } catch (err) {
        next(err);
    }
}
