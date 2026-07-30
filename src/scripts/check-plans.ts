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
const WITHHELD = [
    "spendingAnalysis",
    "trendAndComparison",
    "cashFlow",
    "recurringExpenses",
    "anomalyAndRisk",
    "behavioralInsights",
    "incomeAnalysis",
    "redFlags",
    "recommendations",
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

    const full = (await insightsService.getLatestInsight(owner.userId, true)) as Record<string, unknown>;
    const cut = (await insightsService.getLatestInsight(owner.userId, false)) as Record<string, unknown>;

    const fullInsights = (full.insights ?? {}) as Record<string, unknown>;
    const cutInsights = (cut.insights ?? {}) as Record<string, unknown>;

    check("full read is not marked redacted", full.redacted === undefined);
    check("cut read is marked redacted", cut.redacted === true);
    check("cut read names the plan that unlocks it", cut.unlockedBy === minimumPlanFor("insights_full"));

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

    check(
        "rawStatsSnapshot is dropped entirely",
        !("rawStatsSnapshot" in cut),
        "it restates most of the report in prose the projection just removed"
    );

    const cutCharts = (cut.chartData ?? null) as Record<string, unknown> | null;
    check(
        "recoveryProjection is stripped from chartData",
        cutCharts === null || !("recoveryProjection" in cutCharts)
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
    .finally(() => prisma.$disconnect());
