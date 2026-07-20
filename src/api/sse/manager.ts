import { Redis } from "ioredis";
import type { Response } from "express";

const subscriber = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

const clients = new Map<string, Set<Response>>();

subscriber.subscribe("sse:progress").catch((err: unknown) =>
    console.error("[SSE] subscribe error:", err)
);

subscriber.on("message", (_channel: string, message: string) => {
    try {
        const { userId, ...payload } = JSON.parse(message) as { userId: string; [k: string]: unknown };
        clients.get(userId)?.forEach((res) => {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
        });
    } catch {
        // malformed message — ignore
    }
});

export function addClient(userId: string, res: Response): () => void {
    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId)!.add(res);
    return () => {
        clients.get(userId)?.delete(res);
        if (clients.get(userId)?.size === 0) clients.delete(userId);
    };
}
