import rateLimit from "express-rate-limit";

const fmt = (code: string, message: string) =>
    ({ success: false, error: { code, message } });

export const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: fmt("RATE_LIMITED", "Too many requests, please try again later"),
});

export const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: fmt("UPLOAD_RATE_LIMITED", "Upload limit (10/hour) exceeded"),
});

/**
 * Avatars are cheap to process but write a file per request, so the cap is about
 * disk rather than compute — generous enough that nobody fiddling with their
 * picture hits it, tight enough that a loop cannot fill the volume.
 */
export const avatarLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: fmt("AVATAR_RATE_LIMITED", "Avatar upload limit (20/hour) exceeded"),
});

/**
 * Guards phase 2 of an upload — the expensive half. Mirrors `uploadLimiter`
 * because the two are one action from the user's point of view, split across two
 * requests by the Illuminate gate. Declining needs no limiter of its own: it
 * enqueues nothing, so the global 100/min is enough.
 */
export const processLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: fmt("PROCESS_RATE_LIMITED", "Processing limit (10/hour) exceeded"),
});

export const generateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: fmt("GENERATE_RATE_LIMITED", "Insights generation limit (5/hour) exceeded"),
});

export const analyzeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: fmt("ANALYZE_RATE_LIMITED", "Goal analysis limit (10/hour) exceeded"),
});

/**
 * Guards `POST /admin/auth/login` specifically — the highest-value
 * brute-force target in the admin panel, tighter than every limiter above.
 */
export const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: fmt("ADMIN_LOGIN_RATE_LIMITED", "Too many login attempts, please try again later"),
});
