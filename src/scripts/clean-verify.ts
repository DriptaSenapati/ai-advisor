/**
 * Remove everything `verify-gate.ts` created — and nothing else.
 *
 * **This script used to be dangerous, and is not any more.** `Cluster`,
 * `MonthlyStats` and `RecurringPattern` carried no `userId`, so there was
 * nothing to scope them by and this called `deleteMany()` with no `where` on
 * all three. It once destroyed a real statement's 316 clusters and every
 * `MonthlyStats` row in the database, leaving `FinalTransactionData` intact but
 * with every `clusterId` dangling — the transactions survived with no
 * categories at all.
 *
 * Those three models now carry `userId`, so every delete below is scoped to the
 * verification user. Running this against a database with real data in it is no
 * longer destructive.
 *
 *   npm run clean:verify
 */
import "../envConfig.js";
import prisma from "../prismaClient.js";

const USER = "verify-gate-user";

const statements = await prisma.statementMetadata.findMany({ where: { userId: USER }, select: { id: true } });
const ids = statements.map((s) => s.id);

if (ids.length > 0) {
    await Promise.all([
        prisma.statementExtractedData.deleteMany({ where: { statementMetadataId: { in: ids } } }),
        prisma.finalTransactionData.deleteMany({ where: { statementMetadataId: { in: ids } } }),
        prisma.normalizedTransactions.deleteMany({ where: { statementMetadataId: { in: ids } } }),
        prisma.exceptionTransactions.deleteMany({ where: { statementMetadataId: { in: ids } } }),
        prisma.errorPdfExtract.deleteMany({ where: { statementMetadataId: { in: ids } } }),
    ]);
    await prisma.statementMetadata.deleteMany({ where: { userId: USER } });
}

await prisma.statementGateDecision.deleteMany({ where: { userId: USER } });
await prisma.insightReport.deleteMany({ where: { userId: USER } });

// Scoped, so this only ever removes what the verification run itself created.
const [clusters, stats, recurring, flags] = await Promise.all([
    prisma.cluster.deleteMany({ where: { userId: USER } }),
    prisma.monthlyStats.deleteMany({ where: { userId: USER } }),
    prisma.recurringPattern.deleteMany({ where: { userId: USER } }),
    prisma.transactionFlag.deleteMany({ where: { userId: USER } }),
]);

console.log(
    `Removed ${ids.length} statement(s), ${clusters.count} cluster(s), ${stats.count} monthly stat(s), ${recurring.count} recurring pattern(s), ${flags.count} transaction flag(s).`
);
await prisma.$disconnect();
process.exit(0);
