import type { Request, Response, NextFunction } from "express";
import * as txnService from "../services/transactions.service.js";
import { ok } from "../response.js";
import type { AuthenticatedRequest } from "../middleware/authenticate.js";

/**
 * These four handlers never read `req.user` at all — the routes sat behind
 * `requireAuth`, so a caller had to be signed in, but nothing then narrowed the
 * query to *them*. Every one of these responses was the whole deployment's data.
 */

export async function listTransactions(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const q = (req.query as unknown) as {
            page: number; limit: number; month?: string; category?: string;
            minAmount?: number; maxAmount?: number;
        };
        const { data, total } = await txnService.listTransactions({
            userId,
            page: q.page,
            limit: q.limit,
            ...(q.month !== undefined ? { month: q.month } : {}),
            ...(q.category !== undefined ? { category: q.category } : {}),
            ...(q.minAmount !== undefined ? { minAmount: q.minAmount } : {}),
            ...(q.maxAmount !== undefined ? { maxAmount: q.maxAmount } : {}),
        });
        ok(res, data, { total, page: q.page, limit: q.limit });
    } catch (err) {
        next(err);
    }
}

export async function getMonthlyStats(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const stats = await txnService.getMonthlyStats(userId);
        ok(res, stats);
    } catch (err) {
        next(err);
    }
}

export async function getCategoryBreakdown(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const breakdown = await txnService.getCategoryBreakdown(userId);
        ok(res, breakdown);
    } catch (err) {
        next(err);
    }
}

/**
 * The drill-down behind a category bar.
 *
 * An unknown category is **200 with zeroes, not 404**. This is reached by
 * clicking a bar, so the category is always one the caller was just shown — and
 * a user with no Travel spending asking about Travel has asked a legitimate
 * question with a legitimate answer ("nothing"). Reserving 404 for a genuinely
 * unroutable request keeps it meaningful.
 */
export async function getCategoryDetail(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        // `categoryParamSchema` has already replaced `req.params` with its parsed
        // output, so this is a plain string — Express 5's own type is wider.
        const { category } = (req.params as unknown) as { category: string };
        const detail = await txnService.getCategoryDetail(userId, category);
        ok(res, detail);
    } catch (err) {
        next(err);
    }
}

export async function getMerchants(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const { category, limit } = (req.query as unknown) as { category?: string; limit: number };
        const merchants = await txnService.getMerchants(userId, category, limit);
        ok(res, merchants);
    } catch (err) {
        next(err);
    }
}

export async function getSpendingRhythm(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        ok(res, await txnService.getSpendingRhythm(userId));
    } catch (err) {
        next(err);
    }
}

export async function getPayeeAliases(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        ok(res, await txnService.getPayeeAliases(userId));
    } catch (err) {
        next(err);
    }
}
