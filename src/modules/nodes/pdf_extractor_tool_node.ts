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
import { storage } from "../../lib/storage.js";

const TEMP_ID_KEY = process.env.TEMP_ID_KEY as string;

const parseISODate = (s: string): Date | null => {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
};

/**
 * Write the extracted rows, replacing any from an earlier attempt.
 *
 * `create()` here was not safe, because this node is retried. BullMQ gives the
 * extract job three attempts, so a statement that fails once — including the
 * ordinary "this PDF has no parseable rows" case, which throws — arrives back
 * here with a `StatementExtractedData` row already present, and the retry died on
 * `StatementExtractedData_statementMetadataId_key` instead of on the real
 * problem. The user then saw a Prisma constraint message rather than "no
 * transactions detected".
 *
 * `statementMetadataId` is `@unique`, so an upsert makes the whole node
 * re-runnable, which it has to be.
 */
async function saveExtractedRows(metadataId: string, rows: Record<string, string>[]): Promise<void> {
    await prisma.statementExtractedData.upsert({
        where: { statementMetadataId: metadataId },
        create: { statementMetadataId: metadataId, rows },
        update: { rows },
    });
    await prisma.statementMetadata.update({
        where: { id: metadataId },
        data: { rawRowCount: rows.length },
    });
}

const buildPageMessage = (base64: string, text: string) =>
    new HumanMessage({
        content: [
            { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } },
            { type: "text", text },
        ],
    });

// ── Extract bank name, account number, statement period from page 1 ───────────
async function extractBasicDetails(pdfPath: string, metadataId: string, fallbackBankName: string, password?: string) {
    try {
        const details = await basicDetailsExtractionPrompt.pipe(basicDetailsExtractionLlm).invoke({
            humanMessage: [buildPageMessage(
                getPageAsBase64(pdfPath, 0, 2, password),
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
async function extractTextBased(pdfPath: string, metadataId: string, password?: string): Promise<Record<string, string>[]> {
    const extractedData = await pdfExtractorTool.invoke({ pdfPath, password });
    const rows = extractedData ? Object.values(extractedData).flat() : [];
    const rowsWithTempId = rows.map(tran => ({ ...tran, [TEMP_ID_KEY]: uuidv4() }));
    // `rawRowCount` is recorded alongside because it is what the extraction
    // receipt shows at the gate. `totalTransactions` only lands at the end of the
    // normalizer subgraph, which does not run until the user has already decided.
    await saveExtractedRows(metadataId, rowsWithTempId);
    console.log(`[PDF Extractor] Text extraction — ${rows.length} rows across ${Object.keys(extractedData ?? {}).length} page(s)`);
    return rowsWithTempId;
}

// ── Vision LLM extraction (per page) ─────────────────────────────────────────
async function extractImageBased(pdfPath: string, metadataId: string, password?: string): Promise<Record<string, string>[]> {
    const pageCount = getPageCount(pdfPath, password);
    console.log(`[PDF Extractor] Vision extraction — ${pageCount} page(s)`);
    const chain = imagePdfExtractionPrompt.pipe(imagePdfExtractionLlm);
    const allRows: Record<string, string>[] = [];

    for (let i = 0; i < pageCount; i++) {
        const result = await chain.invoke({
            humanMessage: [buildPageMessage(
                getPageAsBase64(pdfPath, i, 2, password),
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

    await saveExtractedRows(metadataId, allRows);
    return allRows;
}

// ── 12-month range validation (image path only — text path validated in tranKeyNormToolNode) ──
function validateMonthRange(rows: Record<string, string>[]) {
    const dates = rows.map(r => moment(parseTransactionDate(r.date))).filter(m => m.isValid());
    if (dates.length > 1 && moment.max(...dates).diff(moment.min(...dates), "months", true) > 12) {
        throw new Error("Extracted transactions span more than 12 months. Please provide transactions for a maximum of 12 months.");
    }
}

// ── Outcome ───────────────────────────────────────────────────────────────────
//
// Extraction owns `extractionStatus`/`extractionError`, not `normalizerStatus`.
// Since the split those are two different questions: extraction is phase 1, and
// normalisation does not begin until the user presses Illuminate. Reporting an
// extraction failure as a normalizer failure would claim work had started that
// nobody has authorised.
//
// `isImageBased` is persisted here because it is only knowable at this point, and
// phase 2 needs it — the image path carries its rows in graph state, so a fresh
// job has to know to reload them. See `rehydrate_extraction_node.ts`.

async function completeExtraction(metadataId: string, isImageBased: boolean): Promise<void> {
    await prisma.statementMetadata.update({
        where: { id: metadataId },
        data: { extractionStatus: "Completed", extractionError: null, isImageBased },
    });
}

async function failExtraction(metadataId: string, message: string): Promise<void> {
    await prisma.statementMetadata.update({
        where: { id: metadataId },
        data: { extractionStatus: "Error", extractionError: message },
    });
}

// ── Node ──────────────────────────────────────────────────────────────────────
const pdfExtractorToolNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    console.log(`[PDF Extractor] Parsing statement: ${state.statementPath}`);

    // `state.statementPath` is a storage key (local path or S3 key, driver-
    // dependent) — resolved to a real local path once here, so everything below
    // (mupdf, the vision calls) keeps working exactly as it did when this field
    // was always a disk path.
    const localPdfPath = await storage.downloadToTempFile(state.statementPath);
    try {
        const pdfBytes = fs.readFileSync(localPdfPath);
        const contentHash = crypto.createHash("sha256").update(pdfBytes).digest("hex");

        let metadataId: string;

        if (state.statementMetadataId) {
            // API flow: record pre-created by the upload service, just continue
            metadataId = state.statementMetadataId;
            console.log(`[PDF Extractor] Using pre-created StatementMetadata (id: ${metadataId})`);
        } else {
            // CLI flow: full dedup check + create
            const existing = await prisma.statementMetadata.findUnique({ where: { contentHash } });
            if (existing) {
                console.warn(`[PDF Extractor] Duplicate detected (id: ${existing.id}). Aborting.`);
                throw new Error(`Duplicate statement upload: already processed (StatementMetadata id: ${existing.id}).`);
            }
            const metadata = await prisma.statementMetadata.create({
                data: { bankName: state.bankName || "Unknown Bank", contentHash, extractionStatus: "Processing", insightsStatus: "Not Started" },
            });
            metadataId = metadata.id;
            console.log(`[PDF Extractor] StatementMetadata created (id: ${metadataId})`);
        }

        const password = state.pdfPassword;

        await extractBasicDetails(localPdfPath, metadataId, state.bankName || "Unknown Bank", password);

        const detectedAsImage = isImageBasedPdf(localPdfPath, password);
        console.log(`[PDF Extractor] Detected: ${detectedAsImage ? "image-based" : "text-based"}`);

        let isImageBased = detectedAsImage;

        if (!detectedAsImage) {
            try {
                const rows = await extractTextBased(localPdfPath, metadataId, password);
                if (rows.length === 0) {
                    await failExtraction(metadataId, "No transactions detected. Header found but no transaction rows could be parsed from the PDF.");
                    throw new Error("No transactions detected in the extracted PDF.");
                }
            } catch (err) {
                if (err instanceof Error && err.message.startsWith("No transactions detected")) throw err;
                console.warn("[PDF Extractor] Text extraction failed — falling back to vision LLM:", err);
                isImageBased = true;
            }
        }

        if (isImageBased) {
            const rows = await extractImageBased(localPdfPath, metadataId, password);
            if (rows.length === 0) {
                await failExtraction(metadataId, "No transactions detected. Vision LLM found no transaction rows in any page of the PDF.");
                throw new Error("No transactions detected in the extracted PDF.");
            }
            validateMonthRange(rows);
            await completeExtraction(metadataId, true);
            console.log(`[PDF Extractor] Done — ${rows.length} transaction(s) via vision LLM`);
            return { statementMetadataId: metadataId, isImageBased: true, transactionData: rows as any };
        }

        await completeExtraction(metadataId, false);
        console.log("[PDF Extractor] Done — text extraction complete");
        return { statementMetadataId: metadataId, isImageBased: false };
    } finally {
        await storage.releaseTempFile(localPdfPath);
    }
};

export { pdfExtractorToolNode };
