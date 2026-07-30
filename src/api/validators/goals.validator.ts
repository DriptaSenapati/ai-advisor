import { z } from "zod";

const GOAL_TYPES = ["save_amount", "reduce_category", "emergency_fund", "debt_payoff"] as const;

const CATEGORIES = [
    "Food & Dining", "Groceries", "Transport", "Shopping", "Bills & Utilities",
    "Health & Medical", "Entertainment & Subscriptions", "Education",
    "Travel & Accommodation", "Finance & Investments", "Transfers & Payments", "Other",
] as const;

/**
 * `goalType` is optional because the composer no longer asks for it.
 *
 * The screen takes one sentence — "I want to _ costing ₹_ by _" — and the intent gate node
 * derives `goalType` and `categoryTarget` from that text before the simulation runs. Three
 * dropdowns asking what the sentence already said would be a worse form. A caller that does
 * send `goalType` still gets the old contract, including the `reduce_category` refine, which
 * is why that check is now conditional on the field being present at all.
 *
 * `force` steps over the stale-statement guard. It is honoured outside production only —
 * `goals.service.ts` decides, never the client — and is a testing affordance, not a feature.
 */
export const createGoalSchema = z.object({
    title: z.string().trim().min(3, "Say a little more about the goal").max(120).optional(),
    goalType: z.enum(GOAL_TYPES).optional(),
    targetAmount: z.number().positive("targetAmount must be positive"),
    deadline: z.string().datetime("deadline must be a valid ISO datetime"),
    categoryTarget: z.enum(CATEGORIES).optional(),
    force: z.boolean().optional(),
}).refine(
    (d) => d.title !== undefined || d.goalType !== undefined,
    { message: "Either title or goalType is required", path: ["title"] }
).refine(
    (d) => d.goalType !== "reduce_category" || !!d.categoryTarget,
    { message: "categoryTarget is required when goalType is reduce_category", path: ["categoryTarget"] }
);

export const analyzeGoalSchema = z.object({
    force: z.boolean().optional(),
});

export const updateGoalSchema = z.object({
    title: z.string().trim().min(3).max(120).optional(),
    goalType: z.enum(GOAL_TYPES).optional(),
    targetAmount: z.number().positive().optional(),
    deadline: z.string().datetime().optional(),
    categoryTarget: z.enum(CATEGORIES).optional(),
    status: z.enum(["active", "completed", "cancelled"]).optional(),
});

/**
 * `checking` is listable because a stuck check should be visible.
 *
 * It is the window between the composer submitting and the gate ruling, normally a second or
 * two. If the worker dies inside it the goal would otherwise be invisible under every filter
 * — present in the database, absent from the screen, with nothing to explain the gap.
 */
export const listGoalsQuerySchema = z.object({
    status: z.enum(["active", "checking", "completed", "all"]).default("active"),
});

export const listTransactionsGlobalQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM format").optional(),
    category: z.string().optional(),
    minAmount: z.coerce.number().min(0).optional(),
    maxAmount: z.coerce.number().min(0).optional(),
});

export const listMerchantsQuerySchema = z.object({
    category: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * Not `z.enum(CATEGORIES)`, deliberately.
 *
 * The stored value is whatever `llmCategoryNode` wrote, which includes the
 * synthetic `"Uncategorized"` and the `"Other"` that `statsAggregatorTool`
 * substitutes for an unclustered transaction — neither of which is in the list
 * above, and both of which appear as real bars on the dashboard. Enumerating
 * would 400 exactly the drill-downs a user is most likely to want explained.
 * The bound is on length only; the value reaches Mongo as an equality operand,
 * never as anything interpolated.
 */
export const categoryParamSchema = z.object({
    category: z.string().min(1).max(64),
});
