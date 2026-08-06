import { createHash, randomUUID } from "crypto";
import prisma from "../../prismaClient.js";
import { statementExtractGraph, statementProcessGraph } from "../../graph.js";
import { isPdfPasswordError } from "../../modules/pdf/pdf_extractor.js";
import { ConflictError, NotFoundError, PlanLimitError, PlanRequiredError, assertValidObjectId } from "../errors.js";
import { extractQueue, pdfQueue } from "../../queue/index.js";
import { planIdFor } from "../middleware/entitlement.js";
import { jobPriorityFor, minimumPlanFor, nextPlanForLimit, resolvePlan } from "../../config/plans.js";
import { storage } from "../../lib/storage.js";
import { logJobStart } from "../../lib/adminJobLog.js";
import {
    listUserProgress,
    publishStatementProgress,
    statementProgressSelect,
    toPublicStatement,
} from "../../queue/progress.js";

function computeContentHash(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
}

/**
 * The uploaded filename, made safe to *show*. It is never used as a path.
 *
 * Two things are being defended against, and only one of them is exotic:
 *
 * - **It is attacker-controlled text.** Directory components are stripped rather
 *   than escaped (`../../etc/passwd` becomes `passwd`), control characters go, and
 *   the whole thing is capped — a 4,000-character name is not a display label.
 *   Nothing downstream may join this onto a directory; multer already wrote the
 *   file under a UUID and that is the only name the pipeline uses.
 * - **Busboy decodes the name as latin1**, so a browser sending UTF-8 — anything
 *   with an accent, or a non-Latin script — arrives mojibaked (`Ã©` for `é`). The
 *   round trip below recovers it, and is a no-op for the pure-ASCII names that
 *   make up almost everything. If the bytes were not valid UTF-8 after all, the
 *   decode yields U+FFFD and the original is kept instead of a row of question
 *   marks.
 */
export function displayFileName(original: string | undefined): string | undefined {
    if (!original) return undefined;

    const reencoded = Buffer.from(original, "latin1").toString("utf8");
    const decoded = reencoded.includes("�") ? original : reencoded;

    const base = decoded.split(/[\\/]/).pop() ?? "";
    // eslint-disable-next-line no-control-regex
    const cleaned = base.replace(/[\x00-\x1f\x7f]/g, "").trim();
    return cleaned.length > 0 ? cleaned.slice(0, 200) : undefined;
}

/**
 * The queue priority for this user's jobs.
 *
 * Every `queue.add` in this file goes through it — see `jobPriorityFor`'s
 * docblock for why an unset priority is worse than no feature at all.
 */
async function priorityFor(userId: string): Promise<number> {
    return jobPriorityFor(await planIdFor(userId));
}

/**
 * Refuse an upload the caller's plan does not cover.
 *
 * **This is enqueue-time, and it has to be.** The worker has no HTTP context to
 * reject into, and by the time a job is picked up the money is already spent:
 * phase 1 always makes at least one vision LLM call, and an image-based
 * statement is extracted page by page with vision. The upload quota is the only
 * real bound on what a free account costs to serve, which is why it is enforced
 * before `extractQueue.add` rather than anywhere later.
 *
 * Runs against `req.file.buffer`, before anything is written to storage — so a
 * refusal here has nothing to clean up, unlike the old disk-backed upload where
 * multer had already written the file by the time this ran.
 *
 * Two separate rules, and the order matters: the **count** is checked first
 * because it is the one a free user hits by simply using the product, and it
 * would be confusing to be told about multi-bank when the real answer is "you
 * have used your one upload".
 */
async function assertUploadAllowed(userId: string, bankName: string): Promise<void> {
    const plan = resolvePlan(await planIdFor(userId));

    const cap = plan.limits.statements;
    if (cap !== null) {
        const used = await prisma.statementMetadata.count({ where: { userId } });
        if (used >= cap) {
            throw new PlanLimitError(
                "statements",
                cap,
                used,
                nextPlanForLimit("statements", cap),
                plan.id,
                cap === 1
                    ? "Your plan includes one statement. Upgrade to add more."
                    : `Your plan includes ${cap} statements.`
            );
        }
    }

    if (!plan.features.multi_bank) {
        const other = await prisma.statementMetadata.findFirst({
            where: { userId, bankName: { not: bankName } },
            select: { bankName: true },
        });
        if (other) {
            throw new PlanRequiredError(
                "multi_bank",
                minimumPlanFor("multi_bank"),
                plan.id,
                `Your plan covers one bank. This account already has statements from ${other.bankName}.`
            );
        }
    }
}

/**
 * Uploading only *reads* the statement.
 *
 * `normalizerStatus` stays `"Not Started"` until the user presses Illuminate —
 * that field moving is the single fact that says the gate was passed. Claiming
 * `"Processing"` here, as this used to, would describe work nobody has agreed to
 * pay for yet.
 */
export async function uploadStatement(
    buffer: Buffer,
    bankName: string | undefined,
    userId: string,
    pdfPassword?: string,
    /** `req.file.originalname` — what the user called it. Display only; see `displayFileName`. */
    originalName?: string
) {
    const resolvedBankName = bankName ?? "Unknown Bank";
    await assertUploadAllowed(userId, resolvedBankName);

    const contentHash = computeContentHash(buffer);

    // Scoped to this user, not global — two different people (a joint account,
    // or an identical UAT sample PDF) can legitimately hold the same bytes, and
    // each must be able to upload their own copy. See the schema's docblock.
    const existing = await prisma.statementMetadata.findUnique({
        where: { userId_contentHash: { userId, contentHash } },
    });
    if (existing) {
        throw new ConflictError(`Statement already processed (id: ${existing.id})`, "DUPLICATE_STATEMENT");
    }

    // Only written to storage once every rejection above has had its chance —
    // an upload nobody is allowed to make never touches disk/S3 at all.
    const storageKey = storage.keyFor("statements", `${randomUUID()}.pdf`);
    await storage.put(storageKey, buffer, "application/pdf");

    const fileName = displayFileName(originalName);
    const metadata = await prisma.statementMetadata.create({
        data: {
            bankName: resolvedBankName,
            contentHash,
            userId,
            // Frozen here on purpose: the file is deleted when extraction ends, so
            // nothing can — or should — re-read the name later.
            ...(fileName ? { fileName } : {}),
            extractionStatus: "Processing",
            normalizerStatus: "Not Started",
            gateDecision: "pending",
        },
    });

    const extractJob = await extractQueue.add(
        "pdf.extract",
        {
            statementId: metadata.id,
            storageKey,
            bankName: resolvedBankName,
            userId,
            pdfPassword,
        },
        { priority: await priorityFor(userId) }
    );
    await logJobStart({
        jobType: "pdf.extract",
        jobId: extractJob.id ?? metadata.id,
        userId,
        statementMetadataId: metadata.id,
        triggerSource: "user-upload",
    }).catch((err) => console.error("[AdminJobLog] failed to log job start:", err));

    return { statementId: metadata.id, status: "Queued" };
}

/**
 * Called as each graph node finishes, so the worker can publish a real event at
 * every boundary instead of one at the start and one at the end.
 *
 * This is what closed the documented `pct: 5 → 90` blackout. That span covers
 * normalisation, balance analysis and LLM categorisation — most of the job — and
 * publishing nothing across it meant silence was indistinguishable from progress,
 * failure, or a BullMQ retry. A client cannot be event-driven against a stream
 * that goes quiet for minutes at a time; it has to poll. So the events had to get
 * finer before the poll could go.
 */
export type NodeProgress = (node: string) => void | Promise<void>;

/**
 * Run a compiled graph, reporting each node as it completes.
 *
 * `.stream({streamMode: "updates"})` rather than `.invoke()`: it drives the graph
 * identically — same nodes, same order, same thrown errors — but yields one
 * `{[nodeName]: partialState}` chunk per completed node instead of only the final
 * state, which neither caller wants anyway. Draining the iterator to exhaustion is
 * what actually runs the graph, so the loop body is the only place a boundary can
 * be observed.
 *
 * `onNode` failures are swallowed. A progress event that cannot be published is
 * not a reason to fail a pipeline run that is otherwise going fine.
 */
async function runGraph(agent: any, input: Record<string, unknown>, onNode?: NodeProgress) {
    for await (const chunk of await agent.stream(input, { streamMode: "updates" })) {
        if (!onNode || !chunk || typeof chunk !== "object") continue;
        for (const node of Object.keys(chunk as Record<string, unknown>)) {
            try {
                await onNode(node);
            } catch (err) {
                console.error(`[StatementService] progress callback failed after ${node}:`, err);
            }
        }
    }
}

/* ------------------------- the retained upload ------------------------- */

/**
 * `retainedFile` holds a `storage.keyFor("statements", ...)` value written by
 * this server — never user-supplied — but validated anyway before it is handed
 * to `storage.delete`/`storage.exists`. Deliberately loose about the exact
 * shape (it differs by driver: an absolute local path vs. a bare S3 key) and
 * strict about the one thing that matters: no `..` traversal.
 */
function isPlausibleStatementKey(key: string): boolean {
    return !key.includes("..") && /(^|[\\/])statements[\\/][\w.-]+\.pdf$/.test(key);
}

/**
 * Delete a kept upload and forget it. Safe to call when there is nothing kept,
 * which is the common case — every successful extraction calls it.
 */
export async function releaseRetainedFile(statementId: string): Promise<void> {
    const row = await prisma.statementMetadata.findUnique({
        where: { id: statementId },
        select: { retainedFile: true },
    });
    if (!row?.retainedFile || !isPlausibleStatementKey(row.retainedFile)) return;

    await storage.delete(row.retainedFile).catch(() => {});
    await prisma.statementMetadata.update({
        where: { id: statementId },
        data: { retainedFile: null },
    });
}

/**
 * Retry a locked statement with a password — **without** re-uploading it.
 *
 * A wrong password is the one extraction failure that is a *question* rather than
 * an outcome, and it used to be answered by deleting the record and uploading the
 * same bytes again, because the file was gone and `contentHash` is unique so the
 * row could not survive a re-upload of itself. That put a file picker in front of
 * a user whose only actual problem was a date of birth — and after a page reload
 * the browser no longer held the file either, so the picker was unavoidable.
 *
 * The worker now keeps the upload for exactly this case, so the retry is the
 * password and nothing else: same statement, same id, same content hash, one more
 * `pdf.extract` job.
 *
 * `CONFLICT` rather than `NOT_FOUND` when there is nothing kept: the statement
 * exists, it simply cannot be retried this way — anything that failed before this
 * existed, or was already retried successfully. The client falls back to the
 * upload path on that code.
 */
export async function unlockStatement(id: string, userId: string, password: string) {
    assertValidObjectId(id);
    const statement = await prisma.statementMetadata.findFirst({ where: { id, userId } });
    if (!statement) throw new NotFoundError("Statement", id);

    const key = statement.retainedFile && isPlausibleStatementKey(statement.retainedFile)
        ? statement.retainedFile
        : null;
    const held = key ? await storage.exists(key) : false;
    if (!key || !held) {
        // The marker outliving the file is possible — a container restart with an
        // ephemeral local `uploads/`, an S3 lifecycle rule, or a manual clean-up —
        // so clear it rather than leaving the client to be told "retry with a
        // password" forever.
        if (statement.retainedFile) {
            await prisma.statementMetadata
                .update({ where: { id }, data: { retainedFile: null } })
                .catch(() => {});
        }
        throw new ConflictError(
            "The original file is no longer held — upload it again with the password.",
            "SOURCE_UNAVAILABLE"
        );
    }

    await prisma.statementMetadata.update({
        where: { id },
        data: { extractionStatus: "Processing", extractionError: null },
    });

    const unlockJob = await extractQueue.add(
        "pdf.extract",
        {
            statementId: id,
            storageKey: key,
            bankName: statement.bankName,
            userId,
            pdfPassword: password,
        },
        { priority: await priorityFor(userId) }
    );
    await logJobStart({
        jobType: "pdf.extract",
        jobId: unlockJob.id ?? id,
        userId,
        statementMetadataId: id,
        triggerSource: "user-action",
    }).catch((err) => console.error("[AdminJobLog] failed to log job start:", err));

    // Same reason `insights_queued` and `goal_queued` exist: between this response
    // and the worker picking the job up there would otherwise be no frame at all,
    // and this screen has just been told to expect one.
    await publishStatementProgress(userId, id, "extract_queued", 3);

    return { statementId: id, status: "Queued" };
}

/** Phase 1. Failures land on `extractionStatus`, never on the normalizer's fields. */
export async function runExtractionPipeline(
    statementId: string,
    userId: string,
    storageKey: string,
    bankName: string,
    pdfPassword?: string,
    onNode?: NodeProgress
) {
    try {
        const agent = statementExtractGraph.compile();
        await runGraph(
            agent,
            { userId, statementPath: storageKey, bankName, pdfPassword, statementMetadataId: statementId, messages: [] },
            onNode
        );
    } catch (err) {
        console.error(`[StatementService] Extraction error for ${statementId}:`, err);
        try {
            await prisma.statementMetadata.update({
                where: { id: statementId },
                data: {
                    extractionStatus: "Error",
                    extractionError: err instanceof Error ? err.message : "Unknown extraction error",
                    /*
                     * Marked here, on the *first* failed attempt, rather than in the
                     * worker's `failed` handler — which only fires after the last
                     * retry, some 45 seconds later. The password card appears the
                     * moment this row is written, so a marker that lands a minute
                     * afterwards would leave the screen offering a file picker for
                     * a file the server was about to keep. The worker's only job is
                     * to *not delete* it; see `extractWorker.on("failed")`.
                     *
                     * Cleared on any other failure, which matters on a *retry*: an
                     * unlock that gets past the password and then dies on the
                     * content is no longer password-retryable, and the worker is
                     * about to delete those bytes. Leaving the marker set would
                     * have the record claim a file that no longer exists.
                     */
                    retainedFile: isPdfPasswordError(err) ? storageKey : null,
                },
            });
        } catch { /* ignore secondary failure */ }
        throw err;
    }
}

/**
 * Phase 2 — normalise, balance-check and categorise. Runs only after the gate.
 *
 * Takes no file path: `statementPath` is read exclusively by `pdfExtractorNode`,
 * which is not in this graph, and the upload has already been deleted by the time
 * this runs. The empty string satisfies the required field in `agentGraphSchema`
 * and is never read.
 */
export async function runProcessPipeline(statementId: string, userId: string, onNode?: NodeProgress) {
    try {
        const agent = statementProcessGraph.compile();
        await runGraph(
            agent,
            { userId, statementPath: "", bankName: "", statementMetadataId: statementId, messages: [] },
            onNode
        );
    } catch (err) {
        console.error(`[StatementService] Pipeline error for ${statementId}:`, err);
        try {
            await prisma.statementMetadata.update({
                where: { id: statementId },
                data: {
                    normalizerStatus: "Error",
                    normalizerError: err instanceof Error ? err.message : "Unknown pipeline error",
                },
            });
        } catch { /* ignore secondary failure */ }
        throw err;
    }
}

export async function listStatements(
    userId: string,
    page: number,
    limit: number,
    bankName?: string,
    status?: string,
    gate?: string
) {
    const where = {
        userId,
        ...(bankName ? { bankName: { contains: bankName, mode: "insensitive" as const } } : {}),
        ...(status ? { normalizerStatus: status } : {}),
        ...(gate ? { gateDecision: gate } : {}),
    };

    const [total, rows] = await Promise.all([
        prisma.statementMetadata.count({ where }),
        prisma.statementMetadata.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
    ]);

    return { data: rows.map(toPublicStatement), total };
}

export async function getStatement(id: string, userId: string) {
    assertValidObjectId(id);
    const statement = await prisma.statementMetadata.findFirst({ where: { id, userId } });
    if (!statement) throw new NotFoundError("Statement", id);
    return toPublicStatement(statement);
}

/**
 * The same projection the SSE stream pushes, served as a one-shot request.
 *
 * It shares `statementProgressSelect` with the stream deliberately: two shapes
 * that are *nearly* identical is how a client ends up handling a field on one
 * path and not the other.
 *
 * **The web client no longer calls this**, and that is the point of the SSE
 * snapshot — it is not a polling target. It stays because non-browser clients
 * (scripts, mobile, Swagger) have no `EventSource`, and a plain GET is the only
 * thing they can use.
 */
export async function getStatementStatus(id: string, userId: string) {
    assertValidObjectId(id);
    const statement = await prisma.statementMetadata.findFirst({
        where: { id, userId },
        select: statementProgressSelect,
    });
    if (!statement) throw new NotFoundError("Statement", id);
    return toPublicStatement(statement);
}

/**
 * Everything unfinished for this user — written once, immediately, on every SSE
 * connection. See `listUserProgress` for why a stream without this is unusable.
 */
export async function getProgressSnapshot(userId: string) {
    return listUserProgress(userId);
}

/* ----------------------------- the Illuminate gate ----------------------------- */

type GateDecision = "approved" | "declined" | "discarded";

/**
 * Append one row to the decision log.
 *
 * `bankName` and `rawRowCount` are copied rather than read through the relation so
 * the row still describes something after the statement is deleted — which is the
 * whole point of recording `"discarded"`.
 *
 * Never allowed to take the caller down with it: losing an audit row is bad, but
 * failing the user's action because the audit write failed is worse.
 */
async function recordGateDecision(
    statement: { id: string; bankName: string; rawRowCount: number | null },
    userId: string,
    decision: GateDecision,
    reason?: string
): Promise<void> {
    try {
        await prisma.statementGateDecision.create({
            data: {
                statementMetadataId: statement.id,
                userId,
                decision,
                reason: reason ?? null,
                bankName: statement.bankName,
                rawRowCount: statement.rawRowCount,
            },
        });
    } catch (err) {
        console.error(`[StatementService] Could not record "${decision}" for ${statement.id}:`, err);
    }
}

/**
 * Shared precondition for both answers at the gate.
 *
 * Deliberately does **not** look at `gateDecision`. A declined statement is
 * approvable and an approved one is not re-approvable — both of which follow from
 * `normalizerStatus` alone. Treating the previous answer as a guard would make
 * decline a one-way door, which is exactly what it is not.
 */
async function assertAtGate(id: string, userId: string) {
    const statement = await getStatement(id, userId);

    if (statement.extractionStatus === "Error") {
        throw new ConflictError(
            statement.extractionError ?? "This statement could not be read.",
            "EXTRACTION_FAILED"
        );
    }
    if (statement.extractionStatus !== "Completed") {
        throw new ConflictError("Still reading your statement — try again in a moment.", "NOT_EXTRACTED");
    }
    if (statement.normalizerStatus !== "Not Started") {
        throw new ConflictError("This statement is already being processed.", "ALREADY_STARTED");
    }
    return statement;
}

/**
 * Illuminate. Claims the statement, records the approval, then starts phase 2.
 *
 * **The claim is a conditional update, not a read-then-write, and that is the
 * whole point.** `assertAtGate` above cannot make this safe on its own: it reads
 * `normalizerStatus`, which used to be written by `rehydrateNode` inside the
 * worker — so between enqueueing the job and the worker picking it up, the field
 * still said "Not Started" and a second click passed every check and enqueued a
 * *second* `pdf.process` job. Both would have run the full pipeline against the
 * same statement, duplicating every transaction.
 *
 * `updateMany` with the expected value in the `where` makes check and set one
 * atomic operation, so exactly one caller can ever win, however many arrive
 * together.
 */
export async function startProcessing(id: string, userId: string) {
    const statement = await assertAtGate(id, userId);

    const claimed = await prisma.statementMetadata.updateMany({
        where: { id, normalizerStatus: "Not Started" },
        data: { normalizerStatus: "Processing", gateDecision: "approved" },
    });
    if (claimed.count === 0) {
        throw new ConflictError("This statement is already being processed.", "ALREADY_STARTED");
    }

    await recordGateDecision(statement, userId, "approved");
    const processJob = await pdfQueue.add(
        "pdf.process",
        { statementId: id, userId },
        { priority: await priorityFor(userId) }
    );
    await logJobStart({
        jobType: "pdf.process",
        jobId: processJob.id ?? id,
        userId,
        statementMetadataId: id,
        triggerSource: "user-action",
    }).catch((err) => console.error("[AdminJobLog] failed to log job start:", err));

    /**
     * Announce the gate opening from here rather than waiting for the worker.
     *
     * The claim above already moved `normalizerStatus` to "Processing", so this
     * is true the moment it is published — and it can be a while before a worker
     * picks the job up under load. Without it, every *other* tab this user has
     * open would keep showing "ready to illuminate" for a statement that is
     * already running.
     */
    await publishStatementProgress(userId, id, "process_queued", 35);

    return { jobStarted: true as const, statementId: id };
}

/**
 * "Not right now". Records the decline and enqueues nothing.
 *
 * The statement stays exactly as it is — read, unprocessed, and still listed on
 * the dashboard, where approving it later is one click. Nothing is deleted; that
 * is `deleteStatement`, a separate and destructive choice.
 */
export async function declineProcessing(id: string, userId: string, reason?: string) {
    const statement = await assertAtGate(id, userId);

    await recordGateDecision(statement, userId, "declined", reason);
    await prisma.statementMetadata.update({
        where: { id },
        data: { gateDecision: "declined" },
    });

    // Nothing was enqueued, so no worker will ever announce this. Other tabs
    // would otherwise keep nagging about a statement the user has answered.
    await publishStatementProgress(userId, id, "declined");

    return { gateDecision: "declined" as const, statementId: id };
}

export async function listStatementTransactions(
    id: string,
    userId: string,
    page: number,
    limit: number,
    type: "all" | "debit" | "credit",
    month?: string,
    category?: string
) {
    await getStatement(id, userId);

    const dateFilter: Record<string, unknown> = {};
    if (month) {
        const start = new Date(`${month}-01T00:00:00.000Z`);
        const end = new Date(start);
        end.setUTCMonth(end.getUTCMonth() + 1);
        dateFilter.date = { gte: start, lt: end };
    }

    const where = {
        statementMetadataId: id,
        ...(type === "debit" ? { debitAmount: { gt: 0 } } : {}),
        ...(type === "credit" ? { creditAmount: { gt: 0 } } : {}),
        ...dateFilter,
        ...(category ? { cluster: { category } } : {}),
    };

    const select = {
        id: true,
        date: true,
        description: true,
        creditAmount: true,
        debitAmount: true,
        balance: true,
        clusterId: true,
        statementMetadataId: true,
        createdAt: true,
        cluster: {
            select: {
                id: true,
                merchantName: true,
                payeeName: true,
                category: true,
                confidence: true,
            },
        },
    };

    const [total, data] = await Promise.all([
        prisma.finalTransactionData.count({ where }),
        prisma.finalTransactionData.findMany({ where, select, orderBy: { date: "asc" }, skip: (page - 1) * limit, take: limit }),
    ]);

    return { data, total };
}

export async function deleteStatement(id: string, userId: string) {
    const statement = await getStatement(id, userId);

    // Throwing the statement away is an answer at the gate too, so it goes in the
    // log before the record it refers to stops existing.
    await recordGateDecision(statement, userId, "discarded");

    // Red flags point at individual transactions, so they have to go with them or the
    // Insights page keeps offering links into a ledger that no longer has those rows.
    // Read the ids first — once `finalTransactionData.deleteMany` has run there is nothing
    // left to match on, since a flag records `statementMetadataId` nowhere.
    //
    // Only these flags, not all of the user's: `MonthlyStats` and `RecurringPattern` are
    // account-level aggregates this cascade also leaves alone, and wiping every flag would
    // destroy findings about months this statement never touched. The next insights run
    // rebuilds whatever the recomputed aggregates now support.
    const doomedTxnIds = (await prisma.finalTransactionData.findMany({
        where: { statementMetadataId: id, userId },
        select: { id: true },
    })).map(t => t.id);

    await Promise.all([
        prisma.statementExtractedData.deleteMany({ where: { statementMetadataId: id } }),
        doomedTxnIds.length > 0
            ? prisma.transactionFlag.deleteMany({ where: { userId, transactionId: { in: doomedTxnIds } } })
            : Promise.resolve(),
        // `userId` is redundant next to `statementMetadataId` — ownership was
        // already proven by `getStatement` above — but it costs nothing and means
        // a cascade can never reach across tenants even if that check moves.
        prisma.finalTransactionData.deleteMany({ where: { statementMetadataId: id, userId } }),
        prisma.normalizedTransactions.deleteMany({ where: { statementMetadataId: id } }),
        prisma.exceptionTransactions.deleteMany({ where: { statementMetadataId: id } }),
        prisma.errorPdfExtract.deleteMany({ where: { statementMetadataId: id } }),
        // `StatementGateDecision` is deliberately absent. An audit log a delete
        // erases is not an audit log — the rows carry their own `bankName` and
        // `rawRowCount` snapshots so they survive this with meaning intact.
    ]);

    // A locked statement is holding its upload open for a retry that is now never
    // coming. Released before the row goes, since the row is where the filename is.
    await releaseRetainedFile(id).catch(() => {});

    await prisma.statementMetadata.delete({ where: { id } });

    // Published *after* the delete, so the snapshot it carries is `null` — which
    // is precisely the signal a client needs to drop the run from its activity
    // list rather than leave it pulsing forever against a record that is gone.
    await publishStatementProgress(userId, id, "deleted");
}
