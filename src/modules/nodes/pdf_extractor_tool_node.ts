import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../graph_state.js";
import { pdfExtractorTool } from "../graphTools/statementExtraction/graph_pdf_extractor.js";
import { getPageAsBase64, getPageCount, isImageBasedPdf } from "../pdf/pdf_extractor.js";
import { basicDetailsExtractionLlm, basicDetailsExtractionPrompt, imagePdfExtractionLlm, imagePdfExtractionPrompt } from "../../models/index.js";
import { HumanMessage } from "@langchain/core/messages";
import { parseTransactionDate } from "../../helpers/index.js";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import fs from "fs";
import moment from "moment";
import prisma from "../../prismaClient.js";

const TEMP_ID_KEY = process.env.TEMP_ID_KEY as string;

const parseISODate = (s: string): Date | null => {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
};

const buildPageMessage = (base64: string, text: string) =>
    new HumanMessage({
        content: [
            { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } },
            { type: "text", text },
        ],
    });

// ── Extract bank name, account number, statement period from page 1 ───────────
async function extractBasicDetails(pdfPath: string, metadataId: string, fallbackBankName: string) {
    try {
        const details = await basicDetailsExtractionPrompt.pipe(basicDetailsExtractionLlm).invoke({
            humanMessage: [buildPageMessage(
                getPageAsBase64(pdfPath, 0, 2),
                "Extract the bank name, account number, statement start date, and statement end date from this page."
            )],
        });
        await prisma.statementMetadata.update({
            where: { id: metadataId },
            data: {
                bankName: details.bankName || fallbackBankName,
                accountNumber: details.accountNumber || null,
                statementPeriodStart: parseISODate(details.statementStartDate),
                statementPeriodEnd: parseISODate(details.statementEndDate),
            },
        });
        console.log(`[PDF Extractor] Basic details — bank=${details.bankName} account=${details.accountNumber} period=${details.statementStartDate} → ${details.statementEndDate}`);
    } catch (err) {
        console.warn("[PDF Extractor] Basic details extraction failed — skipping:", err);
    }
}

// ── mupdf text extraction ─────────────────────────────────────────────────────
async function extractTextBased(pdfPath: string, metadataId: string): Promise<Record<string, string>[]> {
    const extractedData = await pdfExtractorTool.invoke({ pdfPath });
    const rows = extractedData ? Object.values(extractedData).flat() : [];
    const rowsWithTempId = rows.map(tran => ({ ...tran, [TEMP_ID_KEY]: uuidv4() }));
    await prisma.statementExtractedData.create({ data: { statementMetadataId: metadataId, rows: rowsWithTempId } });
    console.log(`[PDF Extractor] Text extraction — ${rows.length} rows across ${Object.keys(extractedData ?? {}).length} page(s)`);
    return rowsWithTempId;
}

// ── Vision LLM extraction (per page) ─────────────────────────────────────────
async function extractImageBased(pdfPath: string, metadataId: string): Promise<Record<string, string>[]> {
    const pageCount = getPageCount(pdfPath);
    console.log(`[PDF Extractor] Vision extraction — ${pageCount} page(s)`);
    const chain = imagePdfExtractionPrompt.pipe(imagePdfExtractionLlm);
    const allRows: Record<string, string>[] = [];

    for (let i = 0; i < pageCount; i++) {
        const result = await chain.invoke({
            humanMessage: [buildPageMessage(
                getPageAsBase64(pdfPath, i, 2),
                "Extract all transaction rows from this bank statement page."
            )],
        });
        const pageRows = result.rows.map(row => ({
            date: row.date,
            description: row.description,
            creditAmount: row.creditAmount.toString(),
            debitAmount: row.debitAmount.toString(),
            balance: row.balance.toString(),
            [TEMP_ID_KEY]: uuidv4(),
        }));
        console.log(`[PDF Extractor] Page ${i + 1} — ${pageRows.length} transaction(s)`);
        allRows.push(...pageRows);
    }

    await prisma.statementExtractedData.create({ data: { statementMetadataId: metadataId, rows: allRows } });
    return allRows;
}

// ── 12-month range validation (image path only — text path validated in tranKeyNormToolNode) ──
function validateMonthRange(rows: Record<string, string>[]) {
    const dates = rows.map(r => moment(parseTransactionDate(r.date))).filter(m => m.isValid());
    if (dates.length > 1 && moment.max(...dates).diff(moment.min(...dates), "months", true) > 12) {
        throw new Error("Extracted transactions span more than 12 months. Please provide transactions for a maximum of 12 months.");
    }
}

// ── Node ──────────────────────────────────────────────────────────────────────
const pdfExtractorToolNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    console.log(`[PDF Extractor] Parsing statement: ${state.statementPath}`);

    const pdfBytes = fs.readFileSync(state.statementPath);
    const contentHash = crypto.createHash("sha256").update(pdfBytes).digest("hex");

    const existing = await prisma.statementMetadata.findUnique({ where: { contentHash } });
    if (existing) {
        console.warn(`[PDF Extractor] Duplicate detected (id: ${existing.id}). Aborting.`);
        throw new Error(`Duplicate statement upload: already processed (StatementMetadata id: ${existing.id}).`);
    }

    const metadata = await prisma.statementMetadata.create({
        data: { bankName: state.bankName || "Unknown Bank", contentHash, normalizerStatus: "Processing", insightsStatus: "Processing" },
    });
    console.log(`[PDF Extractor] StatementMetadata created (id: ${metadata.id})`);

    await extractBasicDetails(state.statementPath, metadata.id, state.bankName || "Unknown Bank");

    const detectedAsImage = isImageBasedPdf(state.statementPath);
    console.log(`[PDF Extractor] Detected: ${detectedAsImage ? "image-based" : "text-based"}`);

    let isImageBased = detectedAsImage;

    if (!detectedAsImage) {
        try {
            await extractTextBased(state.statementPath, metadata.id);
        } catch (err) {
            console.warn("[PDF Extractor] Text extraction failed — falling back to vision LLM:", err);
            isImageBased = true;
        }
    }

    if (isImageBased) {
        const rows = await extractImageBased(state.statementPath, metadata.id);
        validateMonthRange(rows);
        console.log(`[PDF Extractor] Done — ${rows.length} transaction(s) via vision LLM`);
        return { statementMetadataId: metadata.id, isImageBased: true, transactionData: rows as any };
    }

    console.log("[PDF Extractor] Done — text extraction complete");
    return { statementMetadataId: metadata.id, isImageBased: false };
};

export { pdfExtractorToolNode };
