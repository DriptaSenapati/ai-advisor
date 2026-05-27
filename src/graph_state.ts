import { MessagesValue, StateSchema } from "@langchain/langgraph";
import z from "zod";
import { genericTransactionDataSchema } from "./helpers/index.js";





const agentGraphSchema = new StateSchema({
    messages: MessagesValue,
    statementPath: z.string(),
    bankName: z.string(),
    statementMetadataId: z.string().optional(),
    extractedData: z.array(z.record(z.string(), z.string())).optional(),
    // normalizedData: z.array(z.object({
    //     date: z.string().describe("Transaction Date in ISO format"),
    //     description: z.string().describe("Transaction Description"),
    //     creditAmount: z.number().describe("Credit Amount"),
    //     debitAmount: z.number().describe("Debit Amount"),
    //     balance: z.number().describe("Account Balance"),
    // })).optional(),
    keyMapping: z.record(z.string(), z.string()).optional(),
    // normalizedTranKeyOutput: z.array(z.record(z.string(), z.string())).optional(),
    errorData: z.object({
        errorRows: z.array(z.object({
            action: z.enum(["ACTION_REMOVE", "ACTION_INCORRECT"]),
            rationale: z.string().describe("Reason for why you think that row has some error and what is the error in that row"),
            row: z.array(z.object({
                date: z.string().describe("Transaction Date in ISO format"),
                description: z.string().describe("Transaction Description"),
                creditAmount: z.string().describe("Credit Amount"),
                debitAmount: z.string().describe("Debit Amount"),
                balance: z.string().describe("Account Balance"),
                [process.env.TEMP_ID_KEY || "tempId"]: z.string().describe("Temporary ID to identify the row with error in the original extracted data"),
            })).describe("Row data in key value pair format where key is the column name and value is the corrected value of that column for that row"),
        }))
    }),
    transactionData: z.array(genericTransactionDataSchema.extend({
        [process.env.TEMP_ID_KEY || "tempId"]: z.string().describe("Temporary ID to identify the row with error in the original extracted data"),
    })),
    exceptions: z.array(genericTransactionDataSchema.extend({
        [process.env.TEMP_ID_KEY || "tempId"]: z.string().describe("Temporary ID to identify the row with error in the original extracted data"),
    })),
    finalTransactionData: z.array(genericTransactionDataSchema.extend({
        descriptionVector: z.array(z.number()).describe("Vector representation of the transaction description for clustering and categorization"),
    })),
});


const insightsAgentGraphSchema = new StateSchema({
    messages: MessagesValue,
    isFirstRun: z.boolean().default(true).describe("Flag to indicate if it's the first run of the insights generation"),
    monthToBeCovered: z.int().min(2).max(12).describe("Number of months for which the insights needs to be generated").default(12),
    statementMetadataId: z.string().optional(),
    rawStatsSnapshot: z.record(z.string(), z.unknown()).optional(),
    insightReports: z.record(z.string(), z.unknown()).optional()
})

export { agentGraphSchema, insightsAgentGraphSchema };

export type AgentGraphState = z.infer<typeof agentGraphSchema>;
export type InsightsAgentGraphState = z.infer<typeof insightsAgentGraphSchema>;