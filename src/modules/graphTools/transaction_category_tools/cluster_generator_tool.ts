import { tool } from "langchain";
import z from "zod";
import { genericTransactionDataSchema, parseTransactionDate } from "../../../helpers/index.js";
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
        const numCandidates = Math.max(150, descriptionPool.length * 10);

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
    const { transactionData } = input;
    if (!transactionData || transactionData.length === 0) {
        throw new Error("transactionData is required.");
    }


    const descriptions = transactionData.map(transaction => descriptionCleaner(transaction.description));
    console.log(`[Cluster Tool] Generating embeddings for ${descriptions.length} descriptions...`);
    const descriptionEmbeddings = await createEmbeddings(descriptions);
    console.log(`[Cluster Tool] Embeddings ready — saving to FinalTransactionData`);

    const categorizedTransactions = transactionData.map((transaction, index) => ({
        ...transaction,
        descriptionVector: descriptionEmbeddings[index] || [],
    }));

    // push to mongoDB
    await prisma.finalTransactionData.createMany({
        data: categorizedTransactions.map((transaction, idx) => ({
            date: parseTransactionDate(transaction.date) || new Date(0),
            creditAmount: parseFloat((transaction.creditAmount || "0").replace(/,/g, "")),
            debitAmount: parseFloat((transaction.debitAmount || "0").replace(/,/g, "")),
            balance: parseFloat((transaction.balance || "0").replace(/,/g, "")),
            description: descriptionCleaner(transaction.description || ""),
            descriptionVector: transaction.descriptionVector
        })),
    })

    const transIds = await prisma.finalTransactionData.findMany({ select: { id: true, description: true, descriptionVector: true } });
    console.log(`[Cluster Tool] Saved ${categorizedTransactions.length} transactions — fetched ${transIds.length} total from DB for clustering`);

    await performDescriptionClustering(transIds).catch(console.error);



    return categorizedTransactions;
},
    {
        name: "category-generator-tool",
        description: `A tool to generate category for each transaction based on the transaction data. 
        It takes an array of transactions as input and returns an array of transactions with category and category score added to each transaction. 
        The category is generated based on the description, credit amount, debit amount and balance of the transaction. 
        The category score is a confidence score for the assigned category. 
        The output of this tool will be used as input for the final statement generation tool.
        Also created description clustering vector and stored in the database for future use.`,
        schema: z.object({
            transactionData: z.array(
                genericTransactionDataSchema
            )
        })

    }
)

export { clusterGeneratorTool }