import prisma from "../prismaClient.js";

/**
 * Durable job-level history for the admin panel — Bull Board/Redis only holds
 * job state ephemerally, so `AdminJobLog` is the only persisted record that a
 * job ran at all. Written at ENQUEUE time (not at worker-processor start),
 * because that is where every call site already knows `triggerSource` — the
 * processor function and the `.on("completed"/"failed")` handlers are separate
 * BullMQ callback registrations with no shared closure, so threading an id
 * across that boundary would cost more than the lookup-by-jobId below does.
 *
 * Must never fail the job it is logging: every export here is meant to be
 * called under a `.catch(err => console.error(...))` at the call site, the
 * same discipline `publishStatementProgress`/`publish` already follow.
 */

export type AdminJobType = "pdf.extract" | "pdf.process" | "insights.generate" | "goal.analyze";
export type AdminJobTriggerSource = "user-upload" | "user-action" | "auto-chain" | "system-requeue";

export async function logJobStart(params: {
    jobType: AdminJobType;
    jobId: string;
    userId?: string;
    statementMetadataId?: string;
    triggerSource: AdminJobTriggerSource;
}): Promise<void> {
    await prisma.adminJobLog.create({
        data: {
            jobType: params.jobType,
            jobId: params.jobId,
            ...(params.userId ? { userId: params.userId } : {}),
            ...(params.statementMetadataId ? { statementMetadataId: params.statementMetadataId } : {}),
            status: "started",
            triggerSource: params.triggerSource,
            startedAt: new Date(),
        },
    });
}

/** Finds the most recent "started" row for this jobId/jobType and marks it complete. */
export async function logJobFinish(jobId: string, jobType: AdminJobType): Promise<void> {
    const row = await prisma.adminJobLog.findFirst({
        where: { jobId, jobType, status: "started" },
        orderBy: { createdAt: "desc" },
    });
    if (!row) return; // enqueue-time write failed or predates this feature — nothing to update
    await prisma.adminJobLog.update({
        where: { id: row.id },
        data: { status: "completed", finishedAt: new Date() },
    });
}

export async function logJobFail(jobId: string, jobType: AdminJobType, error: string): Promise<void> {
    const row = await prisma.adminJobLog.findFirst({
        where: { jobId, jobType, status: "started" },
        orderBy: { createdAt: "desc" },
    });
    if (!row) return;
    await prisma.adminJobLog.update({
        where: { id: row.id },
        data: { status: "failed", finishedAt: new Date(), error },
    });
}
