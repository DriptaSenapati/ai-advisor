import type { Request, Response, NextFunction } from "express";
import * as uatService from "../services/uat.service.js";
import { ok } from "../response.js";

/** Always answers, even when UAT is disabled — the frontend uses this to decide whether to fetch anything else. */
export function getConfig(_req: Request, res: Response, next: NextFunction) {
    try {
        ok(res, uatService.getConfig());
    } catch (err) {
        next(err);
    }
}

export function listTestPdfs(_req: Request, res: Response, next: NextFunction) {
    try {
        ok(res, uatService.listTestPdfs());
    } catch (err) {
        next(err);
    }
}

export async function downloadTestPdf(req: Request, res: Response, next: NextFunction) {
    try {
        const { buffer, filename } = await uatService.downloadTestPdf(req.params.id as string);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (err) {
        next(err);
    }
}

export function listTesters(_req: Request, res: Response, next: NextFunction) {
    try {
        ok(res, uatService.listTesters());
    } catch (err) {
        next(err);
    }
}
