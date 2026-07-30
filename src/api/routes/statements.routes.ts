import { Router } from "express";
import * as statementsController from "../controllers/statements.controller.js";
import { validate } from "../middleware/validate.js";
import { processLimiter, uploadLimiter } from "../middleware/rateLimiter.js";
import { uploadMiddleware } from "../middleware/upload.js";
import { requireAuth } from "../middleware/authenticate.js";
import {
    uploadStatementSchema,
    listStatementsQuerySchema,
    listTransactionsQuerySchema,
    declineStatementSchema,
    unlockStatementSchema,
} from "../validators/statements.validator.js";

const router = Router();

/**
 * @openapi
 * /statements/upload:
 *   post:
 *     tags: [Statements]
 *     summary: Upload a bank statement PDF
 *     description: |
 *       Accepts a PDF file and bankName, and starts **extraction only** — phase 1 of two.
 *       The statement is read (bank, account, period, raw row count) and then waits.
 *       Categorisation and insights do not run until the user confirms via
 *       `POST /statements/{id}/process`. Returns statementId immediately — poll
 *       /statements/{id}/status to track progress.
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
 *       403:
 *         $ref: '#/components/responses/PlanRequired'
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
 *         description: Filters normalizerStatus. "Not Started" is the resting state at the Illuminate gate.
 *         schema: { type: string, enum: [Not Started, Processing, Completed, Error] }
 *       - in: query
 *         name: gate
 *         description: The user's answer at the Illuminate gate. Use gate=pending to count statements awaiting a decision.
 *         schema: { type: string, enum: [pending, approved, declined] }
 *     responses:
 *       200:
 *         description: Paginated statement list
 */
router.get("/", validate(listStatementsQuerySchema, "query"), statementsController.listStatements);

/**
 * @openapi
 * /statements/{id}/process:
 *   post:
 *     tags: [Statements]
 *     summary: Illuminate — authorise phase 2 of the pipeline
 *     description: |
 *       Starts normalisation, balance analysis, categorisation and insights for a
 *       statement that has finished extracting. This is the gate: nothing after
 *       extraction runs until it is called. Records an "approved" decision.
 *
 *       A previously declined statement may be approved — decline is reversible.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       202:
 *         description: Processing started
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: |
 *           NOT_EXTRACTED (still reading), EXTRACTION_FAILED (unreadable PDF), or
 *           ALREADY_STARTED (idempotency — processing is already under way).
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 */
router.post("/:id/process", processLimiter, statementsController.startProcessing);

/**
 * @openapi
 * /statements/{id}/decline:
 *   post:
 *     tags: [Statements]
 *     summary: Decline to illuminate, for now
 *     description: |
 *       Records that the user chose not to process this statement. Nothing is
 *       enqueued and nothing is deleted — the statement stays at the gate and can
 *       be approved later via /statements/{id}/process. To remove it entirely,
 *       use DELETE /statements/{id}.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, maxLength: 300 }
 *     responses:
 *       200:
 *         description: Decision recorded
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: NOT_EXTRACTED, EXTRACTION_FAILED, or ALREADY_STARTED
 */
router.post("/:id/decline", validate(declineStatementSchema), statementsController.declineProcessing);

/**
 * @openapi
 * /statements/{id}/unlock:
 *   post:
 *     tags: [Statements]
 *     summary: Retry a password-protected statement
 *     description: |
 *       Re-runs extraction for a statement that failed with
 *       "incorrect or missing password", using the password supplied here and the
 *       upload the worker kept for exactly this purpose. No file is sent: the same
 *       statement id, and therefore the same content hash, survives the retry.
 *
 *       Only statements whose upload is still held can be retried this way —
 *       `awaitingPassword` on the statement says whether that is so.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string, maxLength: 256 }
 *     responses:
 *       202:
 *         description: Extraction re-queued
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: |
 *           SOURCE_UNAVAILABLE — the original upload is no longer held, so the
 *           file has to be sent again through POST /statements/upload.
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 */
router.post(
    "/:id/unlock",
    // The upload limiter, not the process one: this re-runs extraction, which is
    // what an upload costs, and it would otherwise be an unmetered way to run it.
    uploadLimiter,
    validate(unlockStatementSchema),
    statementsController.unlockStatement
);

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
