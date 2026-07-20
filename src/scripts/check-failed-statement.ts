import "../envConfig.js";
import prisma from "../prismaClient.js";

const m = await prisma.statementMetadata.findUnique({
    where: { id: "6a4ffc763872d663c02d535d" },
    select: { normalizerError: true, insightsError: true, bankName: true, contentHash: true },
});
console.log(m);
await prisma.$disconnect();
