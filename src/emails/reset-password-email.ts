import { escapeHtml, renderEmailLayout } from "./shared.js";
import type { RenderedEmail } from "./verification-email.js";

export interface ResetPasswordEmailInput {
    name?: string | null;
    /** The full reset-password URL — better-auth's own redirect chain, token attached. */
    url: string;
}

/**
 * Sent by `requestPasswordReset`. better-auth calls this **regardless of
 * whether the address has an account** — the endpoint always answers "if
 * this email exists, check your inbox" to avoid leaking which emails are
 * registered, so this function is only ever invoked for a real user and
 * never needs to handle the "no such account" case itself.
 */
export function renderResetPasswordEmail({ name, url }: ResetPasswordEmailInput): RenderedEmail {
    const greeting = name && name.trim() ? `Hi ${escapeHtml(name.trim())},` : "Hi,";
    const subject = "Reset your Illuminate password";

    const html = renderEmailLayout({
        subject,
        preheader: "Set a new password for your Illuminate account — the link expires in 1 hour.",
        heading: "Reset your password",
        bodyParagraphs: [
            greeting,
            "We received a request to reset the password on your Illuminate account. Click below to choose a new one. This link is valid for 1 hour.",
        ],
        ctaLabel: "Reset password",
        ctaUrl: url,
        footerNote:
            "You're receiving this because a password reset was requested for this address. If that wasn't you, your password hasn't changed — no further action is needed.",
    });

    const text = [
        greeting,
        "",
        "We received a request to reset the password on your Illuminate account.",
        "Use the link below to choose a new one. This link is valid for 1 hour.",
        "",
        url,
        "",
        "You're receiving this because a password reset was requested for this address.",
        "If that wasn't you, your password hasn't changed — no further action is needed.",
    ].join("\n");

    return { subject, html, text };
}
