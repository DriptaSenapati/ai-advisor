import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../../graph_state.js";
import { statementExceptionFinalTool } from "../../graphTools/statement_normalizer_tools/statement_exception_final_tool.js";


const statementExceptionFinalToolNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    const correctedData = state.transactionData || [];
    console.log(`[Exception Handler] Validating and saving ${correctedData.length} transactions to DB`);
    const { exceptions, normTransactions } = await statementExceptionFinalTool.invoke({
        correctedData,
        statementMetadataId: state.statementMetadataId,
        overlapOverride: state.overlapOverride ?? false,
    });
    console.log(`[Exception Handler] Done — ${normTransactions.length} valid → NormalizedTransactions, ${exceptions.length} invalid → ExceptionTransactions`);
    return { transactionData: undefined };
};

export { statementExceptionFinalToolNode };