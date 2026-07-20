import "../envConfig.js";
import prisma from "../prismaClient.js";

const creditPatterns = await prisma.recurringPattern.findMany({
    where: { type: "credit" },
    orderBy: { estimatedMonthlyAmount: "desc" },
});

console.log(`\nCredit patterns detected: ${creditPatterns.length}\n`);
console.log("─".repeat(100));

for (const p of creditPatterns) {
    const src = p.merchantName ?? p.payeeName ?? `cluster:${(p.clusterKey ?? "none").slice(-8)}`;
    const range = p.rangeMin != null
        ? `₹${Math.round(p.rangeMin).toLocaleString("en-IN")} – ₹${Math.round(p.rangeMax ?? 0).toLocaleString("en-IN")}`
        : "n/a";
    const median = `₹${Math.round(p.estimatedMonthlyAmount).toLocaleString("en-IN")}`;
    console.log(
        `[${(p.creditLabel ?? "unknown").padEnd(18)}]  ${median.padStart(12)}  range: ${range.padEnd(28)}  freq: ${p.frequency.padEnd(10)}  months: ${String(p.monthsDetected).padStart(2)}  active: ${p.isActive}  →  ${src}`
    );
}

console.log("\n─".repeat(100));

const debitPatterns = await prisma.recurringPattern.findMany({
    where: { OR: [{ type: "debit" }, { type: null }] },
    orderBy: { estimatedMonthlyAmount: "desc" },
    take: 20,
});

console.log(`\nTop 20 debit patterns (of ${await prisma.recurringPattern.count({ where: { OR: [{ type: "debit" }, { type: null }] } })}):\n`);
for (const p of debitPatterns) {
    const src = p.merchantName ?? p.payeeName ?? "Unknown";
    console.log(
        `[${(p.cancellability ?? "unknown").padEnd(12)}]  ₹${Math.round(p.estimatedMonthlyAmount).toLocaleString("en-IN").padStart(10)}  freq: ${p.frequency.padEnd(10)}  months: ${String(p.monthsDetected).padStart(2)}  active: ${p.isActive}  →  ${src}`
    );
}
