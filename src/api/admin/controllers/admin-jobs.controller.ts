import type { Request, Response, NextFunction } from "express";
import * as adminJobsService from "../services/admin-jobs.service.js";
import { ok } from "../../response.js";

export async function listJobs(req: Request, res: Response, next: NextFunction) {
    try {
        const { page, limit, jobType, status, from, to } = req.query as unknown as {
            page: number;
            limit: number;
            jobType?: string;
            status?: string;
            from?: string;
            to?: string;
        };
        const { data, total } = await adminJobsService.listAdminJobs(page, limit, jobType, status, from, to);
        ok(res, data, { total, page, limit });
    } catch (err) {
        next(err);
    }
}
