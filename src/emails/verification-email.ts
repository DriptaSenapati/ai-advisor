import { escapeHtml, renderEmailLayout } from "./shared.js";

export interface VerificationEmailInput {
    /** May be empty — better-auth allows sign-up with a blank name. */
    name?: string | null;
    /** The full verify-email URL, token and callbackURL already attached. */
    url: string;
}

export interface RenderedEmail {
    subject: string;
    html: string;
    text: string;
}

/**
 * `sendVerificationEmail` is called on sign-up, on a sign-in attempt against
 * an unverified account, and on an explicit resend — three different
 * situations that all produce the same link. The copy stays neutral enough
 * to cover all three rather than assuming "you just signed up".
 */
export function renderVerificationEmail({ name, url }: VerificationEmailInput): RenderedEmail {
    const greeting = name && name.trim() ? `Hi ${escapeHtml(name.trim())},` : "Hi,";
    const subject = "Confirm your email for Illuminate";

    const html = renderEmailLayout({
        subject,
        preheader: "One click confirms it's really you — the link expires in 24 hours.",
        heading: "Confirm your email address",
        bodyParagraphs: [
            greeting,
            "Confirm this address to finish setting up your Illuminate account and keep it secure. This link is valid for 24 hours.",
        ],
        ctaLabel: "Confirm email address",
        ctaUrl: url,
        footerNote:
            "You're receiving this because this address was used to create an Illuminate account. If that wasn't you, no further action is needed — the account will simply stay unverified.",
    });

    const text = [
        greeting,
        "",
        "Confirm this address to finish setting up your Illuminate account and keep it secure.",
        "This link is valid for 24 hours.",
        "",
        url,
        "",
        "You're receiving this because this address was used to create an Illuminate account.",
        "If that wasn't you, no further action is needed — the account will simply stay unverified.",
    ].join("\n");

    return { subject, html, text };
}
