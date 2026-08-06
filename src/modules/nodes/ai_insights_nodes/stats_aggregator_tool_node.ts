import { GraphNode } from "@langchain/langgraph";
import { insightsAgentGraphSchema } from "../../../graph_state.js";
import { statsAggregatorTool } from "../../graphTools/insights_gen_tools/statsAggregatorTool.js";
import prisma from "../../../prismaClient.js";

const statsAggregatorToolNode: GraphNode<typeof insightsAgentGraphSchema> = async (state) => {
    let affectedMonths: string[];

    if (state.statementMetadataId) {
        // ── Per-statement mode: recompute only months covered by this upload ──
        await prisma.statementMetadata.update({
            where: { id: state.statementMetadataId },
            data: { insightsStatus: "Processing" },
        });

        // Ground truth, not the gate's guess: `statementPeriodStart/End` come from
        // a vision call that reads page 1 only (extractBasicDetails). A statement
        // whose last transaction lands on a later page has its true end date
        // silently invisible to that guess — trusting it here meant months with
        // real, already-normalised transactions in FinalTransactionData never got
        // a MonthlyStats row at all, because nothing after the guessed end was
        // ever in `affectedMonths`. By this point in the pipeline (phase 2, after
        // normalisation) the real dates are sitting in the database; use those.
        const distinctResult = (await prisma.finalTransactionData.aggregateRaw({
            pipeline: [
                { $match: { statementMetadataId: { $oid: state.statementMetadataId } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$date" } } } },
                { $sort: { _id: 1 } },
            ],
        })) as unknown as { _id: string }[];

        if (distinctResult.length === 0) {
            throw new Error(`StatementMetadata ${state.statementMetadataId} has no normalised transactions — cannot derive affected months.`);
        }

        affectedMonths = distinctResult.map((r) => r._id);
        console.log(`[Stats Aggregator] Per-statement mode — affected months: ${affectedMonths.join(", ")}`);
    } else {
        // ── Full recompute mode: derive all months from FinalTransactionData ──
        // "All months" means all of *this user's* months. Unscoped, a full
        // recompute would fan out over every tenant's date range.
        const distinctResult = await prisma.finalTransactionData.aggregateRaw({
            pipeline: [
                { $match: { userId: state.userId } },
                { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$date" } } } },
                { $sort: { _id: 1 } },
            ],
        }) as unknown as { _id: string }[];

        if (distinctResult.length === 0) {
            throw new Error("[Stats Aggregator] No transaction data found. Upload and categorize statements first.");
        }

        affectedMonths = distinctResult.map(r => r._id);
        console.log(`[Stats Aggregator] Full recompute mode — all months: ${affectedMonths.join(", ")}`);
    }

    await statsAggregatorTool.invoke({ affectedMonths, userId: state.userId });

    return { affectedMonths };
}

export { statsAggregatorToolNode };
