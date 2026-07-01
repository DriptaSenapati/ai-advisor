import { GraphNode } from "@langchain/langgraph";
import { insightsAgentGraphSchema } from "../../../graph_state.js";
import { statsAggregatorTool } from "../../graphTools/insights_gen_tools/statsAggregatorTool.js";
import prisma from "../../../prismaClient.js";

function deriveAffectedMonths(start: Date, end: Date): string[] {
    const months: string[] = [];
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (current <= endMonth) {
        months.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`);
        current.setMonth(current.getMonth() + 1);
    }
    return months;
}

const statsAggregatorToolNode: GraphNode<typeof insightsAgentGraphSchema> = async (state) => {
    if (state.statementMetadataId) {
        await prisma.statementMetadata.update({
            where: { id: state.statementMetadataId },
            data: { insightsStatus: "Processing" },
        });
    }

    const metadata = await prisma.statementMetadata.findUnique({
        where: { id: state.statementMetadataId! },
        select: { statementPeriodStart: true, statementPeriodEnd: true },
    });

    if (!metadata?.statementPeriodStart || !metadata?.statementPeriodEnd) {
        throw new Error(`StatementMetadata ${state.statementMetadataId} has no period dates set — cannot derive affected months.`);
    }

    const affectedMonths = deriveAffectedMonths(metadata.statementPeriodStart, metadata.statementPeriodEnd);
    console.log(`[Stats Aggregator] Affected months: ${affectedMonths.join(", ")}`);

    await statsAggregatorTool.invoke({ affectedMonths });

    return { affectedMonths };
}

export { statsAggregatorToolNode };
