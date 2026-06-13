import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../../graph_state.js";
import { clusterGeneratorTool } from "../../graphTools/transaction_category_tools/cluster_generator_tool.js";
import prisma from "../../../prismaClient.js";

const clusterGeneratorToolNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    console.log(`[Cluster Generator] Embedding transactions and building clusters for statement: ${state.statementMetadataId}`);

    if (state.statementMetadataId) {
        await prisma.statementMetadata.update({
            where: { id: state.statementMetadataId },
            data: { categorizationStatus: "Processing" },
        });
    }

    await clusterGeneratorTool.invoke({ statementMetadataId: state.statementMetadataId });
    console.log(`[Cluster Generator] Done`);
    return {};
}

export { clusterGeneratorToolNode };