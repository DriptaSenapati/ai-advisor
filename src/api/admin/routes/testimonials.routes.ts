import { Router } from "express";
import * as adminTestimonialsController from "../controllers/admin-testimonials.controller.js";
import { validate } from "../../middleware/validate.js";
import { createTestimonialSchema, updateTestimonialSchema } from "../validators/admin-testimonials.validator.js";

const router = Router();

router.get("/", adminTestimonialsController.listTestimonials);
router.post("/", validate(createTestimonialSchema), adminTestimonialsController.createTestimonial);
router.patch("/:id", validate(updateTestimonialSchema), adminTestimonialsController.updateTestimonial);
router.delete("/:id", adminTestimonialsController.deleteTestimonial);

export default router;
