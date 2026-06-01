import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../../graph_state.js";
import { statementCorrectionTool } from "../../graphTools/statement_normalizer_tools/statement_correction_tool.js";
import prisma from "../../../prismaClient.js";

const statementCorrectionToolNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    const errors = await prisma.errorPdfExtract.findMany({
        where: { statementMetadataId: state.statementMetadataId ?? null },
        select: { action: true, rationale: true, row: true },
    });
    const errorData = {
        errorRows: errors.map(e => ({
            action: e.action as "ACTION_REMOVE" | "ACTION_INCORRECT",
            rationale: e.rationale,
            row: e.row as Record<string, string>[],
        })),
    };
    console.log(`[Correction] Applying ${errorData.errorRows.length} correction(s) to transaction data`);
    const { correctedData } = await statementCorrectionTool.invoke({ extractedData: state.transactionData || [], errorData }) as { correctedData: Record<string, string>[] };
    console.log(`[Correction] Done — ${correctedData.length} transactions after corrections`);
    return { transactionData: correctedData };
};

export { statementCorrectionToolNode };