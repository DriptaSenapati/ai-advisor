import { tool } from "langchain";
import z from "zod";
import { embeddingsModel } from "../../../models/index.js";
import prisma from "../../../prismaClient.js";

type TxnVector = { id: string; description: string; descriptionVector: number[] };

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
    return embeddingsModel.embedDocuments(text);
};

const descriptionCleaner = (description: string): string => {
    return description
        .replace(/\d+/g, "")
        .replace(/[^a-zA-Z ]/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase();
};

const CLUSTER_BATCH_SIZE = 5;

// ── Fresh clustering for first upload of a bank (0.9 threshold) ───────────────
const performDescriptionClustering = async (transactions: TxnVector[], bankName: string) => {
    if (!process.env.TRAN_VECTOR_INDEX_NAME) throw new Error("TRAN_VECTOR_INDEX_NAME env var is not set");

    let descriptionPool = transactions;
    const clusters: { transactionIds: string[]; centroid: string }[] = [];

    console.log(`[Cluster Tool] Fresh clustering — ${descriptionPool.length} transactions`);
    await new Promise(res => setTimeout(res, 2000));

    while (descriptionPool.length > 0) {
        const randomSeed = Math.floor(rand() * descriptionPool.length) + 1;
        const seedTransaction = descriptionPool[randomSeed - 1];
        if (!seedTransaction) throw new Error("Seed transaction not found in the description pool.");

        const localCluster: { transactionIds: string[]; centroid: string } = {
            transactionIds: [],
            centroid: seedTransaction.description,
        };

        const poolIds = descriptionPool.map(d => ({ '$oid': d.id }));
        const numCandidates = Math.min(10000, Math.max(150, descriptionPool.length * 10));

        let searchResult: { description: string; similarity: number; _id: { '$oid': string } }[] = [];
        while (true) {
            searchResult = await prisma.finalTransactionData.aggregateRaw({
                pipeline: [
                    { '$vectorSearch': { 'index': process.env.TRAN_VECTOR_INDEX_NAME, 'path': 'descriptionVector', 'queryVector': seedTransaction.descriptionVector, 'numCandidates': numCandidates, 'limit': numCandidates } },
                    { '$match': { '_id': { '$in': poolIds } } },
                    { '$project': { '_id': 1, 'description': 1, 'similarity': { '$meta': 'vectorSearchScore' } } },
                ],
            }) as unknown as { description: string; similarity: number; _id: { '$oid': string } }[];

            if (searchResult.length > 0) break;
            console.log(`[Cluster Tool] No results for "${seedTransaction.description}" — retrying...`);
            await new Promise(res => setTimeout(res, 2000));
        }

        for (const result of searchResult) {
            if (result.similarity > 0.9) {
                localCluster.transactionIds.push(result._id['$oid'].toString());
            }
        }

        console.log(`[Cluster Tool] Cluster of size ${localCluster.transactionIds.length} — "${seedTransaction.description}"`);
        descriptionPool = descriptionPool.filter(d => !localCluster.transactionIds.includes(d.id));
        console.log(`[Cluster Tool] Remaining: ${descriptionPool.length}`);
        clusters.push(localCluster);
    }

    for (let i = 0; i < clusters.length; i += CLUSTER_BATCH_SIZE) {
        const batch = clusters.slice(i, i + CLUSTER_BATCH_SIZE);
        console.log(`[Cluster Tool] Saving batch ${Math.floor(i / CLUSTER_BATCH_SIZE) + 1}/${Math.ceil(clusters.length / CLUSTER_BATCH_SIZE)}`);
        await Promise.all(batch.map(cluster =>
            prisma.cluster.create({
                data: {
                    transactions: { connect: cluster.transactionIds.map(id => ({ id })) },
                    clusterLength: cluster.transactionIds.length,
                    bankName,
                    centroid: cluster.centroid,
                    merchantName: null,
                    category: null,
                    confidence: null,
                    categorySupportRationale: null,
                },
            })
        ));
    }
};

// ── Incremental clustering for subsequent uploads of same bank (0.6 threshold) ─
const performIncrementalClustering = async (newTransactions: TxnVector[], bankName: string) => {
    if (!process.env.TRAN_VECTOR_INDEX_NAME) throw new Error("TRAN_VECTOR_INDEX_NAME env var is not set");

    // Build pool from existing clusters of this bank
    const existingClusterIds = (await prisma.cluster.findMany({
        where: { bankName },
        select: { id: true },
    })).map(c => c.id);

    const existingTxns = await prisma.finalTransactionData.findMany({
        where: { clusterId: { in: existingClusterIds } },
        select: { id: true, clusterId: true },
    });

    const txnToCluster = new Map(existingTxns.map(t => [t.id, t.clusterId!]));
    const poolIds = existingTxns.map(t => ({ '$oid': t.id }));
    const numCandidates = Math.min(10000, Math.max(150, poolIds.length * 10));

    console.log(`[Cluster Tool] Incremental mode — ${newTransactions.length} new, ${poolIds.length} in pool`);

    const clusterIncrements = new Map<string, number>();
    const singletons: TxnVector[] = [];

    for (const txn of newTransactions) {
        if (poolIds.length === 0) {
            singletons.push(txn);
            continue;
        }

        let results: { _id: { '$oid': string }; similarity: number }[] = [];
        while (true) {
            results = await prisma.finalTransactionData.aggregateRaw({
                pipeline: [
                    { '$vectorSearch': { 'index': process.env.TRAN_VECTOR_INDEX_NAME, 'path': 'descriptionVector', 'queryVector': txn.descriptionVector, 'numCandidates': numCandidates, 'limit': numCandidates } },
                    { '$match': { '_id': { '$in': poolIds } } },
                    { '$project': { '_id': 1, 'similarity': { '$meta': 'vectorSearchScore' } } },
                    { '$limit': 1 },
                ],
            }) as unknown as { _id: { '$oid': string }; similarity: number }[];

            if (results.length > 0) break;
            await new Promise(res => setTimeout(res, 2000));
        }

        const best = results[0];
        if (best && best.similarity >= 0.9) {
            const clusterId = txnToCluster.get(best._id['$oid']);
            if (clusterId) {
                await prisma.finalTransactionData.update({ where: { id: txn.id }, data: { clusterId } });
                clusterIncrements.set(clusterId, (clusterIncrements.get(clusterId) ?? 0) + 1);
                continue;
            }
        }
        singletons.push(txn);
    }

    // Update clusterLength for matched clusters
    await Promise.all(
        [...clusterIncrements.entries()].map(([clusterId, count]) =>
            prisma.cluster.update({ where: { id: clusterId }, data: { clusterLength: { increment: count } } })
        )
    );

    // Unmatched transactions: cluster among themselves — may form new multi-clusters or singletons
    if (singletons.length > 0) {
        console.log(`[Cluster Tool] ${singletons.length} unmatched — running fresh clustering among themselves...`);
        await performDescriptionClustering(singletons, bankName);
    }

    console.log(`[Cluster Tool] Done — ${newTransactions.length - singletons.length} assigned to existing clusters, ${singletons.length} went to fresh clustering`);
};

// ── Tool ──────────────────────────────────────────────────────────────────────
const clusterGeneratorTool = tool(async (input) => {
    const { statementMetadataId } = input;
    if (!statementMetadataId) throw new Error("statementMetadataId is required for cluster generation.");

    const metadata = await prisma.statementMetadata.findUnique({
        where: { id: statementMetadataId },
        select: { bankName: true },
    });
    if (!metadata) throw new Error(`StatementMetadata not found for id: ${statementMetadataId}`);
    const { bankName } = metadata;

    const normalizedTransactions = await prisma.normalizedTransactions.findMany({
        where: { statementMetadataId },
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
            statementMetadataId,
        })),
    });

    const newTxns = await prisma.finalTransactionData.findMany({
        where: { statementMetadataId },
        select: { id: true, description: true, descriptionVector: true },
    });
    console.log(`[Cluster Tool] ${newTxns.length} transactions ready for clustering`);

    const existingClusterCount = await prisma.cluster.count({ where: { bankName } });

    if (existingClusterCount > 0) {
        console.log(`[Cluster Tool] Existing clusters found for bank "${bankName}" — incremental mode`);
        await performIncrementalClustering(newTxns, bankName).catch(console.error);
    } else {
        console.log(`[Cluster Tool] No existing clusters for bank "${bankName}" — fresh clustering`);
        await performDescriptionClustering(newTxns, bankName).catch(console.error);
    }

    return true;
},
    {
        name: "category-generator-tool",
        description: `Embeds transaction descriptions, saves to FinalTransactionData, and clusters by similarity. Reads from NormalizedTransactions by statementMetadataId.`,
        schema: z.object({
            statementMetadataId: z.string().optional().describe("ID of the StatementMetadata record for this upload"),
        }),
    }
);

export { clusterGeneratorTool };
