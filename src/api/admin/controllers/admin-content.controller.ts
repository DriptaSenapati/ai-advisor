import type { Request, Response, NextFunction } from "express";
import * as contentService from "../../services/content.service.js";
import { ok } from "../../response.js";
import type { AdminRequest } from "../middleware/requireAdminAuth.js";

export async function listContent(_req: Request, res: Response, next: NextFunction) {
    try {
        ok(res, await contentService.listContentForAdmin());
    } catch (err) {
        next(err);
    }
}

export async function putContent(req: Request, res: Response, next: NextFunction) {
    try {
        const { entries } = req.body as { entries: { key: string; value: string }[] };
        const updatedBy = (req as AdminRequest).adminUser.username;
        await contentService.upsertContent(entries as Parameters<typeof contentService.upsertContent>[0], updatedBy);
        ok(res, await contentService.listContentForAdmin());
    } catch (err) {
        next(err);
    }
}
