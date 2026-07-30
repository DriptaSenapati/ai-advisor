import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { MulterError } from "multer";
import { ApiError } from "../errors.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
    /**
     * Drain whatever is left of the request body before answering.
     *
     * An upload that is rejected mid-stream — wrong type, over the size limit —
     * leaves the client still writing while the server is ready to reply. Node
     * will not deliver a response over a socket with an unread request body
     * pending; it resets the connection instead, and the caller sees a dropped
     * connection rather than the 400 that explains what they did wrong. `curl`
     * reports that as exit status 000, with no server log line at all, because
     * the response never finished.
     */
    if (!req.complete) req.resume();

    /**
     * multer's own errors, which are `Error`s with a `code` and would otherwise
     * fall through to a 500. `LIMIT_FILE_SIZE` in particular is a *user* mistake
     * with an obvious remedy, and telling them "an unexpected error occurred"
     * hides the one fact they need.
     */
    if (err instanceof MulterError) {
        const map: Record<string, { status: number; code: string; message: string }> = {
            LIMIT_FILE_SIZE: {
                status: 413,
                code: "FILE_TOO_LARGE",
                message: "That file is too large",
            },
            LIMIT_FILE_COUNT: { status: 400, code: "TOO_MANY_FILES", message: "Only one file at a time" },
            LIMIT_UNEXPECTED_FILE: {
                status: 400,
                code: "UNEXPECTED_FILE",
                message: `Unexpected file field "${err.field ?? ""}"`,
            },
        };
        const mapped = map[err.code] ?? {
            status: 400,
            code: "UPLOAD_ERROR",
            message: err.message,
        };
        res.status(mapped.status).json({
            success: false,
            error: { code: mapped.code, message: mapped.message },
        });
        return;
    }

    if (err instanceof ApiError) {
        res.status(err.statusCode).json({
            success: false,
            error: { code: err.code, message: err.message, details: err.details },
        });
        return;
    }

    if (err instanceof ZodError) {
        res.status(400).json({
            success: false,
            error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: err.issues },
        });
        return;
    }

    if (err instanceof Error) {
        const prismaCode = (err as unknown as Record<string, unknown>)["code"];
        if (prismaCode === "P2025") {
            res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
            return;
        }

        const { message } = err;
        if (prismaCode === "P2023" || message.includes("Malformed ObjectID") || message.includes("ObjectId must be")) {
            res.status(400).json({ success: false, error: { code: "INVALID_ID", message: "Invalid id format — must be a 24-character hex ObjectId" } });
            return;
        }
        if (message.includes("Duplicate statement")) {
            res.status(409).json({ success: false, error: { code: "DUPLICATE_STATEMENT", message } });
            return;
        }
        if (message.includes("No transactions detected")) {
            res.status(422).json({ success: false, error: { code: "EMPTY_STATEMENT", message } });
            return;
        }
        if (message.includes("No MonthlyStats found") || message.includes("has no period dates")) {
            res.status(424).json({ success: false, error: { code: "PREREQUISITE_MISSING", message } });
            return;
        }
        // The thrown message, not a hardcoded one: two upload paths raise this
        // with different rules — PDFs for statements, JPEG/PNG/WebP for avatars —
        // and this used to tell an avatar uploader they needed a PDF.
        if (message.includes("INVALID_FILE_TYPE")) {
            res.status(400).json({
                success: false,
                error: { code: "INVALID_FILE_TYPE", message: message.replace(/^INVALID_FILE_TYPE:\s*/, "") },
            });
            return;
        }
    }

    const isDev = process.env.NODE_ENV !== "production";
    console.error("[API Error]", err);
    res.status(500).json({
        success: false,
        error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred",
            ...(isDev && err instanceof Error ? { details: err.message } : {}),
        },
    });
}
