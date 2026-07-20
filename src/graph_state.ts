import { MessagesValue, StateSchema } from "@langchain/langgraph";
import z from "zod";
import { genericTransactionDataSchema } from "./helpers/index.js";


const agentGraphSchema = new StateSchema({
    messages: MessagesValue,
    statementPath: z.string(),
    bankName: z.string(),
    pdfPassword: z.string().optional(),
    statementMetadataId: z.string().optional(),
    isImageBased: z.boolean().default(false),
    overlapOverride: z.boolean().default(false),
    transactionData: z.array(genericTransactionDataSchema.extend({
        [process.env.TEMP_ID_KEY || "tempId"]: z.string(),
    })).optional(),
});


const insightsAgentGraphSchema = new StateSchema({
    messages: MessagesValue,
    statementMetadataId: z.string().optional(),
    affectedMonths: z.array(z.string()).optional().describe("YYYY-MM months derived from the uploaded statement period"),
    rawStatsSnapshot: z.record(z.string(), z.unknown()).optional(),
    insightReports: z.record(z.string(), z.unknown()).optional()
})

const goalAdvisorGraphSchema = new StateSchema({
    messages: MessagesValue,
    goalId: z.string(),
    goalAnalysisResult: z.record(z.string(), z.unknown()).optional(),
});

export { agentGraphSchema, insightsAgentGraphSchema, goalAdvisorGraphSchema };

export type AgentGraphState = z.infer<typeof agentGraphSchema>;
export type InsightsAgentGraphState = z.infer<typeof insightsAgentGraphSchema>;
export type GoalAdvisorGraphState = z.infer<typeof goalAdvisorGraphSchema>;