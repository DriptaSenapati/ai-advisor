import { createHash } from "crypto";
import fs from "fs";
import prisma from "../../prismaClient.js";
import { advisorAgentGraph } from "../../graph.js";
import { ConflictError, NotFoundError, assertValidObjectId } from "../errors.js";
import { pdfQueue } from "../../queue/index.js";

function computeContentHash(filePath: string): string {
    const bytes = fs.readFileSync(filePath);
    return createHash("sha256").update(bytes).digest("hex");
}

export async function uploadStatement(filePath: string, bankName: string | undefined, userId: string, pdfPassword?: string) {
    const contentHash = computeContentHash(filePath);

    const existing = await prisma.statementMetadata.findUnique({ where: { contentHash } });
    if (existing) {
        fs.unlink(filePath, () => {});
        throw new ConflictError(`Statement already processed (id: ${existing.id})`);
    }

    const resolvedBankName = bankName ?? "Unknown Bank";
    const metadata = await prisma.statementMetadata.create({
        data: { bankName: resolvedBankName, contentHash, normalizerStatus: "Processing", userId },
    });

    await pdfQueue.add("pdf.process", {
        statementId: metadata.id,
        filePath,
        bankName: resolvedBankName,
        userId,
        pdfPassword,
    });

    return { statementId: metadata.id, status: "Queued" };
}

export async function runAdvisorPipeline(statementId: string, filePath: string, bankName: string, pdfPassword?: string) {
    try {
        const agent = advisorAgentGraph.compile();
        await agent.invoke({ statementPath: filePath, bankName, pdfPassword, statementMetadataId: statementId, messages: [] });
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

export async function listStatements(userId: string, page: number, limit: number, bankName?: string, status?: string) {
    const where = {
        userId,
        ...(bankName ? { bankName: { contains: bankName, mode: "insensitive" as const } } : {}),
        ...(status ? { normalizerStatus: status } : {}),
    };

    const [total, data] = await Promise.all([
        prisma.statementMetadata.count({ where }),
        prisma.statementMetadata.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
    ]);

    return { data, total };
}

export async function getStatement(id: string, userId: string) {
    assertValidObjectId(id);
    const statement = await prisma.statementMetadata.findFirst({ where: { id, userId } });
    if (!statement) throw new NotFoundError("Statement", id);
    return statement;
}

export async function getStatementStatus(id: string, userId: string) {
    assertValidObjectId(id);
    const statement = await prisma.statementMetadata.findFirst({
        where: { id, userId },
        select: {
            id: true,
            bankName: true,
            normalizerStatus: true,
            categorizationStatus: true,
            insightsStatus: true,
            normalizerError: true,
            insightsError: true,
            extractionConfidence: true,
            balanceGapCount: true,
        },
    });
    if (!statement) throw new NotFoundError("Statement", id);
    return statement;
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
    await getStatement(id, userId);

    await Promise.all([
        prisma.statementExtractedData.deleteMany({ where: { statementMetadataId: id } }),
        prisma.finalTransactionData.deleteMany({ where: { statementMetadataId: id } }),
        prisma.normalizedTransactions.deleteMany({ where: { statementMetadataId: id } }),
        prisma.exceptionTransactions.deleteMany({ where: { statementMetadataId: id } }),
        prisma.errorPdfExtract.deleteMany({ where: { statementMetadataId: id } }),
    ]);

    await prisma.statementMetadata.delete({ where: { id } });
}
