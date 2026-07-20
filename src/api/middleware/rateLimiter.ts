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
