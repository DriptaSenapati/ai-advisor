import { CompiledStateGraph, START, StateGraph } from "@langchain/langgraph";
import { agentGraphSchema, AgentGraphState } from "../graph_state.js";
import { clusterGeneratorToolNode } from "../modules/nodes/transaction_category_nodes/category_generator_tool_node.js";
import { llmCategoryNode } from "../modules/nodes/transaction_category_nodes/llm_category_node.js";

const transactionCategorySubgraph = new StateGraph(agentGraphSchema)
    .addNode("clusterGeneratorToolNode", clusterGeneratorToolNode)
    .addNode("llmCategoryNode", llmCategoryNode)
    .addEdge(START, "clusterGeneratorToolNode")
    .addEdge("clusterGeneratorToolNode", "llmCategoryNode")
    .compile() as CompiledStateGraph<AgentGraphState, any, any, any, any, any, any, any, any>

export { transactionCategorySubgraph };