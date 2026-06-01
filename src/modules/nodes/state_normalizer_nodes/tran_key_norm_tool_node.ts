import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../../graph_state.js";
import { tranKeyNormalizerTool } from "../../graphTools/statement_normalizer_tools/tran_key_normalizer_tool.js";
import { parseTransactionDate } from "../../../helpers/index.js";
import moment from "moment";
import prisma from "../../../prismaClient.js";


type normalizedTranKeyOutputType = {
    date: string,
    description: string,
    creditAmount: string,
    debitAmount: string,
    balance: string,
    [key: string]: string,
}[];

const tranKeyNormalizerToolNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    if (!state.statementMetadataId) {
        throw new Error("statementMetadataId is required in state for tranKeyNormalizerToolNode.");
    }

    const meta = await prisma.statementMetadata.findUnique({
        where: { id: state.statementMetadataId },
        select: { keyMapping: true },
    });
    const extracted = await prisma.statementExtractedData.findUnique({
        where: { statementMetadataId: state.statementMetadataId },
        select: { rows: true },
    });
    const extractedData = (extracted?.rows ?? []) as Record<string, string>[];
    const keyMapping = (meta?.keyMapping ?? {}) as Record<string, string>;
    console.log(`[Key Normalizer] Renaming keys for ${extractedData.length} transactions`);
    const normalizedTranKeyOutput: normalizedTranKeyOutputType = await tranKeyNormalizerTool.invoke({ extractedData, keyMapping });
    console.log(`[Key Normalizer] Done — ${normalizedTranKeyOutput.length} transactions normalized`);

    console.log(`[Key Normalizer] Validating maxmimum number of months of transactions...`)
    const minDate = moment.min(...normalizedTranKeyOutput.map(t => moment(parseTransactionDate(t.date))))
    const maxDate = moment.max(...normalizedTranKeyOutput.map(t => moment(parseTransactionDate(t.date))))

    if (maxDate.diff(minDate, "months", true) > 12) {
        throw new Error("Extracted transactions span more than 12 months. Please provide transactions for a maximum of 12 months.");
    }
    console.log(`[Key Normalizer] Total ${normalizedTranKeyOutput.length} transactions ready.`);
    return { transactionData: normalizedTranKeyOutput };

}

export { tranKeyNormalizerToolNode };