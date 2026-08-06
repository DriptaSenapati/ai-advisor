import { z } from "zod";

export const listAdminJobsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    jobType: z.enum(["pdf.extract", "pdf.process", "insights.generate", "goal.analyze"]).optional(),
    status: z.enum(["started", "completed", "failed"]).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
});
