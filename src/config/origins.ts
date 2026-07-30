import "../envConfig.js";

/**
 * Browser-facing origin config for the split-domain deployment.
 *
 * Production runs three hosts on one registrable domain:
 *   example.com      — marketing site
 *   app.example.com  — signed-in app
 *   api.example.com  — this API
 *
 * Only the first two ever reach us from a browser, so only those belong in the
 * CORS allowlist and in better-auth's trusted origins.
 */

function parseOriginList(value: string | undefined): string[] {
    return (value ?? "")
        .split(",")
        .map((s) => s.trim().replace(/\/+$/, ""))
        .filter(Boolean);
}

/**
 * Every origin allowed to make a credentialed browser request. Comma-separated
 * in `WEB_ORIGINS`; `FRONTEND_URL` is still honoured as the single-origin form
 * this used before the marketing/app split.
 */
export const WEB_ORIGINS: string[] = (() => {
    const explicit = parseOriginList(process.env.WEB_ORIGINS);
    if (explicit.length > 0) return explicit;
    const legacy = parseOriginList(process.env.FRONTEND_URL);
    return legacy.length > 0 ? legacy : ["http://localhost:3000"];
})();

/**
 * Registrable domain the session cookie is scoped to, leading dot included
 * (".example.com"). This is what lets a cookie *set* by api.example.com be
 * *sent* from app.example.com — without it better-auth scopes the cookie to the
 * baseURL host and the app never sees it.
 *
 * Leave unset on localhost, where the frontend and API already share a hostname
 * (cookies ignore the port, so :3000 and :3001 share one jar).
 */
export const COOKIE_DOMAIN: string | undefined =
    process.env.COOKIE_DOMAIN?.trim() || undefined;
