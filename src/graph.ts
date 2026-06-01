import {
    START,
    END,
    StateGraph,
} from "@langchain/langgraph";
import { agentGraphSchema, insightsAgentGraphSchema } from "./graph_state.js";
import { pdfExtractorToolNode } from "./modules/nodes/pdf_extractor_tool_node.js";
import { statementNormalizerSubgraph } from "./graphs/statement_normalizer_subgraph.js";
import { balanceAnalyzerSubgraph } from "./graphs/balace_analyzer_subgraph.js";
import { transactionCategorySubgraph } from "./graphs/transaction_category_subgraph.js";
import { statsAggregatorToolNode } from "./modules/nodes/ai_insights_nodes/stats_aggregator_tool_node.js";
import { tranRecurringToolNode } from "./modules/nodes/ai_insights_nodes/tran_recurring_tool_node.js";
import { insightsNode } from "./modules/nodes/ai_insights_nodes/insights_node.js";

// TS2742: LangGraph's inferred StateGraph type references internal dist paths.
// Cast to any here so consumers (.compile(), checkpoint-runner) retain full runtime behaviour.
const advisorAgentGraph = new StateGraph(agentGraphSchema)
    .addNode("pdfExtractorNode", pdfExtractorToolNode)
    .addNode("statementNormalizerSubgraph", statementNormalizerSubgraph)
    .addNode("balanceAnalyzerSubgraph", balanceAnalyzerSubgraph)
    .addNode("transactionCategorySubgraph", transactionCategorySubgraph)
    .addEdge(START, "pdfExtractorNode")
    .addEdge("pdfExtractorNode", "statementNormalizerSubgraph")
    .addEdge("statementNormalizerSubgraph", "balanceAnalyzerSubgraph")
    .addEdge("balanceAnalyzerSubgraph", "transactionCategorySubgraph")
    .addEdge("transactionCategorySubgraph", END) as any;

const insightsAgentGraph = new StateGraph(insightsAgentGraphSchema)
    .addNode("statsAggregatorToolNode", statsAggregatorToolNode)
    .addNode("recurringPatternToolNode", tranRecurringToolNode)
    .addNode("insightsNode", insightsNode)
    .addEdge(START, "statsAggregatorToolNode")
    .addEdge("statsAggregatorToolNode", "recurringPatternToolNode")
    .addEdge("recurringPatternToolNode", "insightsNode")
    .addEdge("insightsNode", END) as any;

export { advisorAgentGraph, insightsAgentGraph };



