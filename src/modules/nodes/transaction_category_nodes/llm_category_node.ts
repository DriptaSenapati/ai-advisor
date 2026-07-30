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

type CategoryItem = {
    merchantName: string | null;
    payeeName: string | null;
    category: string;
    confidence: number;
    categorySupportRationale: string;
};

type ClusterToClassify = { id: string; centroid: string; clusterLength: number };

/**
 * Classify a batch, halving it if the model doesn't answer for every cluster.
 *
 * **This used to be `continue`.** `clusterCategorizationLLMSchema` types the
 * answer as an unconstrained `z.array(...)`; "return exactly one result per
 * cluster" is a sentence in the prompt and nothing enforces it. When the count
 * came back wrong the whole batch — up to 30 clusters — was dropped on a
 * `console.warn`, left with `category`, `merchantName` and `payeeName` all null,
 * and the pipeline still reported `categorizationStatus: "Completed"`.
 *
 * It was close to undetectable in the output, because step 2 below refines
 * *singletons* off their nearest neighbour regardless of what step 1 did. So a
 * skipped batch lost only its multi-transaction clusters, and the survivors made
 * the run look healthy. On one real 300-cluster statement this cost 15 clusters
 * and 54 transactions: recognisable payees like "upi kunal das upi" and
 * merchants like PVR Inox and Canva ended up permanently unnamed and pooled into
 * "Other", while the near-identical "upi runu senapati upi" — in a batch that
 * happened to come back the right length — resolved to "Runu Senapati".
 *
 * Halving rather than retrying at the same size: a miscount is usually the model
 * dropping or merging one entry in a long list, and a shorter list is materially
 * easier to answer exactly. It also isolates the offending cluster instead of
 * punishing its 29 neighbours. Recursion terminates at a single cluster, whose
 * id is returned so the caller can report it.
 *
 * Exceptions are deliberately **not** caught. A thrown call is a rate limit or a
 * network fault, which splitting cannot fix and would only re-trigger twice as
 * often; letting it propagate keeps BullMQ's retry-with-backoff as the recovery
 * path, which is the right one.
 */
async function classifyClusters(
    batch: ClusterToClassify[],
    label: string,
    into: Map<string, CategoryItem>
): Promise<ClusterToClassify[]> {
    const clustersText = batch
        .map((c, idx) => `${idx + 1}. "${c.centroid}" (${c.clusterLength} transaction${c.clusterLength === 1 ? "" : "s"})`)
        .join("\n");

    const result = await categorySystemMessage.pipe(clusterCategorizationLlm).invoke({ clusters: clustersText });
    const items = result.clusterCategory as CategoryItem[];

    if (items.length === batch.length) {
        batch.forEach((cluster, idx) => into.set(cluster.id, items[idx]!));
        return [];
    }

    if (batch.length === 1) {
        console.error(
            `[LLM Category] ${label}: model returned ${items.length} results for a single cluster ` +
            `(${batch[0]!.id}, "${batch[0]!.centroid}"). Left uncategorised so a later run can retry it.`
        );
        return batch;
    }

    console.warn(
        `[LLM Category] ${label}: expected ${batch.length} results, got ${items.length}. Splitting.`
    );

    const mid = Math.ceil(batch.length / 2);
    const left = await classifyClusters(batch.slice(0, mid), `${label}·1`, into);
    const right = await classifyClusters(batch.slice(mid), `${label}·2`, into);
    return [...left, ...right];
}

/** Persist one classification result. Shared by the node and the repair script. */
export function applyCategory(id: string, item: CategoryItem) {
    return prisma.cluster.update({
        where: { id },
        data: {
            merchantName: item.merchantName ?? null,
            payeeName: item.payeeName ?? null,
            category: item.category === "Other" ? UNCATEGORIZED : item.category,
            confidence: item.confidence,
            categorySupportRationale: item.categorySupportRationale,
        },
    });
}

export { classifyClusters };
export type { CategoryItem, ClusterToClassify };

const llmCategoryNode: GraphNode<typeof agentGraphSchema> = async (state) => {
    const metadata = await prisma.statementMetadata.findUnique({
        where: { id: state.statementMetadataId! },
        select: { bankName: true }
    });
    const bankName = metadata?.bankName;
    const userId = state.userId;

    let retryAttempt = 0;
    const maxRetryAttempt = 3;

    while (true) {
        // Scoped by `userId` as well as bank. Without it this swept up every
        // other user's uncategorised clusters for the same bank and sent them
        // to the LLM — someone else's merchants named, on this user's job.
        var clusters = await prisma.cluster.findMany({
            where: { category: null, userId, ...(bankName ? { bankName } : {}) },
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
    const unclassified: ClusterToClassify[] = [];

    for (let i = 0; i < clusters.length; i += BATCH_SIZE) {
        const batch = clusters.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(clusters.length / BATCH_SIZE);
        const label = `batch ${batchNum}/${totalBatches}`;

        console.log(`Processing ${label} — ${batch.length} clusters`);

        const classified = new Map<string, CategoryItem>();
        unclassified.push(...(await classifyClusters(batch, label, classified)));

        // Written per batch, not once at the end: if a later batch throws, the
        // work already done survives and the next attempt re-queries only what
        // is still `category: null`.
        await Promise.all([...classified].map(([id, item]) => applyCategory(id, item)));

        console.log(`${label} complete — ${classified.size}/${batch.length} classified`);
    }

    /**
     * Loud, and with the ids. A `console.warn` in a worker is invisible in
     * practice — this is the line that would have surfaced the 15 clusters that
     * sat unnamed through a "Completed" run. `categorizationStatus` is still set
     * to Completed below: insights over 285 named clusters are worth having, and
     * blocking the rest of the pipeline over a handful would be the worse
     * failure. They stay `category: null`, so the next run for this bank picks
     * them up automatically.
     */
    if (unclassified.length > 0) {
        console.error(
            `[LLM Category] ${unclassified.length} cluster(s) could not be classified and remain uncategorised: ` +
            unclassified.map((c) => `${c.id} ("${c.centroid}")`).join(", ")
        );
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
            userId,
            clusterLength: { gt: 1 },
            id: { notIn: singletonClusterIds },
            category: { not: null }
        },
        select: { id: true }
    })).map(c => c.id);

    const poolTxns = await prisma.finalTransactionData.findMany({
        where: { clusterId: { in: eligibleClusterIds }, userId },
        select: { id: true }
    });

    const bankPoolIds = poolTxns.map(t => ({ '$oid': t.id }));
    console.log(`[LLM Category] Singleton refinement pool: ${bankPoolIds.length} transactions from bank "${bankName}"`);

    if (bankPoolIds.length > 0) {
        const refinementResults: (RefinementResult | null)[] = await Promise.all(
            singletons.map(async (singleton): Promise<RefinementResult | null> => {
                const singletonTx = await prisma.finalTransactionData.findFirst({
                    where: { clusterId: singleton.id, userId },
                    select: { id: true, descriptionVector: true }
                });

                if (!singletonTx || !singletonTx.descriptionVector.length) return null;

                const numCandidates = Math.min(10000, Math.max(150, bankPoolIds.length * 10));

                const rawResults = await prisma.finalTransactionData.aggregateRaw({
                    pipeline: [
                        {
                            // Filtered inside the search, not after it — see the
                            // note on `vectorSearchStage` in cluster_generator_tool.ts.
                            '$vectorSearch': {
                                'index': process.env.TRAN_VECTOR_INDEX_NAME,
                                'path': 'descriptionVector',
                                'queryVector': singletonTx.descriptionVector,
                                'numCandidates': numCandidates,
                                'limit': numCandidates,
                                'filter': { 'userId': { '$eq': userId } }
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

                const matchedCluster = await prisma.cluster.findFirst({
                    where: { id: topMatch.clusterId!['$oid'], userId },
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
