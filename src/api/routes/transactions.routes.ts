import { Router } from "express";
import * as txnController from "../controllers/transactions.controller.js";
import { validate } from "../middleware/validate.js";
import { listTransactionsGlobalQuerySchema, listMerchantsQuerySchema } from "../validators/goals.validator.js";

const router = Router();

/**
 * @openapi
 * /transactions:
 *   get:
 *     tags: [Transactions]
 *     summary: List all transactions across statements (paginated)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - in: query
 *         name: month
 *         schema: { type: string, example: "2025-04" }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: minAmount
 *         schema: { type: number }
 *       - in: query
 *         name: maxAmount
 *         schema: { type: number }
 *     responses:
 *       200:
 *         description: Paginated transaction list
 */
router.get("/", validate(listTransactionsGlobalQuerySchema, "query"), txnController.listTransactions);

/**
 * @openapi
 * /transactions/summary:
 *   get:
 *     tags: [Transactions]
 *     summary: Monthly aggregated stats for all months
 *     responses:
 *       200:
 *         description: Array of MonthlyStats ordered by month ascending
 */
router.get("/summary", txnController.getMonthlyStats);

/**
 * @openapi
 * /transactions/categories:
 *   get:
 *     tags: [Transactions]
 *     summary: Aggregated category totals across all months
 *     responses:
 *       200:
 *         description: Category breakdown sorted by totalSpend desc
 */
router.get("/categories", txnController.getCategoryBreakdown);

/**
 * @openapi
 * /transactions/merchants:
 *   get:
 *     tags: [Transactions]
 *     summary: Merchant cluster list
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Cluster records (merchantName not null) sorted by transaction count desc
 */
router.get("/merchants", validate(listMerchantsQuerySchema, "query"), txnController.getMerchants);

export default router;
