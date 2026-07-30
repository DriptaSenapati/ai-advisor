import type { Request, Response, NextFunction } from "express";
import * as recurringService from "../services/recurring.service.js";
import { ok } from "../response.js";
import type { AuthenticatedRequest } from "../middleware/authenticate.js";

export async function listRecurring(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const filters = (req.query as unknown) as recurringService.ListRecurringFilters;
        const { data, total } = await recurringService.listRecurring(userId, filters);
        ok(res, data, { total, page: filters.page, limit: filters.limit });
    } catch (err) {
        next(err);
    }
}

export async function getRecurringSummary(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const summary = await recurringService.getRecurringSummary(userId);
        ok(res, summary);
    } catch (err) {
        next(err);
    }
}

export async function getRecurringTransactions(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const id = req.params["id"] as string;
        const { page, limit } = (req.query as unknown) as { page: number; limit: number };
        const { data, total } = await recurringService.getRecurringTransactions(id, userId, page, limit);
        ok(res, data, { total, page, limit });
    } catch (err) {
        next(err);
    }
}
