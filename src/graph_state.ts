import { MessagesValue, StateSchema } from "@langchain/langgraph";
import z from "zod";
import { genericTransactionDataSchema } from "./helpers/index.js";


/**
 * `userId` is required in both pipeline schemas, and is threaded from the BullMQ
 * job payload rather than read back off `StatementMetadata.userId`.
 *
 * Two reasons. The job payload is set from the authenticated session, so it is
 * non-null by construction, whereas `StatementMetadata.userId` is `String?` and
 * a null there would silently produce unowned aggregate rows. And every model
 * these graphs write — `FinalTransactionData`, `Cluster`, `MonthlyStats`,
 * `RecurringPattern`, `InsightReport` — now requires it, so a node that forgets
 * to pass it fails at the write instead of quietly creating global data.
 */
const agentGraphSchema = new StateSchema({
    messages: MessagesValue,
    userId: z.string(),
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
    userId: z.string(),
    statementMetadataId: z.string().optional(),
    affectedMonths: z.array(z.string()).optional().describe("YYYY-MM months derived from the uploaded statement period"),
    rawStatsSnapshot: z.record(z.string(), z.unknown()).optional(),
    insightReports: z.record(z.string(), z.unknown()).optional()
})

/**
 * `userId` is required here for the same reason it is above, and its absence was a bug.
 *
 * Without it `goal_analysis_node` had nothing to filter on, so it read *every* user's
 * `MonthlyStats` and `RecurringPattern` rows and fitted one blended distribution across the
 * whole deployment. The job payload has always carried a `userId`; it simply stopped at
 * `triggerGoalAnalysis`. Threading it through state is what makes the scoped queries in the
 * node possible, and what makes a node that forgets to scope fail loudly rather than quietly
 * simulate somebody else's money.
 */
const goalAdvisorGraphSchema = new StateSchema({
    messages: MessagesValue,
    goalId: z.string(),
    userId: z.string(),
    /**
     * Run the simulation even when the statements are too old for it to mean anything.
     *
     * Testing affordance only — resolved in `goals.service.ts` from an env var, or from a
     * request flag that is honoured outside production alone. A run that used it is marked
     * `staleOverride: true` so it can never be mistaken for a clean one.
     */
    allowStaleData: z.boolean().optional(),
    /** The gate's verdict. Its presence and shape decide whether the simulation runs at all. */
    goalIntent: z.record(z.string(), z.unknown()).optional(),
    goalAnalysisResult: z.record(z.string(), z.unknown()).optional(),
});

export { agentGraphSchema, insightsAgentGraphSchema, goalAdvisorGraphSchema };

export type AgentGraphState = z.infer<typeof agentGraphSchema>;
export type InsightsAgentGraphState = z.infer<typeof insightsAgentGraphSchema>;
export type GoalAdvisorGraphState = z.infer<typeof goalAdvisorGraphSchema>;