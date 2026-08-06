/**
 * The fixed vocabulary of admin-editable marketing strings — v1 is a curated
 * set, not a generic CMS. Shared by the admin CRUD validator and the public
 * read service so the two can never drift apart on what a valid key is.
 */
export const SITE_CONTENT_KEYS = [
    "hero.headline",
    "hero.subhead",
    "hero.cta",
    "nav.features",
    "nav.howItWorks",
    "nav.security",
    "nav.pricing",
    "footer.blurb",
    "cta.heading",
    "cta.body",
    "cta.buttonLabel",
] as const;

export type SiteContentKey = (typeof SITE_CONTENT_KEYS)[number];

export function isSiteContentKey(value: unknown): value is SiteContentKey {
    return typeof value === "string" && (SITE_CONTENT_KEYS as readonly string[]).includes(value);
}
