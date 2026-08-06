import { Router } from "express";
import * as testimonialsController from "../controllers/testimonials.controller.js";

const router = Router();

/**
 * @openapi
 * /testimonials:
 *   get:
 *     tags: [Content]
 *     summary: Marketing testimonials
 *     description: Public, unauthenticated — the marketing site renders from this, same posture as /plans and /content.
 *     responses:
 *       200:
 *         description: Testimonial list, ordered
 */
router.get("/", testimonialsController.listTestimonials);

export default router;
