import { z } from "zod";

export const listAdminStatementsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    /** Filters normalizerStatus — matches the product API's `/statements` convention. */
    status: z.enum(["Not Started", "Processing", "Completed", "Error"]).optional(),
    /** Filters extractionStatus separately — a statement failed at the gate has
     *  normalizerStatus "Not Started", so `status=Error` alone can never find it. */
    extractionStatus: z.enum(["Processing", "Completed", "Error"]).optional(),
    gate: z.enum(["pending", "approved", "declined"]).optional(),
    bankName: z.string().max(200).optional(),
});
