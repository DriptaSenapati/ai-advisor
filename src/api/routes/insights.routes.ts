import { Router } from "express";
import * as insightsController from "../controllers/insights.controller.js";
import { validate } from "../middleware/validate.js";
import { generateLimiter } from "../middleware/rateLimiter.js";
import { generateInsightsSchema, listInsightsQuerySchema } from "../validators/insights.validator.js";

const router = Router();

/**
 * @openapi
 * /insights/latest:
 *   get:
 *     tags: [Insights]
 *     summary: Get the most recent InsightReport
 *     responses:
 *       200:
 *         description: Full InsightReport including insights JSON and rawStatsSnapshot
 *       404:
 *         description: No insights generated yet
 */
router.get("/latest", insightsController.getLatestInsight);

/**
 * @openapi
 * /insights:
 *   get:
 *     tags: [Insights]
 *     summary: List all InsightReports (summary only, no full JSON)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 5, maximum: 50 }
 *     responses:
 *       200:
 *         description: Paginated list of InsightReport summaries
 */
router.get("/", validate(listInsightsQuerySchema, "query"), insightsController.listInsights);

/**
 * @openapi
 * /insights/{id}:
 *   get:
 *     tags: [Insights]
 *     summary: Get a specific InsightReport by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Full InsightReport
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/:id", insightsController.getInsight);

/**
 * @openapi
 * /insights/generate:
 *   post:
 *     tags: [Insights]
 *     summary: Trigger insights generation
 *     description: |
 *       Runs asynchronously. Returns 202 immediately.
 *       - Without statementId: full recompute across all months
 *       - With statementId: recomputes only months from that statement
 *       Poll GET /insights/latest after ~30 seconds.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               statementId:
 *                 type: string
 *     responses:
 *       202:
 *         description: Generation started
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 */
router.post(
    "/generate",
    generateLimiter,
    validate(generateInsightsSchema),
    insightsController.generateInsights
);

export default router;
