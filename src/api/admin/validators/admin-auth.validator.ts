import { z } from "zod";

export const adminLoginSchema = z.object({
    username: z.string().min(1).max(100),
    password: z.string().min(1).max(256),
});
