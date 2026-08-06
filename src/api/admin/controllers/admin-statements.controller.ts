import type { Request, Response, NextFunction } from "express";
import * as adminStatementsService from "../services/admin-statements.service.js";
import { ok } from "../../response.js";

export async function listStatements(req: Request, res: Response, next: NextFunction) {
    try {
        const { page, limit, status, gate, bankName, extractionStatus } = req.query as unknown as {
            page: number;
            limit: number;
            status?: string;
            gate?: string;
            bankName?: string;
            extractionStatus?: string;
        };
        const { data, total } = await adminStatementsService.listAdminStatements(
            page,
            limit,
            status,
            gate,
            bankName,
            extractionStatus
        );
        ok(res, data, { total, page, limit });
    } catch (err) {
        next(err);
    }
}

export async function getStatement(req: Request, res: Response, next: NextFunction) {
    try {
        const id = req.params["id"] as string;
        ok(res, await adminStatementsService.getAdminStatementDetail(id));
    } catch (err) {
        next(err);
    }
}
