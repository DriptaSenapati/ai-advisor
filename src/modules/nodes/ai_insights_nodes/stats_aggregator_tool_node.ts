import { GraphNode } from "@langchain/langgraph";
import { insightsAgentGraphSchema } from "../../../graph_state.js";
import { statsAggregatorTool } from "../../graphTools/insights_gen_tools/statsAggregatorTool.js";
import prisma from "../../../prismaClient.js";

function deriveAffectedMonths(start: Date, end: Date): string[] {
    const months: string[] = [];
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (current <= endMonth) {
        months.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`);
        current.setMonth(current.getMonth() + 1);
    }
    return months;
}

const statsAggregatorToolNode: GraphNode<typeof insightsAgentGraphSchema> = async (state) => {
    let affectedMonths: string[];

    if (state.statementMetadataId) {
        // ── Per-statement mode: recompute only months covered by this upload ──
        await prisma.statementMetadata.update({
            where: { id: state.statementMetadataId },
            data: { insightsStatus: "Processing" },
        });

        const metadata = await prisma.statementMetadata.findUnique({
            where: { id: state.statementMetadataId },
            select: { statementPeriodStart: true, statementPeriodEnd: true },
        });

        if (!metadata?.statementPeriodStart || !metadata?.statementPeriodEnd) {
            throw new Error(`StatementMetadata ${state.statementMetadataId} has no period dates set — cannot derive affected months.`);
        }

        affectedMonths = deriveAffectedMonths(metadata.statementPeriodStart, metadata.statementPeriodEnd);
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
