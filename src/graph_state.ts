import { MessagesValue, StateSchema } from "@langchain/langgraph";
import z from "zod";
import { genericTransactionDataSchema } from "./helpers/index.js";


const agentGraphSchema = new StateSchema({
    messages: MessagesValue,
    statementPath: z.string(),
    bankName: z.string(),
    statementMetadataId: z.string().optional(),
    isImageBased: z.boolean().default(false),
    transactionData: z.array(genericTransactionDataSchema.extend({
        [process.env.TEMP_ID_KEY || "tempId"]: z.string(),
    })).optional(),
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