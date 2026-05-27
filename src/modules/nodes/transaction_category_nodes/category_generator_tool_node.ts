import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../../graph_state.js";
import { clusterGeneratorTool } from "../../graphTools/transaction_category_tools/cluster_generator_tool.js";
import { genericTransactionDataSchema } from "../../../helpers/index.js";
import z from "zod";

const clusterGeneratorToolNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    console.log(`[Cluster Generator] Embedding ${(state.transactionData || []).length} transaction descriptions and building clusters`);
    const categorizedTransactions = await clusterGeneratorTool.invoke({
        transactionData: state.transactionData as z.infer<typeof genericTransactionDataSchema>[] || [],
        statementMetadataId: state.statementMetadataId,
    })
    console.log(`[Cluster Generator] Done — ${categorizedTransactions.length} transactions embedded and clustered`);
    return { ...state, finalTransactionData: categorizedTransactions }
}

export { clusterGeneratorToolNode };