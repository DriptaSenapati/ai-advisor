import type { Response } from "express";

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>, statusCode = 200): void {
    const body: Record<string, unknown> = { success: true, data };
    if (meta) body.meta = { ...meta, timestamp: new Date().toISOString() };
    res.status(statusCode).json(body);
}

export function created<T>(res: Response, data: T): void {
    ok(res, data, undefined, 201);
}

export function accepted<T>(res: Response, data: T): void {
    ok(res, data, undefined, 202);
}
