import type { Request, Response, NextFunction } from "express";
import { ok } from "../../response.js";
import {
    verifyAdminCredentials,
    signAdminToken,
    ADMIN_SESSION_COOKIE,
    ADMIN_SESSION_MAX_AGE_MS,
} from "../services/admin-auth.service.js";
import type { AdminRequest } from "../middleware/requireAdminAuth.js";

const COOKIE_OPTS = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
};

export async function login(req: Request, res: Response, next: NextFunction) {
    try {
        const { username, password } = req.body as { username: string; password: string };
        const valid = await verifyAdminCredentials(username, password);
        if (!valid) {
            res.status(401).json({ success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password" } });
            return;
        }
        const token = await signAdminToken(username);
        res.cookie(ADMIN_SESSION_COOKIE, token, { ...COOKIE_OPTS, maxAge: ADMIN_SESSION_MAX_AGE_MS });
        ok(res, { username });
    } catch (err) {
        next(err);
    }
}

export function logout(_req: Request, res: Response) {
    res.clearCookie(ADMIN_SESSION_COOKIE, { httpOnly: true, sameSite: "lax", path: "/" });
    ok(res, { success: true });
}

export function me(req: Request, res: Response, next: NextFunction) {
    try {
        ok(res, (req as AdminRequest).adminUser);
    } catch (err) {
        next(err);
    }
}
