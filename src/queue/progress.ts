import prisma from "../prismaClient.js";
import { publish } from "./index.js";

/**
 * Progress events that carry the answer, not just the question.
 *
 * ---
 *
 * **Why every event ships a full status snapshot.** The original events were
 * `{stage, pct}` and nothing else, which made them a doorbell: a client that
 * received one still had to go and read the statement to find out what had
 * actually changed. That is what forced the frontend into a 5-second poll, with
 * the stream demoted to a "re-read it now" nudge — an inversion nobody wanted,
 * and the source of a real bug (polling through a Next.js Server Action
 * revalidated the current route and yanked the router backwards mid-navigation).
 *
 * Attaching the projection costs one indexed `findUnique` per event, and there
 * are roughly eight events in a statement's whole life. The poll it replaces was
 * one query every five seconds per open tab, for the entire duration of a
 * multi-minute pipeline. The snapshot is cheaper by an order of magnitude and it
 * is also *correct*, because the payload and the record can no longer disagree.
 *
 * **The client still derives its stage from the status fields, not from
 * `stage`.** `stage` is a label for logs and for humans reading Bull Board; the
 * four `*Status` fields are the machine-readable truth, they change at every real
 * boundary, and — unlike a stage string — they cannot be delivered out of order
 * in a way that makes the UI go backwards, because a later snapshot simply
 * overwrites an earlier one.
 */

/**
 * The one projection: `GET /statements/:id/status` and every SSE frame return
 * exactly this. Two shapes that are *nearly* the same is how a client ends up
 * with a field that exists on one path and not the other, so there is only one.
 *
 * `updatedAt` is load-bearing rather than decorative — the client uses it to
 * decide whether a server-rendered seed is newer than what it already holds, so
 * a cached RSC payload cannot overwrite live state with something staler.
 */
export const statementProgressSelect = {
    id: true,
    bankName: true,
    // The row rendered mid-run is built from this projection alone, and until the
    // vision model answers there is nothing else on it that identifies which
    // upload it is — no period, no account number, sometimes not even the bank.
    fileName: true,
    accountNumber: true,
    statementPeriodStart: true,
    statementPeriodEnd: true,
    extractionStatus: true,
    normalizerStatus: true,
    categorizationStatus: true,
    insightsStatus: true,
    gateDecision: true,
    extractionError: true,
    normalizerError: true,
    insightsError: true,
    rawRowCount: true,
    totalTransactions: true,
    exceptionCount: true,
    isImageBased: true,
    extractionConfidence: true,
    balanceGapCount: true,
    updatedAt: true,
    // Selected so it can be turned into `awaitingPassword` below — never sent as
    // it stands. See `toPublicStatement`.
    retainedFile: true,
} as const;

export type StatementProgress = Awaited<ReturnType<typeof readStatementProgress>>;

/**
 * The client-facing shape of a statement row.
 *
 * `retainedFile` is a filename on the server's disk. It is swapped for the single
 * bit a client actually needs — **can this be retried with just a password** —
 * because a browser has no business knowing how the API stores anything, and
 * because that boolean is what the recovery screen branches on. Every path that
 * returns a statement goes through here: the list, the single read, the status
 * projection and every SSE frame.
 */
export function toPublicStatement<T extends { retainedFile?: string | null }>(row: T) {
    const { retainedFile, ...rest } = row;
    return { ...rest, awaitingPassword: retainedFile != null };
}

export async function readStatementProgress(statementId: string) {
    const row = await prisma.statementMetadata.findUnique({
        where: { id: statementId },
        select: statementProgressSelect,
    });
    return row ? toPublicStatement(row) : null;
}

/**
 * Publish one statement event with its current status attached.
 *
 * Never throws. A progress event is a courtesy — the database has already been
 * written by the time this is called, so failing the job because Redis blinked
 * would turn a cosmetic problem into a lost pipeline run. The client recovers on
 * its own anyway: every reconnect is answered with a fresh snapshot.
 */
export async function publishStatementProgress(
    userId: string,
    statementId: string,
    stage: string,
    pct?: number,
    extra: Record<string, unknown> = {}
): Promise<void> {
    try {
        const statement = await readStatementProgress(statementId);
        await publish(userId, {
            stage,
            ...(pct === undefined ? {} : { pct }),
            statementId,
            ...extra,
            statement,
        });
    } catch (err) {
        console.error(`[Progress] could not publish "${stage}" for ${statementId}:`, err);
    }
}

/**
 * Everything this user has that is not finished, for the frame written the
 * instant an SSE connection opens.
 *
 * **This is what makes polling unnecessary rather than merely unfashionable.**
 * SSE has no replay: a tab opened mid-run, or one whose connection dropped and
 * auto-reconnected, hears nothing until the next event fires — which during
 * categorisation can be minutes away, and at the Illuminate gate is never. The
 * snapshot closes that hole once per connection instead of every five seconds
 * forever.
 *
 * "Not finished" includes statements parked at the gate and ones that failed:
 * both are things the user still needs shown, and neither will produce another
 * event on its own.
 */
export async function listUserProgress(userId: string, limit = 25) {
    const rows = await prisma.statementMetadata.findMany({
        where: { userId, NOT: { insightsStatus: "Completed" } },
        select: statementProgressSelect,
        orderBy: { createdAt: "desc" },
        take: limit,
    });
    return rows.map(toPublicStatement);
}
