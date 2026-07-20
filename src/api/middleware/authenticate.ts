import type { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../../auth.js";

type BetterAuthUser = {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt: Date;
    updatedAt: Date;
};

type BetterAuthSession = {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
};

export interface AuthenticatedRequest extends Request {
    user: BetterAuthUser;
    session: BetterAuthSession;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
        if (!result) {
            res.status(401).json({
                success: false,
                error: { code: "UNAUTHORIZED", message: "Authentication required" },
            });
            return;
        }
        (req as AuthenticatedRequest).user = result.user as BetterAuthUser;
        (req as AuthenticatedRequest).session = result.session as BetterAuthSession;
        next();
    } catch (err) {
        next(err);
    }
}
