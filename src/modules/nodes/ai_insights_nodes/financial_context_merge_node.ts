import { GraphNode } from "@langchain/langgraph";
import { insightsAgentGraphSchema } from "../../../graph_state.js";
import type { BehaviourPattern } from "../../insights/behaviour_patterns.js";
import type { CategoryContext } from "../../insights/financial_context.js";

/**
 * The fan-in point for behaviour, event and opportunity detection — "what is the overall
 * financial situation?"
 *
 * ---
 *
 * **This is the merge, not a passthrough.** The concrete case it exists for: `Shopping`
 * spending crossed the sustained-elevation threshold `behaviourDetectionNode` uses for
 * "lifestyle inflation" *and* `eventDetectionNode` classified it `event` in the same run —
 * two detectors that each look at only one slice of the same numbers can genuinely disagree,
 * because a category can be both "elevated lately" (true) and "driven by a one-off" (also
 * true) at once. Left alone, the behaviour pattern would tell the reader their lifestyle has
 * inflated while `financial_context.ts`'s classification, one node over, disagreed about the
 * same category — two contradictory claims on one report.
 *
 * `financial_context.ts`'s own classification already prefers `habit` whenever three
 * consecutive recent months are *all* elevated, so a real habit rarely also reads as an
 * event — but "rarely" is not "never", and this is the one place in the graph positioned to
 * catch it when the two disagree. A `lifestyle_inflation` finding whose own category is
 * classified `event` is dropped here, before either the LLM prompt or the recommendation
 * validator ever see it — the model narrates only patterns nothing else has contradicted.
 *
 * Everything else (savings discipline, refund recovery, impulse buying) has no event
 * classification to conflict with and passes through untouched.
 */
const financialContextMergeNode: GraphNode<typeof insightsAgentGraphSchema> = async (state) => {
    const behaviourPatterns = (state.behaviourPatterns ?? []) as BehaviourPattern[];
    const financialContext = (state.financialContext ?? []) as CategoryContext[];

    const eventCategories = new Set(
        financialContext.filter((c) => c.classification === "event").map((c) => c.category)
    );

    const merged = behaviourPatterns.filter((p) => {
        if (p.key !== "lifestyle_inflation" || !p.category) return true;
        if (!eventCategories.has(p.category)) return true;
        console.log(
            `[FinancialContext] Dropping lifestyle_inflation for ${p.category} — event detection says the recent rise is a one-off, not a sustained shift.`
        );
        return false;
    });

    return { behaviourPatterns: merged as unknown[] };
};

export { financialContextMergeNode };
