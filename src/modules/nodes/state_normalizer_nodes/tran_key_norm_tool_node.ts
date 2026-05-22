import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../../graph_state.js";
import { tranKeyNormalizerTool } from "../../graphTools/statement_normalizer_tools/tran_key_normalizer_tool.js";

const tranKeyNormalizerToolNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    const normalizedTranKeyOutput = await tranKeyNormalizerTool.invoke({ extractedData: state.extractedData, keyMapping: state.keyMapping });

    return { ...state, transactionData: normalizedTranKeyOutput };

}

export { tranKeyNormalizerToolNode };