/**
 * The subscription plan catalog — the single source of truth for what each plan
 * costs and what it unlocks.
 *
 * **This is code, not database rows, and that is deliberate.** A seeded catalog
 * would need a migration path every time a feature is added, and this project is
 * `db push`-only with an idempotent boot (`config/bootstrap-db.ts`). Only the
 * *assignment* of a plan to a user is data (`model Subscription`); the catalog
 * itself ships with the deployment, so the code enforcing a rule and the copy
 * describing it can never disagree.
 *
 * **The field is `plan`, never `tier`.** `InsightReport.tier` already means
 * something else entirely — data depth, derived from how many months of
 * statements exist (1 month → 1, <6 → 2, ≥6 → 3) — and it decides which prose
 * sections the LLM populates. Two different `tier`s in one codebase would be a
 * permanent source of wrong reads.
 *
 * `GET /api/v1/plans` serves this catalog **unauthenticated**, which is what
 * stops the marketing site from carrying a second copy of the prices.
 */

export const PLAN_IDS = ["first", "glow", "radiant"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const DEFAULT_PLAN: PlanId = "first";

/**
 * Everything that can be gated, named after the capability rather than the
 * screen — a feature key outlives the route that happens to render it.
 *
 * Note what is *absent*: the Overall dashboard, the categories index and the
 * statements list have no key, because every plan has them. A key exists only
 * where there is a line to draw.
 */
export const FEATURE_KEYS = [
    "monthly_view",
    "insights_headline",
    "insights_summary",
    "flags",
    "recurring",
    "multi_bank",
    "category_baseline",
    "insights_full",
    "goals",
    "priority_processing",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface PlanLimits {
    /** Statements a user may upload in total. `null` is unlimited. */
    statements: number | null;
    /** Goals a user may hold at once. `null` is unlimited. */
    goals: number | null;
}

export interface Plan {
    id: PlanId;
    /** Display name, e.g. "First light". */
    name: string;
    /** The oversized numeral the pricing card watermarks into its corner. */
    num: string;
    blurb: string;
    price: { monthly: number; annual: number };
    /** Copy for the card's call to action. */
    cta: string;
    caption: string;
    popular: boolean;
    features: Record<FeatureKey, boolean>;
    limits: PlanLimits;
}

/** Every feature off — spread over this so a new key can never be silently omitted. */
const NONE: Record<FeatureKey, boolean> = {
    monthly_view: false,
    insights_headline: false,
    insights_summary: false,
    flags: false,
    recurring: false,
    multi_bank: false,
    category_baseline: false,
    insights_full: false,
    goals: false,
    priority_processing: false,
};

const GLOW_FEATURES: Record<FeatureKey, boolean> = {
    ...NONE,
    monthly_view: true,
    insights_headline: true,
    insights_summary: true,
    flags: true,
    recurring: true,
    multi_bank: true,
};

export const PLANS: Record<PlanId, Plan> = {
    first: {
        id: "first",
        name: "First light",
        num: "01",
        blurb: "Get your first month of clarity.",
        price: { monthly: 0, annual: 0 },
        cta: "Start free",
        caption: "No credit card required.",
        popular: false,
        // `insights_headline` is the one paid-looking thing the free plan has, and it is
        // deliberate: `/app` is now recommendation-first, so without it the home screen
        // would be a locked panel for every free user — a product demonstrating itself by
        // showing nothing. They get the health score, the key summary and the single
        // highest-impact move; the ranked list and the argument behind it are what Glow and
        // Radiant sell.
        features: { ...NONE, insights_headline: true },
        limits: { statements: 1, goals: 0 },
    },
    glow: {
        id: "glow",
        name: "Glow",
        num: "02",
        blurb: "Clarity that never switches off.",
        price: { monthly: 499, annual: 399 },
        cta: "Get started",
        caption: "Cancel anytime.",
        popular: true,
        features: GLOW_FEATURES,
        limits: { statements: null, goals: 0 },
    },
    radiant: {
        id: "radiant",
        name: "Radiant",
        num: "03",
        blurb: "Your full financial picture.",
        price: { monthly: 999, annual: 799 },
        cta: "Get started",
        caption: "Cancel anytime.",
        popular: false,
        features: {
            ...GLOW_FEATURES,
            category_baseline: true,
            insights_full: true,
            goals: true,
            priority_processing: true,
        },
        limits: { statements: null, goals: null },
    },
};

/** Cheapest first. Comparisons like "is this an upgrade" index into this. */
export const PLAN_ORDER: PlanId[] = ["first", "glow", "radiant"];

/* ------------------------------------------------------------------ *
 * The marketing comparison matrix
 * ------------------------------------------------------------------ */

/**
 * A cell is either a tick/cross or a figure. Uploads are the only row today that
 * needs a figure ("1" vs "Unlimited"), and expressing it as `string` rather than
 * forcing it into a boolean is what keeps one array driving the whole table.
 */
export type ComparisonValue = boolean | string;

export interface ComparisonRow {
    key: string;
    label: string;
    /** One line of plain language, shown under the label. */
    hint: string;
    values: Record<PlanId, ComparisonValue>;
}

/**
 * The rows of the pricing page's comparison table, in reading order.
 *
 * Rows that are *not* keyed to a `FeatureKey` (the three every plan has, and the
 * upload allowance) are here too — a comparison table that lists only the
 * differences tells a reader what they lose, never what they get.
 */
export const COMPARISON_ROWS: ComparisonRow[] = [
    {
        key: "statements",
        label: "Statement uploads",
        hint: "How many bank statements you can put through the pipeline.",
        values: { first: "1", glow: "Unlimited", radiant: "Unlimited" },
    },
    {
        key: "dashboard_overall",
        label: "Spending dashboard",
        hint: "Where your money goes — categories, merchants, and the rhythm of your month.",
        values: { first: true, glow: true, radiant: true },
    },
    {
        key: "categories_index",
        label: "Category breakdown",
        hint: "Every category ranked by what you actually spent.",
        values: { first: true, glow: true, radiant: true },
    },
    {
        key: "statements_list",
        label: "Statement history",
        hint: "Everything you have uploaded, grouped by bank.",
        values: { first: true, glow: true, radiant: true },
    },
    {
        key: "insights_headline",
        label: "Health score & your next move",
        hint: "A score out of 100 with the working behind it, the risks worth knowing, and the single highest-impact thing to do.",
        values: { first: true, glow: true, radiant: true },
    },
    {
        key: "monthly_view",
        label: "Cash-flow analysis",
        hint: "Income against expenses month by month, and what you saved or overspent.",
        values: { first: false, glow: true, radiant: true },
    },
    {
        key: "insights_summary",
        label: "Your moves, ranked",
        hint: "Every recommendation with what it is worth a year, how confident we are, and the effort involved.",
        values: { first: false, glow: true, radiant: true },
    },
    {
        key: "recurring",
        label: "Recurring expense detection",
        hint: "Subscriptions, EMIs and standing commitments found automatically.",
        values: { first: false, glow: true, radiant: true },
    },
    {
        key: "flags",
        label: "Anomaly flags",
        hint: "Duplicate charges, surprise fees, price rises and outlier payments.",
        values: { first: false, glow: true, radiant: true },
    },
    {
        key: "multi_bank",
        label: "Multi-bank support",
        hint: "Statements from more than one bank, merged into one picture.",
        values: { first: false, glow: true, radiant: true },
    },
    {
        key: "category_baseline",
        label: "Trend vs. your own baseline",
        hint: "Per-category history against your six-month average — is this normal for you?",
        values: { first: false, glow: false, radiant: true },
    },
    {
        key: "insights_full",
        label: "Trajectory projection & the full report",
        hint: "Where you land in a year if nothing changes — and if you act — plus the seven sections of written analysis.",
        values: { first: false, glow: false, radiant: true },
    },
    {
        key: "goals",
        label: "Goal simulation & projections",
        hint: "Monte Carlo feasibility on a savings goal, with what it would take to get there.",
        values: { first: false, glow: false, radiant: true },
    },
    {
        key: "priority_processing",
        label: "Priority processing",
        hint: "Your statements jump the queue ahead of free-plan runs.",
        values: { first: false, glow: false, radiant: true },
    },
];

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

export function isPlanId(value: unknown): value is PlanId {
    return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

/**
 * Resolve a stored plan id to a `Plan`.
 *
 * **An absent or unrecognised value resolves to the free plan rather than
 * throwing**, and that is what removes any backfill: a user with no
 * `Subscription` row simply is on `first`. It also means a plan id retired from
 * the catalog degrades to free instead of 500-ing every request that user makes.
 */
export function resolvePlan(planId?: string | null): Plan {
    return isPlanId(planId) ? PLANS[planId] : PLANS[DEFAULT_PLAN];
}

export function hasFeature(planId: string | null | undefined, feature: FeatureKey): boolean {
    return resolvePlan(planId).features[feature];
}

/**
 * The cheapest plan that includes `feature`, so a refusal can name what to buy
 * rather than just saying no. `null` would mean no plan has it, which should be
 * unreachable — but returning the top plan in that case is a worse lie.
 */
export function minimumPlanFor(feature: FeatureKey): PlanId | null {
    return PLAN_ORDER.find((id) => PLANS[id].features[feature]) ?? null;
}

/**
 * The BullMQ `priority` a plan's jobs are enqueued with.
 *
 * **Both values are explicit and non-zero, and that is the whole subtlety.**
 * BullMQ documents `0` — the default — as *"no explicit priority, and jobs with
 * no explicit priority are processed **before** prioritized jobs"*. So the
 * obvious implementation, giving paid runs `priority: 1` and leaving everyone
 * else alone, inverts the feature: every free job would sit in the unprioritized
 * wait list and be picked up ahead of the paying ones. Lower is sooner among
 * prioritized jobs, hence 1 and 2.
 *
 * This means **every** `queue.add` call site must pass a priority. One that
 * forgets does not merely lose the benefit — it silently outranks Radiant.
 */
export const PRIORITY_PAID = 1;
export const PRIORITY_STANDARD = 2;

export function jobPriorityFor(planId: string | null | undefined): number {
    return hasFeature(planId, "priority_processing") ? PRIORITY_PAID : PRIORITY_STANDARD;
}

/** Cheapest plan whose `limit` is higher than `current`, for quota refusals. */
export function nextPlanForLimit(limit: keyof PlanLimits, current: number | null): PlanId | null {
    return (
        PLAN_ORDER.find((id) => {
            const value = PLANS[id].limits[limit];
            return value === null || (current !== null && value > current);
        }) ?? null
    );
}
