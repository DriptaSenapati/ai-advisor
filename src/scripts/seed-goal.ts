import "../envConfig.js";
import { createGoal, listGoals } from "../modules/goalManager.js";
import prisma from "../prismaClient.js";

async function main() {
    const g = await createGoal({
        goalType: "save_amount",
        targetAmount: 100000,
        deadline: new Date("2026-12-31"),
    });
    console.log("Created goal:", g.id);

    const all = await listGoals();
    console.log("All goals:", all.map(g => ({ id: g.id, goalType: g.goalType, targetAmount: g.targetAmount, deadline: g.deadline })));

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
