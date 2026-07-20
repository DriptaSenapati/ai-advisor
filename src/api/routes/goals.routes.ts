import { Router } from "express";
import * as goalsController from "../controllers/goals.controller.js";
import { validate } from "../middleware/validate.js";
import { analyzeLimiter } from "../middleware/rateLimiter.js";
import { createGoalSchema, updateGoalSchema, listGoalsQuerySchema } from "../validators/goals.validator.js";

const router = Router();

/**
 * @openapi
 * /goals:
 *   get:
 *     tags: [Goals]
 *     summary: List goals
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, completed, all], default: active }
 *     responses:
 *       200:
 *         description: Goal list
 */
router.get("/", validate(listGoalsQuerySchema, "query"), goalsController.listGoals);

/**
 * @openapi
 * /goals:
 *   post:
 *     tags: [Goals]
 *     summary: Create a new goal
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [goalType, targetAmount, deadline]
 *             properties:
 *               goalType:
 *                 type: string
 *                 enum: [save_amount, reduce_category, emergency_fund, debt_payoff]
 *               targetAmount:
 *                 type: number
 *                 example: 100000
 *               deadline:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-12-31T00:00:00Z"
 *               categoryTarget:
 *                 type: string
 *                 description: Required when goalType is reduce_category
 *     responses:
 *       201:
 *         description: Goal created
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post("/", validate(createGoalSchema), goalsController.createGoal);

/**
 * @openapi
 * /goals/{id}:
 *   get:
 *     tags: [Goals]
 *     summary: Get a goal including simulationResult from last analysis
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Goal with simulationResult
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/:id", goalsController.getGoal);

/**
 * @openapi
 * /goals/{id}:
 *   patch:
 *     tags: [Goals]
 *     summary: Update a goal
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               targetAmount: { type: number }
 *               deadline: { type: string, format: date-time }
 *               categoryTarget: { type: string }
 *               status: { type: string, enum: [active, completed, cancelled] }
 *     responses:
 *       200:
 *         description: Updated goal
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch("/:id", validate(updateGoalSchema), goalsController.updateGoal);

/**
 * @openapi
 * /goals/{id}:
 *   delete:
 *     tags: [Goals]
 *     summary: Delete a goal
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete("/:id", goalsController.deleteGoal);

/**
 * @openapi
 * /goals/{id}/analyze:
 *   post:
 *     tags: [Goals]
 *     summary: Trigger Monte Carlo simulation + LLM analysis for a goal
 *     description: Runs asynchronously. Returns 202 immediately. Poll GET /goals/{id} — simulationResult populates when done.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       202:
 *         description: Analysis started
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 */
router.post("/:id/analyze", analyzeLimiter, goalsController.analyzeGoal);

export default router;
