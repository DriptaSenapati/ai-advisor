import { Router } from "express";
import * as txnController from "../controllers/transactions.controller.js";
import { validate } from "../middleware/validate.js";
import { requireFeature } from "../middleware/entitlement.js";
import {
    listTransactionsGlobalQuerySchema,
    listMerchantsQuerySchema,
    categoryParamSchema,
} from "../validators/goals.validator.js";

const router = Router();

/**
 * **`GET /transactions/summary` is deliberately not gated**, even though the
 * Monthly dashboard view is a paid feature. That one endpoint backs *both*
 * dashboard views — the Overall view's stat cards and category ring are sums
 * over the same `MonthlyStats` rows — so withholding it from a free user would
 * break a screen they are entitled to. The Monthly/Overall split is therefore
 * enforced in the UI alone, and is the only presentational gate in the product.
 * Anything genuinely paid has an endpoint of its own; keep it that way.
 */

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
 * /transactions/categories/{category}:
 *   get:
 *     tags: [Transactions]
 *     summary: One category's full history — monthly series, merchants, largest transactions
 *     description: >
 *       Backs the category drill-down. The monthly series is read back off MonthlyStats
 *       (so momDelta / rollingAvg6m / isSpiked are the same values the dashboard rendered,
 *       not a second derivation), with absent months emitted as explicit zeroes.
 *       Per-merchant spend is aggregated here because neither Cluster nor
 *       MonthlyStats.topMerchants can answer it — the former holds no money, the latter
 *       is a per-month top ten that omits the long tail.
 *       An unknown category returns 200 with zeroes rather than 404.
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema: { type: string, maxLength: 64 }
 *         example: "Food & Dining"
 *     responses:
 *       200:
 *         description: Category detail
 */
router.get(
    "/categories/:category",
    requireFeature("category_baseline"),
    validate(categoryParamSchema, "params"),
    txnController.getCategoryDetail
);

/**
 * @openapi
 * /transactions/merchants:
 *   get:
 *     tags: [Transactions]
 *     summary: Who the money goes to, ranked by total spend
 *     description: >
 *       Counterparties across every statement, ranked by money rather than by transaction
 *       count. `name` falls back merchantName → payeeName → cluster centroid, and `kind`
 *       says which was used — merchantName is deliberately null for rent, EMI and P2P
 *       transfers, so a merchantName-only list omits exactly those.
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25, maximum: 100 }
 *     responses:
 *       200:
 *         description: "[{ name, kind, category, totalSpend, txnCount, avgTxnAmount, lastDate }]"
 */
router.get("/merchants", validate(listMerchantsQuerySchema, "query"), txnController.getMerchants);

/**
 * @openapi
 * /transactions/payee-aliases:
 *   get:
 *     tags: [Transactions]
 *     summary: Which payee spellings were folded into which
 *     description: >
 *       Provenance for `payeeCanonicalizerTool`. Keyed by the surviving name, so a client
 *       holding a payee name can look it up directly and show what was merged into it.
 *       Returns `{}` for an account where nothing has ever merged.
 *
 *       One call rather than widening every endpoint that renders a counterparty: payee names
 *       surface on the dashboard, the recurring screen, the flag list and the category
 *       drill-down, and threading an alias array through all four responses would put the same
 *       join in four places and still miss the fifth.
 *     responses:
 *       200:
 *         description: "{ [canonical]: { totalTxns, aliases: [{ name, txnCount }] } }"
 */
router.get("/payee-aliases", txnController.getPayeeAliases);

/**
 * @openapi
 * /transactions/rhythm:
 *   get:
 *     tags: [Transactions]
 *     summary: Months whose spending rhythm broke this user's own pattern
 *     description: >
 *       The "when it goes out" panel shows all-time totals, which is precisely where an
 *       anomaly hides — summed across a year, one inverted month is a rounding error. This
 *       names the months where the weekday/weekend split flipped, or where a different week
 *       of the month led the spending than usually leads it.
 *
 *       Robust (median + IQR) so one extreme month cannot define the baseline it is then
 *       measured against, and read-time rather than persisted on `MonthlyStats`: "unusual for
 *       this user" is a fact about the whole set and changes as months arrive.
 *
 *       Empty until there are at least four months to compare.
 *     responses:
 *       200:
 *         description: "{ anomalies: [{ month, kind, value, baseline, deviation, week?, usualWeek? }], monthsCompared }"
 */
router.get("/rhythm", txnController.getSpendingRhythm);

export default router;
