import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/authenticate.js";
import statementsRouter from "./statements.routes.js";
import insightsRouter from "./insights.routes.js";
import goalsRouter from "./goals.routes.js";
import transactionsRouter from "./transactions.routes.js";

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

router.use("/statements", requireAuth, statementsRouter);
router.use("/insights", requireAuth, insightsRouter);
router.use("/goals", requireAuth, goalsRouter);
router.use("/transactions", requireAuth, transactionsRouter);

export default router;
