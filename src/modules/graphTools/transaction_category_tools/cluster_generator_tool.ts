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

/**
 * Restricts the approximate-nearest-neighbour search to one user's vectors.
 *
 * This is a `filter` inside `$vectorSearch`, not a `$match` after it, and the
 * difference is not cosmetic. `$vectorSearch` returns its `numCandidates` best
 * matches across the **whole collection** and only then hands them to the rest of
 * the pipeline — so with several users in the database, another tenant's similar
 * descriptions consume the candidate budget and genuine matches from this user's
 * pool get crowded out before any later stage can see them. Filtering inside the
 * search means the ANN traversal never considers them at all.
 *
 * Requires `userId` to be declared as a `filter` field on the Atlas index — see
 * `src/seeds/create_vector_search_index.ts`. Without that declaration Atlas
 * rejects the query rather than silently ignoring the filter, which is the
 * failure mode we want.
 */
const vectorSearchStage = (queryVector: number[], userId: string, numCandidates: number) => ({
    '$vectorSearch': {
        'index': process.env.TRAN_VECTOR_INDEX_NAME,
        'path': 'descriptionVector',
        'queryVector': queryVector,
        'numCandidates': numCandidates,
        'limit': numCandidates,
        'filter': { 'userId': { '$eq': userId } },
    },
});

// ── Fresh clustering for first upload of a bank (0.9 threshold) ───────────────
const performDescriptionClustering = async (transactions: TxnVector[], bankName: string, userId: string) => {
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
                    vectorSearchStage(seedTransaction.descriptionVector, userId, numCandidates),
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
                    userId,
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
const performIncrementalClustering = async (newTransactions: TxnVector[], bankName: string, userId: string) => {
    if (!process.env.TRAN_VECTOR_INDEX_NAME) throw new Error("TRAN_VECTOR_INDEX_NAME env var is not set");

    // Build pool from this user's existing clusters for this bank.
    //
    // `userId` here is the single most important filter in the file. Scoped only
    // by `bankName`, a second customer of the same bank would have their new
    // transactions matched against — and attached to — the first customer's
    // clusters, inheriting their merchant names and categories.
    const existingClusterIds = (await prisma.cluster.findMany({
        where: { bankName, userId },
        select: { id: true },
    })).map(c => c.id);

    const existingTxns = await prisma.finalTransactionData.findMany({
        where: { clusterId: { in: existingClusterIds }, userId },
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
                    vectorSearchStage(txn.descriptionVector, userId, numCandidates),
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
        await performDescriptionClustering(singletons, bankName, userId);
    }

    console.log(`[Cluster Tool] Done — ${newTransactions.length - singletons.length} assigned to existing clusters, ${singletons.length} went to fresh clustering`);
};

// ── Tool ──────────────────────────────────────────────────────────────────────
const clusterGeneratorTool = tool(async (input) => {
    const { statementMetadataId, userId } = input;
    if (!statementMetadataId) throw new Error("statementMetadataId is required for cluster generation.");
    if (!userId) throw new Error("userId is required for cluster generation.");

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
            userId,
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
        where: { statementMetadataId, userId },
        select: { id: true, description: true, descriptionVector: true },
    });
    console.log(`[Cluster Tool] ${newTxns.length} transactions ready for clustering`);

    // "Fresh vs incremental" is a question about *this user's* history with the
    // bank. Counting globally would put the very first upload of a second user
    // straight into incremental mode against clusters they have never seen.
    const existingClusterCount = await prisma.cluster.count({ where: { bankName, userId } });

    if (existingClusterCount > 0) {
        console.log(`[Cluster Tool] Existing clusters found for bank "${bankName}" — incremental mode`);
        await performIncrementalClustering(newTxns, bankName, userId).catch(console.error);
    } else {
        console.log(`[Cluster Tool] No existing clusters for bank "${bankName}" — fresh clustering`);
        await performDescriptionClustering(newTxns, bankName, userId).catch(console.error);
    }

    return true;
},
    {
        name: "category-generator-tool",
        description: `Embeds transaction descriptions, saves to FinalTransactionData, and clusters by similarity. Reads from NormalizedTransactions by statementMetadataId.`,
        schema: z.object({
            statementMetadataId: z.string().optional().describe("ID of the StatementMetadata record for this upload"),
            userId: z.string().optional().describe("Owner of the statement — scopes clustering and the vector search"),
        }),
    }
);

export { clusterGeneratorTool };
