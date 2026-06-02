import { CompiledStateGraph, START, StateGraph } from "@langchain/langgraph";
import { agentGraphSchema, AgentGraphState } from "../graph_state.js";
import { statementExceptionFinalToolNode } from "../modules/nodes/state_normalizer_nodes/statement_exceptions_final_tool_node.js";
import { statementCorrectionToolNode } from "../modules/nodes/state_normalizer_nodes/statement_correction_tool_node.js";
import { tranKeyNormalizerToolNode } from "../modules/nodes/state_normalizer_nodes/tran_key_norm_tool_node.js";
import { statementKeysMapper } from "../modules/nodes/state_normalizer_nodes/statement_keys_mapper.js";
import { statementErrorFetcherNode } from "../modules/nodes/state_normalizer_nodes/statement_normalizer_node.js";

const statementNormalizerSubgraph = new StateGraph(agentGraphSchema)
    .addNode("statementErrorFetchNode", statementErrorFetcherNode)
    .addNode("keyMapperNode", statementKeysMapper)
    .addNode("tranKeyNormToolNode", tranKeyNormalizerToolNode)
    .addNode("statementCorrectionToolNode", statementCorrectionToolNode)
    .addNode("statementExceptionFinalToolNode", statementExceptionFinalToolNode)

    .addConditionalEdges(START, (state: any) =>
        state.isImageBased ? "statementErrorFetchNode" : "keyMapperNode"
    )
    .addEdge("keyMapperNode", "tranKeyNormToolNode")
    .addEdge("tranKeyNormToolNode", "statementErrorFetchNode")
    .addEdge("statementErrorFetchNode", "statementCorrectionToolNode")
    .addEdge("statementCorrectionToolNode", "statementExceptionFinalToolNode")
    .compile() as CompiledStateGraph<AgentGraphState, any, any, any, any, any, any, any, any>

    ;

export { statementNormalizerSubgraph };