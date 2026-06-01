/**
 * Standalone runner for the balance gap analyzer + confidence calculator.
 * Reads NormalizedTransactions from DB, computes balance gaps and extraction
 * confidence, and writes results back to StatementMetadata.
 *
 *   npm run analyze:balance                              # run for ALL StatementMetadata records
 *   npm run analyze:balance -- --metadataId=<id>        # run for a single record
 */

import "../envConfig.js";
import prisma from "../prismaClient.js";
import { balanceGapAnalyzerNode } from "../modules/nodes/balance_analyzer_nodes/balance_gap_analyzer_node.js";
import { confidenceCalculatorNode } from "../modules/nodes/balance_analyzer_nodes/confidence_calculator_node.js";

const metadataIdArg = process.argv.find(a => a.startsWith("--metadataId="))?.split("=")[1];

async function runForMetadata(metadataId: string) {
    const minState = { statementMetadataId: metadataId, statementPath: "", bankName: "", messages: [] } as any;

    await balanceGapAnalyzerNode(minState, {} as any);
    await confidenceCalculatorNode(minState, {} as any);

    const result = await prisma.statementMetadata.findUnique({
        where: { id: metadataId },
        select: { bankName: true, balanceGapCount: true, extractionConfidence: true },
    });

    console.log(
        `[${metadataId}] bank=${result?.bankName ?? "?"} ` +
        `gaps=${result?.balanceGapCount ?? "?"} ` +
        `confidence=${result?.extractionConfidence ?? "?"}`
    );
}

async function run() {
    if (metadataIdArg) {
        const exists = await prisma.statementMetadata.findUnique({ where: { id: metadataIdArg }, select: { id: true } });
        if (!exists) {
            console.error(`[BalanceAnalyzerRunner] No StatementMetadata found for id: ${metadataIdArg}`);
            process.exit(1);
        }
        await runForMetadata(metadataIdArg);
    } else {
        const allMetadata = await prisma.statementMetadata.findMany({
            select: { id: true },
            orderBy: { createdAt: "asc" },
        });

        if (allMetadata.length === 0) {
            console.log("[BalanceAnalyzerRunner] No StatementMetadata records found.");
            return;
        }

        console.log(`[BalanceAnalyzerRunner] Processing ${allMetadata.length} record(s)...`);
        for (const { id } of allMetadata) {
            await runForMetadata(id);
        }
    }

    console.log("\nDone.");
}

run().catch(e => { console.error(e); process.exit(1); });
