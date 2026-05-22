import { GraphNode } from "@langchain/langgraph";
import { insightsAgentGraphSchema } from "../../../graph_state.js";
import { statsAggregatorTool } from "../../graphTools/insights_gen_tools/statsAggregatorTool.js";

const statsAggregatorToolNode: GraphNode<typeof insightsAgentGraphSchema> = async (state) => {
    await statsAggregatorTool.invoke({
        monthToBeCovered: state.monthToBeCovered || 12,
        isFirstRun: state.isFirstRun || false
    })

    return state
}

export { statsAggregatorToolNode };