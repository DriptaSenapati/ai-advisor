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
 */
const redFlagDetectorNode: GraphNode<typeof insightsAgentGraphSchema> = async (state) => {
    const affectedMonths = state.affectedMonths ?? [];

    if (affectedMonths.length === 0) {
        console.warn("[RedFlags] No affectedMonths in state — skipping red flag detection.");
        return state;
    }

    await redFlagDetectorTool.invoke({ affectedMonths, userId: state.userId });
    return state;
}

export { redFlagDetectorNode }
