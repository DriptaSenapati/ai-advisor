import prisma from "../../../prismaClient.js";
import { NotFoundError, ConflictError, assertValidObjectId } from "../../errors.js";
import { extractQueue, pdfQueue } from "../../../queue/index.js";
import { jobPriorityFor } from "../../../config/plans.js";
import { planIdFor } from "../../middleware/entitlement.js";
import { storage } from "../../../lib/storage.js";
import { logJobStart } from "../../../lib/adminJobLog.js";

async function priorityFor(userId: string): Promise<number> {
    return jobPriorityFor(await planIdFor(userId));
}

/**
 * The admin "retry" action — a thin, audited wrapper around the same
 * `extractQueue.add`/`pdfQueue.add` calls the product API already makes.
 * No new queue, no new job type, no reimplementation of the pipeline.
 */
export async function retryAdminStatement(id: string): Promise<{ requeued: true; jobType: "pdf.extract" | "pdf.process" }> {
    assertValidObjectId(id);
    const statement = await prisma.statementMetadata.findUnique({ where: { id } });
    if (!statement) throw new NotFoundError("Statement", id);
    if (!statement.userId) {
        throw new ConflictError("This statement has no owning user and cannot be retried.", "NO_OWNER");
    }
    const userId = statement.userId;

    if (statement.extractionStatus === "Error") {
        // Only the password-failure case keeps its upload — every other
        // extraction failure has already had its file deleted by the worker
        // (see extractWorker.on("failed") in worker.ts), and there is nothing
        // to retry without it.
        const key = statement.retainedFile;
        const held = key ? await storage.exists(key) : false;
        if (!key || !held) {
            throw new ConflictError(
                "The original file is no longer held — the user must re-upload it.",
                "SOURCE_UNAVAILABLE"
            );
        }

        await prisma.statementMetadata.update({
            where: { id },
            data: { extractionStatus: "Processing", extractionError: null },
        });

        const job = await extractQueue.add(
            "pdf.extract",
            { statementId: id, storageKey: key, bankName: statement.bankName, userId },
            { priority: await priorityFor(userId) }
        );
        await logJobStart({
            jobType: "pdf.extract",
            jobId: job.id ?? id,
            userId,
            statementMetadataId: id,
            triggerSource: "system-requeue",
        }).catch((err) => console.error("[Admin] failed to log job start:", err));

        return { requeued: true, jobType: "pdf.extract" };
    }

    const phase2Failed =
        statement.extractionStatus === "Completed" &&
        (statement.normalizerStatus === "Error" ||
            statement.categorizationStatus === "Error" ||
            statement.insightsStatus === "Error");

    if (phase2Failed) {
        // Same conditional-claim pattern `startProcessing` uses, so a
        // double-click (or a race with the worker) can't double-enqueue.
        const claimed = await prisma.statementMetadata.updateMany({
            where: {
                id,
                OR: [{ normalizerStatus: "Error" }, { categorizationStatus: "Error" }, { insightsStatus: "Error" }],
            },
            data: {
                normalizerStatus: "Processing",
                categorizationStatus: "Not Started",
                insightsStatus: "Not Started",
                normalizerError: null,
                insightsError: null,
            },
        });
        if (claimed.count === 0) {
            throw new ConflictError("This statement is already being retried.", "ALREADY_STARTED");
        }

        const job = await pdfQueue.add(
            "pdf.process",
            { statementId: id, userId },
            { priority: await priorityFor(userId) }
        );
        await logJobStart({
            jobType: "pdf.process",
            jobId: job.id ?? id,
            userId,
            statementMetadataId: id,
            triggerSource: "system-requeue",
        }).catch((err) => console.error("[Admin] failed to log job start:", err));

        return { requeued: true, jobType: "pdf.process" };
    }

    throw new ConflictError("This statement is not in a failed state.", "NOT_RETRYABLE");
}
