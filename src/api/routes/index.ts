import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/authenticate.js";
import { requireFeature } from "../middleware/entitlement.js";
import statementsRouter from "./statements.routes.js";
import insightsRouter from "./insights.routes.js";
import goalsRouter from "./goals.routes.js";
import transactionsRouter from "./transactions.routes.js";
import recurringRouter from "./recurring.routes.js";
import usersRouter from "./users.routes.js";
import plansRouter from "./plans.routes.js";
import contentRouter from "./content.routes.js";
import testimonialsRouter from "./testimonials.routes.js";
import uatRouter from "./uat.routes.js";

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Health check
 *     responses:
 *       200:
 *         description: Server is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: ok }
 *                 version: { type: string, example: "1.0.0" }
 *                 timestamp: { type: string, format: date-time }
 */
router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", version: "1.0.0", timestamp: new Date().toISOString() });
});

/**
 * The plan catalog is public, like `/health` — deliberately mounted above the
 * `requireAuth` block below. The pricing page is a static marketing route with
 * no session, and it renders from this; requiring auth here would force the
 * prices back into a hardcoded copy in the frontend, which is the duplication
 * this endpoint exists to remove.
 */
router.use("/plans", plansRouter);

/**
 * Curated marketing copy — public like `/plans`, for the same reason: the
 * marketing site has no session, and this is what an admin-editable hero
 * headline/CTA/footer blurb renders from instead of a hardcoded string.
 */
router.use("/content", contentRouter);
router.use("/testimonials", testimonialsRouter);

/**
 * UAT testing surface — public like `/plans`, entirely gated internally by
 * UAT_TESTING_FLAG (src/config/uat.ts). Every route here 404s unconditionally
 * when the flag is off, rather than being un-mounted, so a stale bookmark
 * gets a clean 404 instead of a route that doesn't exist at the Express level.
 */
router.use("/uat", uatRouter);

/**
 * Two routers are gated whole, at the mount, because every endpoint under them
 * belongs to one feature. The rest carry their guards per-route — `/insights`
 * especially, where `latest` is *projected* by plan rather than refused, so that
 * one endpoint can serve the Glow summary band and the Radiant report.
 */
router.use("/statements", requireAuth, statementsRouter);
router.use("/insights", requireAuth, insightsRouter);
router.use("/goals", requireAuth, requireFeature("goals"), goalsRouter);
router.use("/transactions", requireAuth, transactionsRouter);
router.use("/recurring", requireAuth, requireFeature("recurring"), recurringRouter);
router.use("/users", requireAuth, usersRouter);

export default router;
