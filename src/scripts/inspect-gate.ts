/**
 * Print the gate-relevant fields of every statement, plus the decision log.
 *
 *   npm run inspect:gate
 */
import "../envConfig.js";
import prisma from "../prismaClient.js";

const statements = await prisma.statementMetadata.findMany({ orderBy: { createdAt: "asc" } });
console.log(`\nStatementMetadata (${statements.length})`);
for (const s of statements) {
    console.log(
        `  ${s.id}  ${s.bankName}\n` +
        `    extraction=${s.extractionStatus} normalizer=${s.normalizerStatus} categorization=${s.categorizationStatus} insights=${s.insightsStatus}\n` +
        `    gate=${s.gateDecision} rawRows=${s.rawRowCount} total=${s.totalTransactions} image=${s.isImageBased}\n` +
        `    extractionError=${s.extractionError ?? "—"}\n` +
        `    normalizerError=${s.normalizerError ?? "—"}`
    );
}

const decisions = await prisma.statementGateDecision.findMany({ orderBy: { decidedAt: "asc" } });
console.log(`\nStatementGateDecision (${decisions.length})`);
for (const d of decisions) {
    console.log(
        `  ${d.decidedAt.toISOString()}  ${d.decision.padEnd(9)} statement=${d.statementMetadataId ?? "(deleted)"} bank=${d.bankName ?? "—"} rows=${d.rawRowCount ?? "—"} reason=${d.reason ?? "—"}`
    );
}

await prisma.$disconnect();
process.exit(0);
