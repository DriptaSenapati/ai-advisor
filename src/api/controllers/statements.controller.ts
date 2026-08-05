import type { Request, Response, NextFunction } from "express";
import * as statementsService from "../services/statements.service.js";
import * as insightsService from "../services/insights.service.js";
import { ok, accepted } from "../response.js";
import { ValidationError } from "../errors.js";
import type { AuthenticatedRequest } from "../middleware/authenticate.js";
import * as sseManager from "../sse/manager.js";

export async function uploadStatement(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.file) return next(new ValidationError("PDF file is required"));
        const { bankName, password } = req.body as { bankName?: string; password?: string };
        const userId = (req as AuthenticatedRequest).user.id;
        const result = await statementsService.uploadStatement(
            req.file.buffer,
            bankName,
            userId,
            password,
            req.file.originalname
        );
        accepted(res, result);
    } catch (err) {
        next(err);
    }
}

export async function listStatements(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const { page, limit, bankName, status, gate } = (req.query as unknown) as {
            page: number; limit: number; bankName?: string; status?: string; gate?: string;
        };
        const { data, total } = await statementsService.listStatements(userId, page, limit, bankName, status, gate);
        ok(res, data, { total, page, limit });
    } catch (err) {
        next(err);
    }
}

export async function getStatement(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const id = req.params["id"] as string;
        const statement = await statementsService.getStatement(id, userId);
        ok(res, statement);
    } catch (err) {
        next(err);
    }
}

export async function getStatementStatus(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const id = req.params["id"] as string;
        const status = await statementsService.getStatementStatus(id, userId);
        ok(res, status);
    } catch (err) {
        next(err);
    }
}

/**
 * The two answers at the Illuminate gate.
 *
 * Approving is `202` — it starts a job. Declining is `200` — it starts nothing
 * and the state change is already complete when the response is written.
 */
export async function startProcessing(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const id = req.params["id"] as string;
        const result = await statementsService.startProcessing(id, userId);
        accepted(res, result);
    } catch (err) {
        next(err);
    }
}

export async function declineProcessing(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const id = req.params["id"] as string;
        const { reason } = req.body as { reason?: string };
        const result = await statementsService.declineProcessing(id, userId, reason);
        ok(res, result);
    } catch (err) {
        next(err);
    }
}

/** 202, like every other route that hands work to the worker. */
export async function unlockStatement(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const id = req.params["id"] as string;
        const { password } = req.body as { password: string };
        const result = await statementsService.unlockStatement(id, userId, password);
        accepted(res, result);
    } catch (err) {
        next(err);
    }
}

export async function listStatementTransactions(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const id = req.params["id"] as string;
        const { page, limit, type, month, category } = (req.query as unknown) as {
            page: number; limit: number; type: "all" | "debit" | "credit"; month?: string; category?: string;
        };
        const { data, total } = await statementsService.listStatementTransactions(
            id, userId, page, limit, type, month, category
        );
        ok(res, data, { total, page, limit });
    } catch (err) {
        next(err);
    }
}

export async function deleteStatement(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as AuthenticatedRequest).user.id;
        const id = req.params["id"] as string;
        await statementsService.deleteStatement(id, userId);
        ok(res, { deleted: true });
    } catch (err) {
        next(err);
    }
}

/** Keeps proxies and load balancers from reaping an idle stream. */
const HEARTBEAT_MS = 25_000;

/**
 * The progress stream — and, as of the snapshot below, the *only* thing a browser
 * client needs in order to stay current.
 *
 * Three things make it self-sufficient rather than a nice-to-have on top of a
 * poll:
 *
 *  - **A snapshot is written immediately, before any live event.** SSE has no
 *    replay, so a tab opened mid-run — or one whose connection dropped and
 *    silently reconnected — would otherwise hear nothing until the next event,
 *    which during categorisation is minutes away and at the Illuminate gate is
 *    never. `EventSource` reconnects on its own, so this also doubles as the
 *    resync path: every reconnect is answered with current truth.
 *  - **Every event carries the statement's full status projection**, so a client
 *    never has to follow one up with a fetch. See `queue/progress.ts`.
 *  - **A heartbeat comment every 25s.** Proxies close idle connections, and a
 *    statement sitting at the gate produces no traffic at all by design.
 *
 * The `retry:` hint tells the browser how long to wait before reconnecting; the
 * default is unspecified and implementations differ.
 */
export async function streamProgress(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user.id;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // nginx buffers proxied responses by default, which holds events until the
    // buffer fills — indistinguishable from a stalled pipeline.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write("retry: 3000\n\n");

    const cleanup = sseManager.addClient(userId, res);
    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

    req.on("close", () => {
        clearInterval(heartbeat);
        cleanup();
    });

    try {
        /**
         * `recomputing` carries the one run that has no record behind it. A full recompute
         * lives only as a queue entry, so unlike a statement it cannot be read back after a
         * reload — see `insightsService.isRecomputing`. Fetched alongside rather than after,
         * since neither depends on the other and the snapshot is on the connection's
         * critical path.
         */
        const [statements, recomputing] = await Promise.all([
            statementsService.getProgressSnapshot(userId),
            insightsService.isRecomputing(userId),
        ]);
        // Registered before this resolves on purpose: an event arriving mid-query
        // is then delivered *after* the snapshot, so the newer value wins. The
        // reverse order would drop it.
        res.write(`data: ${JSON.stringify({ stage: "snapshot", statements, recomputing })}\n\n`);
    } catch (err) {
        console.error("[SSE] could not write initial snapshot:", err);
        // Not fatal, and deliberately not a 500 — the headers are already sent.
        // Live events still flow; the client resyncs on its next reconnect.
    }
}
