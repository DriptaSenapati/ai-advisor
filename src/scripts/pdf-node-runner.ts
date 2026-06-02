/**
 * Standalone runner for pdfExtractorToolNode.
 * Renders page 1, extracts basic details via LLM, saves extracted rows to DB.
 *
 *   npm run run:pdf-node                                      # uses default PDF path
 *   npm run run:pdf-node -- --pdf=assets\2025_statement.pdf
 *   npm run run:pdf-node -- --pdf=assets\hdfc.pdf --bank=HDFC
 */

import "../envConfig.js";
import { pdfExtractorToolNode } from "../modules/nodes/pdf_extractor_tool_node.js";

const pdfArg = process.argv.find(a => a.startsWith("--pdf="))?.split("=")[1];
const bankArg = process.argv.find(a => a.startsWith("--bank="))?.split("=")[1];

const PDF_PATH = pdfArg ?? "assets\\2025_statement.pdf";
const BANK_NAME = bankArg ?? "Unknown Bank";

console.log(`[PDF Node Runner] PDF: ${PDF_PATH} | Bank: ${BANK_NAME}`);

async function run() {
    const result = await pdfExtractorToolNode(
        { statementPath: PDF_PATH, bankName: BANK_NAME, messages: [] } as any,
        {} as any
    ) as any;
    console.log(`[PDF Node Runner] Done — statementMetadataId: ${result?.statementMetadataId}`);
}

run().catch(e => { console.error(e); process.exit(1); });
