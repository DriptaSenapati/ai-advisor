import "../envConfig.js";
import prisma from "../prismaClient.js";

/**
 * Populates `SiteContent` and `Testimonial` with the exact strings currently
 * hardcoded in `ai_advisor_ui/src/components/landing/*.tsx` — so the admin
 * content form shows real, editable values instead of blank placeholders,
 * and the DB (not just component fallbacks) is the source of truth from day
 * one. Idempotent: upserts `SiteContent` by key, and only inserts
 * testimonials when the collection is empty (they have no natural unique
 * key), so re-running this never duplicates rows or clobbers an edit an
 * admin has already made through /panel/content.
 *
 * `cta.heading` is seeded as plain text ("Ready to transform your financial
 * clarity?"). The component's hardcoded default highlights "clarity?" with a
 * gradient span; once a DB row exists, `CTASection` renders it as plain text
 * instead — a deliberate, known trade-off of making this field editable.
 */

const SITE_CONTENT_DEFAULTS: { key: string; value: string }[] = [
    { key: "hero.headline", value: "Every Rupee, Understood." },
    {
        key: "hero.subhead",
        value: "Upload a statement. Illuminate reads every line, tracks every pattern, and shows you exactly what to do next.",
    },
    { key: "hero.cta", value: "Get started for free" },
    { key: "nav.features", value: "Features" },
    { key: "nav.howItWorks", value: "How it works" },
    { key: "nav.security", value: "Security" },
    { key: "nav.pricing", value: "Pricing" },
    {
        key: "footer.blurb",
        value: "AI-powered clarity for every rupee — decode statements, catch silent debits, and plan goals with confidence.",
    },
    { key: "cta.heading", value: "Ready to transform your financial clarity?" },
    {
        key: "cta.body",
        value: "Upload your bank PDF statement to decode cryptic merchant strings, track silent recurring debits, and gain complete spending clarity in seconds.",
    },
    { key: "cta.buttonLabel", value: "Illuminate statement" },
];

const TESTIMONIAL_DEFAULTS = [
    {
        quote:
            "My income lands in lumps, never on a schedule. Illuminate still sorted six months of messy invoices into clean categories — the first tool that didn’t choke on freelance chaos.",
        name: "Neha Rao",
        role: "Freelance product designer",
        initials: "NR",
        bg: "var(--ember-500)",
        order: 0,
    },
    {
        quote:
            "I set a six-month emergency fund goal and the simulation gave me April, not some fantasy date. It reads my real spending, so I actually trust the number.",
        name: "Arjun Menon",
        role: "Salaried · building an emergency fund",
        initials: "AM",
        bg: "var(--rust-500)",
        order: 1,
    },
    {
        quote:
            "It cleanly split my personal UPI payments from studio expenses without me tagging a single transaction. Tax season went from three days to an afternoon.",
        name: "Priya Shah",
        role: "Owner, design studio",
        initials: "PS",
        bg: "var(--grey-2)",
        order: 2,
    },
    {
        quote:
            "Illuminate flagged a ₹649 subscription I’d forgotten renewing for fourteen months. That one catch paid for itself several times over.",
        name: "Kabir Nair",
        role: "Software engineer",
        initials: "KN",
        bg: "var(--ember-400)",
        order: 3,
    },
    {
        quote:
            "Half my statement used to read like “POS-992183-BLR-IN”. Now every line shows the actual merchant. I finally know where my money goes.",
        name: "Divya Iyer",
        role: "Freelance photographer",
        initials: "DI",
        bg: "var(--grey-3)",
        order: 4,
    },
    {
        quote:
            "Seven silent auto-debits were quietly draining my current account. Illuminate surfaced all of them in one view — two were services I’d cancelled months ago.",
        name: "Sameer Gupta",
        role: "Small business owner",
        initials: "SG",
        bg: "var(--ember-600)",
        order: 5,
    },
];

for (const entry of SITE_CONTENT_DEFAULTS) {
    await prisma.siteContent.upsert({
        where: { key: entry.key },
        create: { ...entry, updatedBy: "seed" },
        update: {}, // never overwrite an admin's existing edit
    });
}
console.log(`SiteContent: ensured ${SITE_CONTENT_DEFAULTS.length} keys.`);

const testimonialCount = await prisma.testimonial.count();
if (testimonialCount === 0) {
    await prisma.testimonial.createMany({ data: TESTIMONIAL_DEFAULTS });
    console.log(`Testimonial: seeded ${TESTIMONIAL_DEFAULTS.length} rows.`);
} else {
    console.log(`Testimonial: ${testimonialCount} row(s) already exist — skipped.`);
}

await prisma.$disconnect();
