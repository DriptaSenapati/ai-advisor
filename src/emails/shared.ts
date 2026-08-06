/**
 * Brand values shared by every transactional email — a deliberate, small
 * subset of `ai_advisor_ui/src/app/globals.css`'s palette (`--ember-500`,
 * `--light-*` tokens), copied rather than imported because an email client
 * renders none of that CSS layer: everything here has to be a literal hex in
 * an inline `style`, and the marketing site is light-only anyway, so there is
 * no dark variant to carry over.
 */
export const EMBER = "#ff4d00";
export const EMBER_LIGHT = "#ff6b2c";
export const INK = "#141414";
export const MUTED = "#6b6b6b";
export const BORDER = "#e6e4e1";
export const CARD_BG = "#ffffff";
export const PAGE_BG = "#f6f6f4";
export const FONT =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * A wordmark built from text, not an image. Email clients that block remote
 * images by default (most do, on first open) would otherwise show a blank
 * header on exactly the message that most needs to look legitimate on first
 * glance — and a broken-image icon reads as more suspicious than plain text,
 * not less.
 */
export function wordmarkHtml(): string {
    return `
    <tr>
      <td style="padding:0 0 28px 0;text-align:center;">
        <span style="font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-0.01em;color:${INK};">
          Illuminate
        </span>
      </td>
    </tr>`;
}

export interface EmailLayoutInput {
    subject: string;
    preheader: string;
    heading: string;
    /** Each string becomes one paragraph, in order. */
    bodyParagraphs: string[];
    ctaLabel: string;
    ctaUrl: string;
    /** Line shown under the button, before the raw fallback link. Defaults to a generic prompt. */
    fallbackLabel?: string;
    /** Footer disclosure — why the recipient is getting this email. */
    footerNote: string;
}

/**
 * One table-based, inline-styled shell shared by every transactional email
 * here. Table layout and inline styles throughout are deliberate, not dated
 * habit — Outlook's rendering engine (Word, not a browser) and a wide swath
 * of webmail clients strip `<style>` blocks and collapse flex/grid, so this
 * is the subset of HTML/CSS that actually survives across clients.
 */
export function renderEmailLayout({
    subject,
    preheader,
    heading,
    bodyParagraphs,
    ctaLabel,
    ctaUrl,
    fallbackLabel = "Or paste this link into your browser:",
    footerNote,
}: EmailLayoutInput): string {
    const paragraphsHtml = bodyParagraphs
        .map(
            (p, i) => `
                  <tr>
                    <td style="font-family:${FONT};font-size:14.5px;line-height:1.6;color:${MUTED};padding:0 0 ${i === bodyParagraphs.length - 1 ? "28" : "8"}px 0;">
                      ${p}
                    </td>
                  </tr>`
        )
        .join("");

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:${PAGE_BG};">
    <!-- Preheader: shown by mail clients in the inbox list, invisible in the body. -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
            ${wordmarkHtml()}
            <tr>
              <td style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:16px;padding:36px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-family:${FONT};font-size:19px;font-weight:700;color:${INK};padding:0 0 12px 0;">
                      ${heading}
                    </td>
                  </tr>
                  ${paragraphsHtml}
                  <tr>
                    <td align="center" style="padding:0 0 28px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="border-radius:10px;background:${EMBER};background-image:linear-gradient(135deg, ${EMBER} 0%, ${EMBER_LIGHT} 100%);">
                            <a href="${ctaUrl}"
                               style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:14.5px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                              ${ctaLabel}
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:${FONT};font-size:12.5px;line-height:1.6;color:${MUTED};padding:0 0 4px 0;">
                      ${fallbackLabel}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:${FONT};font-size:12.5px;line-height:1.6;word-break:break-all;padding:0 0 0 0;">
                      <a href="${ctaUrl}" style="color:${EMBER};text-decoration:underline;">${ctaUrl}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 8px 0 8px;text-align:center;">
                <p style="font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};margin:0;">
                  ${footerNote}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
