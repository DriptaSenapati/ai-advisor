import "../envConfig.js";
import prisma from "../prismaClient.js";

const report = await prisma.insightReport.findFirst({ orderBy: { createdAt: "desc" } });
if (!report) { console.log("No report found."); process.exit(0); }

console.log(`\n=== InsightReport (tier ${report.tier}, ${(report.monthsCovered as string[]).join(", ")}) ===\n`);
const ins = report.insights as Record<string, unknown>;
console.log(JSON.stringify(ins, null, 2));
