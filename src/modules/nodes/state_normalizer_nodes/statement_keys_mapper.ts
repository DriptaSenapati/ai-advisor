import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../../graph_state.js";
import { keyMapperLlm, llmSystemMessageKeyMapper, structuredLlm } from "../../../models/index.js";

const statementKeysMapper: GraphNode<typeof agentGraphSchema> = async (state) => {
    if (!state.extractedData || state.extractedData.length === 0) {
        return { ...state };
    }
    // const keyMapping = await llmSystemMessageKeyMapper.pipe(keyMapperLlm).invoke({ extractedData: Object.keys(state.extractedData[0] || {}) });
    // return { ...state, keyMapping: Object.fromEntries(Object.entries(keyMapping).map(([k, v]) => [v, k])) }

    return {
        ...state, keyMapping: {
            Date: 'date',
            Description: 'description',
            'Deposit (Cr.)': 'creditAmount',
            'Withdrawal (Dr.)': 'debitAmount',
            Balance: 'balance'
        }
    };

}

export { statementKeysMapper };