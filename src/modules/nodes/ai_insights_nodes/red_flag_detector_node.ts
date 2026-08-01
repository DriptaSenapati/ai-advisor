import { GraphNode } from "@langchain/langgraph"
import { insightsAgentGraphSchema } from "../../../graph_state.js"
import { redFlagDetectorTool } from "../../graphTools/insights_gen_tools/red_flag_detector_tool.js"

/**
 * Runs the seven deterministic red-flag detectors and persists their findings.
 *
 * Sits between recurring-pattern detection and `insightsNode` because two detectors read
 * what the pass before it wrote: `subscription_price_hike` compares `RecurringPattern` rows,
 * and the deactivation sweep at the end of `recurring_pattern_tool.ts` is what makes the
 * superseded price identifiable. Running before `insightsNode` also means the flags are on
 * disk in time to be summarised into that node's prompt.
 *
 * Detection failures never fail the run — the tool wraps each detector in `allSettled` and
 * the insight report does not depend on flags existing.
 *
 * **Returns `{}`, not `state`.** This node now runs in the same superstep as
 * `behaviourDetectionNode` and `eventDetectionNode` (see the fan-out in `graph.ts`), and
 * LangGraph's default channel is single-writer-per-step: echoing the whole state object back
 * — including the `behaviourPatterns`/`financialContext` keys the schema declares but this
 * node never touches — collided with the real writer and threw
 * `InvalidUpdateError: LastValue can only receive one value per step`. An empty partial
 * update is also the more correct shape regardless: this node persists straight to
 * `TransactionFlag` and has never had anything to hand back through state.
 */
const redFlagDetectorNode: GraphNode<typeof insightsAgentGraphSchema> = async (state) => {
    const affectedMonths = state.affectedMonths ?? [];

    if (affectedMonths.length === 0) {
        console.warn("[RedFlags] No affectedMonths in state — skipping red flag detection.");
        return {};
    }

    await redFlagDetectorTool.invoke({ affectedMonths, userId: state.userId });
    return {};
}

export { redFlagDetectorNode }
