import { z } from "zod";
import { PLAN_IDS } from "../../config/plans.js";

/**
 * `PLAN_IDS` is the catalog's own `as const` tuple, so adding a plan there makes
 * it accepted here with no second edit — the same relationship `GOAL_TYPES` has
 * with the goal validator.
 */
export const setPlanSchema = z.object({
    plan: z.enum(PLAN_IDS),
});
