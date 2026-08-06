import { z } from "zod";
import { SITE_CONTENT_KEYS } from "../../../config/site-content.js";

export const putContentSchema = z.object({
    entries: z
        .array(
            z.object({
                key: z.enum(SITE_CONTENT_KEYS),
                value: z.string().max(2000),
            })
        )
        .min(1)
        .max(SITE_CONTENT_KEYS.length),
});
