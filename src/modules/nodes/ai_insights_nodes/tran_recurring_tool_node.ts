import { GraphNode } from "@langchain/langgraph"
import { insightsAgentGraphSchema } from "../../../graph_state.js"
import { recurringPatternTool } from "../../graphTools/insights_gen_tools/recurring_pattern_tool.js"

const tranRecurringToolNode: GraphNode<typeof insightsAgentGraphSchema> = async (state) => {
    await recurringPatternTool.invoke({ monthToBeCovered: state.monthToBeCovered || 12, isFirstRun: state.isFirstRun || false })

    return state
}

export { tranRecurringToolNode }