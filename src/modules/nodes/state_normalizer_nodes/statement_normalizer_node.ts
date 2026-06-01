import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../../graph_state.js";
import { llmSystemMessage, structuredLlm } from "../../../models/index.js";
import prisma from "../../../prismaClient.js";

// create a batch of size process.env.BATCH_SIZE from list of transaction and split them into chunks of size process.env.CHUNK_SIZE
// for each batch invoke the llm and get the normalized transactions and then combine the results of all batches and return the final normalized transactions
function* batchTransactions(transactions: any[], batchSize: number = parseInt(process.env.BATCH_SIZE as string), chunkSize: number = parseInt(process.env.CHUNK_SIZE as string)) {
    for (let i = 0; i < transactions.length; i += batchSize) {
        const batch = transactions.slice(i, i + batchSize);

        yield [
            batch.slice(0, chunkSize),
            batch.slice(chunkSize, 2 * chunkSize),
        ]
    }
}


const statementErrorFetcherNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    const transactionData = state.transactionData || [];
    const total = transactionData.length;
    console.log(`[Error Fetcher] Scanning ${total} transactions for errors via LLM`);

    const errorData: { errorRows: any[] } = { errorRows: [] };

    const columnOrder = Object.keys(transactionData[0] || {})
        .filter(k => k !== (process.env.TEMP_ID_KEY || "tempId"))
        .join(" → ");

    for (const batch of batchTransactions(transactionData)) {
        const normDataList = (await Promise.all(batch.map(chunk => llmSystemMessage.pipe(structuredLlm).invoke({ extractedData: chunk, columnOrder })))).flat();
        errorData.errorRows.push(...normDataList.map(data => data.errorRows).flat());
    }

    console.log(`[Error Fetcher] Done — ${errorData.errorRows.length} error row(s) detected`);

    if (errorData.errorRows.length > 0) {
        await prisma.errorPdfExtract.createMany({
            data: errorData.errorRows.map((err: any) => ({
                action: err.action,
                rationale: err.rationale,
                row: err.row,
                statementMetadataId: state.statementMetadataId ?? null,
            }))
        });
        console.log(`[Error Fetcher] Saved ${errorData.errorRows.length} error(s) to ErrorPdfExtract`);
    }

    return {};
}

export { statementErrorFetcherNode };