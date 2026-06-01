import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../../graph_state.js";
import prisma from "../../../prismaClient.js";
import type { Prisma } from "../../../generated/prisma/client.js";

const EPSILON = 0.01;

interface BalanceGap {
    fromDate: string;
    toDate: string;
    description: string;
    prevDescription: string;
    balanceDiff: number;
    expectedAmount: number;
    gap: number;
}

const balanceGapAnalyzerNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    const { statementMetadataId } = state;
    if (!statementMetadataId) {
        console.warn("[BalanceGapAnalyzer] No statementMetadataId — skipping");
        return {};
    }

    const transactions = await prisma.normalizedTransactions.findMany({
        where: { statementMetadataId },
        orderBy: [{ date: "asc" }, { id: "asc" }],
        select: { id: true, date: true, description: true, creditAmount: true, debitAmount: true, balance: true },
    });

    if (transactions.length < 2) {
        console.log("[BalanceGapAnalyzer] Fewer than 2 transactions — nothing to compare");
        await prisma.statementMetadata.update({
            where: { id: statementMetadataId },
            data: { balanceGaps: [], balanceGapCount: 0 },
        });
        return {};
    }

    const gaps: BalanceGap[] = [];

    for (let i = 1; i < transactions.length; i++) {
        const prev = transactions[i - 1]!;
        const curr = transactions[i]!;
        const diff = curr.balance - prev.balance;

        let expectedAmount: number;
        if (diff < 0) {
            expectedAmount = curr.debitAmount;
        } else if (diff > 0) {
            expectedAmount = curr.creditAmount;
        } else {
            expectedAmount = 0;
        }

        const gap = Math.abs(diff) - expectedAmount;

        if (Math.abs(gap) > EPSILON) {
            gaps.push({
                fromDate: prev.date.toISOString(),
                toDate: curr.date.toISOString(),
                description: curr.description,
                prevDescription: prev.description,
                balanceDiff: parseFloat(diff.toFixed(2)),
                expectedAmount: parseFloat(expectedAmount.toFixed(2)),
                gap: parseFloat(gap.toFixed(2)),
            });
        }
    }

    console.log(`[BalanceGapAnalyzer] ${gaps.length} gap(s) found out of ${transactions.length - 1} pairs`);

    await prisma.statementMetadata.update({
        where: { id: statementMetadataId },
        data: { balanceGaps: gaps as unknown as Prisma.InputJsonValue[], balanceGapCount: gaps.length },
    });

    return {};
};

export { balanceGapAnalyzerNode };
