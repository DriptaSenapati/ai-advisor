import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { connection } from "./connection.js";

const retryDefaults = {
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 30_000 },
};

export const pdfQueue      = new Queue("pdf.process",       { connection, defaultJobOptions: { ...retryDefaults } });
export const insightsQueue = new Queue("insights.generate", { connection, defaultJobOptions: { ...retryDefaults, backoff: { type: "exponential", delay: 60_000 } } });
export const goalQueue     = new Queue("goal.analyze",      { connection, defaultJobOptions: { ...retryDefaults, backoff: { type: "exponential", delay: 20_000 } } });

export interface PdfJobData {
    statementId: string;
    filePath: string;
    bankName: string;
    userId: string;
    pdfPassword?: string;
}

export interface InsightsJobData {
    userId: string;
    statementId?: string;
}

export interface GoalJobData {
    goalId: string;
    userId: string;
}

const publisher = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

export async function publish(userId: string, payload: object): Promise<void> {
    await publisher.publish("sse:progress", JSON.stringify({ userId, ...payload }));
}
