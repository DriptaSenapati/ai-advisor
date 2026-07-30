import { GraphNode } from "@langchain/langgraph";
import { goalAdvisorGraphSchema } from "../../../graph_state.js";
import { goalIntentGateLlm, goalIntentGateSystemMessage } from "../../../models/index.js";
import prisma from "../../../prismaClient.js";

/**
 * The first of the goal graph's two layers: decide whether to simulate at all.
 *
 * ---
 *
 * **Why a gate exists.** The composer takes a sentence the user wrote, and a simulation is
 * expensive — one LLM call plus roughly 460,000 Monte Carlo iterations. Running that over
 * "asdkjhasd" or over something abusive costs real money and produces a page of confident
 * figures about nothing. Screening first is cheaper than screening after.
 *
 * **Why it also classifies.** The sentence is the whole form, so nothing in the request says
 * whether "clear my credit card" is a `debt_payoff` or which category "stop wasting money on
 * takeaway" targets. Both fall out of the same call the screening needs, which is what keeps
 * three dropdowns off a form that reads as one line of English.
 *
 * **Rejections are not persisted.** The goal row is deleted rather than parked in a `blocked`
 * state — the point of checking before simulating is that nothing rejected sticks around.
 * The cost is that a page reload during the check loses the message; the typed text lives in
 * the composer and is lost on reload anyway, so nothing is actually worse off.
 *
 * **A goal with no `title` passes straight through.** Rows created directly through the API
 * predate the composer and have nothing to screen; refusing them would break an endpoint that
 * worked before this node existed.
 */
const goalIntentGateNode: GraphNode<typeof goalAdvisorGraphSchema> = async (state) => {
    const { goalId, userId } = state;

    const goal = await prisma.goal.findFirstOrThrow({ where: { id: goalId, userId } });

    if (!goal.title || goal.title.trim().length === 0) {
        return { goalIntent: { verdict: "accept", reasonCode: "ok" } };
    }

    const prompt = await goalIntentGateSystemMessage.formatMessages({
        goalText: goal.title,
        targetAmount: Math.round(goal.targetAmount).toLocaleString("en-IN"),
        deadline: goal.deadline.toISOString().slice(0, 7),
    });

    const gate = await goalIntentGateLlm.invoke(prompt);

    if (gate.verdict !== "accept") {
        await prisma.goal.delete({ where: { id: goalId } });
        console.log(`[GoalGate] goalId=${goalId} REJECTED verdict=${gate.verdict} reason=${gate.reasonCode}`);

        return {
            goalIntent: { verdict: gate.verdict, reasonCode: gate.reasonCode },
            /*
              The worker discriminates on `blocked` to publish `goal_blocked` rather than
              `goal_done`. The user's own words are deliberately not carried here — a refusal
              that quotes the text back is a refusal that can be made to say anything.
            */
            goalAnalysisResult: {
                blocked: true,
                reasonCode: gate.reasonCode,
                checkedAt: new Date().toISOString(),
            },
        };
    }

    /*
      `reduce_category` without a `categoryTarget` is the one classification that would make
      the next node throw (`goal_analysis_node` requires it). Demoting to `save_amount` keeps
      the run alive on a goal the user did express clearly enough to accept.
    */
    const goalType =
        gate.goalType === "reduce_category" && !gate.categoryTarget
            ? "save_amount"
            : gate.goalType ?? goal.goalType;

    await prisma.goal.update({
        where: { id: goalId },
        data: {
            goalType,
            categoryTarget: goalType === "reduce_category" ? gate.categoryTarget : null,
            title: gate.normalisedTitle?.trim() || goal.title,
            status: "active",
        },
    });

    console.log(`[GoalGate] goalId=${goalId} accepted as ${goalType}${gate.categoryTarget ? ` (${gate.categoryTarget})` : ""}`);

    return { goalIntent: { verdict: "accept", reasonCode: "ok" } };
};

export { goalIntentGateNode };
