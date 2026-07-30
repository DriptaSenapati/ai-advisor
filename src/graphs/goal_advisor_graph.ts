import { START, END, StateGraph } from "@langchain/langgraph";
import { goalAdvisorGraphSchema } from "../graph_state.js";
import { goalAnalysisNode } from "../modules/nodes/goal_advisor_nodes/goal_analysis_node.js";
import { goalIntentGateNode } from "../modules/nodes/goal_advisor_nodes/goal_intent_gate_node.js";

/**
 * Two layers, and the edge between them is conditional:
 *
 * ```
 * START → goalIntentGateNode ──accept──→ goalAnalysisNode → END
 *                            └──reject──→ END
 * ```
 *
 * The gate is what makes the simulation worth running — screening a sentence costs one small
 * LLM call, while the node behind it costs another call plus ~460,000 Monte Carlo iterations.
 * Branching rather than letting the analysis node decide keeps each node responsible for one
 * thing: the gate rules on the text, the analysis fits a distribution to the money.
 */
const goalAdvisorGraph = new StateGraph(goalAdvisorGraphSchema)
    .addNode("goalIntentGateNode", goalIntentGateNode)
    .addNode("goalAnalysisNode", goalAnalysisNode)
    .addEdge(START, "goalIntentGateNode")
    .addConditionalEdges(
        "goalIntentGateNode",
        // `| undefined` is not redundant — `exactOptionalPropertyTypes` is on, so an optional
        // property whose type omits it will not accept the graph's own state.
        (state: { goalIntent?: Record<string, unknown> | undefined }) =>
            state.goalIntent?.["verdict"] === "accept" ? "goalAnalysisNode" : END,
        ["goalAnalysisNode", END]
    )
    .addEdge("goalAnalysisNode", END) as any;

export { goalAdvisorGraph };
