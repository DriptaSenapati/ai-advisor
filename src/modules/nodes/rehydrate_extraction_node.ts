import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../graph_state.js";
import prisma from "../../prismaClient.js";

/**
 * Entry point of phase 2 — rebuilds the graph state that phase 1 held in memory.
 *
 * The two phases run as separate BullMQ jobs, so nothing survives between them
 * except what was written to the database. For the **text** path that costs
 * nothing: `tranKeyNormToolNode` already reloads rows from `StatementExtractedData`
 * itself, so it never depended on state in the first place.
 *
 * The **image** path did. `pdfExtractorNode` returns `transactionData` in state,
 * and the conditional edge at the head of `statementNormalizerSubgraph` sends
 * image statements straight to `statementErrorFetchNode`, skipping the key mapper
 * and the key normaliser — the only two nodes that read from the database. So an
 * image statement arriving in a fresh process would find `state.transactionData`
 * empty and quietly normalise zero rows: no error, no transactions.
 *
 * That is what this node exists to prevent. `isImageBased` is persisted for the
 * same reason — without it phase 2 cannot tell which of the two situations it is in.
 *
 * The `normalizerStatus` write below is a backstop, not the primary one.
 * `startProcessing` claims the statement atomically at enqueue time — doing it
 * only here left a window between enqueue and pickup in which a second click
 * passed every guard and queued a duplicate job. This write covers anything that
 * enqueues `pdf.process` without going through the API, and is idempotent.
 */
const rehydrateExtractionNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    if (!state.statementMetadataId) {
        throw new Error("statementMetadataId is required in state for rehydrateExtractionNode.");
    }

    const meta = await prisma.statementMetadata.findUnique({
        where: { id: state.statementMetadataId },
        select: { bankName: true, isImageBased: true, extractionStatus: true },
    });
    if (!meta) {
        throw new Error(`StatementMetadata ${state.statementMetadataId} not found.`);
    }
    if (meta.extractionStatus !== "Completed") {
        // The API guards this too; repeating it here covers a job enqueued by
        // anything else, and fails loudly rather than normalising a half-read PDF.
        throw new Error(
            `Cannot process statement ${state.statementMetadataId}: extraction is "${meta.extractionStatus}", not "Completed".`
        );
    }

    await prisma.statementMetadata.update({
        where: { id: state.statementMetadataId },
        data: { normalizerStatus: "Processing" },
    });

    if (!meta.isImageBased) {
        console.log(`[Rehydrate] Text statement — rows load from DB downstream (id: ${state.statementMetadataId})`);
        return { isImageBased: false, bankName: meta.bankName };
    }

    const extracted = await prisma.statementExtractedData.findUnique({
        where: { statementMetadataId: state.statementMetadataId },
        select: { rows: true },
    });
    const rows = (extracted?.rows ?? []) as Record<string, string>[];
    if (rows.length === 0) {
        throw new Error(
            `No extracted rows found for image-based statement ${state.statementMetadataId}. Extraction may have been interrupted.`
        );
    }

    console.log(`[Rehydrate] Image statement — restored ${rows.length} row(s) into state`);
    return { isImageBased: true, bankName: meta.bankName, transactionData: rows as any };
};

export { rehydrateExtractionNode };
