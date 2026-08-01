import { GraphNode } from "@langchain/langgraph";
import { insightsAgentGraphSchema } from "../../../graph_state.js";
import prisma from "../../../prismaClient.js";
import { computeBehaviourPatterns } from "../../insights/behaviour_patterns.js";

/**
 * "Looks only for habits. Doesn't care about duplicates." — runs in parallel with
 * `eventDetectionNode` and `redFlagDetectorToolNode` (opportunity detection), all three fanned
 * out from `recurringPatternToolNode` and fanned back in at `financialContextMergeNode`.
 *
 * Deterministic — see `behaviour_patterns.ts`. Written to `state.behaviourPatterns` rather
 * than persisted, because unlike a flag or a recurring pattern this has no collection of its
 * own to live in until `insightsNode` creates the `InsightReport` at the end of the graph.
 */
const behaviourDetectionNode: GraphNode<typeof insightsAgentGraphSchema> = async (state) => {
    try {
        const monthlyStats = await prisma.monthlyStats.findMany({
            where: { userId: state.userId },
            orderBy: { month: "asc" },
        });
        const behaviourPatterns = await computeBehaviourPatterns(state.userId, monthlyStats);
        return { behaviourPatterns: behaviourPatterns as unknown[] };
    } catch (err) {
        console.error("[BehaviourDetection] failed:", err);
        return { behaviourPatterns: [] };
    }
};

export { behaviourDetectionNode };
