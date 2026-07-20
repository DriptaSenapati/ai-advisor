import prisma from "../../prismaClient.js";
import {
    createGoal,
    updateGoal,
    deleteGoal,
    listGoals,
    getGoal,
} from "../../modules/goalManager.js";
import { NotFoundError, assertValidObjectId } from "../errors.js";
import { goalQueue } from "../../queue/index.js";

export async function createNewGoal(
    input: {
        goalType: string;
        targetAmount: number;
        deadline: string;
        categoryTarget?: string;
    },
    userId: string
) {
    const { deadline, ...rest } = input;
    return createGoal(
        { ...rest, deadline: new Date(deadline) } as Parameters<typeof createGoal>[0],
        userId
    );
}

export async function listGoalsByStatus(userId: string, status: "active" | "completed" | "all") {
    const goals = await listGoals(userId);
    if (status === "all") return goals;
    return goals.filter((g) => g.status === status);
}

export async function getGoalById(id: string, userId: string) {
    assertValidObjectId(id);
    const goal = await getGoal(id, userId);
    if (!goal) throw new NotFoundError("Goal", id);
    return goal;
}

export async function patchGoal(
    id: string,
    userId: string,
    data: {
        goalType?: string;
        targetAmount?: number;
        deadline?: string;
        categoryTarget?: string;
        status?: string;
    }
) {
    assertValidObjectId(id);
    const goal = await getGoal(id, userId);
    if (!goal) throw new NotFoundError("Goal", id);

    const { deadline, ...rest } = data;
    const updateData = {
        ...rest,
        ...(deadline ? { deadline: new Date(deadline) } : {}),
    };
    return prisma.goal.update({ where: { id }, data: updateData });
}

export async function removeGoal(id: string, userId: string) {
    assertValidObjectId(id);
    const goal = await getGoal(id, userId);
    if (!goal) throw new NotFoundError("Goal", id);
    await deleteGoal(id);
}

export async function scheduleGoalAnalysis(goalId: string, userId: string): Promise<void> {
    await goalQueue.add("goal.analyze", { goalId, userId });
}
