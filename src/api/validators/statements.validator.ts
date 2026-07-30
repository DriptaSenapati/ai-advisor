import { z } from "zod";

export const uploadStatementSchema = z.object({
    bankName: z.string().optional(),
    password: z.string().optional(),
});

export const listStatementsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    bankName: z.string().optional(),
    // Filters `normalizerStatus`. Since the two-phase split "Not Started" is the
    // resting state at the Illuminate gate, not an unreached one.
    status: z.enum(["Not Started", "Processing", "Completed", "Error"]).optional(),
    // The user's answer at the gate. `gate=pending` is what the dashboard counts.
    gate: z.enum(["pending", "approved", "declined"]).optional(),
});

/**
 * `.default({})` is load-bearing, not decoration. Express 5 leaves `req.body`
 * **undefined** when a request carries no JSON content-type, and declining is
 * expected to be sent with no body at all — without the default, the commonest
 * call would fail validation with "expected object, received undefined".
 */
export const declineStatementSchema = z
    .object({
        // Optional throughout: declining needs no justification, and demanding one
        // would make the cheap exit expensive. Bounded only so the audit row can't
        // be used as free storage.
        reason: z.string().trim().max(300).optional(),
    })
    .default({});

/**
 * Retrying a locked PDF. The password is the whole request — the file is already
 * on the server, which is the point of the endpoint.
 *
 * Not trimmed: a PDF password is a literal byte sequence and a leading or
 * trailing space in one is a legitimate, if unkind, choice by the bank. Bounded
 * because mupdf will not thank us for a megabyte of it.
 */
export const unlockStatementSchema = z.object({
    password: z.string().min(1, "Enter the password your bank uses to lock the file.").max(256),
});

export const listTransactionsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    type: z.enum(["all", "debit", "credit"]).default("all"),
    month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM format").optional(),
    category: z.string().optional(),
});
