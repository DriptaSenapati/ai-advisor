import "../envConfig.js";
import prisma from "../prismaClient.js";

const stats = await prisma.monthlyStats.findMany({
    select: { month: true, totalIncome: true, totalExpenses: true, netSavings: true },
    orderBy: { month: "asc" },
});

console.log(`Total MonthlyStats records: ${stats.length}`);
console.log("\nMonths in DB:");
for (const s of stats) {
    console.log(`  ${s.month}  income=${s.totalIncome.toFixed(0).padStart(10)}  expenses=${s.totalExpenses.toFixed(0).padStart(10)}  netSavings=${s.netSavings.toFixed(0).padStart(10)}`);
}

const meta = await prisma.statementMetadata.findMany({
    select: { id: true, bankName: true, statementPeriodStart: true, statementPeriodEnd: true, normalizerStatus: true, insightsStatus: true },
    orderBy: { createdAt: "asc" },
});
console.log(`\nStatementMetadata records: ${meta.length}`);
for (const m of meta) {
    console.log(`  ${m.id}  bank=${m.bankName}  period=${m.statementPeriodStart?.toISOString().slice(0,10)} → ${m.statementPeriodEnd?.toISOString().slice(0,10)}  normalizer=${m.normalizerStatus}  insights=${m.insightsStatus}`);
}

await prisma.$disconnect();
