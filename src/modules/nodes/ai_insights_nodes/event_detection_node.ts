import { GraphNode } from "@langchain/langgraph";
import { insightsAgentGraphSchema } from "../../../graph_state.js";
import prisma from "../../../prismaClient.js";
import { computeFinancialContext } from "../../insights/financial_context.js";

/**
 * "Looks only for unusual events. Doesn't care about trends." — the node that stops a single
 * ₹3,50,000 wedding transfer from being read as an ongoing habit. Runs in parallel with
 * `behaviourDetectionNode` and `redFlagDetectorToolNode`; see that fan-out in `graph.ts`.
 *
 * Deterministic — see `financial_context.ts`. Written to `state.financialContext` for the
 * same reason `behaviourDetectionNode` writes to state instead of persisting: nothing to
 * persist *to* until `insightsNode` creates the `InsightReport`.
 */
const eventDetectionNode: GraphNode<typeof insightsAgentGraphSchema> = async (state) => {
    try {
        const monthlyStats = await prisma.monthlyStats.findMany({
            where: { userId: state.userId },
            orderBy: { month: "asc" },
        });
        const financialContext = computeFinancialContext(monthlyStats);
        return { financialContext: financialContext as unknown[] };
    } catch (err) {
        console.error("[EventDetection] failed:", err);
        return { financialContext: [] };
    }
};

export { eventDetectionNode };
