import type { Request, Response, NextFunction } from "express";
import * as insightsService from "../services/insights.service.js";
import { ok, accepted } from "../response.js";
import type { AuthenticatedRequest } from "../middleware/authenticate.js";

export async function getLatestInsight(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const report = await insightsService.getLatestInsight(userId);
        ok(res, report);
    } catch (err) {
        next(err);
    }
}

export async function getInsight(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const id = req.params["id"] as string;
        const report = await insightsService.getInsight(id, userId);
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
