import { Router } from "express";
import * as statementsController from "../controllers/statements.controller.js";
import { validate } from "../middleware/validate.js";
import { uploadLimiter } from "../middleware/rateLimiter.js";
import { uploadMiddleware } from "../middleware/upload.js";
import { requireAuth } from "../middleware/authenticate.js";
import {
    uploadStatementSchema,
    listStatementsQuerySchema,
    listTransactionsQuerySchema,
} from "../validators/statements.validator.js";

const router = Router();

/**
 * @openapi
 * /statements/upload:
 *   post:
 *     tags: [Statements]
 *     summary: Upload a bank statement PDF
 *     description: Accepts a PDF file and bankName. Starts processing pipeline asynchronously. Returns statementId immediately — poll /statements/{id}/status to track progress.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, bankName]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: PDF bank statement (max 20 MB)
 *               bankName:
 *                 type: string
 *                 example: HDFC
 *     responses:
 *       202:
 *         description: Processing started
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AcceptedResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         description: Duplicate statement
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 */
router.post(
    "/upload",
    uploadLimiter,
    uploadMiddleware,
    validate(uploadStatementSchema),
    statementsController.uploadStatement
);

/**
 * @openapi
 * /statements:
 *   get:
 *     tags: [Statements]
 *     summary: List all statements
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *       - in: query
 *         name: bankName
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Processing, Completed, Error] }
 *     responses:
 *       200:
 *         description: Paginated statement list
 */
router.get("/", validate(listStatementsQuerySchema, "query"), statementsController.listStatements);

/**
 * @openapi
 * /statements/{id}:
 *   get:
 *     tags: [Statements]
 *     summary: Get a single statement
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: StatementMetadata record
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
/**
 * @openapi
 * /statements/{id}/progress:
 *   get:
 *     tags: [Statements]
 *     summary: SSE stream for real-time processing progress
 *     description: Server-Sent Events endpoint. Opens a persistent connection and pushes stage/pct events as the pipeline runs.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: SSE stream (text/event-stream)
 */
router.get("/:id/progress", requireAuth, statementsController.streamProgress);

router.get("/:id", statementsController.getStatement);

/**
 * @openapi
 * /statements/{id}/status:
 *   get:
 *     tags: [Statements]
 *     summary: Poll processing status
 *     description: Returns normalizerStatus, categorizationStatus, and insightsStatus. Poll until all are "Completed".
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Status fields
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/:id/status", statementsController.getStatementStatus);

/**
 * @openapi
 * /statements/{id}/transactions:
 *   get:
 *     tags: [Statements]
 *     summary: List transactions for a statement
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [all, debit, credit], default: all }
 *       - in: query
 *         name: month
 *         schema: { type: string, example: "2025-04" }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated transaction list
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
    "/:id/transactions",
    validate(listTransactionsQuerySchema, "query"),
    statementsController.listStatementTransactions
);

/**
 * @openapi
 * /statements/{id}:
 *   delete:
 *     tags: [Statements]
 *     summary: Delete a statement and all its data
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
router.delete("/:id", statementsController.deleteStatement);

export default router;
