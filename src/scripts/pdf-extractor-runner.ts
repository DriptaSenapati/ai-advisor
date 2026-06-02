/**
 * Standalone runner for the PDF extractor.
 * Parses a bank statement PDF and writes the extracted transactions to a JSON file.
 *
 *   npm run extract:pdf                                 # uses default path
 *   npm run extract:pdf -- --pdf=assets\2025_statement.pdf
 *   npm run extract:pdf -- --pdf=assets\2025_statement.pdf --out=my_output.json
 */

import "../envConfig.js";
import fs from "fs";
import path from "path";
import { buildTransactionData, debugPDF } from "../modules/pdf/pdf_extractor.js";

const pdfArg = process.argv.find(a => a.startsWith("--pdf="))?.split("=")[1];
const outArg = process.argv.find(a => a.startsWith("--out="))?.split("=")[1];
const isDebug = process.argv.includes("--debug");

const PDF_PATH = pdfArg ?? "assets\\2025_statement.pdf";
const OUT_PATH = outArg ?? "extracted_data.json";

console.log(`[PDF Runner] Reading: ${PDF_PATH}`);

if (isDebug) {
    debugPDF(PDF_PATH);
    process.exit(0);
}

const result = buildTransactionData(PDF_PATH);

if (!result || Object.keys(result).length === 0) {
    console.error("[PDF Runner] No data extracted. Check the PDF path and format.");
    process.exit(1);
}

const totalTransactions = Object.values(result).flat().length;
console.log(`[PDF Runner] Extracted ${totalTransactions} transactions across ${Object.keys(result).length} page(s)`);

const output = {
    extractedAt: new Date().toISOString(),
    pdfPath: PDF_PATH,
    totalPages: Object.keys(result).length,
    totalTransactions,
    pages: Object.fromEntries(
        Object.entries(result).map(([pageNum, rows]) => [
            `page_${pageNum}`,
            {
                transactionCount: rows.length,
                transactions: rows,
            },
        ])
    ),
};

fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), "utf-8");
console.log(`[PDF Runner] Output written to: ${path.resolve(OUT_PATH)}`);
