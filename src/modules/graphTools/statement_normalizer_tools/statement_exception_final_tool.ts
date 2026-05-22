import { tool } from "langchain";
import z from "zod";
import prisma from "../../../prismaClient.js";
import { parseTransactionDate } from "../../../helpers/index.js";

const parseAmount = (amountStr: string): boolean => {
    const amountRegex = /(?<!\w)(?:₹|Rs\.?|INR|\$|€|£)?\s?-?\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?(?!\w)/;
    return amountRegex.test(amountStr)
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
    const { correctedData } = input;
    if (!correctedData) {
        throw new Error("correctedData is required.");
    }
    let exceptions = [];
    for (const row of correctedData) {
        if (!creditDebitValidator({ creditAmount: row.creditAmount || "", debitAmount: row.debitAmount || "" }) || !parseDate(row.date || "") || !parseAmount(row.balance || "")) {
            exceptions.push(row);
        }
    }

    await prisma.normalizedTransactions.createMany({
        data: correctedData.map(data => ({
            date: parseTransactionDate(data.date || "") || new Date(0),
            description: data.description || "",
            creditAmount: parseFloat((data.creditAmount || "0").replace(/,/g, "")),
            debitAmount: parseFloat((data.debitAmount || "0").replace(/,/g, "")),
            balance: parseFloat((data.balance || "0").replace(/,/g, ""))
        }))
    });

    if (exceptions.length > 0) {
        await prisma.exceptionTransactions.createMany({
            data: exceptions.map(data => ({
                date: parseTransactionDate(data.date || ""),
                description: data.description || "",
                creditAmount: (data.creditAmount || "0").replace(/,/g, ""),
                debitAmount: (data.debitAmount || "0").replace(/,/g, ""),
                balance: (data.balance || "0").replace(/,/g, "")
            }))
        });
    }


    return exceptions;

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
        })
    });


export { statementExceptionFinalTool };