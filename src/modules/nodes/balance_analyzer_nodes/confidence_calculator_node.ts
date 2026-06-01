import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../../graph_state.js";
import prisma from "../../../prismaClient.js";

const EXCEPTION_PENALTY_WEIGHT = 0.8;
const GAP_PENALTY_WEIGHT = 0.2;

const confidenceCalculatorNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    const { statementMetadataId } = state;
    if (!statementMetadataId) {
        console.warn("[ConfidenceCalculator] No statementMetadataId — skipping");
        return {};
    }

    const metadata = await prisma.statementMetadata.findUnique({
        where: { id: statementMetadataId },
        select: { totalTransactions: true, exceptionCount: true, balanceGapCount: true },
    });

    if (!metadata) {
        console.warn("[ConfidenceCalculator] StatementMetadata not found — skipping");
        return {};
    }

    const totalTransactions = metadata.totalTransactions ?? 0;
    const exceptionCount = metadata.exceptionCount ?? 0;
    const balanceGapCount = metadata.balanceGapCount ?? 0;

    const totalRows = totalTransactions + exceptionCount;
    const exceptionRate = totalRows > 0 ? exceptionCount / totalRows : 0;

    const totalPairs = totalTransactions - 1;
    const gapRate = totalPairs > 0 ? Math.min(balanceGapCount / totalPairs, 1) : 0;

    const exceptionPenalty = exceptionRate * EXCEPTION_PENALTY_WEIGHT;
    const gapPenalty = gapRate * GAP_PENALTY_WEIGHT;

    const confidence = parseFloat(Math.max(0, 1 - exceptionPenalty - gapPenalty).toFixed(4));

    console.log(
        `[ConfidenceCalculator] exceptionPenalty=${exceptionPenalty.toFixed(4)} gapPenalty=${gapPenalty.toFixed(4)} → confidence=${confidence}`
    );

    await prisma.statementMetadata.update({
        where: { id: statementMetadataId },
        data: { extractionConfidence: confidence },
    });

    return {};
};

export { confidenceCalculatorNode };
