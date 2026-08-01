/**
 * Assert the plan catalog's invariants, and the `/insights/latest` projection
 * against whatever real reports are in the database.
 *
 *   npm run check:plans
 *
 * Read-only. Follows `check-flags.ts`: drive the real services and assert, since
 * there is no test runner in this project.
 *
 * **The projection is the part worth a script.** Route guards fail loudly — a 403
 * is visible the first time anyone opens the screen — but a redaction that
 * quietly leaks a section looks exactly like a working response, and the only way
 * to notice is to read the payload key by key. That is what this does.
 */
import "../envConfig.js";
import prisma from "../prismaClient.js";
import * as insightsService from "../api/services/insights.service.js";
import {
    COMPARISON_ROWS,
    FEATURE_KEYS,
    PLANS,
    PLAN_ORDER,
    PRIORITY_PAID,
    PRIORITY_STANDARD,
    jobPriorityFor,
    minimumPlanFor,
    resolvePlan,
} from "../config/plans.js";

let failures = 0;

function check(label: string, condition: boolean, detail?: string): void {
    if (condition) {
        console.log(`  ✓ ${label}`);
    } else {
        failures++;
        console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    }
}

function catalogChecks(): void {
    console.log("\nCatalog");

    check(
        "every plan declares every feature key",
        PLAN_ORDER.every((id) => FEATURE_KEYS.every((k) => typeof PLANS[id].features[k] === "boolean")),
        "a missing key reads as undefined, which is falsy — the feature would silently be off"
    );

    // Cumulative plans are what `unlockingPlan()` in the UI assumes when it names
    // the upgrade. If this ever fails, that helper has to become a catalog lookup.
    check(
        "features are cumulative up the order",
        PLAN_ORDER.every((id, i) =>
            i === 0
                ? true
                : FEATURE_KEYS.every((k) => !PLANS[PLAN_ORDER[i - 1]!].features[k] || PLANS[id].features[k])
        ),
        "a dearer plan drops a feature a cheaper one has"
    );

    check(
        "every feature is unlocked by some plan",
        FEATURE_KEYS.every((k) => minimumPlanFor(k) !== null),
        "a feature nothing sells can never be reached"
    );

    check(
        "comparison rows cover every plan",
        COMPARISON_ROWS.every((r) => PLAN_ORDER.every((id) => r.values[id] !== undefined)),
        "a missing cell renders as an empty table cell"
    );

    // Every comparison row that names a real feature must agree with that feature's
    // flag, or the pricing page advertises something the API refuses.
    const featureRows = COMPARISON_ROWS.filter((r) =>
        (FEATURE_KEYS as readonly string[]).includes(r.key)
    );
    check(
        `${featureRows.length} feature rows match the flags they describe`,
        featureRows.every((r) =>
            PLAN_ORDER.every((id) => r.values[id] === PLANS[id].features[r.key as never])
        ),
        "the pricing table and the enforcement disagree"
    );

    check("unknown plan id resolves to first", resolvePlan("nonsense").id === "first");
    check("absent plan id resolves to first", resolvePlan(null).id === "first");

    /**
     * BullMQ treats `0` as "no priority" and runs those jobs *before* prioritized
     * ones, so an unset priority would put free runs ahead of Radiant. Both values
     * must be non-zero, and paid must sort first (lower is sooner).
     */
    check("free jobs carry an explicit non-zero priority", jobPriorityFor("first") === PRIORITY_STANDARD && PRIORITY_STANDARD > 0);
    check("paid jobs outrank free ones", jobPriorityFor("radiant") === PRIORITY_PAID && PRIORITY_PAID < PRIORITY_STANDARD);
}

/** Keys a plan without `insights_full` must never receive. */
/**
 * Sections no depth below `full` may return.
 *
 * **`recommendations` is deliberately not in this list any more.** It survives at both
 * shallower depths now — trimmed to one at `headline` — because the overview is
 * recommendation-first on every plan. What must never leak is the prose and the narrated
 * flags, which is what these nine were always really about.
 */
const WITHHELD = [
    "spendingAnalysis",
    "trendAndComparison",
    "cashFlow",
    "recurringExpenses",
    "anomalyAndRisk",
    "behavioralInsights",
    "incomeAnalysis",
    "redFlags",
];

async function projectionChecks(): Promise<void> {
    console.log("\nReport projection");

    const owner = await prisma.insightReport.findFirst({
        orderBy: { createdAt: "desc" },
        select: { userId: true },
    });

    if (!owner) {
        console.log("  — no InsightReport in the database, so nothing to project. Skipped.");
        console.log("    (Upload and illuminate a statement, then re-run to cover this.)");
        return;
    }

    const full = (await insightsService.getLatestInsight(owner.userId, "full")) as Record<string, unknown>;
    const cut = (await insightsService.getLatestInsight(owner.userId, "summary")) as Record<string, unknown>;
    const headline = (await insightsService.getLatestInsight(owner.userId, "headline")) as Record<string, unknown>;

    const fullInsights = (full.insights ?? {}) as Record<string, unknown>;
    const cutInsights = (cut.insights ?? {}) as Record<string, unknown>;
    const headlineInsights = (headline.insights ?? {}) as Record<string, unknown>;

    check("full read is not marked redacted", full.redacted === undefined);
    check("cut read is marked redacted", cut.redacted === true);
    check("cut read names the plan that unlocks it", cut.unlockedBy === minimumPlanFor("insights_full"));
    check(
        "headline read names the NEXT plan up, not the top one",
        headline.unlockedBy === minimumPlanFor("insights_summary"),
        "pointing a free user straight at Radiant skips the plan that actually answers their next question"
    );

    check(
        "keySummary survives the cut",
        // Only meaningful if the full report had one; every report should.
        ("keySummary" in fullInsights) === ("keySummary" in cutInsights),
        "the summary band is the whole point of the Glow tier"
    );
    check(
        "dataQualityWarning survives the cut",
        ("dataQualityWarning" in fullInsights) === ("dataQualityWarning" in cutInsights),
        "a caveat about the reader's own data must never be withheld"
    );

    const leaked = WITHHELD.filter((k) => k in cutInsights);
    check(
        `no withheld section survives (${WITHHELD.length} checked)`,
        leaked.length === 0,
        leaked.length ? `leaked: ${leaked.join(", ")}` : undefined
    );

    const leakedHeadline = WITHHELD.filter((k) => k in headlineInsights);
    check(
        `no withheld section survives the headline cut (${WITHHELD.length} checked)`,
        leakedHeadline.length === 0,
        leakedHeadline.length ? `leaked: ${leakedHeadline.join(", ")}` : undefined
    );

    /* ---- the three depths differ in the ways they are supposed to ---- */

    const fullRecs = Array.isArray(fullInsights.recommendations) ? fullInsights.recommendations : null;
    if (fullRecs && fullRecs.length > 0) {
        const cutRecs = cutInsights.recommendations as unknown[] | undefined;
        const headlineRecs = headlineInsights.recommendations as unknown[] | undefined;

        check(
            "summary keeps every recommendation",
            Array.isArray(cutRecs) && cutRecs.length === fullRecs.length,
            "the ranked list is what insights_summary sells"
        );
        check(
            "headline keeps exactly one recommendation",
            Array.isArray(headlineRecs) && headlineRecs.length === Math.min(1, fullRecs.length),
            "the free plan gets the top move, not the list"
        );
    } else {
        console.log("  — report has no recommendations, so the depth-trim checks are skipped.");
    }

    /**
     * The forecast is the paid thing; the per-recommendation scalars are not.
     *
     * `impact`, `annualImpact` and `confidence` live inside `recoveryProjection`, and they are
     * what a *card* prints — so stripping the whole object took them with it and left a Glow
     * user with three recommendations carrying no yearly figure and no confidence, while the
     * pricing page promised exactly those. Both shallow depths therefore keep the scalars and
     * lose every series.
     */
    const seriesKeys = ["p50"];
    const forecastKeys = [
        "historyMonths",
        "actualCumulative",
        "forecastMonths",
        "baselineP10",
        "baselineP50",
        "baselineP90",
        "planP50",
    ];

    for (const [label, report] of [["summary", cut], ["headline", headline]] as const) {
        const proj = (report.chartData as Record<string, unknown> | null)?.recoveryProjection as
            | Record<string, unknown>
            | undefined;

        if (!proj) {
            console.log(`  — ${label} has no recoveryProjection to check (report predates it).`);
            continue;
        }

        check(
            `${label} keeps the per-recommendation figures the cards print`,
            Array.isArray(proj.perRecommendation),
            "confidence and annualImpact live here; without them the cards contradict the pricing page"
        );

        const leakedSeries = (proj.perRecommendation as Record<string, unknown>[]).some((p) =>
            seriesKeys.some((k) => k in p)
        );
        check(`${label} drops every per-recommendation forecast path`, !leakedSeries);

        const drawable = forecastKeys.filter(
            (k) => Array.isArray(proj[k]) && (proj[k] as unknown[]).length > 0
        );
        check(
            `${label} sends nothing that could be plotted`,
            drawable.length === 0,
            drawable.length ? `still populated: ${drawable.join(", ")}` : undefined
        );

        check(
            `${label} reports isProjectable false, so no chart is attempted`,
            proj.isProjectable === false
        );
    }

    check(
        "headline carries the projection scalars and nothing else from chartData",
        Object.keys((headline.chartData ?? {}) as object).every((k) => k === "recoveryProjection"),
        "every other panel it would feed is a paid screen, and /transactions/summary already backs the free dashboard"
    );

    /* ---- the score survives every depth ---- */
    for (const [label, report] of [["full", full], ["summary", cut], ["headline", headline]] as const) {
        check(
            `${label} read keeps the score columns`,
            "healthScore" in report && "riskLevel" in report && "scoreDelta" in report,
            "the score is the overview's headline on every plan, and it is our arithmetic rather than the model's"
        );
    }

    check(
        "rawStatsSnapshot is dropped entirely",
        !("rawStatsSnapshot" in cut),
        "it restates most of the report in prose the projection just removed"
    );

    const cutCharts = (cut.chartData ?? null) as Record<string, unknown> | null;
    check(
        "summary keeps the rest of chartData intact",
        cutCharts !== null && "monthlyOverview" in cutCharts,
        "the Glow dashboard is built from it"
    );

    // The cut must still be a usable report, not an empty husk.
    check("cut read keeps its identity fields", typeof cut.id === "string" && Array.isArray(cut.monthsCovered));
}

async function main(): Promise<void> {
    catalogChecks();
    await projectionChecks();

    console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
    if (failures > 0) process.exitCode = 1;
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
        /**
         * **Explicit exit, because `$disconnect()` alone does not end this process.**
         *
         * This script imports `insights.service.ts` for the real projection — that is the
         * point of it — and that module imports `insightsQueue` from `queue/index.js`. A
         * BullMQ `Queue` opens an ioredis connection at construction and holds it, so the
         * event loop stays alive forever: the checks all ran, "All checks passed" printed,
         * and the process then sat there. Anything that waits for the exit code (CI, a
         * pre-commit hook, a shell wrapper that buffers output until exit) simply hung.
         *
         * Closing the queue instead would mean reaching into a module this script only
         * borrows a type of. Exiting is the honest end of a read-only script.
         */
        process.exit(process.exitCode ?? 0);
    });
