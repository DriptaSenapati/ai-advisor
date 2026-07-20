import prisma from "../../prismaClient.js";
import { insightsAgentGraph } from "../../graph.js";
import { NotFoundError, assertValidObjectId } from "../errors.js";
import { insightsQueue } from "../../queue/index.js";

export async function getLatestInsight(userId: string) {
    const report = await prisma.insightReport.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
    });
    if (!report) throw new NotFoundError("InsightReport");
    return report;
}

export async function getInsight(id: string, userId: string) {
    assertValidObjectId(id);
    const report = await prisma.insightReport.findFirst({ where: { id, userId } });
    if (!report) throw new NotFoundError("InsightReport", id);
    return report;
}

export async function listInsights(userId: string, page: number, limit: number) {
    const [total, data] = await Promise.all([
        prisma.insightReport.count({ where: { userId } }),
        prisma.insightReport.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                tier: true,
                monthsCovered: true,
                generatedAt: true,
                createdAt: true,
            },
        }),
    ]);
    return { data, total };
}

export async function triggerInsightsGeneration(userId: string, statementId?: string): Promise<void> {
    await insightsQueue.add("insights.generate", { userId, statementId });
}

export async function runInsightsPipeline(statementId?: string) {
    try {
        const agent = insightsAgentGraph.compile();
        const input = statementId
            ? { statementMetadataId: statementId, messages: [] }
            : { messages: [] };
        await agent.invoke(input);
    } catch (err) {
        console.error("[InsightsService] Pipeline error:", err);
        if (statementId) {
            try {
                await prisma.statementMetadata.update({
                    where: { id: statementId },
                    data: {
                        insightsStatus: "Error",
                        insightsError: err instanceof Error ? err.message : "Unknown error",
                    },
                });
            } catch { /* ignore */ }
        }
        throw err;
    }
}
