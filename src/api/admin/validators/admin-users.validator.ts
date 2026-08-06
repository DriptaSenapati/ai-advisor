import { z } from "zod";
import { PLAN_IDS } from "../../../config/plans.js";

export const listAdminUsersQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().max(200).optional(),
});

export const setAdminUserPlanSchema = z.object({
    plan: z.enum(PLAN_IDS),
});
