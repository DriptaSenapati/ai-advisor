import { Router } from "express";
import * as plansController from "../controllers/plans.controller.js";

const router = Router();

/**
 * @openapi
 * /plans:
 *   get:
 *     tags: [Plans]
 *     security: []
 *     summary: The subscription plan catalog
 *     description: >
 *       Public — no authentication. Returns every plan with its price, its
 *       feature flags and its limits, plus the ordered comparison matrix the
 *       pricing page renders. This is the single source of truth: the marketing
 *       site derives its prices and its feature table from this response rather
 *       than carrying a second copy that could drift from what is enforced.
 *     responses:
 *       200:
 *         description: The catalog
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     plans:
 *                       type: array
 *                       description: Cheapest first.
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string, enum: [first, glow, radiant] }
 *                           name: { type: string, example: "Glow" }
 *                           num: { type: string, example: "02" }
 *                           blurb: { type: string }
 *                           price:
 *                             type: object
 *                             properties:
 *                               monthly: { type: number, example: 499 }
 *                               annual: { type: number, example: 399, description: "Per month, billed yearly" }
 *                           cta: { type: string }
 *                           caption: { type: string }
 *                           popular: { type: boolean }
 *                           features:
 *                             type: object
 *                             description: One boolean per feature key.
 *                             additionalProperties: { type: boolean }
 *                           limits:
 *                             type: object
 *                             properties:
 *                               statements: { type: integer, nullable: true, description: "null is unlimited" }
 *                               goals: { type: integer, nullable: true }
 *                     comparison:
 *                       type: array
 *                       description: Rows of the pricing comparison table, in reading order.
 *                       items:
 *                         type: object
 *                         properties:
 *                           key: { type: string }
 *                           label: { type: string }
 *                           hint: { type: string }
 *                           values:
 *                             type: object
 *                             description: Per plan id — true, false, or a figure such as "Unlimited".
 */
router.get("/", plansController.listPlans);

export default router;
