import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../../graph_state.js";
import { statementExceptionFinalTool } from "../../graphTools/statement_normalizer_tools/statement_exception_final_tool.js";

// TODO: Refactor to add exceptions data into MongoDB

const statementExceptionFinalToolNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    const exceptions = await statementExceptionFinalTool.invoke({ correctedData: state.transactionData || [] });
    return {
        ...state,
        exceptions: exceptions
    };
};

export { statementExceptionFinalToolNode };