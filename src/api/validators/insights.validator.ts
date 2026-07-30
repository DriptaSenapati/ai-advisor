import { z } from "zod";

export const generateInsightsSchema = z.object({
    statementId: z.string().optional(),
});

export const listInsightsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(5),
});

/**
 * The seven detector kinds. Enumerated here — unlike `categoryParamSchema`, which
 * deliberately is not — because this set is closed: it is defined by the detectors that
 * exist in `red_flag_detector_tool.ts`, not by anything an LLM wrote. A request for a kind
 * that has no detector is a client bug and should 400 rather than quietly return nothing.
 */
export const FLAG_KINDS = [
    "duplicate_charge",
    "merchant_outlier",
    "category_spike_contributor",
    "fee_or_interest",
    "subscription_price_hike",
    "balance_risk",
    "large_opaque_transfer",
] as const;

/** The three dimensions a flag can be filtered on, shared by the list and the summary. */
export const flagFilterShape = {
    severity: z.enum(["high", "medium", "low"]).optional(),
    kind: z.enum(FLAG_KINDS).optional(),
    month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM format").optional(),
};

export const listFlagsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    ...flagFilterShape,
});

/**
 * The summary takes the same filters as the list, and no pagination — it is an aggregate.
 *
 * Each cut applies these *except* the one it is grouped by, so the charts narrow together
 * without any of them collapsing to the single bar the reader just selected. See
 * `getFlagSummary`.
 */
export const flagSummaryQuerySchema = z.object(flagFilterShape);
