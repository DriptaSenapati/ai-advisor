import type { Request, Response, NextFunction } from "express";
import * as testimonialsService from "../services/testimonials.service.js";
import { ok } from "../response.js";

/** Public, unauthenticated — same posture as /plans and /content. */
export async function listTestimonials(_req: Request, res: Response, next: NextFunction) {
    try {
        ok(res, await testimonialsService.getPublicTestimonials());
    } catch (err) {
        next(err);
    }
}
