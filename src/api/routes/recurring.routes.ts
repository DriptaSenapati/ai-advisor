import { Router } from "express";
import * as recurringController from "../controllers/recurring.controller.js";
import { validate } from "../middleware/validate.js";
import { listRecurringQuerySchema, recurringTransactionsQuerySchema } from "../validators/recurring.validator.js";

const router = Router();

/**
 * `/summary` is declared before `/:id/transactions` for the usual reason — a literal segment
 * that a parameterised route could also match has to come first.
 */

/**
 * @openapi
 * /recurring/summary:
 *   get:
 *     tags: [Recurring]
 *     summary: Committed monthly spend, income floor, and detected subscription price changes
 *     description: |
 *       `committedMonthly` counts active debits only, normalised to a monthly figure
 *       (a quarterly ₹3,000 charge contributes ₹1,000). Inactive rows are excluded because a
 *       subscription whose price changed leaves its old amount behind as a separate row —
 *       counting both would double it. That same artefact is what `priceChanges` reads.
 *
 *       `incomeFloor` sums each active credit pattern's `rangeMin` (the bottom of its IQR
 *       band), so it is the amount the user can rely on rather than what they average.
 *     responses:
 *       200:
 *         description: "{ committedMonthly, cancellableMonthly, annualisedCancellable, byCancellability, byCreditLabel, incomeFloor, incomeMedian, counts, priceChanges }"
 */
router.get("/summary", recurringController.getRecurringSummary);

/**
 * @openapi
 * /recurring:
 *   get:
 *     tags: [Recurring]
 *     summary: Recurring debit and credit patterns
 *     description: |
 *       Returns full `RecurringPattern` rows — including `id` and `lastTransactionDate`, both
 *       of which `chartData.recurringPatterns` drops — plus a derived `nextExpectedDate`,
 *       `name` (merchant → payee) and `kind`.
 *
 *       `type=debit` also matches rows whose `type` is null: the column carries a write-time
 *       default and predates the first patterns, so documents written before it have no value.
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [debit, credit, all], default: all }
 *       - in: query
 *         name: active
 *         schema: { type: string, enum: ["true", "false", "all"], default: "true" }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100, maximum: 200 }
 *     responses:
 *       200:
 *         description: Paginated RecurringPattern rows, highest estimated amount first
 */
router.get("/", validate(listRecurringQuerySchema, "query"), recurringController.listRecurring);

/**
 * @openapi
 * /recurring/{id}/transactions:
 *   get:
 *     tags: [Recurring]
 *     summary: The transactions a pattern was detected from
 *     description: |
 *       Nothing links a pattern to its occurrences — `RecurringPattern` stores no transaction
 *       ids — so this reconstructs the detector's own predicate: name plus the exact amount
 *       for a debit, name or cluster alone for a credit (income varies and is matched on an
 *       IQR range). The two must change together.
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
 *         schema: { type: integer, default: 25, maximum: 100 }
 *     responses:
 *       200:
 *         description: Paginated transactions, newest first
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
    "/:id/transactions",
    validate(recurringTransactionsQuerySchema, "query"),
    recurringController.getRecurringTransactions
);

export default router;
