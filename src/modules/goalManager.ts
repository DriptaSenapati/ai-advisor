import prisma from "../prismaClient.js";

type GoalType = "save_amount" | "reduce_category" | "emergency_fund" | "debt_payoff";

interface CreateGoalInput {
    goalType: GoalType;
    targetAmount: number;
    deadline: Date;
    categoryTarget?: string;
}

async function createGoal(input: CreateGoalInput) {
    if (input.goalType === "reduce_category" && !input.categoryTarget) {
        throw new Error("categoryTarget is required for reduce_category goals.");
    }
    return prisma.goal.create({ data: input });
}

async function updateGoal(id: string, data: Partial<CreateGoalInput>) {
    return prisma.goal.update({ where: { id }, data });
}

async function deleteGoal(id: string): Promise<void> {
    await prisma.goal.delete({ where: { id } });
}

async function listGoals() {
    return prisma.goal.findMany({ orderBy: { createdAt: "desc" } });
}

async function getGoal(id: string) {
    return prisma.goal.findUnique({ where: { id } });
}

async function triggerGoalAnalysis(goalId: string): Promise<Record<string, unknown>> {
    const { goalAdvisorGraph } = await import("../graph.js");
    const { MemorySaver } = await import("@langchain/langgraph");

    const checkpointer = new MemorySaver();
    const agent = (goalAdvisorGraph as any).compile({ checkpointer });
    const result = await agent.invoke(
        { goalId, messages: [] },
        { configurable: { thread_id: `goal_${goalId}` } }
    );
    return (result.goalAnalysisResult as Record<string, unknown>) ?? {};
}

export { createGoal, updateGoal, deleteGoal, listGoals, getGoal, triggerGoalAnalysis };
