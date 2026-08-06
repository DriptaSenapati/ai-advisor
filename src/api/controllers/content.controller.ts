import type { Request, Response, NextFunction } from "express";
import * as contentService from "../services/content.service.js";
import { ok } from "../response.js";

/** Public, unauthenticated — the marketing site renders from this, same posture as /plans. */
export async function getContent(_req: Request, res: Response, next: NextFunction) {
    try {
        ok(res, await contentService.getPublicContent());
    } catch (err) {
        next(err);
    }
}
