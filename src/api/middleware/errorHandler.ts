import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { ApiError } from "../errors.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
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
        if (message.includes("INVALID_FILE_TYPE")) {
            res.status(400).json({ success: false, error: { code: "INVALID_FILE_TYPE", message: "Only PDF files are accepted" } });
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
