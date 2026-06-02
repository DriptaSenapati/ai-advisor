import { tool } from "langchain";
import z from "zod";
import prisma from "../../../prismaClient.js";
import { parseTransactionDate } from "../../../helpers/index.js";

const cleanAmount = (s: string) => s.replace(/,/g, "").replace(/(?:Cr|Dr)$/i, "").trim();

const parseAmount = (amountStr: string): boolean => {
    const amountRegex = /^(?:₹|Rs\.?|INR|\$|€|£)?\s?-?(?:\d{1,3}(?:,\d{2,3})*|\d+)(?:\.\d{1,2})?(?:\s?(?:Cr|Dr))?$/i;
    return amountRegex.test(amountStr.trim());
};

const parseDate = (dateStr: string): boolean => {
    const datePatterns = [
        /^\d{2}\/\d{2}\/\d{2,4}/,
        /^\d{2}-\d{2}-\d{2,4}/,
        /^\d{1,2} [A-Za-z]{3} \d{4}/,
        /^\d{1,2} [A-Za-z]+ \d{4}/,
        /^[A-Za-z]{3,} \d{1,2}, \d{4}/,
        /^\d{4}-\d{2}-\d{2}/
    ];

    return datePatterns.some(p => p.test(dateStr));
}

const creditDebitValidator = (row: { creditAmount: string; debitAmount: string }): boolean => {
    return parseAmount(row.creditAmount) || parseAmount(row.debitAmount);
};



const statementExceptionFinalTool = tool(async (input) => {
    const { correctedData, statementMetadataId } = input;
    if (!correctedData) {
        throw new Error("correctedData is required.");
    }
    let exceptions = [];
    let normTransactions = [];
    for (const row of correctedData) {
        if (!creditDebitValidator({ creditAmount: row.creditAmount || "", debitAmount: row.debitAmount || "" }) || !parseDate(row.date || "") || !parseAmount(row.balance || "")) {
            exceptions.push(row);
        } else {
            normTransactions.push(row);
        }
    }

    const nanRows = normTransactions.filter(data =>
        isNaN(parseFloat(cleanAmount(data.balance || "0"))) ||
        isNaN(parseFloat(cleanAmount(data.creditAmount || "0"))) ||
        isNaN(parseFloat(cleanAmount(data.debitAmount || "0")))
    );
    if (nanRows.length > 0) {
        console.warn("[Exception Handler] NaN rows found:", JSON.stringify(nanRows, null, 2));
    }

    await prisma.normalizedTransactions.createMany({
        data: normTransactions.map(data => ({
            date: parseTransactionDate(data.date || "") || new Date(0),
            description: data.description || "",
            creditAmount: parseFloat(cleanAmount(data.creditAmount || "0")),
            debitAmount: parseFloat(cleanAmount(data.debitAmount || "0")),
            balance: parseFloat(cleanAmount(data.balance || "0")),
            statementMetadataId: statementMetadataId ?? null,
        }))
    });

    if (exceptions.length > 0) {
        await prisma.exceptionTransactions.createMany({
            data: exceptions.map(data => ({
                date: parseTransactionDate(data.date || ""),
                description: data.description || "",
                creditAmount: cleanAmount(data.creditAmount || "0"),
                debitAmount: cleanAmount(data.debitAmount || "0"),
                balance: cleanAmount(data.balance || "0"),
                statementMetadataId: statementMetadataId ?? null,
            }))
        });
    }

    if (statementMetadataId) {
        const existing = await prisma.statementMetadata.findUnique({
            where: { id: statementMetadataId },
            select: { statementPeriodStart: true, statementPeriodEnd: true },
        });

        const datesAlreadySet = !!(existing?.statementPeriodStart && existing?.statementPeriodEnd);

        let periodStart: Date | null = existing?.statementPeriodStart ?? null;
        let periodEnd: Date | null = existing?.statementPeriodEnd ?? null;

        if (!datesAlreadySet) {
            console.log("[Exception Handler] Statement dates not set — computing from transaction range");
            const parsedDates = normTransactions
                .map(d => parseTransactionDate(d.date || ""))
                .filter((d): d is Date => d !== null && d.getTime() !== new Date(0).getTime());

            periodStart = parsedDates.length > 0 ? new Date(Math.min(...parsedDates.map(d => d.getTime()))) : null;
            periodEnd = parsedDates.length > 0 ? new Date(Math.max(...parsedDates.map(d => d.getTime()))) : null;
        } else {
            console.log("[Exception Handler] Statement dates already set from LLM extraction — skipping date range computation");
        }

        await prisma.statementMetadata.update({
            where: { id: statementMetadataId },
            data: {
                statementPeriodStart: periodStart,
                statementPeriodEnd: periodEnd,
                totalTransactions: normTransactions.length,
                exceptionCount: exceptions.length,
                normalizerStatus: "Completed",
            }
        });
    }

    return { exceptions, normTransactions };

},
    {
        name: "statementExceptionFinalTool",
        description: `
        A tool to provide final output of the corrected transaction data in the required format.
        It takes the corrected transaction data as input and returns the final output after applying any final formatting or transformations if needed.
    `,
        schema: z.object({
            correctedData: z.array(z.object({
                date: z.string().describe("Transaction Date in ISO format"),
                description: z.string().describe("Transaction Description"),
                creditAmount: z.string().describe("Credit Amount"),
                debitAmount: z.string().describe("Debit Amount"),
                balance: z.string().describe("Account Balance"),
                [process.env.TEMP_ID_KEY || "tempId"]: z.string().describe("Temporary ID to identify the row with error in the original extracted data"),
            })),
            statementMetadataId: z.string().optional().describe("ID of the StatementMetadata record for this upload"),
        })
    });


export { statementExceptionFinalTool };