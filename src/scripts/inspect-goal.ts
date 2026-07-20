import "../envConfig.js";
import prisma from "../prismaClient.js";

const id = process.argv[2];
if (!id) { console.error("Usage: npx tsx src/scripts/inspect-goal.ts <goalId>"); process.exit(1); }

const g = await prisma.goal.findUnique({ where: { id } });
if (!g) { console.error("Goal not found"); process.exit(1); }

console.log(JSON.stringify(g.simulationResult, null, 2));
await prisma.$disconnect();
