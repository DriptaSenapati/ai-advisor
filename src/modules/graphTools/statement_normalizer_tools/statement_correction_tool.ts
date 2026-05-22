import { tool } from "langchain";
import z from "zod";

const statementCorrectionTool = tool(async (input) => {
    const { extractedData, errorData } = input;
    if (!extractedData || !errorData) {
        throw new Error("Both extractedData and errorData are required.");
    }
    let correctedData = [...extractedData];

    for (const errorRow of errorData.errorRows) {
        const { action, row } = errorRow;
        const tempId = row.map(r => r[process.env.TEMP_ID_KEY || "tempId"]); // Assuming tempId is present in the row data
        if (action === "ACTION_REMOVE") {
            correctedData = correctedData.filter(r => !tempId.includes(r[process.env.TEMP_ID_KEY || "tempId"]));
        } else if (action === "ACTION_INCORRECT") {
            correctedData = correctedData.map(r => {
                const idx = tempId.indexOf(r[process.env.TEMP_ID_KEY || "tempId"]);
                return idx !== -1 ? (row[idx] as Record<string, string>) : r;
            });
        }
    }


    return { correctedData };

}, {
    name: "statementCorrectionTool",
    description: `
        A tool to correct the errors in the extracted transaction data based on the actions defined by previous steps. 
        It takes the normalized transaction data with standardized keys and the error data as input and returns the corrected transaction data. 
        The corrected transaction data should have the same format as the normalized transaction data with standardized keys.
    `,
    schema: z.object({
        extractedData: z.array(
            z.object({
                date: z.string().describe("Transaction Date in ISO format"),
                description: z.string().describe("Transaction Description"),
                creditAmount: z.string().describe("Credit Amount"),
                debitAmount: z.string().describe("Debit Amount"),
                balance: z.string().describe("Account Balance"),
                [process.env.TEMP_ID_KEY || "tempId"]: z.string().describe("Temporary ID to identify the row with error in the original extracted data"),
            })
        ),
        errorData: z.object({
            errorRows: z.array(
                z.object({
                    action: z.enum(["ACTION_REMOVE", "ACTION_INCORRECT"]).describe("The action to be taken for the error row"),
                    rationale: z.string().describe("The rationale for the action taken"),
                    row: z.array(
                        z.object({
                            date: z.string().describe("Transaction Date in ISO format"),
                            description: z.string().describe("Transaction Description"),
                            creditAmount: z.string().describe("Credit Amount"),
                            debitAmount: z.string().describe("Debit Amount"),
                            balance: z.string().describe("Account Balance"),
                            [process.env.TEMP_ID_KEY || "tempId"]: z.string().describe("Temporary ID to identify the row with error in the original extracted data"),
                        })
                    )
                })
            )
        })
    })
});


export { statementCorrectionTool };