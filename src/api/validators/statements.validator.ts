import { z } from "zod";

export const uploadStatementSchema = z.object({
    bankName: z.string().optional(),
    password: z.string().optional(),
});

export const listStatementsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    bankName: z.string().optional(),
    status: z.enum(["Processing", "Completed", "Error"]).optional(),
});

export const listTransactionsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    type: z.enum(["all", "debit", "credit"]).default("all"),
    month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM format").optional(),
    category: z.string().optional(),
});
