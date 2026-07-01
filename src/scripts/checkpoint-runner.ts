/**
 * Dev runner using LangGraph's built-in checkpointing.
 * State is saved after every node automatically — no custom cache files.
 *
 * ── Full dry run (default — no --graph flag) ────────────────────────────────
 *   npm run dev:checkpoint                            # PDF → normalize → categorize → insights (chained)
 *
 * ── Advisor graph only ───────────────────────────────────────────────────────
 *   npm run dev:checkpoint -- --graph=advisor                     # PDF → normalize → categorize (no insights)
 *   npm run dev:checkpoint -- --graph=advisor --from=normalize    # re-run from normalization onwards
 *   npm run dev:checkpoint -- --graph=advisor --from=balance      # re-run from balance gap + confidence onwards
 *   npm run dev:checkpoint -- --graph=advisor --from=categorize   # re-run from clustering + LLM onwards
 *   npm run dev:checkpoint -- --graph=advisor --from=llm          # re-run only LLM categorization
 *
 * ── Insights graph only ──────────────────────────────────────────────────────
 *   npm run dev:checkpoint -- --graph=insights --metadataId=<id>                    # run insights for statement
 *   npm run dev:checkpoint -- --graph=insights --metadataId=<id> --from=recurring   # resume from recurring node
 *   npm run dev:checkpoint -- --graph=insights --metadataId=<id> --from=insights    # resume from insights LLM node
 *
 * Pair with reset:db to clear the relevant DB collections first.
 */

import "../envConfig.js";

const CHECKPOINT_DB = "./dev-checkpoints.sqlite";
const PDF_PATH = "assets\\hsbc_statement.pdf";

// ── shared arg parsing ────────────────────────────────────────────────────────

const graphMode = process.argv.find(a => a.startsWith("--graph="))?.split("=")[1] ?? "full";
const fromArg = process.argv.find(a => a.startsWith("--from="))?.split("=")[1];

// ── advisor graph ─────────────────────────────────────────────────────────────

const ADVISOR_THREAD_ID = "dev_run";

const ADVISOR_RESUME_NODE: Record<string, string> = {
    normalize: "statementNormalizerSubgraph",
    balance: "balanceAnalyzerSubgraph",
    categorize: "transactionCategorySubgraph",
};

const ADVISOR_VALID_STAGES = ["pdf", "normalize", "balance", "categorize", "llm"] as const;
type AdvisorStage = typeof ADVISOR_VALID_STAGES[number];

async function runAdvisor() {
    const fromStage = (fromArg ?? "pdf") as AdvisorStage;

    if (!ADVISOR_VALID_STAGES.includes(fromStage)) {
        console.error(`Invalid --from for advisor. Use one of: ${ADVISOR_VALID_STAGES.join(", ")}`);
        process.exit(1);
    }

    if (fromStage === "llm") {
        console.log("[llm] Re-running LLM categorization on existing clusters...");
        const { llmCategoryNode } = await import("../modules/nodes/transaction_category_nodes/llm_category_node.js");
        const minState = { statementPath: "", messages: [], errorData: { errorRows: [] }, transactionData: [], exceptions: [], finalTransactionData: [] };
        await llmCategoryNode(minState as any, {});
        return;
    }

    const { SqliteSaver } = await import("@langchain/langgraph-checkpoint-sqlite");
    const { advisorAgentGraph } = await import("../graph.js");

    const checkpointer = SqliteSaver.fromConnString(CHECKPOINT_DB);
    const agent = advisorAgentGraph.compile({ checkpointer });
    const threadConfig = { configurable: { thread_id: ADVISOR_THREAD_ID } };

    if (fromStage === "pdf") {
        console.log("[advisor] Full advisor run...");
        await agent.invoke({ statementPath: PDF_PATH, messages: [] }, threadConfig);
        return;
    }

    const targetNode = ADVISOR_RESUME_NODE[fromStage]!;
    let resumeCheckpointId: string | undefined;

    for await (const snapshot of agent.getStateHistory(threadConfig)) {
        if (snapshot.next.includes(targetNode)) {
            resumeCheckpointId = snapshot.config.configurable?.checkpoint_id as string;
            break;
        }
    }

    if (!resumeCheckpointId) {
        console.error(`No checkpoint found before "${targetNode}".\nRun the full pipeline first: npm run dev:checkpoint`);
        process.exit(1);
    }

    console.log(`[${fromStage}] Resuming advisor from checkpoint before "${targetNode}"...`);
    await agent.invoke(
        { statementPath: PDF_PATH, messages: [], bankName: "Kotak" },
        { configurable: { thread_id: ADVISOR_THREAD_ID, checkpoint_id: resumeCheckpointId } }
    );
}

// ── insights graph ────────────────────────────────────────────────────────────

const INSIGHTS_THREAD_ID = "insights_run";

const INSIGHTS_RESUME_NODE: Record<string, string> = {
    recurring: "recurringPatternToolNode",
    insights: "insightsNode",
};

const INSIGHTS_VALID_STAGES = ["stats", "recurring", "insights"] as const;
type InsightsStage = typeof INSIGHTS_VALID_STAGES[number];

async function runInsights() {
    const metadataIdArg = process.argv.find(a => a.startsWith("--metadataId="))?.split("=")[1];
    const fromStage = fromArg as InsightsStage | undefined;

    if (!metadataIdArg) {
        console.error("--metadataId=<id> is required for insights run. Find the StatementMetadata ID from the DB.");
        process.exit(1);
    }

    if (fromStage && !INSIGHTS_VALID_STAGES.includes(fromStage)) {
        console.error(`Invalid --from for insights. Use one of: ${INSIGHTS_VALID_STAGES.join(", ")}`);
        process.exit(1);
    }

    const { SqliteSaver } = await import("@langchain/langgraph-checkpoint-sqlite");
    const { insightsAgentGraph } = await import("../graph.js");

    const checkpointer = SqliteSaver.fromConnString(CHECKPOINT_DB);
    const agent = insightsAgentGraph.compile({ checkpointer });
    const threadConfig = { configurable: { thread_id: INSIGHTS_THREAD_ID } };

    if (!fromStage) {
        console.log(`[insights] Full run — metadataId=${metadataIdArg}...`);
        await agent.invoke({ messages: [], statementMetadataId: metadataIdArg }, threadConfig);
        return;
    }

    const targetNode = INSIGHTS_RESUME_NODE[fromStage];
    let resumeCheckpointId: string | undefined;

    for await (const snapshot of agent.getStateHistory(threadConfig)) {
        if (snapshot.next.includes(targetNode!)) {
            resumeCheckpointId = snapshot.config.configurable?.checkpoint_id as string;
            break;
        }
    }

    if (!resumeCheckpointId) {
        console.error(`No checkpoint found before "${targetNode}".\nRun the full insights pipeline first: npm run dev:checkpoint -- --graph=insights --metadataId=<id>`);
        process.exit(1);
    }

    console.log(`[insights:${fromStage}] Resuming from checkpoint before "${targetNode}"...`);
    await agent.invoke(
        { messages: [], statementMetadataId: metadataIdArg },
        { configurable: { thread_id: INSIGHTS_THREAD_ID, checkpoint_id: resumeCheckpointId } }
    );
}

// ── full dry run ──────────────────────────────────────────────────────────────

async function runFull() {
    const { SqliteSaver } = await import("@langchain/langgraph-checkpoint-sqlite");
    const { advisorAgentGraph, insightsAgentGraph } = await import("../graph.js");

    const checkpointer = SqliteSaver.fromConnString(CHECKPOINT_DB);

    console.log("[full] Running advisor graph...");
    const advisorAgent = advisorAgentGraph.compile({ checkpointer });
    const advisorResult = await advisorAgent.invoke(
        { statementPath: PDF_PATH, messages: [] },
        { configurable: { thread_id: ADVISOR_THREAD_ID } }
    );

    const statementMetadataId: string | undefined = advisorResult?.statementMetadataId;
    if (!statementMetadataId) {
        console.warn("[full] No statementMetadataId in advisor result — skipping insights.");
        return;
    }

    console.log(`\n[full] Running insights graph for statementMetadataId=${statementMetadataId}...`);
    const insightsAgent = insightsAgentGraph.compile({ checkpointer });
    await insightsAgent.invoke(
        { statementMetadataId, messages: [] },
        { configurable: { thread_id: INSIGHTS_THREAD_ID } }
    );
    console.log("[full] Done.");
}

// ── entry point ───────────────────────────────────────────────────────────────

async function run() {
    if (graphMode === "full") {
        await runFull();
    } else if (graphMode === "advisor") {
        await runAdvisor();
    } else if (graphMode === "insights") {
        await runInsights();
    } else {
        console.error(`Unknown --graph value "${graphMode}". Use "advisor", "insights", or omit for full run.`);
        process.exit(1);
    }
}

run().then(() => console.log("Done.")).catch(e => { console.error(e); process.exit(1); });
