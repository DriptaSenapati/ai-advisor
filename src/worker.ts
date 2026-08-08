import "./envConfig.js";
import { Worker, type Job } from "bullmq";
import { connection } from "./queue/connection.js";
import { storage } from "./lib/storage.js";
import {
    insightsQueue,
    goalQueue,
    cleanupQueue,
    publish,
    type ExtractJobData,
    type PdfJobData,
    type InsightsJobData,
    type GoalJobData,
} from "./queue/index.js";
import { publishStatementProgress } from "./queue/progress.js";
import {
    releaseRetainedFile,
    runExtractionPipeline,
    runProcessPipeline,
    sweepExpiredRetainedFiles,
} from "./api/services/statements.service.js";
import { isPdfPasswordError } from "./modules/pdf/pdf_extractor.js";
import { runInsightsPipeline } from "./api/services/insights.service.js";
import { triggerGoalAnalysis } from "./modules/goalManager.js";
import { planIdFor } from "./api/middleware/entitlement.js";
import { jobPriorityFor } from "./config/plans.js";
import prisma from "./prismaClient.js";
import { logJobStart, logJobFinish, logJobFail } from "./lib/adminJobLog.js";

const workerOpts = { connection };

/**
 * BullMQ fires `failed` once per attempt, and every attempt but the last is
 * followed by a retry. Only the last one is terminal, so it's the only one the
 * client should hear about — announcing a failure the queue then quietly
 * recovers from is worse than saying nothing.
 */
const isFinalAttempt = (job?: Job): boolean =>
    !job || job.attemptsMade >= (job.opts.attempts ?? 3);

/**
 * Terminal error event for the progress stream.
 *
 * The pipelines already record failures in the database (`normalizerStatus:
 * "Error"` + `normalizerError`), so `GET /statements/:id/status` has always
 * reported them correctly. The SSE stream did not: the success path published
 * every stage while the failure path only logged to stdout, so a client
 * following along would receive `extracting 5%` and then silence forever, with
 * no way to tell a dead job from a slow one. Every stream now ends in a
 * terminal event, success or failure.
 *
 * `error` carries the same message the status endpoint already exposes as
 * `normalizerError`, so this reveals nothing new to the client.
 */
async function publishFailure(
    userId: string | undefined,
    stage: string,
    err: Error,
    extra: Record<string, unknown> = {}
): Promise<void> {
    if (!userId) return; // nothing to address it to
    try {
        // A statement failure carries the record, like every other statement
        // event, so the client's terminal state comes from `normalizerStatus:
        // "Error"` rather than from having to trust a stage string.
        const statementId = extra["statementId"];
        if (typeof statementId === "string") {
            await publishStatementProgress(userId, statementId, stage, undefined, { error: err.message });
            return;
        }
        await publish(userId, { stage, error: err.message, ...extra });
    } catch (publishErr) {
        // Redis is very likely the reason the job failed in the first place;
        // an unhandled rejection here would take the whole worker down with it.
        console.error("[Worker] could not publish failure event:", publishErr);
    }
}

/**
 * Which graph node maps to which announced stage, and how far along it is.
 *
 * Both phases publish on every node boundary. Before this the stream went from
 * `extracting`(5) straight to `pipeline_done`(90) with nothing in between, and
 * that gap is the entire reason the frontend used to poll: a client cannot be
 * event-driven against a source that goes silent for the majority of the run.
 *
 * The percentages are for humans reading a log or a queue dashboard. The client
 * derives its stage from the status fields in the attached snapshot instead —
 * they change at the same boundaries and cannot contradict the record.
 */
const NODE_STAGE: Record<string, { stage: string; pct: number }> = {
    // phase 1
    pdfExtractorNode: { stage: "extracted", pct: 30 },
    // phase 2
    rehydrateNode: { stage: "normalizing", pct: 45 },
    statementNormalizerSubgraph: { stage: "normalized", pct: 65 },
    balanceAnalyzerSubgraph: { stage: "balance_checked", pct: 72 },
    transactionCategorySubgraph: { stage: "categorized", pct: 88 },
};

const nodeReporter = (userId: string, statementId: string) => async (node: string) => {
    const step = NODE_STAGE[node];
    if (!step) return; // an unmapped node is not worth inventing a stage for
    await publishStatementProgress(userId, statementId, step.stage, step.pct);
};

/**
 * An upload runs as two jobs with the user's decision in between.
 *
 *   pdf.extract   read the PDF, then stop          ← this is all an upload starts
 *      ↓                    (the Illuminate gate)
 *   pdf.process   normalise → balance → categorise → enqueue insights
 *
 * The split is what makes "Illuminate" mean something: until it is pressed, no
 * transaction has been embedded, clustered or sent to an LLM for categorisation.
 * `POST /statements/:id/process` is the only producer of `pdf.process` jobs.
 */

// --- Phase 1: extraction ---
const extractWorker = new Worker<ExtractJobData>(
    "pdf.extract",
    async (job) => {
        const { statementId, storageKey, bankName, userId, pdfPassword } = job.data;
        await publishStatementProgress(userId, statementId, "extracting", 5);
        // `pdfExtractorNode` completing publishes `extracted`(30) via the reporter.
        // Terminal for this job, but *not* for the statement — it is now parked at
        // the gate, and nothing further will be published until the user answers.
        await runExtractionPipeline(
            statementId,
            userId,
            storageKey,
            bankName,
            pdfPassword,
            nodeReporter(userId, statementId)
        );
    },
    {
        ...workerOpts,
        concurrency: 2,
        // Shorter than the process phase: this is mupdf plus one vision call for
        // page 1, unless the PDF is scanned, in which case it is a call per page.
        lockDuration: 300_000,
        lockRenewTime: 60_000,
    }
);

/**
 * The uploaded file is deleted here rather than after processing, and that is
 * safe rather than lucky: `statementPath` is read only by `pdfExtractorNode`, so
 * once this job is done nothing else will ever open it. Phase 2 reads rows out of
 * `StatementExtractedData` instead.
 */
extractWorker.on("completed", async (job) => {
    await storage.delete(job.data.storageKey).catch(() => {});
    // A successful run may be the *retry* of a locked statement, which is the one
    // case where a file was deliberately kept. Clearing the marker alongside the
    // delete is what stops `POST /unlock` offering a file that is no longer there.
    await releaseRetainedFile(job.data.statementId).catch(() => {});
    await logJobFinish(job.id ?? job.data.statementId, "pdf.extract").catch((err) =>
        console.error("[AdminJobLog] failed to log job finish:", err)
    );
    console.log(`[Worker] pdf.extract completed: ${job.data.statementId} — awaiting user confirmation`);
});

/**
 * A wrong password is the only extraction failure the user can fix, so it is the
 * only one whose upload is worth keeping.
 *
 * Everything else — a corrupt file, an unreadable layout — will fail identically
 * however many times it is retried, and holding the bytes would just be an
 * unbounded pile of dead PDFs on disk. A locked statement, by contrast, is one
 * field away from working, and deleting the file turns that into "upload it
 * again", which is what this exists to avoid.
 */
extractWorker.on("failed", async (job, err) => {
    if (isFinalAttempt(job)) {
        // `runExtractionPipeline` has already recorded which case this is, by
        // writing `retainedFile` when the password was the problem. All that is
        // left here is to leave those bytes alone.
        if (job && !isPdfPasswordError(err)) {
            await storage.delete(job.data.storageKey).catch(() => {});
        }
        await publishFailure(job?.data.userId, "extract_failed", err, { statementId: job?.data.statementId });
        if (job) {
            await logJobFail(job.id ?? job.data.statementId, "pdf.extract", err.message).catch((e) =>
                console.error("[AdminJobLog] failed to log job fail:", e)
            );
        }
    }
    console.error(`[Worker] pdf.extract failed (attempt ${job?.attemptsMade}):`, err.message);
});

// --- Phase 2: everything the user authorised ---
const pdfWorker = new Worker<PdfJobData>(
    "pdf.process",
    async (job) => {
        const { statementId, userId } = job.data;
        await runProcessPipeline(statementId, userId, nodeReporter(userId, statementId));
        await publishStatementProgress(userId, statementId, "pipeline_done", 90);

        // Auto-trigger insights after successful PDF pipeline.
        // The priority has to be carried across the hand-off: a job added with no
        // explicit priority is processed *ahead* of prioritized ones in BullMQ, so
        // omitting it here would let a free account's insights run overtake a
        // Radiant one — see `jobPriorityFor` in config/plans.ts.
        const insightsJob = await insightsQueue.add(
            "insights.generate",
            { userId, statementId },
            { priority: jobPriorityFor(await planIdFor(userId)) }
        );
        await logJobStart({
            jobType: "insights.generate",
            jobId: insightsJob.id ?? statementId,
            userId,
            statementMetadataId: statementId,
            triggerSource: "auto-chain",
        }).catch((err) => console.error("[AdminJobLog] failed to log job start:", err));
        await publishStatementProgress(userId, statementId, "insights_queued", 95);
    },
    {
        ...workerOpts,
        concurrency: 2,
        lockDuration: 600_000,   // 10 min — PDF pipeline can take up to 7 min
        lockRenewTime: 120_000,  // renew every 2 min (well within lockDuration)
    }
);

// No file to clean up — this job never had one in its payload.
pdfWorker.on("completed", async (job) => {
    await logJobFinish(job.id ?? job.data.statementId, "pdf.process").catch((err) =>
        console.error("[AdminJobLog] failed to log job finish:", err)
    );
    console.log(`[Worker] pdf.process completed: ${job.data.statementId}`);
});

pdfWorker.on("failed", async (job, err) => {
    if (isFinalAttempt(job)) {
        await publishFailure(job?.data.userId, "failed", err, { statementId: job?.data.statementId });
        if (job) {
            await logJobFail(job.id ?? job.data.statementId, "pdf.process", err.message).catch((e) =>
                console.error("[AdminJobLog] failed to log job fail:", e)
            );
        }
    }
    console.error(`[Worker] pdf.process failed (attempt ${job?.attemptsMade}):`, err.message);
});

/**
 * Re-run every active goal's simulation after the account's derived data changes.
 *
 * A goal's `simulationResult` is a snapshot — Monte Carlo over `MonthlyStats` and
 * `RecurringPattern` as they stood at the moment someone pressed "analyze". A new
 * statement rewrites both (new months, shifted rolling averages, a changed income
 * floor), and until this the simulation just sat there unrefreshed: correct for
 * data that no longer exists, with nothing on `/goals` or the goal detail page
 * to say so.
 *
 * **Called only for a per-statement `insights.generate` run, never a full
 * recompute.** A full recompute (`POST /insights/generate` with no
 * `statementId`) re-derives the same report from `MonthlyStats`/`RecurringPattern`
 * that have not changed — a "Regenerate" click, or the dev plan switcher's
 * re-read — so triggering ten thousand Monte Carlo iterations per active goal
 * off it would be a full re-simulation of numbers nothing moved. Only a real
 * statement finishing is "the derived data just moved"; the caller guards this
 * on `statementId` being present.
 *
 * **`checking` goals are skipped.** They have no simulation yet and may still be
 * deleted by the intent gate; re-analysing one would race that gate's own
 * `goal.analyze` job for the same row. `completed`/`cancelled` are skipped
 * because nothing about them is meant to keep moving.
 *
 * Each job goes through the same queue, same priority rule and same
 * `allowStaleData` resolution as a manual "Re-analyze" click — this is not a
 * separate code path, only a different trigger for the existing one.
 */
async function requeueActiveGoals(userId: string): Promise<void> {
    const goals = await prisma.goal.findMany({
        where: { userId, status: "active" },
        select: { id: true },
    });
    if (goals.length === 0) return;

    const priority = jobPriorityFor(await planIdFor(userId));
    for (const g of goals) {
        await publish(userId, { stage: "goal_queued", goalId: g.id });
        const job = await goalQueue.add(
            "goal.analyze",
            { goalId: g.id, userId, allowStaleData: resolveAllowStaleData() },
            { priority }
        );
        await logJobStart({
            jobType: "goal.analyze",
            jobId: job.id ?? g.id,
            userId,
            triggerSource: "auto-chain",
        }).catch((err) => console.error("[AdminJobLog] failed to log job start:", err));
    }
}

/** Mirrors `goals.service.ts`'s `resolveAllowStaleData(force?)` with no per-call
    `force` — an automatic refresh is never the forced path, only the env-level
    local-fixture default. Duplicated rather than imported: the service module
    pulls in Express-only middleware the worker process has no business loading. */
function resolveAllowStaleData(): boolean {
    return process.env["GOAL_SIM_ALLOW_STALE_DATA"] === "true";
}

// --- Insights generation worker ---
const insightsWorker = new Worker<InsightsJobData>(
    "insights.generate",
    async (job) => {
        const { userId, statementId } = job.data;
        // A full recompute has no statementId — an account-level event, with no
        // statement record to attach.
        if (statementId) await publishStatementProgress(userId, statementId, "insights_started", 96);
        else await publish(userId, { stage: "insights_started" });

        await runInsightsPipeline(userId, statementId);

        if (statementId) await publishStatementProgress(userId, statementId, "insights_done", 100);
        else await publish(userId, { stage: "insights_done", pct: 100 });

        // Goals are re-simulated after insights, never before: the Monte Carlo
        // engine reads `MonthlyStats`/`RecurringPattern` directly, and this is the
        // point in the pipeline where both are guaranteed to reflect the new
        // statement.
        //
        // **Only when this run came from a real statement**, i.e. `statementId`
        // is present. A full recompute (`POST /insights/generate` with no
        // `statementId` — the manual "Regenerate" button, or the dev plan
        // switcher's re-read) re-derives the report from data that has not
        // changed, so it must not spend a Monte Carlo run on every active goal
        // for nothing. New numbers on disk is the trigger, not "the LLM wrote a
        // new report about the same numbers".
        //
        // A failure here must not fail the insights job itself — the report just
        // generated is real regardless of whether a goal refresh could be queued.
        try {
            if (statementId) await requeueActiveGoals(userId);
        } catch (err) {
            console.error("[Worker] failed to requeue goals after insights:", err);
        }
    },
    { ...workerOpts, concurrency: 1 }
);

insightsWorker.on("completed", async (job) => {
    await logJobFinish(job.id ?? job.data.userId, "insights.generate").catch((err) =>
        console.error("[AdminJobLog] failed to log job finish:", err)
    );
    console.log(`[Worker] insights.generate completed: statementId=${job.data.statementId}`);
});
insightsWorker.on("failed", async (job, err) => {
    if (isFinalAttempt(job)) {
        // statementId is absent on a full recompute — an account-level event.
        await publishFailure(job?.data.userId, "insights_failed", err, {
            ...(job?.data.statementId ? { statementId: job.data.statementId } : {}),
        });
        if (job) {
            await logJobFail(job.id ?? job.data.userId, "insights.generate", err.message).catch((e) =>
                console.error("[AdminJobLog] failed to log job fail:", e)
            );
        }
    }
    console.error(`[Worker] insights.generate failed (attempt ${job?.attemptsMade}):`, err.message);
});

// --- Goal analysis worker ---
const goalWorker = new Worker<GoalJobData>(
    "goal.analyze",
    async (job) => {
        const { goalId, userId, allowStaleData } = job.data;

        /*
          Two stages, because the graph has two layers and they feel different: the gate is a
          second, the simulation is a minute. A screen told only "working" for both would look
          stuck through the long half.
        */
        await publish(userId, { stage: "goal_checking", goalId });
        const result = await triggerGoalAnalysis(
            goalId,
            userId,
            allowStaleData === true,
            async (node, emitted) => {
                /*
                  The gate finishing is the moment the long half starts — but only if it let
                  the run through. A rejected gate also completes, and announcing "analyzing"
                  a beat before `goal_blocked` would be a frame that was never true.
                */
                if (node === "goalIntentGateNode" && emitted?.["blocked"] !== true) {
                    await publish(userId, { stage: "goal_analyzing", goalId });
                }
            }
        );

        /*
          A gate rejection is a *successful* job with nothing to show, so it cannot ride the
          `failed` handler. `goal_blocked` carries the reason category and never the user's
          own words — the copy for it lives in the UI, keyed on `reasonCode`.
        */
        if (result["blocked"] === true) {
            await publish(userId, { stage: "goal_blocked", goalId, reasonCode: result["reasonCode"] });
            return;
        }

        await publish(userId, { stage: "goal_done", goalId });
    },
    { ...workerOpts, concurrency: 3 }
);

goalWorker.on("completed", async (job) => {
    await logJobFinish(job.id ?? job.data.goalId, "goal.analyze").catch((err) =>
        console.error("[AdminJobLog] failed to log job finish:", err)
    );
    console.log(`[Worker] goal.analyze completed: ${job.data.goalId}`);
});
goalWorker.on("failed", async (job, err) => {
    if (isFinalAttempt(job)) {
        await publishFailure(job?.data.userId, "goal_failed", err, { goalId: job?.data.goalId });
        if (job) {
            await logJobFail(job.id ?? job.data.goalId, "goal.analyze", err.message).catch((e) =>
                console.error("[AdminJobLog] failed to log job fail:", e)
            );
        }
    }
    console.error(`[Worker] goal.analyze failed (attempt ${job?.attemptsMade}):`, err.message);
});

// --- Retained-file cleanup: silent 3-day sweep ---
const cleanupWorker = new Worker(
    "statements.cleanup",
    async (job) => {
        // Logged inside the processor, not at schedule-registration time: a
        // repeatable job gets a fresh `job.id` on every firing, so a start/finish
        // pair only correlates correctly if both halves read the same `job.id`
        // from the same invocation — exactly what the "completed" handler below
        // also does.
        await logJobStart({
            jobType: "statements.cleanup",
            jobId: job.id ?? "retained-file-sweep",
            triggerSource: "system-requeue",
        }).catch((err) => console.error("[AdminJobLog] failed to log job start:", err));

        const result = await sweepExpiredRetainedFiles();
        console.log(`[Worker] statements.cleanup swept ${result.swept} expired retained file(s)`);
        return result;
    },
    { ...workerOpts, concurrency: 1 }
);

cleanupWorker.on("completed", async (job) => {
    await logJobFinish(job.id ?? "retained-file-sweep", "statements.cleanup").catch((err) =>
        console.error("[AdminJobLog] failed to log job finish:", err)
    );
});
cleanupWorker.on("failed", async (job, err) => {
    console.error("[Worker] statements.cleanup failed:", err.message);
    if (job) {
        await logJobFail(job.id ?? "retained-file-sweep", "statements.cleanup", err.message).catch((e) =>
            console.error("[AdminJobLog] failed to log job fail:", e)
        );
    }
});

/**
 * Scheduled once here, not from an HTTP route or script — this is the only
 * process that runs continuously, and BullMQ dedups repeatable jobs by
 * `jobId`, so re-registering on every worker restart/deploy is a no-op rather
 * than a pile of duplicate schedules. Daily rather than every exactly-3-days:
 * it keeps the actual deletion delay to "3 days ± up to 1 day," which is fine
 * for housekeeping and simpler to reason about than aligning to a moving
 * per-row cutoff.
 */
async function scheduleRetainedFileSweep(): Promise<void> {
    await cleanupQueue.add(
        "sweep-retained-files",
        {},
        { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: "retained-file-sweep" }
    );
}
scheduleRetainedFileSweep().catch((err) =>
    console.error("[Worker] failed to schedule retained-file sweep:", err)
);

console.log("[Worker] All workers started — pdf.extract(×2), pdf.process(×2), insights.generate(×1), goal.analyze(×3), statements.cleanup(×1, daily)");
