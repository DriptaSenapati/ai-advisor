import { Router } from "express";
import * as insightsController from "../controllers/insights.controller.js";
import { validate } from "../middleware/validate.js";
import { generateLimiter } from "../middleware/rateLimiter.js";
import { requireFeature } from "../middleware/entitlement.js";
import {
    generateInsightsSchema,
    listInsightsQuerySchema,
    listFlagsQuerySchema,
    flagSummaryQuerySchema,
} from "../validators/insights.validator.js";

const router = Router();

/**
 * @openapi
 * /insights/latest:
 *   get:
 *     tags: [Insights]
 *     summary: Get the most recent InsightReport
 *     description: |
 *       **Projected by plan, not simply allowed or refused.** Below `insights_summary`
 *       (the free plan) this is a 403. On a plan with `insights_summary` but not
 *       `insights_full`, the report comes back with `insights` reduced to `keySummary`
 *       and `dataQualityWarning`, no `rawStatsSnapshot`, and `chartData` stripped of
 *       `recoveryProjection` — flagged with `redacted: true` and `unlockedBy`. One
 *       endpoint serving two depths is what lets the dashboard's summary band and the
 *       full report share a read; the withheld sections never reach the client, so the
 *       lock is real rather than presentational.
 *     responses:
 *       200:
 *         description: InsightReport, complete or redacted according to plan
 *       403:
 *         description: PLAN_REQUIRED — this plan has no insights at all
 *       404:
 *         description: No insights generated yet
 */
router.get("/latest", requireFeature("insights_summary"), insightsController.getLatestInsight);

/**
 * Both flag routes must stay **above** `GET /:id`.
 *
 * Express matches in declaration order, so registered after it `/insights/flags` binds to
 * `/:id` with `id = "flags"` and dies in `assertValidObjectId` as a 400 about a malformed
 * ObjectId — a confusing failure for a URL that is perfectly valid. `/latest` sits above it
 * for exactly the same reason.
 */

/**
 * @openapi
 * /insights/flags/summary:
 *   get:
 *     tags: [Insights]
 *     summary: Counts and ₹ totals of red flags, grouped by severity, kind, month and category
 *     description: |
 *       Takes the same filters as `GET /insights/flags`, and each cut applies all of them
 *       *except* the dimension it is grouped by — so narrowing to one kind does not reduce
 *       `byKind` to a single bar, and the charts stay usable as controls. `byCategory` has no
 *       filter of its own and applies all three.
 *
 *       `total`, `highCount` and `totalAmount` are always unfiltered: they describe the
 *       account, and back the "at stake" tile and the sidebar badge. `scaleMax` carries each
 *       cut's unfiltered maximum so a filtered chart can keep its scale instead of
 *       re-normalising, which would hide the very narrowing it is showing.
 *     parameters:
 *       - in: query
 *         name: severity
 *         schema: { type: string, enum: [high, medium, low] }
 *       - in: query
 *         name: kind
 *         schema:
 *           type: string
 *           enum: [duplicate_charge, merchant_outlier, category_spike_contributor, fee_or_interest, subscription_price_hike, balance_risk, large_opaque_transfer]
 *       - in: query
 *         name: month
 *         schema: { type: string, example: "2026-03" }
 *     responses:
 *       200:
 *         description: "{ total, highCount, totalAmount, bySeverity, byKind, byMonth, byCategory, scaleMax }"
 */
router.get(
    "/flags/summary",
    requireFeature("flags"),
    validate(flagSummaryQuerySchema, "query"),
    insightsController.getFlagSummary
);

/**
 * @openapi
 * /insights/flags:
 *   get:
 *     tags: [Insights]
 *     summary: Paginated red flags, each joined to the transaction it points at
 *     description: |
 *       Flags are written by the red-flag detectors during the insights pipeline, not by this
 *       endpoint — they are deterministic Mongo aggregations, so every row carries a real
 *       amount, date and transaction id. Ordered by severity then amount descending.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25, maximum: 100 }
 *       - in: query
 *         name: severity
 *         schema: { type: string, enum: [high, medium, low] }
 *       - in: query
 *         name: kind
 *         schema:
 *           type: string
 *           enum: [duplicate_charge, merchant_outlier, category_spike_contributor, fee_or_interest, subscription_price_hike, balance_risk, large_opaque_transfer]
 *       - in: query
 *         name: month
 *         schema: { type: string, example: "2026-03" }
 *     responses:
 *       200:
 *         description: Paginated TransactionFlag rows with an embedded `transaction` (null when it no longer exists)
 */
router.get(
    "/flags",
    requireFeature("flags"),
    validate(listFlagsQuerySchema, "query"),
    insightsController.listFlags
);

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
router.get(
    "/",
    requireFeature("insights_summary"),
    validate(listInsightsQuerySchema, "query"),
    insightsController.listInsights
);

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
router.get("/:id", requireFeature("insights_summary"), insightsController.getInsight);

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
    requireFeature("insights_summary"),
    generateLimiter,
    validate(generateInsightsSchema),
    insightsController.generateInsights
);

export default router;
