import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../../graph_state.js";
import { statementCorrectionTool } from "../../graphTools/statement_normalizer_tools/statement_correction_tool.js";

const statementCorrectionToolNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    const { correctedData } = await statementCorrectionTool.invoke({ extractedData: state.transactionData || [], errorData: state.errorData });
    return {
        ...state,
        transactionData: correctedData
    };
};

export { statementCorrectionToolNode };