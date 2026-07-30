import { z } from "zod";

export const listRecurringQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    /**
     * `debit` also matches rows with `type: null`. The column was added after the first
     * patterns were written and defaults to `"debit"`, so legacy rows have no value at all —
     * filtering on `type: "debit"` alone silently hides them. Same `OR` the insights node uses.
     */
    type: z.enum(["debit", "credit", "all"]).default("all"),
    /**
     * `all` is not the default. An inactive pattern is usually a *superseded* one — passes 1
     * and 2 of the detector key on the exact debit amount, so a price change leaves the old
     * amount behind as its own row — and showing both by default would double-count every
     * subscription whose price ever moved.
     */
    active: z.enum(["true", "false", "all"]).default("true"),
});

export const recurringTransactionsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
});
