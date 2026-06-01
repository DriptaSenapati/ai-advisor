import { CompiledStateGraph, END, START, StateGraph } from "@langchain/langgraph";
import { agentGraphSchema, AgentGraphState } from "../graph_state.js";
import { balanceGapAnalyzerNode } from "../modules/nodes/balance_analyzer_nodes/balance_gap_analyzer_node.js";
import { confidenceCalculatorNode } from "../modules/nodes/balance_analyzer_nodes/confidence_calculator_node.js";

const balanceAnalyzerSubgraph = new StateGraph(agentGraphSchema)
    .addNode("balanceGapAnalyzerNode", balanceGapAnalyzerNode)
    .addNode("confidenceCalculatorNode", confidenceCalculatorNode)
    .addEdge(START, "balanceGapAnalyzerNode")
    .addEdge("balanceGapAnalyzerNode", "confidenceCalculatorNode")
    .addEdge("confidenceCalculatorNode", END)
    .compile() as CompiledStateGraph<AgentGraphState, any, any, any, any, any, any, any, any>;

export { balanceAnalyzerSubgraph };
