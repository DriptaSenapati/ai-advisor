import type { Request, Response, NextFunction } from "express";
import * as adminUsersService from "../services/admin-users.service.js";
import { ok } from "../../response.js";

export async function listUsers(req: Request, res: Response, next: NextFunction) {
    try {
        const { page, limit, search } = req.query as unknown as { page: number; limit: number; search?: string };
        const { data, total } = await adminUsersService.listAdminUsers(page, limit, search);
        ok(res, data, { total, page, limit });
    } catch (err) {
        next(err);
    }
}

export async function getUser(req: Request, res: Response, next: NextFunction) {
    try {
        const id = req.params["id"] as string;
        ok(res, await adminUsersService.getAdminUserDetail(id));
    } catch (err) {
        next(err);
    }
}

export async function setUserPlan(req: Request, res: Response, next: NextFunction) {
    try {
        const id = req.params["id"] as string;
        const { plan } = req.body as { plan: Parameters<typeof adminUsersService.setAdminUserPlan>[1] };
        ok(res, await adminUsersService.setAdminUserPlan(id, plan));
    } catch (err) {
        next(err);
    }
}
