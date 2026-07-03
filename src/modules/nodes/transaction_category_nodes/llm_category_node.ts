import { GraphNode } from "@langchain/langgraph";
import { agentGraphSchema } from "../../../graph_state.js";
import prisma from "../../../prismaClient.js";
import { clusterCategorizationLlm, categorySystemMessage } from "../../../models/index.js";

const BATCH_SIZE = 30;
const UNCATEGORIZED = "Uncategorized";
const SINGLETON_SIMILARITY_THRESHOLD = 0.75;
const SINGLETON_CONFIDENCE_PENALTY = 0.8;

type VectorSearchResult = {
    _id: { '$oid': string };
    clusterId?: { '$oid': string } | null;
    similarity: number;
};

type RefinementResult = {
    id: string;
    merchantName: string | null;
    category: string;
    confidence: number;
    categorySupportRationale: string;
};

const llmCategoryNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    const metadata = await prisma.statementMetadata.findUnique({
        where: { id: state.statementMetadataId! },
        select: { bankName: true }
    });
    const bankName = metadata?.bankName;

    let retryAttempt = 0;
    const maxRetryAttempt = 3;

    while (true) {
        var clusters = await prisma.cluster.findMany({
            where: { category: null, ...(bankName ? { bankName } : {}) },
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

    // ── Step 1: LLM categorizes ALL clusters (multi + singleton) ─────────────
    for (let i = 0; i < clusters.length; i += BATCH_SIZE) {
        const batch = clusters.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(clusters.length / BATCH_SIZE);

        const clustersText = batch
            .map((c, idx) => `${idx + 1}. "${c.centroid}" (${c.clusterLength} transaction${c.clusterLength === 1 ? "" : "s"})`)
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
                        payeeName: item.payeeName ?? null,
                        category: item.category === "Other" ? UNCATEGORIZED : item.category,
                        confidence: item.confidence,
                        categorySupportRationale: item.categorySupportRationale
                    }
                })
            )
        );

        console.log(`Batch ${batchNum}/${totalBatches} complete`);
    }

    if (singletons.length === 0 || !bankName) {
        if (state.statementMetadataId) {
            await prisma.statementMetadata.update({
                where: { id: state.statementMetadataId },
                data: { categorizationStatus: "Completed" },
            });
        }
        return state;
    }

    // ── Step 2: Singleton refinement — overwrite LLM result with nearest ──────
    //    multi-cluster if similarity > 0.75, for merchantName consistency
    const singletonClusterIds = singletons.map(c => c.id);

    const eligibleClusterIds = (await prisma.cluster.findMany({
        where: {
            bankName,
            clusterLength: { gt: 1 },
            id: { notIn: singletonClusterIds },
            category: { not: null }
        },
        select: { id: true }
    })).map(c => c.id);

    const poolTxns = await prisma.finalTransactionData.findMany({
        where: { clusterId: { in: eligibleClusterIds } },
        select: { id: true }
    });

    const bankPoolIds = poolTxns.map(t => ({ '$oid': t.id }));
    console.log(`[LLM Category] Singleton refinement pool: ${bankPoolIds.length} transactions from bank "${bankName}"`);

    if (bankPoolIds.length > 0) {
        const refinementResults: (RefinementResult | null)[] = await Promise.all(
            singletons.map(async (singleton): Promise<RefinementResult | null> => {
                const singletonTx = await prisma.finalTransactionData.findFirst({
                    where: { clusterId: singleton.id },
                    select: { id: true, descriptionVector: true }
                });

                if (!singletonTx || !singletonTx.descriptionVector.length) return null;

                const numCandidates = Math.min(10000, Math.max(150, bankPoolIds.length * 10));

                const rawResults = await prisma.finalTransactionData.aggregateRaw({
                    pipeline: [
                        {
                            '$vectorSearch': {
                                'index': process.env.TRAN_VECTOR_INDEX_NAME,
                                'path': 'descriptionVector',
                                'queryVector': singletonTx.descriptionVector,
                                'numCandidates': numCandidates,
                                'limit': numCandidates
                            }
                        },
                        { '$match': { '_id': { '$in': bankPoolIds } } },
                        {
                            '$project': {
                                '_id': 1,
                                'clusterId': 1,
                                'similarity': { '$meta': 'vectorSearchScore' }
                            }
                        },
                        { '$limit': 1 }
                    ]
                }) as unknown as VectorSearchResult[];

                const topMatch = rawResults[0];
                if (!topMatch || topMatch.similarity < SINGLETON_SIMILARITY_THRESHOLD) return null;

                const matchedCluster = await prisma.cluster.findUnique({
                    where: { id: topMatch.clusterId!['$oid'] },
                    select: { merchantName: true, category: true, confidence: true }
                });

                if (!matchedCluster?.category) return null;

                return {
                    id: singleton.id,
                    merchantName: matchedCluster.merchantName ?? null,
                    category: matchedCluster.category,
                    confidence: (matchedCluster.confidence ?? 0) * SINGLETON_CONFIDENCE_PENALTY,
                    categorySupportRationale: `Refined from nearest multi-cluster (similarity: ${topMatch.similarity.toFixed(2)})`
                };
            })
        );

        const toRefine = refinementResults.filter((r): r is RefinementResult => r !== null);

        if (toRefine.length > 0) {
            await Promise.all(
                toRefine.map(r =>
                    prisma.cluster.update({
                        where: { id: r.id },
                        data: {
                            merchantName: r.merchantName,
                            category: r.category,
                            confidence: r.confidence,
                            categorySupportRationale: r.categorySupportRationale
                        }
                    })
                )
            );
            console.log(`[LLM Category] Refined ${toRefine.length} singleton(s) from nearest multi-cluster`);
        }
    }

    if (state.statementMetadataId) {
        await prisma.statementMetadata.update({
            where: { id: state.statementMetadataId },
            data: { categorizationStatus: "Completed" },
        });
    }

    return state;
}

export { llmCategoryNode };
