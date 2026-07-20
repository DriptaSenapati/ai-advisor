import { tool } from "@langchain/core/tools";
import { buildTransactionData } from "../../pdf/pdf_extractor.js";
import * as z from "zod";

const pdfExtractorTool = tool((input) => buildTransactionData(input.pdfPath, input.password), {
    name: "pdfExtractor",
    description: "Extract transaction data from a PDF file and return it in a structured format.",
    schema: z.object({
        pdfPath: z.string().describe("Path to the PDF file to be processed."),
        password: z.string().optional().describe("Password for encrypted PDFs."),
    }),
})

export { pdfExtractorTool };