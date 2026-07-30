import type { Request, Response, NextFunction } from "express";
import * as insightsService from "../services/insights.service.js";
import { ok, accepted } from "../response.js";
import type { AuthenticatedRequest } from "../middleware/authenticate.js";
import { loadPlan } from "../middleware/entitlement.js";
import { hasFeature } from "../../config/plans.js";

/**
 * Both report reads are already behind `requireFeature("insights_summary")`, so
 * reaching here means the caller gets *something*. `loadPlan` is memoised on the
 * request, so re-reading it to decide the depth costs nothing.
 */
async function canReadFullReport(req: Request): Promise<boolean> {
    return hasFeature((await loadPlan(req)).id, "insights_full");
}

export async function getLatestInsight(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const report = await insightsService.getLatestInsight(userId, await canReadFullReport(req));
        ok(res, report);
    } catch (err) {
        next(err);
    }
}

export async function getInsight(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const id = req.params["id"] as string;
        const report = await insightsService.getInsight(id, userId, await canReadFullReport(req));
        ok(res, report);
    } catch (err) {
        next(err);
    }
}

export async function listInsights(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const { page, limit } = (req.query as unknown) as { page: number; limit: number };
        const { data, total } = await insightsService.listInsights(userId, page, limit);
        ok(res, data, { total, page, limit });
    } catch (err) {
        next(err);
    }
}

export async function listFlags(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const filters = (req.query as unknown) as insightsService.ListFlagsFilters;
        const { data, total } = await insightsService.listFlags(userId, filters);
        ok(res, data, { total, page: filters.page, limit: filters.limit });
    } catch (err) {
        next(err);
    }
}

export async function getFlagSummary(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const filters = (req.query as unknown) as insightsService.FlagSummaryFilters;
        const summary = await insightsService.getFlagSummary(userId, filters);
        ok(res, summary);
    } catch (err) {
        next(err);
    }
}

export async function generateInsights(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const { statementId } = req.body as { statementId?: string };
        await insightsService.triggerInsightsGeneration(userId, statementId);
        accepted(res, {
            jobStarted: true,
            scope: statementId ? "statement" : "full",
            ...(statementId ? { statementId } : {}),
        });
    } catch (err) {
        next(err);
    }
}
