import { tool } from "langchain";
import z from "zod";
import { genericTransactionDataSchema } from "../../../helpers/index.js";
import { embeddingsModel } from "../../../models/index.js";
import prisma from "../../../prismaClient.js";

function seededRandom(seed: number) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

const rand = seededRandom(42);

const createEmbeddings = async (text: string[]): Promise<number[][]> => {
    const embedding = await embeddingsModel.embedDocuments(text);
    return embedding;
};

const descriptionCleaner = (description: string): string => {
    const cleaned = description
        .replace(/\d+/g, "")
        .replace(/[^a-zA-Z ]/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase();
    return cleaned;
}

const performDescriptionClustering = async (transactions: {
    descriptionVector: number[];
    description: string;
    id: string;
}[]) => {
    if (!process.env.TRAN_VECTOR_INDEX_NAME) throw new Error("TRAN_VECTOR_INDEX_NAME env var is not set");
    let descriptionPool = transactions

    let clusters: { transactionIds: string[], centroid: string }[] = [];

    console.log(`Starting description clustering for ${descriptionPool.length} transactions...`);
    await new Promise(res => setTimeout(res, 2000));


    while (descriptionPool.length > 0) {
        const randomSeed = Math.floor(rand() * descriptionPool.length) + 1;
        const seedTransaction = descriptionPool[randomSeed - 1];
        if (!seedTransaction) throw new Error("Seed transaction not found in the description pool.");
        const emb = seedTransaction.descriptionVector;
        let localClusters: { transactionIds: string[], centroid: string } = { transactionIds: [], centroid: seedTransaction.description };

        let merchantCategoriesSearchResult: { description: string; similarity: number; _id: { '$oid': string } }[] = [];

        const poolIds = descriptionPool.map(d => ({ '$oid': d.id }));
        const numCandidates = Math.min(10000, Math.max(150, descriptionPool.length * 10));

        while (true) {
            merchantCategoriesSearchResult = await prisma.finalTransactionData.aggregateRaw({
                pipeline: [
                    {
                        '$vectorSearch': {
                            'index': process.env.TRAN_VECTOR_INDEX_NAME,
                            'path': 'descriptionVector',
                            'queryVector': emb,
                            'numCandidates': numCandidates,
                            'limit': numCandidates
                        }
                    },
                    {
                        '$match': { '_id': { '$in': poolIds } }
                    },
                    {
                        "$project": {
                            "_id": 1,
                            "description": 1,
                            "similarity": { "$meta": "vectorSearchScore" }
                        }
                    }
                ]
            }) as unknown as { description: string; similarity: number; _id: { '$oid': string } }[];

            if (merchantCategoriesSearchResult.length > 0) {
                break;
            } else {
                console.log(`No search results found for seed description: "${seedTransaction.description}". Retrying after a short delay...`);
                await new Promise(res => setTimeout(res, 2000));
            }
        }


        for (const result of merchantCategoriesSearchResult) {
            const highSimilarity = result.similarity > 0.9;
            if (highSimilarity) {
                localClusters.transactionIds.push(result._id['$oid'].toString());
            }
        }
        // localClusters.push({ transactionId: seedTransaction.id.toString() });

        console.log(`Formed a cluster of size ${localClusters.transactionIds.length} with seed description: "${seedTransaction!.description}"`);
        descriptionPool = descriptionPool.filter(desc => !localClusters.transactionIds.some(cluster => cluster === desc.id));
        console.log(`Remaining descriptions to cluster: ${descriptionPool.length}`);
        clusters.push(localClusters);
    }

    // fs.writeFile("./extracted_maps.json", JSON.stringify(testMap), 'utf8', (err) => {
    //     if (err) {
    //         console.error('Error writing to file', err);
    //     } else {
    //         console.log(`Data written to ./extracted_maps.json as JSON.`);
    //     }
    // });

    const BATCH_SIZE = 5;

    for (let i = 0; i < clusters.length; i += BATCH_SIZE) {
        const batch = clusters.slice(i, i + BATCH_SIZE);

        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(clusters.length / BATCH_SIZE)} — ${batch.length} clusters`);


        await Promise.all(batch.map(async (cluster) => {
            return prisma.cluster.create({
                data: {
                    transactions: {
                        connect: cluster.transactionIds.map(c => ({ id: c }))
                    },
                    clusterLength: cluster.transactionIds.length,
                    centroid: cluster.centroid,
                    merchantName: null,
                    category: null,
                    confidence: null,
                    categorySupportRationale: null
                }
            });
        }));

    }



}



const clusterGeneratorTool = tool(async (input) => {
    const { statementMetadataId } = input;

    const normalizedTransactions = await prisma.normalizedTransactions.findMany({
        where: { statementMetadataId: statementMetadataId ?? null },
        select: { description: true, date: true, creditAmount: true, debitAmount: true, balance: true },
    });
    if (normalizedTransactions.length === 0) {
        throw new Error("No normalized transactions found for this statement.");
    }

    const descriptions = normalizedTransactions.map(t => descriptionCleaner(t.description));
    console.log(`[Cluster Tool] Generating embeddings for ${descriptions.length} descriptions...`);
    const descriptionEmbeddings = await createEmbeddings(descriptions);
    console.log(`[Cluster Tool] Embeddings ready — saving to FinalTransactionData`);

    await prisma.finalTransactionData.createMany({
        data: normalizedTransactions.map((t, index) => ({
            date: t.date,
            creditAmount: t.creditAmount,
            debitAmount: t.debitAmount,
            balance: t.balance,
            description: descriptionCleaner(t.description),
            descriptionVector: descriptionEmbeddings[index] || [],
            statementMetadataId: statementMetadataId ?? null,
        })),
    });

    const transIds = await prisma.finalTransactionData.findMany({ select: { id: true, description: true, descriptionVector: true } });
    console.log(`[Cluster Tool] Saved ${normalizedTransactions.length} transactions — fetched ${transIds.length} total from DB for clustering`);

    await performDescriptionClustering(transIds).catch(console.error);

    return "ok";
},
    {
        name: "category-generator-tool",
        description: `Embeds transaction descriptions, saves to FinalTransactionData, and clusters by similarity. Reads from NormalizedTransactions by statementMetadataId.`,
        schema: z.object({
            statementMetadataId: z.string().optional().describe("ID of the StatementMetadata record for this upload"),
        })
    }
)

export { clusterGeneratorTool }