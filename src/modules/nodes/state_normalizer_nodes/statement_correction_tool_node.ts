import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../../graph_state.js";
import { statementCorrectionTool } from "../../graphTools/statement_normalizer_tools/statement_correction_tool.js";

const statementCorrectionToolNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    const errorCount = (state.errorData?.errorRows || []).length;
    console.log(`[Correction] Applying ${errorCount} correction(s) to transaction data`);
    const { correctedData } = await statementCorrectionTool.invoke({ extractedData: state.transactionData || [], errorData: state.errorData });
    console.log(`[Correction] Done — ${correctedData.length} transactions after corrections`);
    return {
        ...state,
        transactionData: correctedData
    };
};

export { statementCorrectionToolNode };