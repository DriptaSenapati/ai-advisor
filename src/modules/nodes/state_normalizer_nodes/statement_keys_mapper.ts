import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../../graph_state.js";
import { keyMapperLlm, llmSystemMessageKeyMapper } from "../../../models/index.js";
import prisma from "../../../prismaClient.js";

const statementKeysMapper: GraphNode<typeof agentGraphSchema> = async (state) => {
    if (!state.statementMetadataId) {
        console.log("[Key Mapper] No statementMetadataId in state, skipping key mapping");
        return {};
    }

    const extracted = await prisma.statementExtractedData.findUnique({
        where: { statementMetadataId: state.statementMetadataId },
        select: { rows: true },
    });
    const firstRow = (extracted?.rows?.[0] ?? {}) as Record<string, string>;
    const keys = Object.keys(firstRow);
    if (keys.length === 0) {
        console.log("[Key Mapper] No extracted data found in DB, skipping key mapping");
        return {};
    }
    console.log(`[Key Mapper] Mapping column headers via LLM — ${keys.length} keys detected`);
    const keyMapping = await llmSystemMessageKeyMapper.pipe(keyMapperLlm).invoke({ extractedData: keys });
    const mapped = Object.fromEntries(Object.entries(keyMapping).map(([k, v]) => [v, k]));
    await prisma.statementMetadata.update({
        where: { id: state.statementMetadataId },
        data: { keyMapping: mapped },
    });
    console.log(`[Key Mapper] Done — mapped: ${JSON.stringify(mapped)}`);
    return {};
}

export { statementKeysMapper };