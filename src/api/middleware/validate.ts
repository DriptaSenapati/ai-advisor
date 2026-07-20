import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";
import { ValidationError } from "../errors.js";

export function validate(
    schema: ZodType,
    target: "body" | "query" | "params" = "body"
): (req: Request, res: Response, next: NextFunction) => void {
    return (req, _res, next) => {
        const result = schema.safeParse(req[target]);
        if (!result.success) {
            return next(new ValidationError(result.error.issues));
        }
        // Express 5 makes req.query/req.params read-only getters — use defineProperty to override
        if (target === "body") {
            req.body = result.data as Record<string, unknown>;
        } else {
            Object.defineProperty(req, target, {
                value: result.data,
                writable: true,
                configurable: true,
                enumerable: true,
            });
        }
        next();
    };
}
