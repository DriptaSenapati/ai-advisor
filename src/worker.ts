import "dotenv/config";
import fs from "fs/promises";
import { Worker } from "bullmq";
import { connection } from "./queue/connection.js";
import {
    insightsQueue,
    publish,
    type PdfJobData,
    type InsightsJobData,
    type GoalJobData,
} from "./queue/index.js";
import { runAdvisorPipeline } from "./api/services/statements.service.js";
import { runInsightsPipeline } from "./api/services/insights.service.js";
import { triggerGoalAnalysis } from "./modules/goalManager.js";

const workerOpts = { connection };

// --- PDF processing worker ---
const pdfWorker = new Worker<PdfJobData>(
    "pdf.process",
    async (job) => {
        const { statementId, filePath, bankName, userId, pdfPassword } = job.data;
        await publish(userId, { stage: "extracting", pct: 5, statementId });
        await runAdvisorPipeline(statementId, filePath, bankName, pdfPassword);
        await publish(userId, { stage: "pipeline_done", pct: 90, statementId });

        // Auto-trigger insights after successful PDF pipeline
        await insightsQueue.add("insights.generate", { userId, statementId });
        await publish(userId, { stage: "insights_queued", pct: 95, statementId });
    },
    {
        ...workerOpts,
        concurrency: 2,
        lockDuration: 600_000,   // 10 min — PDF pipeline can take up to 7 min
        lockRenewTime: 120_000,  // renew every 2 min (well within lockDuration)
    }
);

pdfWorker.on("completed", async (job) => {
    await fs.rm(job.data.filePath, { force: true }).catch(() => {});
    console.log(`[Worker] pdf.process completed: ${job.data.statementId}`);
});

pdfWorker.on("failed", async (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
        await fs.rm(job.data.filePath, { force: true }).catch(() => {});
    }
    console.error(`[Worker] pdf.process failed (attempt ${job?.attemptsMade}):`, err.message);
});

// --- Insights generation worker ---
const insightsWorker = new Worker<InsightsJobData>(
    "insights.generate",
    async (job) => {
        const { userId, statementId } = job.data;
        await publish(userId, { stage: "insights_started", statementId });
        await runInsightsPipeline(statementId);
        await publish(userId, { stage: "insights_done", pct: 100, statementId });
    },
    { ...workerOpts, concurrency: 1 }
);

insightsWorker.on("completed", (job) =>
    console.log(`[Worker] insights.generate completed: statementId=${job.data.statementId}`)
);
insightsWorker.on("failed", (_job, err) =>
    console.error("[Worker] insights.generate failed:", err.message)
);

// --- Goal analysis worker ---
const goalWorker = new Worker<GoalJobData>(
    "goal.analyze",
    async (job) => {
        const { goalId, userId } = job.data;
        await publish(userId, { stage: "goal_analyzing", goalId });
        await triggerGoalAnalysis(goalId);
        await publish(userId, { stage: "goal_done", goalId });
    },
    { ...workerOpts, concurrency: 3 }
);

goalWorker.on("completed", (job) =>
    console.log(`[Worker] goal.analyze completed: ${job.data.goalId}`)
);
goalWorker.on("failed", (_job, err) =>
    console.error("[Worker] goal.analyze failed:", err.message)
);

console.log("[Worker] All workers started — pdf.process(×2), insights.generate(×1), goal.analyze(×3)");
