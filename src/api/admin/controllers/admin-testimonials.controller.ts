import type { Request, Response, NextFunction } from "express";
import * as adminTestimonialsService from "../services/admin-testimonials.service.js";
import { ok, created } from "../../response.js";

export async function listTestimonials(_req: Request, res: Response, next: NextFunction) {
    try {
        ok(res, await adminTestimonialsService.listAdminTestimonials());
    } catch (err) {
        next(err);
    }
}

export async function createTestimonial(req: Request, res: Response, next: NextFunction) {
    try {
        created(res, await adminTestimonialsService.createTestimonial(req.body));
    } catch (err) {
        next(err);
    }
}

export async function updateTestimonial(req: Request, res: Response, next: NextFunction) {
    try {
        const id = req.params["id"] as string;
        ok(res, await adminTestimonialsService.updateTestimonial(id, req.body));
    } catch (err) {
        next(err);
    }
}

export async function deleteTestimonial(req: Request, res: Response, next: NextFunction) {
    try {
        const id = req.params["id"] as string;
        await adminTestimonialsService.deleteTestimonial(id);
        ok(res, { deleted: true });
    } catch (err) {
        next(err);
    }
}
