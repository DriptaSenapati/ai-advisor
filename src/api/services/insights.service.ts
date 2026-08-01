import prisma from "../../prismaClient.js";
import { insightsAgentGraph } from "../../graph.js";
import { NotFoundError, assertValidObjectId } from "../errors.js";
import { insightsQueue, publish } from "../../queue/index.js";
import { hasFeature, jobPriorityFor, minimumPlanFor, type PlanId } from "../../config/plans.js";
import { planIdFor } from "../middleware/entitlement.js";

/**
 * How much of a report a plan may read. **Three depths, not two.**
 *
 * The overview is the app's home screen and it is recommendation-first, so a two-depth
 * projection would have made `/app` a locked panel for every free user — a home page that
 * teaches nothing, on a plan whose whole job is to demonstrate the product. The middle
 * ground is real: the free plan sees *what to do next*, the paid plans see the ranked list
 * and then the argument behind it.
 *
 * | Depth | Feature | Reads as |
 * |---|---|---|
 * | `headline` | `insights_headline` (every plan) | the score, the key summary, and the single highest-impact move |
 * | `summary` | `insights_summary` | + every recommendation with what each is worth, + `chartData` |
 * | `full` | `insights_full` | + the seven prose sections, the narrated flags and the trajectory projection |
 */
export type ReportDepth = "headline" | "summary" | "full";

/**
 * Sections of `InsightReport.insights` that survive at *any* depth.
 *
 * `keySummary` is the summary band on the dashboard and the header of `/app/insights`;
 * `dataQualityWarning` is a caveat about the reader's *own* data and withholding it would be
 * indefensible — a report that quietly omits "18% of March is uncategorised" is worse than no
 * report.
 */
const SUMMARY_SECTIONS = ["keySummary", "dataQualityWarning"] as const;

/**
 * How many recommendations the headline depth returns.
 *
 * One, because `keySummary.actionItem` already names the top lever in prose at every tier —
 * this only makes the same fact structured, so it can carry its rupee figure and its effort.
 * Returning the whole ranked list here would leave `insights_summary` selling nothing.
 */
const HEADLINE_RECOMMENDATIONS = 1;

/**
 * Reduce the recovery projection to the figures without the forecast.
 *
 * **The chart is the Radiant product; the figures on the cards are not.** `confidence` and
 * `annualImpact` live inside `perRecommendation` because that is where the bounded arithmetic
 * happens — but they are what a *card* prints, and the pricing page promises Glow "every
 * recommendation with what it is worth a year, how confident we are". Stripping the whole
 * object took those with it, so a Glow user saw three recommendations with no yearly figure
 * and no confidence, and the plan comparison advertised something the API had removed.
 *
 * So the series go and the scalars stay: no `p50`, no baselines, no months — nothing that
 * could be plotted — and `isProjectable: false`, which is what stops the UI drawing a chart
 * from arrays that are no longer there.
 *
 * **`isProjectable: false` now means two different things**, and the UI must tell them apart:
 * "under three months of history" and "not on your plan". `redacted` is the discriminator, and
 * the copy differs — telling a Glow user to regenerate a report would be advice that cannot
 * work.
 */
function stripForecast(projection: Record<string, unknown>): Record<string, unknown> {
    const perRecommendation = Array.isArray(projection.perRecommendation)
        ? projection.perRecommendation.map((entry) => {
              const { p50: _dropped, ...rest } = entry as Record<string, unknown>;
              return rest;
          })
        : [];

    return {
        perRecommendation,
        clampedSlugs: projection.clampedSlugs ?? [],
        isProjectable: false,
        historyMonths: [],
        actualCumulative: [],
        forecastMonths: [],
        baselineP10: [],
        baselineP50: [],
        baselineP90: [],
        planP50: [],
        monthlyBaseline: 0,
        monthlyWithPlan: 0,
        gapAt12m: 0,
        excludedDipMonths: [],
    };
}

export interface RedactedReport {
    redacted: true;
    /** The cheapest plan that returns what was withheld — the *next* step up, not always the top. */
    unlockedBy: PlanId | null;
}

/** The depth a plan reads at. */
export function depthFor(planId: string | null | undefined): ReportDepth {
    if (hasFeature(planId, "insights_full")) return "full";
    if (hasFeature(planId, "insights_summary")) return "summary";
    return "headline";
}

/**
 * Cut a report down to what `depth` may see.
 *
 * **This happens here, in the service, and not in the client.** The whole point of the lock
 * is that the withheld prose never crosses the wire — a UI that hides sections it was sent is
 * a lock anyone can open with the network tab.
 *
 * `rawStatsSnapshot` is dropped below `full` for the same reason: it is the prose-formatted
 * stats block assembled for the LLM prompt, so it restates most of the report in a field
 * nothing renders. Leaving it in place would hand back exactly what the projection removed.
 *
 * **The four score columns are never withheld.** They are the headline of the overview on
 * every plan, and they are derived arithmetic over the user's own figures rather than LLM
 * output — there is no version of this product where a paying tier owns the answer to "how am
 * I doing". They ride along in `...rest` because they are real columns, not JSON.
 */
function projectReport<T extends { insights: unknown; chartData?: unknown; rawStatsSnapshot?: unknown }>(
    report: T,
    depth: ReportDepth
): T | (Omit<T, "rawStatsSnapshot"> & RedactedReport) {
    if (depth === "full") return report;

    const { rawStatsSnapshot: _dropped, ...rest } = report;

    const insights = report.insights as Record<string, unknown> | null;
    const chartData = report.chartData as Record<string, unknown> | null | undefined;

    const kept: Record<string, unknown> = insights
        ? Object.fromEntries(
              SUMMARY_SECTIONS.filter((k) => k in insights).map((k) => [k, insights[k]])
          )
        : {};

    // Recommendations are already ordered by `monthlySavingImpact` descending, so "the top
    // one" is a slice rather than a sort. Absent on reports generated before the field
    // existed, which is why this is guarded rather than assumed.
    if (insights && Array.isArray(insights.recommendations)) {
        kept.recommendations =
            depth === "headline"
                ? insights.recommendations.slice(0, HEADLINE_RECOMMENDATIONS)
                : insights.recommendations;
    }

    return {
        ...rest,
        insights: insights ? kept : insights,
        // The headline depth carries no chartData at all. Every panel it feeds — the trend
        // charts, the category ring, the rhythm grid — belongs to a paid screen, and
        // `GET /transactions/summary` already backs the dashboard a free user *is* entitled
        // to, so nothing is lost by withholding the duplicate.
        /**
         * **`headline` keeps the projection's scalars and nothing else.**
         *
         * Everything else in `chartData` — the monthly overview, the category breakdown, the
         * merchants, the rhythm — feeds a paid screen, and `GET /transactions/summary`
         * already backs the dashboard a free user *is* entitled to, so withholding the
         * duplicate costs them nothing.
         *
         * The reduced `recoveryProjection` is different: it is where `impact`,
         * `annualImpact` and `confidence` live, and those are what make the one
         * recommendation on the free overview credible rather than an assertion. Dropping it
         * left the card with a monthly figure while the heading above it printed a yearly
         * total — the same fact, at two grains, from two different numbers.
         */
        chartData:
            depth === "headline"
                ? chartData?.recoveryProjection
                    ? { recoveryProjection: stripForecast(chartData.recoveryProjection as Record<string, unknown>) }
                    : null
                : chartData
                  ? Object.fromEntries(
                        Object.entries(chartData).map(([k, v]) =>
                            k === "recoveryProjection"
                                ? [k, v ? stripForecast(v as Record<string, unknown>) : v]
                                : [k, v]
                        )
                    )
                  : chartData,
        redacted: true,
        unlockedBy: minimumPlanFor(depth === "headline" ? "insights_summary" : "insights_full"),
    } as Omit<T, "rawStatsSnapshot"> & RedactedReport;
}

export async function getLatestInsight(userId: string, depth: ReportDepth = "full") {
    const report = await prisma.insightReport.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
    });
    if (!report) throw new NotFoundError("InsightReport");
    return projectReport(report, depth);
}

export async function getInsight(id: string, userId: string, depth: ReportDepth = "full") {
    assertValidObjectId(id);
    const report = await prisma.insightReport.findFirst({ where: { id, userId } });
    if (!report) throw new NotFoundError("InsightReport", id);
    return projectReport(report, depth);
}

export async function listInsights(userId: string, page: number, limit: number) {
    const [total, data] = await Promise.all([
        prisma.insightReport.count({ where: { userId } }),
        prisma.insightReport.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                tier: true,
                monthsCovered: true,
                generatedAt: true,
                createdAt: true,
            },
        }),
    ]);
    return { data, total };
}

export interface ListFlagsFilters {
    page: number;
    limit: number;
    severity?: string;
    kind?: string;
    month?: string;
}

/**
 * A page of red flags, each joined to the transaction it points at.
 *
 * The join is what makes a flag actionable rather than a claim: it carries the real
 * description, date and running balance so the user can recognise the charge on their
 * statement. `label`, `amount` and `title` are already denormalised onto the flag, so a flag
 * whose transaction has since been deleted still renders — it just has no `transaction` to
 * expand. (Statement deletion prunes its own flags; this guards the ones nothing pruned.)
 *
 * **Sorted in the database, by severity then amount — and it has to be.** `severity` is a
 * string, so `orderBy: { severity: "asc" }` sorts it *alphabetically*: "high", "low",
 * "medium", which puts the least urgent findings second. Ranking after `findMany` instead is
 * worse in a way that is easy to miss: pagination would then be by amount and the reordering
 * would only apply *within* a page, so page 1 of a risk list could omit a high-severity
 * finding that page 2 contains. The `$addFields` rank makes the order real, so `skip`/`take`
 * page through it correctly.
 */
export async function listFlags(userId: string, filters: ListFlagsFilters) {
    const { page, limit, severity, kind, month } = filters;
    const match = {
        userId,
        ...(severity ? { severity } : {}),
        ...(kind ? { kind } : {}),
        ...(month ? { month } : {}),
    };

    type RawFlag = Record<string, unknown> & {
        _id: { $oid: string };
        occurredAt?: { $date: string } | null;
        detectedAt?: { $date: string } | null;
        transactionId?: string | null;
        severity: string;
        amount: number;
    };

    const [total, raw] = await Promise.all([
        prisma.transactionFlag.count({ where: match }),
        prisma.transactionFlag.aggregateRaw({
            pipeline: [
                { $match: match },
                {
                    $addFields: {
                        severityRank: {
                            $switch: {
                                branches: [
                                    { case: { $eq: ["$severity", "high"] }, then: 0 },
                                    { case: { $eq: ["$severity", "medium"] }, then: 1 },
                                ],
                                default: 2,
                            },
                        },
                    },
                },
                { $sort: { severityRank: 1, amount: -1 } },
                { $skip: (page - 1) * limit },
                { $limit: limit },
                { $unset: "severityRank" },
            ] as never,
        }) as unknown as Promise<RawFlag[]>,
    ]);

    const txnIds = raw.map(r => r.transactionId).filter((v): v is string => typeof v === "string");
    const txns = txnIds.length > 0
        ? await prisma.finalTransactionData.findMany({
            where: { id: { in: txnIds }, userId },
            select: { id: true, date: true, description: true, debitAmount: true, creditAmount: true, balance: true },
        })
        : [];
    const byId = new Map(txns.map(t => [t.id, t]));

    // `aggregateRaw` answers in MongoDB extended JSON, so an ObjectId is `{$oid}` and a date
    // is `{$date}`. Unwrapped here or the client receives `{"$date":"…"}` where an ISO string
    // belongs — the same conversion `transactions.service.ts` does with its `iso()` helper.
    const data = raw.map(r => {
        const { _id, occurredAt, detectedAt, ...rest } = r;
        return {
            ...rest,
            id: _id.$oid,
            occurredAt: occurredAt ? occurredAt.$date : null,
            detectedAt: detectedAt ? detectedAt.$date : null,
            transaction: typeof r.transactionId === "string" ? byId.get(r.transactionId) ?? null : null,
        };
    });

    return { data, total };
}

export interface FlagSummaryFilters {
    severity?: string;
    kind?: string;
    month?: string;
}

/**
 * Counts and totals over this user's flags, as several faceted cuts.
 *
 * Separate from `listFlags` rather than bolted onto its `meta` because the page needs the
 * whole distribution to draw its pattern charts *while* the list beside them is filtered,
 * and because the sidebar badge needs `highCount` without fetching a page of rows at all.
 *
 * **Every cut applies the filters except its own dimension**, which is the rule that makes
 * filtering these charts safe at all. Narrowing to `kind=duplicate_charge` and then applying
 * that to `byKind` leaves a chart of exactly one bar — the control the reader is holding
 * disappears the moment they use it, and the same is true of `month` against `byMonth`. So
 * `byKind` answers "which kinds, among the severity and month you picked", `byMonth` answers
 * "which months, among the severity and kind you picked", and each stays a usable control.
 * `byCategory` has no filter of its own and so applies all three.
 *
 * That rule also governs the chip counts on the page: a facet's counts reflect every *other*
 * facet, so a combination that would return nothing can be seen to be empty before it is
 * clicked, and the chip you are standing on never reads zero.
 *
 * **`total`, `highCount` and `totalAmount` ignore the filters entirely.** They are statements
 * about the account — the "at stake" tile and the sidebar badge — not about the current view.
 * A badge that shrank when a filter was applied elsewhere on the page would be a lie about
 * how many findings exist.
 */
export async function getFlagSummary(userId: string, filters: FlagSummaryFilters = {}) {
    const all = await prisma.transactionFlag.findMany({
        where: { userId },
        select: {
            kind: true,
            severity: true,
            month: true,
            category: true,
            amount: true,
            transactionId: true,
        },
    });

    type Flag = typeof all[number];
    type Dimension = keyof FlagSummaryFilters;

    /** Every filter except `own`, which the caller's cut is itself grouped by. */
    const narrow = (own?: Dimension): Flag[] =>
        all.filter(
            f =>
                (own === "severity" || !filters.severity || f.severity === filters.severity) &&
                (own === "kind" || !filters.kind || f.kind === filters.kind) &&
                (own === "month" || !filters.month || f.month === filters.month)
        );

    /**
     * **`count` counts findings; `amount` counts money, and the two must not be summed the
     * same way.** Several detectors legitimately catch the *same payment* — a ₹50,000 transfer
     * that is both 16.7× the median at that payee and inside the user's largest 5% is a
     * `merchant_outlier` *and* a `large_opaque_transfer`, and neither is wrong. Adding both
     * rows' `amount` counted that ₹50,000 twice: on real data 23 of 76 flagged transactions
     * carried two or three flags, and the "at stake" figure came out at ₹16,42,564 against
     * ₹9,08,056 of distinct money — overstated by 81%. A figure a reader will compare against
     * their own statement cannot be inflated like that.
     *
     * So money is deduplicated per transaction within each group, keeping the largest flag
     * on that transaction; the count still reports every finding, because eight things to
     * look at really are eight things to look at.
     *
     * `dedupeAmount` is deliberately opt-in per group rather than always on. It is **wrong**
     * for `byKind`: a transaction cannot appear twice inside one kind (`dedupeKey` guarantees
     * it, and there are zero such collisions on real data), so there is nothing to remove,
     * and each kind's total is already its own honest exposure. It applies to the rollups that
     * span kinds — month, category, severity and the grand total — which is exactly where the
     * overlap shows up. One consequence to keep in mind: the `byKind` amounts therefore add
     * up to *more* than `totalAmount`, on purpose.
     *
     * Deduplication is *within* a group, not across groups, so two `bySeverity` buckets can
     * still share a transaction (one payment can be high under one kind and medium under
     * another). Month and category are properties of the transaction itself and so cannot
     * split that way; severity can. The UI reads only `bySeverity`'s counts, so no figure
     * shown to a reader depends on that — do not start rendering its `amount` without
     * deciding which severity a shared payment should belong to.
     */
    const tally = <K extends string>(
        rows: Flag[],
        key: (f: Flag) => K | null,
        dedupeAmount = false
    ) => {
        const out: Record<string, { count: number; amount: number }> = {};
        // group → transactionId → the largest amount seen on that transaction
        const perTxn = new Map<string, Map<string, number>>();

        for (const f of rows) {
            const k = key(f);
            if (k === null) continue;
            const slot = out[k] ?? { count: 0, amount: 0 };
            slot.count += 1;

            // A flag with no transaction — a price rise is about a pattern, not one payment —
            // has nothing to collide with and is always added.
            if (dedupeAmount && f.transactionId) {
                const seen = perTxn.get(k) ?? new Map<string, number>();
                seen.set(f.transactionId, Math.max(seen.get(f.transactionId) ?? 0, f.amount));
                perTxn.set(k, seen);
            } else {
                slot.amount += f.amount;
            }

            out[k] = slot;
        }

        for (const [k, seen] of perTxn) {
            out[k]!.amount += [...seen.values()].reduce((s, a) => s + a, 0);
        }
        return out;
    };

    const distinctAmount = (() => {
        const byTxn = new Map<string, number>();
        let looseTotal = 0;
        for (const f of all) {
            if (!f.transactionId) looseTotal += f.amount;
            else byTxn.set(f.transactionId, Math.max(byTxn.get(f.transactionId) ?? 0, f.amount));
        }
        return looseTotal + [...byTxn.values()].reduce((s, a) => s + a, 0);
    })();

    const largest = (t: Record<string, { amount: number }>) =>
        Math.round(Math.max(0, ...Object.values(t).map(v => v.amount)));

    return {
        total: all.length,
        highCount: all.filter(f => f.severity === "high").length,
        totalAmount: Math.round(distinctAmount),
        bySeverity: tally(narrow("severity"), f => f.severity, true),
        byKind: tally(narrow("kind"), f => f.kind),
        // Ascending, so a chart drawn from this reads left to right in time.
        byMonth: Object.fromEntries(
            Object.entries(tally(narrow("month"), f => f.month, true)).sort(([a], [b]) =>
                a.localeCompare(b)
            )
        ),
        byCategory: tally(narrow(), f => f.category, true),

        /**
         * `byCategory` split three ways by severity, unfiltered — like `totalAmount` and
         * `highCount`, this describes the account rather than the current view, because it
         * exists to answer one question the overview asks: *which categories have a red or
         * amber finding at all*, account-wide. `byCategory` alone cannot answer that — two
         * categories with an identical `{count: 3, amount: 9000}` can be three low-severity
         * price rises in one and three high-severity duplicate charges in the other, and a
         * screen deciding whether to flag a category red needs to tell those apart.
         *
         * Three separate tallies rather than one nested map, for the same reason `bySeverity`
         * and `byCategory` are already separate: a consumer that only wants "is there a high
         * finding in Groceries" reads `byCategoryBySeverity.high["Groceries"]` directly rather
         * than reaching into a category row and checking a nested severity key.
         */
        byCategoryBySeverity: {
            high: tally(all.filter(f => f.severity === "high"), f => f.category, true),
            medium: tally(all.filter(f => f.severity === "medium"), f => f.category, true),
            low: tally(all.filter(f => f.severity === "low"), f => f.category, true),
        },

        /**
         * The largest bar each cut would have with no filters at all.
         *
         * Sent because a chart that re-scales to its filtered maximum tells the reader
         * nothing about the filter. `RankedBars` sizes bars against the biggest row, so a
         * month whose only finding is ₹1,399 would draw a full-width bar — identical in
         * length to the ₹7,10,903 all-year transfers bar it replaced. Holding the scale
         * fixed is what makes filtering *look* like narrowing rather than like a different
         * set of similar-sized numbers.
         *
         * A number per cut rather than one shared number, because the three cuts have very
         * different maxima and a common scale would flatten two of them.
         */
        scaleMax: {
            severity: largest(tally(all, f => f.severity, true)),
            kind: largest(tally(all, f => f.kind)),
            month: largest(tally(all, f => f.month, true)),
            category: largest(tally(all, f => f.category, true)),
        },
    };
}

export async function triggerInsightsGeneration(userId: string, statementId?: string): Promise<void> {
    await insightsQueue.add(
        "insights.generate",
        { userId, statementId },
        { priority: jobPriorityFor(await planIdFor(userId)) }
    );

    /**
     * Announce the enqueue, not just the pickup.
     *
     * A per-statement run needs nothing here: the statement's own record changes and
     * `pdf.process` has already published a stream of frames the client is watching. A **full
     * recompute has no statement**, so until the worker claims the job — `concurrency: 1`, so
     * behind any other run that could be minutes — there is no record whose `updatedAt` moves
     * and no event on the wire. The UI had nothing to show between the click and the pickup,
     * which is exactly the window where a user decides the button is broken and clicks again.
     *
     * Deliberately fire-and-forget in the same shape as `publishStatementProgress`: the job is
     * already on the queue, so a Redis hiccup on the pub/sub channel must not fail the request
     * and lose a run the user will never know to retry.
     */
    if (!statementId) {
        try {
            await publish(userId, { stage: "insights_queued" });
        } catch (err) {
            console.error("[InsightsService] could not publish insights_queued:", err);
        }
    }
}

/**
 * Is a full recompute queued or running for this user right now?
 *
 * **SSE has no replay, and a full recompute has no record to fall back on.** Every other kind
 * of run is recoverable after a reload because `listUserProgress` reads it back out of
 * `StatementMetadata`; an account-level regeneration exists only as a queue entry and a pair
 * of events. Without this, reloading the page thirty seconds into a two-minute regeneration
 * showed no bell, no bar, and no reason to think anything was happening — the same hole the
 * statement snapshot was added to close.
 *
 * Reads the queue rather than the database because the queue is the only place the fact
 * lives. `delayed` counts: a job that failed once and is backing off is still a run in
 * progress from the user's point of view.
 */
export async function isRecomputing(userId: string): Promise<boolean> {
    const jobs = await insightsQueue.getJobs(["waiting", "active", "delayed"]);
    return jobs.some((job) => job?.data?.userId === userId && !job.data.statementId);
}

/**
 * `userId` is required and comes from the job payload.
 *
 * It used to be absent entirely: the worker destructured `userId` off the job and
 * then called this without it, so `insightsNode` created every `InsightReport`
 * with no owner while all three read paths filtered on one. The endpoints 404'd
 * for every user, permanently, and nothing surfaced an error — the report was
 * written, just unreachable. It is threaded end to end now, and `userId` is
 * required on the model so the same omission cannot recur silently.
 */
export async function runInsightsPipeline(userId: string, statementId?: string) {
    try {
        const agent = insightsAgentGraph.compile();
        const input = statementId
            ? { userId, statementMetadataId: statementId, messages: [] }
            : { userId, messages: [] };
        await agent.invoke(input);
    } catch (err) {
        console.error("[InsightsService] Pipeline error:", err);
        if (statementId) {
            try {
                await prisma.statementMetadata.update({
                    where: { id: statementId },
                    data: {
                        insightsStatus: "Error",
                        insightsError: err instanceof Error ? err.message : "Unknown error",
                    },
                });
            } catch { /* ignore */ }
        }
        throw err;
    }
}
