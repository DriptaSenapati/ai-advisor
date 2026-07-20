import { z } from "zod";

export const generateInsightsSchema = z.object({
    statementId: z.string().optional(),
});

export const listInsightsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(5),
});
