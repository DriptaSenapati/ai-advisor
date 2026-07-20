import type { Request, Response, NextFunction } from "express";
import * as statementsService from "../services/statements.service.js";
import { ok, accepted } from "../response.js";
import { ValidationError } from "../errors.js";
import type { AuthenticatedRequest } from "../middleware/authenticate.js";
import * as sseManager from "../sse/manager.js";

export async function uploadStatement(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.file) return next(new ValidationError("PDF file is required"));
        const { bankName, password } = req.body as { bankName?: string; password?: string };
        const userId = (req as AuthenticatedRequest).user.id;
        const result = await statementsService.uploadStatement(req.file.path, bankName, userId, password);
        accepted(res, result);
    } catch (err) {
        next(err);
    }
}

export async function listStatements(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const { page, limit, bankName, status } = (req.query as unknown) as {
            page: number; limit: number; bankName?: string; status?: string;
        };
        const { data, total } = await statementsService.listStatements(userId, page, limit, bankName, status);
        ok(res, data, { total, page, limit });
    } catch (err) {
        next(err);
    }
}

export async function getStatement(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const id = req.params["id"] as string;
        const statement = await statementsService.getStatement(id, userId);
        ok(res, statement);
    } catch (err) {
        next(err);
    }
}

export async function getStatementStatus(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const id = req.params["id"] as string;
        const status = await statementsService.getStatementStatus(id, userId);
        ok(res, status);
    } catch (err) {
        next(err);
    }
}

export async function listStatementTransactions(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const id = req.params["id"] as string;
        const { page, limit, type, month, category } = (req.query as unknown) as {
            page: number; limit: number; type: "all" | "debit" | "credit"; month?: string; category?: string;
        };
        const { data, total } = await statementsService.listStatementTransactions(
            id, userId, page, limit, type, month, category
        );
        ok(res, data, { total, page, limit });
    } catch (err) {
        next(err);
    }
}

export async function deleteStatement(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const id = req.params["id"] as string;
        await statementsService.deleteStatement(id, userId);
        ok(res, { deleted: true });
    } catch (err) {
        next(err);
    }
}

export function streamProgress(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user.id;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const cleanup = sseManager.addClient(userId, res);
    req.on("close", cleanup);
}
