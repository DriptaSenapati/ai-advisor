import { Router } from "express";
import * as contentController from "../controllers/content.controller.js";

const router = Router();

/**
 * @openapi
 * /content:
 *   get:
 *     tags: [Content]
 *     summary: Curated marketing copy, admin-editable
 *     description: >
 *       Public, unauthenticated — the marketing site renders from this, same
 *       posture as /plans. Returns `{ [key]: value }` for every key an admin
 *       has set; a missing key means the marketing component should render
 *       its own hardcoded default.
 *     responses:
 *       200:
 *         description: Content map
 */
router.get("/", contentController.getContent);

export default router;
