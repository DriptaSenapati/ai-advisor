/**
 * Generates Mermaid diagrams (and optionally PNG) for key graphs.
 *
 *   npm run graph:visualize
 *
 * Output written to assets/graphs/
 */

import "../envConfig.js";
import fs from "fs";
import path from "path";
import { statementNormalizerSubgraph } from "../graphs/statement_normalizer_subgraph.js";
import { balanceAnalyzerSubgraph } from "../graphs/balace_analyzer_subgraph.js";
import { advisorAgentGraph, insightsAgentGraph } from "../graph.js";

const OUTPUT_DIR = "assets/graphs";

async function saveGraph(name: string, compiledGraph: any) {
    const mermaid: string = compiledGraph.getGraph().drawMermaid();

    const mdPath = path.join(OUTPUT_DIR, `${name}.md`);
    fs.writeFileSync(mdPath, `# ${name}\n\`\`\`mermaid\n${mermaid}\`\`\`\n`, "utf8");
    console.log(`[Graph] Mermaid saved → ${mdPath}`);

    try {
        const png: Uint8Array = await compiledGraph.getGraph().drawMermaidPng();
        const pngPath = path.join(OUTPUT_DIR, `${name}.png`);
        fs.writeFileSync(pngPath, Buffer.from(png));
        console.log(`[Graph] PNG saved     → ${pngPath}`);
    } catch {
        console.warn(`[Graph] PNG skipped for ${name} (mermaid.ink unavailable or no network)`);
    }
}

async function run() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const advisorCompiled = advisorAgentGraph.compile();
    const insightsCompiled = insightsAgentGraph.compile();

    await saveGraph("advisor_graph", advisorCompiled);
    await saveGraph("normalizer_subgraph", statementNormalizerSubgraph);
    await saveGraph("balance_analyzer_subgraph", balanceAnalyzerSubgraph);
    await saveGraph("insights_graph", insightsCompiled);

    console.log("Done.");
}

run().catch((e) => { console.error(e); process.exit(1); });
