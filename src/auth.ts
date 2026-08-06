import "./envConfig.js";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./prismaClient.js";
import { COOKIE_DOMAIN, WEB_ORIGINS } from "./config/origins.js";
import { sendMail } from "./lib/mailer.js";
import { renderVerificationEmail } from "./emails/verification-email.js";
import { renderResetPasswordEmail } from "./emails/reset-password-email.js";

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
        // A signup no longer gets a session until the address is confirmed —
        // see `emailVerification` below for the actual send.
        requireEmailVerification: true,
        /**
         * "Forgot password?" — `POST /request-password-reset` calls this with a
         * one-hour token already embedded in `url`; the frontend's
         * `/reset-password` page reads the token back off the query string once
         * better-auth's own `GET /reset-password/:token` redirect lands there.
         * Deliberately silent about whether the address has an account —
         * better-auth's endpoint always answers the same "check your inbox"
         * message either way, and this function is only ever called for a real
         * one, so no branching is needed here.
         */
        sendResetPassword: async ({ user, url }) => {
            const { subject, html, text } = renderResetPasswordEmail({ name: user.name, url });
            await sendMail({ to: user.email, subject, html, text });
        },
        resetPasswordTokenExpiresIn: 60 * 60, // 1h — shorter than email verification's 24h, since this grants account access
        /**
         * Every other session is killed the moment a password reset succeeds.
         * If the reset was triggered by an attacker who guessed their way into
         * the mailbox rather than by the account owner, this is what actually
         * locks the *previous* attacker's session out rather than leaving both
         * of them signed in side by side.
         */
        revokeSessionsOnPasswordReset: true,
    },
    /**
     * Every email/password signup now goes through a real confirmation link
     * (`src/emails/verification-email.ts`, sent via `src/lib/mailer.ts`'s
     * Nodemailer/SMTP transport). `sendOnSignUp` covers the normal case;
     * `sendOnSignIn` re-sends automatically the moment someone who never
     * verified tries to sign in, rather than leaving them stuck with no way
     * to get a fresh link short of the (separate) `/send-verification-email`
     * endpoint. `autoSignInAfterVerification` signs the browser in the moment
     * the link is clicked, so verifying is the last step of onboarding rather
     * than a detour back to the login screen.
     *
     * **Existing accounts predate this feature and were grandfathered in** —
     * `npm run grandfather:verified-users` set `emailVerified: true` for every
     * row created before this shipped, once, so `requireEmailVerification`
     * only applies to signups from this point forward. Do not re-run that
     * script; it would wrongly verify genuinely-unverified new accounts.
     */
    emailVerification: {
        sendVerificationEmail: async ({ user, url }) => {
            const { subject, html, text } = renderVerificationEmail({ name: user.name, url });
            await sendMail({ to: user.email, subject, html, text });
        },
        sendOnSignUp: true,
        sendOnSignIn: true,
        autoSignInAfterVerification: true,
        expiresIn: 60 * 60 * 24, // 24h — an email link, not a short-lived OTP
    },
    /**
     * Account linking is left at better-auth's defaults, which are the safe
     * ones.
     *
     * `accountLinking.requireLocalEmailVerified` defaults to `true`, and the
     * linking check in better-auth's `oauth2/link-account.mjs` reads:
     *
     *     requireLocalEmailVerified && !dbUser.user.emailVerified  →  refuse
     *
     * Now that every email/password signup is required to verify before it
     * can even sign in, this only ever refuses a genuinely unverified row —
     * someone who created a password account and never clicked the
     * confirmation link. Google sign-ups that have never used a password are
     * unaffected either way.
     *
     * The only switch that changes this is `requireLocalEmailVerified: false`,
     * and it is deliberately not set: it would let anyone who pre-registers an
     * unverified account at someone else's address absorb that person's Google
     * identity into the attacker-owned row on their first sign-in. better-auth
     * documents it as a takeover risk and has already deprecated it — the gate
     * becomes unconditional next minor. `trustedProviders` does not help here
     * either; it only bypasses the *provider's* email-verified claim, which is
     * a separate clause of the same condition.
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
