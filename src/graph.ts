import {
    START,
    END,
    StateGraph,
} from "@langchain/langgraph";
import { agentGraphSchema, insightsAgentGraphSchema } from "./graph_state.js";
import { goalAdvisorGraph } from "./graphs/goal_advisor_graph.js";
import { pdfExtractorToolNode } from "./modules/nodes/pdf_extractor_tool_node.js";
import { rehydrateExtractionNode } from "./modules/nodes/rehydrate_extraction_node.js";
import { statementNormalizerSubgraph } from "./graphs/statement_normalizer_subgraph.js";
import { balanceAnalyzerSubgraph } from "./graphs/balace_analyzer_subgraph.js";
import { transactionCategorySubgraph } from "./graphs/transaction_category_subgraph.js";
import { payeeCanonicalizerNode } from "./modules/nodes/ai_insights_nodes/payee_canonicalizer_node.js";
import { statsAggregatorToolNode } from "./modules/nodes/ai_insights_nodes/stats_aggregator_tool_node.js";
import { tranRecurringToolNode } from "./modules/nodes/ai_insights_nodes/tran_recurring_tool_node.js";
import { redFlagDetectorNode } from "./modules/nodes/ai_insights_nodes/red_flag_detector_node.js";
import { insightsNode } from "./modules/nodes/ai_insights_nodes/insights_node.js";

// TS2742: LangGraph's inferred StateGraph type references internal dist paths.
// Cast to any here so consumers (.compile(), checkpoint-runner) retain full runtime behaviour.

/**
 * The whole pipeline in one pass, no gate.
 *
 * Kept for the CLI and the dev scripts — `src/index.ts`, `checkpoint-runner.ts`,
 * `graph-visualizer.ts` and `pdf-node-runner.ts` all drive this, and none of them
 * has a user to ask. **The API no longer uses it**: uploads run
 * `statementExtractGraph`, and `POST /statements/:id/process` runs
 * `statementProcessGraph`, with the user's decision in between.
 */
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

/**
 * Phase 1 — read the PDF, then stop and wait.
 *
 * Everything this does is cheap relative to what follows, with one exception:
 * a scanned statement is extracted page by page with a vision LLM here, so the
 * gate saves nothing on image PDFs. It still buys the thing it exists for —
 * the user sees the bank, period and row count and can back out before
 * categorisation and insights run.
 */
const statementExtractGraph = new StateGraph(agentGraphSchema)
    .addNode("pdfExtractorNode", pdfExtractorToolNode)
    .addEdge(START, "pdfExtractorNode")
    .addEdge("pdfExtractorNode", END) as any;

/**
 * Phase 2 — everything the user authorises by pressing Illuminate.
 *
 * `rehydrateNode` restores the state the extract job held in memory; see the long
 * note in that file for why the image path cannot do without it.
 */
const statementProcessGraph = new StateGraph(agentGraphSchema)
    .addNode("rehydrateNode", rehydrateExtractionNode)
    .addNode("statementNormalizerSubgraph", statementNormalizerSubgraph)
    .addNode("balanceAnalyzerSubgraph", balanceAnalyzerSubgraph)
    .addNode("transactionCategorySubgraph", transactionCategorySubgraph)
    .addEdge(START, "rehydrateNode")
    .addEdge("rehydrateNode", "statementNormalizerSubgraph")
    .addEdge("statementNormalizerSubgraph", "balanceAnalyzerSubgraph")
    .addEdge("balanceAnalyzerSubgraph", "transactionCategorySubgraph")
    .addEdge("transactionCategorySubgraph", END) as any;

/**
 * Payees → aggregate → recurring → red flags → report.
 *
 * `payeeCanonicalizerToolNode` is **first**, and has to be: it rewrites
 * `Cluster.payeeName`, which every node after it reads. Merging two spellings of one person
 * after `statsAggregatorTool` has already written `topMerchants`, or after the recurring
 * passes have keyed patterns on the old name, leaves derived rows pointing at a name that no
 * longer exists in the source.
 *
 * `redFlagDetectorToolNode` is fourth rather than anywhere else for two reasons: two of its
 * detectors read `RecurringPattern` rows the node before it has just written (including the
 * deactivation sweep that makes a superseded subscription price identifiable), and its
 * output has to be on disk before `insightsNode` builds the prompt that narrates it.
 */
const insightsAgentGraph = new StateGraph(insightsAgentGraphSchema)
    .addNode("payeeCanonicalizerToolNode", payeeCanonicalizerNode)
    .addNode("statsAggregatorToolNode", statsAggregatorToolNode)
    .addNode("recurringPatternToolNode", tranRecurringToolNode)
    .addNode("redFlagDetectorToolNode", redFlagDetectorNode)
    .addNode("insightsNode", insightsNode)
    .addEdge(START, "payeeCanonicalizerToolNode")
    .addEdge("payeeCanonicalizerToolNode", "statsAggregatorToolNode")
    .addEdge("statsAggregatorToolNode", "recurringPatternToolNode")
    .addEdge("recurringPatternToolNode", "redFlagDetectorToolNode")
    .addEdge("redFlagDetectorToolNode", "insightsNode")
    .addEdge("insightsNode", END) as any;

export {
    advisorAgentGraph,
    statementExtractGraph,
    statementProcessGraph,
    insightsAgentGraph,
    goalAdvisorGraph,
};



