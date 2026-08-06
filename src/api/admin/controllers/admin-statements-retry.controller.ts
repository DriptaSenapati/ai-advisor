import type { Request, Response, NextFunction } from "express";
import * as retryService from "../services/admin-statements-retry.service.js";
import { accepted } from "../../response.js";

export async function retryStatement(req: Request, res: Response, next: NextFunction) {
    try {
        const id = req.params["id"] as string;
        accepted(res, await retryService.retryAdminStatement(id));
    } catch (err) {
        next(err);
    }
}
