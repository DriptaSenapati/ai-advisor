import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../../graph_state.js";
import { keyMapperLlm, llmSystemMessageKeyMapper, structuredLlm } from "../../../models/index.js";

const statementKeysMapper: GraphNode<typeof agentGraphSchema> = async (state) => {
    if (!state.extractedData || state.extractedData.length === 0) {
        console.log("[Key Mapper] No extracted data found, skipping key mapping");
        return { ...state };
    }
    console.log(`[Key Mapper] Mapping column headers via LLM — ${Object.keys(state.extractedData[0] || {}).length} keys detected`);
    const keyMapping = await llmSystemMessageKeyMapper.pipe(keyMapperLlm).invoke({ extractedData: Object.keys(state.extractedData[0] || {}) });
    const mapped = Object.fromEntries(Object.entries(keyMapping).map(([k, v]) => [v, k]));
    console.log(`[Key Mapper] Done — mapped: ${JSON.stringify(mapped)}`);
    return { ...state, keyMapping: mapped }

    // return {
    //     ...state, keyMapping: {
    //         Date: 'date',
    //         Description: 'description',
    //         'Deposit (Cr.)': 'creditAmount',
    //         'Withdrawal (Dr.)': 'debitAmount',
    //         Balance: 'balance'
    //     }
    // };

}

export { statementKeysMapper };