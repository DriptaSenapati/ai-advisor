import { GraphNode } from "@langchain/langgraph"
import { insightsAgentGraphSchema } from "../../../graph_state.js"
import { payeeCanonicalizerTool } from "../../graphTools/insights_gen_tools/payee_canonicalizer_tool.js"

/**
 * Reconcile payee spellings before anything aggregates them.
 *
 * First in the insights graph on purpose: `statsAggregatorTool`, the recurring
 * passes, the detectors and the prompt all read `Cluster.payeeName`, and merging
 * afterwards would leave every derived row keyed on a name that no longer exists.
 *
 * Unlike its neighbours this ignores `affectedMonths` and always runs over the
 * user's whole set. A spelling introduced this month has to be compared against
 * every spelling already on file — that is the entire point — and the work is a
 * string comparison over distinct names, not a query per month.
 */
const payeeCanonicalizerNode: GraphNode<typeof insightsAgentGraphSchema> = async (state) => {
    await payeeCanonicalizerTool.invoke({ userId: state.userId });
    return state;
}

export { payeeCanonicalizerNode }
