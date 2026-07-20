import { z } from "zod";

const GOAL_TYPES = ["save_amount", "reduce_category", "emergency_fund", "debt_payoff"] as const;

const CATEGORIES = [
    "Food & Dining", "Groceries", "Transport", "Shopping", "Bills & Utilities",
    "Health & Medical", "Entertainment & Subscriptions", "Education",
    "Travel & Accommodation", "Finance & Investments", "Transfers & Payments", "Other",
] as const;

export const createGoalSchema = z.object({
    goalType: z.enum(GOAL_TYPES),
    targetAmount: z.number().positive("targetAmount must be positive"),
    deadline: z.string().datetime("deadline must be a valid ISO datetime"),
    categoryTarget: z.enum(CATEGORIES).optional(),
}).refine(
    (d) => d.goalType !== "reduce_category" || !!d.categoryTarget,
    { message: "categoryTarget is required when goalType is reduce_category", path: ["categoryTarget"] }
);

export const updateGoalSchema = z.object({
    goalType: z.enum(GOAL_TYPES).optional(),
    targetAmount: z.number().positive().optional(),
    deadline: z.string().datetime().optional(),
    categoryTarget: z.enum(CATEGORIES).optional(),
    status: z.enum(["active", "completed", "cancelled"]).optional(),
});

export const listGoalsQuerySchema = z.object({
    status: z.enum(["active", "completed", "all"]).default("active"),
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
});
