/**
 * ── Advisor graph (default) ─────────────────────────────────────────────────
 *   npm run reset:db                              # clear everything
 *   npm run reset:db -- --stage=normalize         # clear from normalize onwards
 *   npm run reset:db -- --stage=categorize        # clear FinalTransactionData + Cluster
 *   npm run reset:db -- --stage=llm              # reset Cluster category fields to null
 *
 * ── Insights graph ───────────────────────────────────────────────────────────
 *   npm run reset:db -- --graph=insights                      # clear all insight collections
 *   npm run reset:db -- --graph=insights --stage=stats        # clear only MonthlyStats
 *   npm run reset:db -- --graph=insights --stage=recurring    # clear only RecurringPattern
 *   npm run reset:db -- --graph=insights --stage=insights     # clear only InsightReport
 */

import "../envConfig.js";
import prisma from "../prismaClient.js";

const graphMode = process.argv.find(a => a.startsWith("--graph="))?.split("=")[1] ?? "advisor";
const stage = process.argv.find(a => a.startsWith("--stage="))?.split("=")[1] ?? "all";

// ── advisor graph ─────────────────────────────────────────────────────────────

const ADVISOR_VALID_STAGES = ["all", "normalize", "categorize", "llm"] as const;
type AdvisorStage = typeof ADVISOR_VALID_STAGES[number];

async function resetAdvisor(s: AdvisorStage) {
    switch (s) {
        case "all":
        case "normalize":
            await prisma.finalTransactionData.deleteMany();
            await prisma.recurringPattern.deleteMany();
            await prisma.cluster.deleteMany();
            await prisma.normalizedTransactions.deleteMany();
            await prisma.exceptionTransactions.deleteMany();
            console.log("Cleared: FinalTransactionData, RecurringPattern, Cluster, NormalizedTransactions, ExceptionTransactions");
            break;

        case "categorize":
            await prisma.finalTransactionData.deleteMany();
            await prisma.recurringPattern.deleteMany();
            await prisma.cluster.deleteMany();
            console.log("Cleared: FinalTransactionData, RecurringPattern, Cluster");
            break;

        case "llm":
            await prisma.cluster.updateMany({
                data: {
                    merchantName: null,
                    category: null,
                    confidence: null,
                    categorySupportRationale: null,
                },
            });
            console.log("Reset Cluster: category fields set back to null");
            break;
    }
}

// ── insights graph ────────────────────────────────────────────────────────────

const INSIGHTS_VALID_STAGES = ["all", "stats", "recurring", "insights"] as const;
type InsightsStage = typeof INSIGHTS_VALID_STAGES[number];

async function resetInsights(s: InsightsStage) {
    switch (s) {
        case "all":
            await prisma.insightReport.deleteMany();
            await prisma.recurringPattern.deleteMany();
            await prisma.monthlyStats.deleteMany();
            console.log("Cleared: InsightReport, RecurringPattern, MonthlyStats");
            break;

        case "stats":
            await prisma.monthlyStats.deleteMany();
            console.log("Cleared: MonthlyStats");
            break;

        case "recurring":
            await prisma.recurringPattern.deleteMany();
            console.log("Cleared: RecurringPattern");
            break;

        case "insights":
            await prisma.insightReport.deleteMany();
            console.log("Cleared: InsightReport");
            break;
    }
}

// ── entry point ───────────────────────────────────────────────────────────────

async function run() {
    if (graphMode === "insights") {
        if (!INSIGHTS_VALID_STAGES.includes(stage as InsightsStage)) {
            console.error(`Invalid --stage for insights. Use one of: ${INSIGHTS_VALID_STAGES.join(", ")}`);
            process.exit(1);
        }
        await resetInsights(stage as InsightsStage);
    } else if (graphMode === "advisor") {
        if (!ADVISOR_VALID_STAGES.includes(stage as AdvisorStage)) {
            console.error(`Invalid --stage for advisor. Use one of: ${ADVISOR_VALID_STAGES.join(", ")}`);
            process.exit(1);
        }
        await resetAdvisor(stage as AdvisorStage);
    } else {
        console.error(`Unknown --graph value "${graphMode}". Use "advisor" or "insights".`);
        process.exit(1);
    }
}

run()
    .then(() => { console.log("Done."); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
