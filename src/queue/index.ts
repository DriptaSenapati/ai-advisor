import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { connection } from "./connection.js";

const retryDefaults = {
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 30_000 },
};

export const extractQueue  = new Queue("pdf.extract",       { connection, defaultJobOptions: { ...retryDefaults, backoff: { type: "exponential", delay: 15_000 } } });
export const pdfQueue      = new Queue("pdf.process",       { connection, defaultJobOptions: { ...retryDefaults } });
export const insightsQueue = new Queue("insights.generate", { connection, defaultJobOptions: { ...retryDefaults, backoff: { type: "exponential", delay: 60_000 } } });
export const goalQueue     = new Queue("goal.analyze",      { connection, defaultJobOptions: { ...retryDefaults, backoff: { type: "exponential", delay: 20_000 } } });
/**
 * Not user-triggered like the others — one repeatable job, scheduled once at
 * worker startup (see `worker.ts`), that sweeps `retainedFile` rows past their
 * 3-day hold. No `defaultJobOptions` retry backoff worth tuning: a missed run
 * is caught by the next day's run, since the sweep re-queries by cutoff rather
 * than acting on a fixed list.
 */
export const cleanupQueue  = new Queue("statements.cleanup", { connection });

/**
 * Phase 1 of an upload: read the PDF and stop.
 *
 * Its own queue rather than a `phase` field on one job, because the two halves
 * genuinely differ: this one is short, holds a file in storage that has to be
 * cleaned up, and retries cheaply. `pdf.process` is the multi-minute LLM run
 * that needs the 10-minute lock.
 */
export interface ExtractJobData {
    statementId: string;
    /** A key into `storage` (`src/lib/storage.ts`) — local path or S3 key, driver-dependent. */
    storageKey: string;
    bankName: string;
    userId: string;
    pdfPassword?: string;
}

/**
 * Phase 2: everything after the user presses Illuminate.
 *
 * Carries no `storageKey` on purpose — `statementPath` is read only by
 * `pdfExtractorNode`, so by this point the upload has already been deleted and
 * every downstream node reads from the database instead.
 */
export interface PdfJobData {
    statementId: string;
    userId: string;
}

export interface InsightsJobData {
    userId: string;
    statementId?: string;
}

export interface GoalJobData {
    goalId: string;
    userId: string;
    /** Resolved server-side in `goals.service.ts`; never taken from a client in production. */
    allowStaleData?: boolean;
}

const publisher = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

export async function publish(userId: string, payload: object): Promise<void> {
    await publisher.publish("sse:progress", JSON.stringify({ userId, ...payload }));
}
