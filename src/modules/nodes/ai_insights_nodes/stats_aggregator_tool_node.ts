import { GraphNode } from "@langchain/langgraph";
import { insightsAgentGraphSchema } from "../../../graph_state.js";
import { statsAggregatorTool } from "../../graphTools/insights_gen_tools/statsAggregatorTool.js";
import prisma from "../../../prismaClient.js";

const statsAggregatorToolNode: GraphNode<typeof insightsAgentGraphSchema> = async (state) => {
    if (state.statementMetadataId) {
        await prisma.statementMetadata.update({
            where: { id: state.statementMetadataId },
            data: { insightsStatus: "Processing" },
        });
    }

    await statsAggregatorTool.invoke({
        monthToBeCovered: state.monthToBeCovered || 12,
        isFirstRun: state.isFirstRun || false
    })

    return state
}

export { statsAggregatorToolNode };