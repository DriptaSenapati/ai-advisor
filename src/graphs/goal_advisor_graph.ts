import { START, END, StateGraph } from "@langchain/langgraph";
import { goalAdvisorGraphSchema } from "../graph_state.js";
import { goalAnalysisNode } from "../modules/nodes/goal_advisor_nodes/goal_analysis_node.js";

const goalAdvisorGraph = new StateGraph(goalAdvisorGraphSchema)
    .addNode("goalAnalysisNode", goalAnalysisNode)
    .addEdge(START, "goalAnalysisNode")
    .addEdge("goalAnalysisNode", END) as any;

export { goalAdvisorGraph };
