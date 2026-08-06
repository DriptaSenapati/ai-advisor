import "../envConfig.js";
import nodemailer from "nodemailer";

/**
 * One SMTP transport for the whole API, built once at import time — the same
 * shape `storage.ts` uses for picking a driver. `noreply@theilluminate.site`
 * sends through Zoho's SMTP relay; nothing above this module knows or cares
 * that it's Zoho rather than SES or Resend.
 *
 * A missing env var throws at import time rather than at first send, the same
 * posture `auth.ts` takes with `BETTER_AUTH_SECRET` — an API that can't send
 * the emails it promises (verification, eventually password reset) shouldn't
 * report itself healthy.
 */
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 465);
const SMTP_SECURE = (process.env.SMTP_SECURE ?? "true") === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME ?? "Illuminate Team";
const SMTP_FROM_EMAIL = process.env.SMTP_FROM_EMAIL ?? SMTP_USER;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
        "SMTP_HOST / SMTP_USER / SMTP_PASS environment variables are required to send email"
    );
}

const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE, // true for port 465 (implicit TLS), false for 587 (STARTTLS)
    auth: { user: SMTP_USER, pass: SMTP_PASS },
});

export interface SendMailInput {
    to: string;
    subject: string;
    html: string;
    text: string;
    /** RFC 2919 — groups related emails (e.g. every verification resend) in clients that thread by it. */
    headers?: Record<string, string>;
}

/**
 * Sends one email. Always carries both an HTML and a plain-text body —
 * a text-only alternative part is one of the cheapest deliverability wins
 * there is: several spam filters score a HTML-only message up specifically
 * for missing one.
 */
export async function sendMail({ to, subject, html, text, headers }: SendMailInput): Promise<void> {
    await transporter.sendMail({
        from: `"${SMTP_FROM_NAME}" <${SMTP_FROM_EMAIL}>`,
        to,
        subject,
        html,
        text,
        headers,
    });
}
