import prisma from "../../prismaClient.js";
import {
    createGoal,
    updateGoal,
    deleteGoal,
    listGoals,
    getGoal,
} from "../../modules/goalManager.js";
import { NotFoundError, PlanLimitError, PlanRequiredError, assertValidObjectId } from "../errors.js";
import { goalQueue, publish } from "../../queue/index.js";
import { planIdFor } from "../middleware/entitlement.js";
import { jobPriorityFor, minimumPlanFor, nextPlanForLimit, resolvePlan } from "../../config/plans.js";

/**
 * Whether this run may step over the `very_stale` data guard.
 *
 * Two ways in, and neither is reachable from a deployed client. `GOAL_SIM_ALLOW_STALE_DATA`
 * is the local default for working against a fixture set whose statements are months old;
 * the per-request `force` exists so one goal can be forced while the guard stays on for the
 * rest, and is ignored entirely in production. A run that used either is marked
 * `staleOverride: true` in its result, so the screen can say the figures are illustrative
 * rather than quietly presenting year-old data as a forecast.
 */
function resolveAllowStaleData(force?: boolean): boolean {
    if (process.env["GOAL_SIM_ALLOW_STALE_DATA"] === "true") return true;
    return process.env["NODE_ENV"] !== "production" && force === true;
}

/**
 * Refuse a goal the caller's plan does not cover.
 *
 * The whole `/goals` router already sits behind `requireFeature("goals")`, so
 * the feature check here is redundant *through the API* — and deliberately kept.
 * This service is also reachable from the CLI entry point and the dev scripts,
 * which never touch Express middleware, and a rule that lives only in a route
 * table is one refactor away from being lost. The count check is not redundant
 * at all: no middleware counts rows.
 */
async function assertGoalAllowed(userId: string): Promise<void> {
    const plan = resolvePlan(await planIdFor(userId));

    if (!plan.features.goals) {
        throw new PlanRequiredError("goals", minimumPlanFor("goals"), plan.id);
    }

    const cap = plan.limits.goals;
    if (cap === null) return;

    const used = await prisma.goal.count({
        where: { userId, status: { in: ["active", "checking"] } },
    });
    if (used >= cap) {
        throw new PlanLimitError(
            "goals",
            cap,
            used,
            nextPlanForLimit("goals", cap),
            plan.id,
            `Your plan allows ${cap} active goal${cap === 1 ? "" : "s"}.`
        );
    }
}

/**
 * Creates the goal and queues its analysis in one step.
 *
 * The composer is a single sentence and submitting it is a single action; making the client
 * follow a 201 with a separate `POST /:id/analyze` would put a round-trip between "I want to
 * buy a laptop" and anything happening. The goal starts in `checking` — the gate may yet
 * reject it and delete the row — and reaches `active` only once the gate accepts.
 */
export async function createNewGoal(
    input: {
        title?: string;
        goalType?: string;
        targetAmount: number;
        deadline: string;
        categoryTarget?: string;
        force?: boolean;
    },
    userId: string
) {
    await assertGoalAllowed(userId);
    const { deadline, force, title, goalType, ...rest } = input;

    const goal = await createGoal(
        {
            ...rest,
            ...(title ? { title } : {}),
            // The gate overwrites this. It is a placeholder, not a guess presented to anyone.
            goalType: goalType ?? "save_amount",
            deadline: new Date(deadline),
            status: title ? "checking" : "active",
        } as Parameters<typeof createGoal>[0],
        userId
    );

    await scheduleGoalAnalysis(goal.id, userId, force);
    return goal;
}

export async function listGoalsByStatus(
    userId: string,
    status: "active" | "checking" | "completed" | "all"
) {
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

/**
 * `goal_queued` is published here rather than by the worker, for the reason `insights_queued`
 * exists: between the 202 and the worker picking the job up there is otherwise no frame at
 * all, and the screen has nothing to show but an unexplained pause.
 */
export async function scheduleGoalAnalysis(
    goalId: string,
    userId: string,
    force?: boolean
): Promise<void> {
    await goalQueue.add(
        "goal.analyze",
        {
            goalId,
            userId,
            allowStaleData: resolveAllowStaleData(force),
        },
        { priority: jobPriorityFor(await planIdFor(userId)) }
    );
    await publish(userId, { stage: "goal_queued", goalId });
}
