import "./envConfig.js";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./prismaClient.js";
import { COOKIE_DOMAIN, WEB_ORIGINS } from "./config/origins.js";

if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET environment variable is required");
}

/**
 * Google is registered only when both halves of the credential are present.
 *
 * Registering it with a missing clientId would produce a provider that fails at
 * the redirect, mid-flow, after the user has already clicked. Leaving it
 * unregistered instead makes `/sign-in/social` answer 404 `PROVIDER_NOT_FOUND`,
 * which the frontend already maps to "Google sign-in isn't switched on yet" —
 * a truthful message, shown before anyone leaves the page. So an environment
 * without the credentials degrades to email/password rather than breaking.
 *
 * The redirect URI to authorise in the Google Cloud console is
 * `{BETTER_AUTH_URL}/api/auth/callback/google` — better-auth derives it from
 * baseURL and the mount path in `src/api/app.ts` (`/api/auth/*splat`).
 */
const google =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }
        : null;

if (!google) {
    console.warn(
        "[auth] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set — Google sign-in is disabled."
    );
}

export const auth = betterAuth({
    database: prismaAdapter(prisma, { provider: "mongodb" }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? `http://localhost:${process.env.PORT ?? 3001}`,
    emailAndPassword: {
        enabled: true,
        minPasswordLength: 10,
    },
    /**
     * Account linking is left at better-auth's defaults, which are the safe
     * ones, and that has a consequence worth knowing before it surprises you.
     *
     * `accountLinking.requireLocalEmailVerified` defaults to `true`. This app
     * has no email-verification flow, so every email/password signup stores
     * `User.emailVerified: false`. The linking check in better-auth's
     * `oauth2/link-account.mjs` reads:
     *
     *     requireLocalEmailVerified && !dbUser.user.emailVerified  →  refuse
     *
     * So somebody who registered with a password and later clicks "Continue
     * with Google" on that same address is refused with `account_not_linked`,
     * rather than having the two identities merged. Google sign-ups that have
     * never used a password are unaffected — the common path works.
     *
     * The only switch that changes this is `requireLocalEmailVerified: false`,
     * and it is deliberately not set: it would let anyone who pre-registers an
     * unverified account at someone else's address absorb that person's Google
     * identity into the attacker-owned row on their first sign-in. better-auth
     * documents it as a takeover risk and has already deprecated it — the gate
     * becomes unconditional next minor. `trustedProviders` does not help here
     * either; it only bypasses the *provider's* email-verified claim, which is
     * a separate clause of the same condition.
     *
     * The real fix, if this path matters, is an email-verification flow — the
     * `Verification` model and better-auth's `sendVerificationEmail` already
     * exist for it. Until then this is a known, safe limitation.
     */
    socialProviders: google ? { google } : {},
    trustedOrigins: WEB_ORIGINS,
    session: {
        expiresIn: 60 * 60 * 24 * 7,        // 7 days
        updateAge: 60 * 60 * 24,             // refresh session if older than 24h
    },
    /**
     * Cross-subdomain session cookie. Enabling the flag alone is not enough:
     * better-auth falls back to `new URL(baseURL).hostname` when `domain` is
     * omitted, which is api.example.com — a host-only cookie the app would
     * never receive. The domain has to be spelled out.
     *
     * `secure` and the __Secure- name prefix follow from baseURL being https,
     * and the default SameSite=Lax is sufficient because app.example.com and
     * api.example.com share a registrable domain — they are same-site. That is
     * what keeps EventSource working: SSE cannot send an Authorization header,
     * so the cookie is its only credential.
     */
    advanced: COOKIE_DOMAIN
        ? { crossSubDomainCookies: { enabled: true, domain: COOKIE_DOMAIN } }
        : undefined,
    plugins: [
        bearer(),   // enables Authorization: Bearer <token> for API clients
    ],
});

export type Auth = typeof auth;
