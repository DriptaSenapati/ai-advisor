import type { Request, Response, NextFunction } from "express";
import * as txnService from "../services/transactions.service.js";
import { ok } from "../response.js";

export async function listTransactions(req: Request, res: Response, next: NextFunction) {
    try {
        const q = (req.query as unknown) as {
            page: number; limit: number; month?: string; category?: string;
            minAmount?: number; maxAmount?: number;
        };
        const { data, total } = await txnService.listTransactions({
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
        const stats = await txnService.getMonthlyStats();
        ok(res, stats);
    } catch (err) {
        next(err);
    }
}

export async function getCategoryBreakdown(req: Request, res: Response, next: NextFunction) {
    try {
        const breakdown = await txnService.getCategoryBreakdown();
        ok(res, breakdown);
    } catch (err) {
        next(err);
    }
}

export async function getMerchants(req: Request, res: Response, next: NextFunction) {
    try {
        const { category } = (req.query as unknown) as { category?: string };
        const merchants = await txnService.getMerchants(category);
        ok(res, merchants);
    } catch (err) {
        next(err);
    }
}
