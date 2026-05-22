import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../../graph_state.js";
import prisma from "../../../prismaClient.js";
import { clusterCategorizationLlm, categorySystemMessage } from "../../../models/index.js";

const BATCH_SIZE = 30;
const UNCATEGORIZED = "Uncategorized";
const SINGLETON_SIMILARITY_THRESHOLD = 0.6;
const SINGLETON_CONFIDENCE_PENALTY = 0.8;

type VectorSearchResult = {
    _id: { '$oid': string };
    clusterId?: { '$oid': string } | null;
    similarity: number;
};

type SingletonResult =
    | { id: string; matched: true; category: string; confidence: number; categorySupportRationale: string }
    | { id: string; matched: false };

const llmCategoryNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    let retryAttempt = 0;
    const maxRetryAttempt = 3;

    while (true) {
        var clusters = await prisma.cluster.findMany({
            where: { category: null },
            select: { id: true, clusterLength: true, centroid: true }
        });
        if (clusters.length > 0) {
            break;
        } else {
            retryAttempt++;
            if (retryAttempt > maxRetryAttempt) {
                console.warn(`No clusters found for categorization after ${maxRetryAttempt} attempts. Exiting categorization node.`);
                return state;
            }
            console.log("No clusters found for categorization. Retrying in 2 seconds...");
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    const singletons = clusters.filter(c => c.clusterLength === 1);
    const multiClusters = clusters.filter(c => c.clusterLength > 1);

    console.log(`Clusters to categorize: ${clusters.length} total, ${singletons.length} singletons, ${multiClusters.length} multi-transaction`);

    // Multi-clusters are processed first so singletons can inherit from their categories
    for (let i = 0; i < multiClusters.length; i += BATCH_SIZE) {
        const batch = multiClusters.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(multiClusters.length / BATCH_SIZE);

        const clustersText = batch
            .map((c, idx) => `${idx + 1}. "${c.centroid}" (${c.clusterLength} transactions)`)
            .join("\n");

        console.log(`Processing batch ${batchNum}/${totalBatches} — ${batch.length} clusters`);

        const result = await categorySystemMessage.pipe(clusterCategorizationLlm).invoke({
            clusters: clustersText
        });

        if (result.clusterCategory.length !== batch.length) {
            console.warn(`Batch ${batchNum}: expected ${batch.length} results, got ${result.clusterCategory.length}. Skipping batch.`);
            continue;
        }

        await Promise.all(
            result.clusterCategory.map((item, idx) =>
                prisma.cluster.update({
                    where: { id: batch[idx]!.id },
                    data: {
                        merchantName: item.merchantName ?? null,
                        category: item.category,
                        confidence: item.confidence,
                        categorySupportRationale: item.categorySupportRationale
                    }
                })
            )
        );

        console.log(`Batch ${batchNum}/${totalBatches} complete`);
    }

    if (singletons.length === 0) return state;

    const singletonClusterIds = singletons.map(c => c.id);

    const singletonResults: SingletonResult[] = await Promise.all(
        singletons.map(async (singleton): Promise<SingletonResult> => {
            const singletonTx = await prisma.finalTransactionData.findFirst({
                where: { clusterId: singleton.id },
                select: { id: true, descriptionVector: true }
            });

            if (!singletonTx || !singletonTx.descriptionVector.length) {
                return { id: singleton.id, matched: false };
            }

            const rawResults = await prisma.finalTransactionData.aggregateRaw({
                pipeline: [
                    {
                        '$vectorSearch': {
                            'index': process.env.TRAN_VECTOR_INDEX_NAME,
                            'path': 'descriptionVector',
                            'queryVector': singletonTx.descriptionVector,
                            'numCandidates': 150,
                            'limit': 30
                        }
                    },
                    {
                        '$project': {
                            '_id': 1,
                            'clusterId': 1,
                            'similarity': { '$meta': 'vectorSearchScore' }
                        }
                    }
                ]
            }) as unknown as VectorSearchResult[];

            const topMatch = rawResults.find(r =>
                r._id['$oid'] !== singletonTx.id &&
                r.clusterId != null &&
                !singletonClusterIds.includes(r.clusterId['$oid'])
            );

            if (!topMatch || topMatch.similarity < SINGLETON_SIMILARITY_THRESHOLD) {
                return { id: singleton.id, matched: false };
            }

            const matchedCluster = await prisma.cluster.findUnique({
                where: { id: topMatch.clusterId!['$oid'] },
                select: { category: true, confidence: true }
            });

            if (!matchedCluster?.category) {
                return { id: singleton.id, matched: false };
            }

            return {
                id: singleton.id,
                matched: true,
                category: matchedCluster.category,
                confidence: (matchedCluster.confidence ?? 0) * SINGLETON_CONFIDENCE_PENALTY,
                categorySupportRationale: `Inferred from nearest cluster (similarity: ${topMatch.similarity.toFixed(2)})`
            };
        })
    );

    const matched = singletonResults.filter((r): r is Extract<SingletonResult, { matched: true }> => r.matched);
    const unmatched = singletonResults.filter(r => !r.matched);

    if (matched.length > 0) {
        await Promise.all(
            matched.map(r =>
                prisma.cluster.update({
                    where: { id: r.id },
                    data: {
                        merchantName: null,
                        category: r.category,
                        confidence: r.confidence,
                        categorySupportRationale: r.categorySupportRationale
                    }
                })
            )
        );
        console.log(`Inferred category for ${matched.length} singleton clusters from nearest neighbor`);
    }

    if (unmatched.length > 0) {
        await prisma.cluster.updateMany({
            where: { id: { in: unmatched.map(r => r.id) } },
            data: {
                category: UNCATEGORIZED,
                confidence: 0,
                categorySupportRationale: "Singleton cluster — no similar cluster found"
            }
        });
        console.log(`Marked ${unmatched.length} singleton clusters as Uncategorized`);
    }

    return state;
}

export { llmCategoryNode };
