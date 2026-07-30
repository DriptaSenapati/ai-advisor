import prisma from "../prismaClient.js";

type GoalType = "save_amount" | "reduce_category" | "emergency_fund" | "debt_payoff";

interface CreateGoalInput {
    /** The free text from the composer. Absent when a goal is created straight through the API. */
    title?: string;
    goalType: GoalType;
    targetAmount: number;
    deadline: Date;
    categoryTarget?: string;
    status?: string;
}

async function createGoal(input: CreateGoalInput, userId: string) {
    if (input.goalType === "reduce_category" && !input.categoryTarget) {
        throw new Error("categoryTarget is required for reduce_category goals.");
    }
    return prisma.goal.create({ data: { ...input, userId } });
}

async function updateGoal(id: string, data: Partial<CreateGoalInput>) {
    return prisma.goal.update({ where: { id }, data });
}

async function deleteGoal(id: string): Promise<void> {
    await prisma.goal.delete({ where: { id } });
}

async function listGoals(userId: string) {
    return prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

async function getGoal(id: string, userId: string) {
    return prisma.goal.findFirst({ where: { id, userId } });
}

/**
 * Runs the two-node goal graph: intent gate, then — only if it accepts — the simulation.
 *
 * `userId` is not decoration. Every read inside the graph filters on it, and it used to be
 * dropped here even though the BullMQ payload carried it, which is what let the simulation
 * fit itself to the whole deployment's savings history.
 *
 * The returned object is one of four shapes and the caller must look at it: the gate's
 * rejection (`{ blocked: true, reasonCode }`), the past-deadline result, the stale result,
 * or a full simulation. The worker discriminates on `blocked` to decide which stage to
 * publish.
 */
async function triggerGoalAnalysis(
    goalId: string,
    userId: string,
    allowStaleData = false,
    onNodeComplete?: (node: string, emitted?: Record<string, unknown>) => Promise<void>
): Promise<Record<string, unknown>> {
    const { goalAdvisorGraph } = await import("../graph.js");
    const { MemorySaver } = await import("@langchain/langgraph");

    const checkpointer = new MemorySaver();
    const agent = (goalAdvisorGraph as any).compile({ checkpointer });

    /*
      Streamed rather than invoked, so the caller gets a frame at each node boundary the way
      every other pipeline here does. The two layers are wildly different lengths — the gate
      is about a second, the simulation runs ~460,000 iterations — and a screen told only
      "working" across both looks stuck through the long half.
    */
    let result: Record<string, unknown> = {};

    const stream = await agent.stream(
        { goalId, userId, allowStaleData, messages: [] },
        { configurable: { thread_id: `goal_${goalId}` }, streamMode: "updates" }
    );

    for await (const update of stream) {
        for (const [node, value] of Object.entries(update as Record<string, any>)) {
            const emitted = value?.goalAnalysisResult as Record<string, unknown> | undefined;
            if (emitted) result = emitted;
            if (onNodeComplete) await onNodeComplete(node, emitted);
        }
    }

    return result;
}

export { createGoal, updateGoal, deleteGoal, listGoals, getGoal, triggerGoalAnalysis };
