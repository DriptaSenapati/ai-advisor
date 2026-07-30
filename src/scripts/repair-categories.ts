import "../envConfig.js";
import prisma from "../prismaClient.js";
import {
    applyCategory,
    classifyClusters,
    type CategoryItem,
    type ClusterToClassify,
} from "../modules/nodes/transaction_category_nodes/llm_category_node.js";

/**
 * Classify clusters that the pipeline left behind.
 *
 * A cluster with `category: null` has no `merchantName` and no `payeeName`
 * either, so its transactions show up in the dashboard as unnamed rows pooled
 * into "Other" — `statsAggregatorTool` substitutes `"Other"` for a null category,
 * which is why the money is still counted and only the *identity* is missing.
 * That is what made the original bug so quiet.
 *
 * The cause is fixed in `llm_category_node.ts` (a miscounted batch used to be
 * dropped wholesale). This is the one-shot repair for rows stranded before that
 * fix. It is safe to run repeatedly: it only ever touches clusters that are
 * still `category: null`, and it re-uses the node's own classification and write
 * helpers so a repaired cluster is indistinguishable from one done in-pipeline.
 *
 * **Aggregates are not recomputed.** `MonthlyStats.topMerchants`,
 * `categoryBreakdown` and `RecurringPattern` were all derived while these
 * clusters were nameless, so they need `POST /insights/generate` (no
 * `statementId`, i.e. a full recompute) afterwards — the script prints which
 * users need it.
 *
 *   npm run repair:categories              # dry run — lists what it would do
 *   npm run repair:categories -- --yes     # actually classify and write
 *   npm run repair:categories -- --user=<id> --yes
 */

const BATCH_SIZE = 30;

const args = process.argv.slice(2);
const commit = args.includes("--yes");
const userFilter = args.find((a) => a.startsWith("--user="))?.split("=")[1];

async function main() {
    const stranded = await prisma.cluster.findMany({
        where: { category: null, ...(userFilter ? { userId: userFilter } : {}) },
        select: { id: true, centroid: true, clusterLength: true, userId: true, bankName: true },
        orderBy: { createdAt: "asc" },
    });

    if (stranded.length === 0) {
        console.log("Nothing to repair — every cluster has a category.");
        return;
    }

    const byUser = new Map<string, typeof stranded>();
    for (const c of stranded) {
        byUser.set(c.userId, [...(byUser.get(c.userId) ?? []), c]);
    }

    const txnCount = await prisma.finalTransactionData.count({
        where: { clusterId: { in: stranded.map((c) => c.id) } },
    });

    console.log(
        `${stranded.length} uncategorised cluster(s) across ${byUser.size} user(s), ` +
        `covering ${txnCount} transaction(s):\n`
    );
    for (const [userId, clusters] of byUser) {
        console.log(`  user ${userId} — ${clusters.length} cluster(s)`);
        for (const c of clusters) {
            console.log(`      ${String(c.clusterLength).padStart(3)} txn  ${c.bankName ?? "?"}  "${c.centroid}"`);
        }
    }

    if (!commit) {
        console.log("\nDry run. Re-run with -- --yes to classify these and write the results.");
        return;
    }

    console.log("\nClassifying...\n");

    const classified = new Map<string, CategoryItem>();
    const failed: ClusterToClassify[] = [];

    for (let i = 0; i < stranded.length; i += BATCH_SIZE) {
        const batch = stranded.slice(i, i + BATCH_SIZE).map(({ id, centroid, clusterLength }) => ({
            id,
            centroid,
            clusterLength,
        }));
        const label = `repair batch ${Math.floor(i / BATCH_SIZE) + 1}`;
        failed.push(...(await classifyClusters(batch, label, classified)));
    }

    await Promise.all([...classified].map(([id, item]) => applyCategory(id, item)));

    console.log(`\nWrote ${classified.size} cluster(s):\n`);
    for (const cluster of stranded) {
        const item = classified.get(cluster.id);
        if (!item) continue;
        const name = item.merchantName ?? item.payeeName ?? "(no name)";
        const kind = item.merchantName ? "merchant" : item.payeeName ? "payee   " : "unnamed ";
        console.log(`  ${kind} ${name.padEnd(26)} ${item.category.padEnd(30)} "${cluster.centroid}"`);
    }

    if (failed.length > 0) {
        console.warn(`\n${failed.length} cluster(s) still unclassified: ${failed.map((c) => c.id).join(", ")}`);
    }

    console.log(
        "\nNow recompute the aggregates — MonthlyStats and RecurringPattern were built while these\n" +
        "clusters were nameless, so merchant rankings and category totals are still stale:\n"
    );
    for (const userId of byUser.keys()) {
        console.log(`  POST /api/v1/insights/generate   (as user ${userId}, no statementId)`);
    }
}

main()
    .catch((err) => {
        console.error("[repair:categories] failed:", err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
