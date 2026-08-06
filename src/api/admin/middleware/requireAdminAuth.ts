import type { Request, Response, NextFunction } from "express";
import { verifyAdminToken, ADMIN_SESSION_COOKIE, type AdminTokenClaims } from "../services/admin-auth.service.js";

export interface AdminRequest extends Request {
    adminUser: AdminTokenClaims;
}

/** Hand-rolled, same pattern `bullBoardAuth` in `app.ts` already uses for a second auth
 *  scheme in this codebase — no `cookie-parser` dependency needed for one cookie. */
function readCookie(header: string | undefined, name: string): string | null {
    if (!header) return null;
    for (const part of header.split(";")) {
        const eq = part.indexOf("=");
        if (eq === -1) continue;
        if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
    }
    return null;
}

/**
 * Gates every `/api/v1/admin/*` route except `POST /admin/auth/login`. Verifies
 * the `admin_session` JWT cookie directly — this credential has nothing to do
 * with better-auth or the `User` model, so it does not call `requireAuth`.
 */
export async function requireAdminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = readCookie(req.headers.cookie, ADMIN_SESSION_COOKIE);
    if (!token) {
        res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Admin authentication required" } });
        return;
    }
    try {
        const claims = await verifyAdminToken(token);
        (req as AdminRequest).adminUser = claims;
        next();
    } catch {
        res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Admin authentication required" } });
    }
}
