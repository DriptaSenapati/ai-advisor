import { GraphNode } from "@langchain/langgraph"
import { insightsAgentGraphSchema } from "../../../graph_state.js"
import { recurringPatternTool } from "../../graphTools/insights_gen_tools/recurring_pattern_tool.js"

const tranRecurringToolNode: GraphNode<typeof insightsAgentGraphSchema> = async (state) => {
    const affectedMonths = state.affectedMonths ?? [];

    if (affectedMonths.length === 0) {
        console.warn("[Recurring] No affectedMonths in state — skipping recurring pattern detection.");
        return state;
    }

    await recurringPatternTool.invoke({ affectedMonths });
    return state;
}

export { tranRecurringToolNode }
