import { Db, MongoClient } from "mongodb"

const client = new MongoClient(process.env.DATABASE_URL || "");

/**
 * The index definition.
 *
 * **`userId` is a `filter` field, and that is load-bearing.** `$vectorSearch`
 * only accepts a `filter` on paths the index declares this way; without the
 * declaration Atlas rejects the query outright. That is the good outcome — the
 * alternative to filtering *inside* the search is filtering after it, and a
 * post-`$match` is not equivalent: `$vectorSearch` picks its `numCandidates`
 * nearest neighbours across the whole collection first, so with several tenants
 * another user's similar descriptions consume the candidate budget and this
 * user's real matches never reach the later stage at all.
 */
const definitionFor = (path: string) => ({
    "fields": [
        {
            "type": "vector",
            "numDimensions": 1536,
            "path": path,
            "similarity": "cosine",
            "quantization": "scalar"
        },
        {
            "type": "filter",
            "path": "userId"
        }
    ]
});

const hasUserIdFilter = (index: Record<string, any>): boolean =>
    (index?.latestDefinition?.fields ?? []).some(
        (f: any) => f?.type === "filter" && f?.path === "userId"
    );

/** Block until Atlas reports the index queryable. Rebuilds are asynchronous. */
const waitUntilQueryable = async (collection: ReturnType<Db["collection"]>, name: string) => {
    console.log(`Polling to check if the ${name} index is ready. This may take up to a minute.`);

    for (;;) {
        const indexes = await collection.listSearchIndexes().toArray();
        const found = indexes.find((i) => i.name === name);

        if ((found as any)?.queryable) {
            console.log(`${name} is ready for querying.`);
            return;
        }
        // Sleeps whether or not the index was found. The previous version only
        // slept inside the "found but not queryable" branch, so an index that
        // disappeared between calls span this loop at full speed forever.
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
};

/**
 * Creates the named Atlas vector search index, or **updates it in place** when it
 * exists with an out-of-date definition.
 *
 * The update path is not optional. This used to check by name alone and return
 * early on a match, which meant a definition change could never reach a database
 * that already had the index — it would keep the old shape indefinitely, and the
 * `userId` filter added above would fail at query time on every existing
 * deployment while working perfectly on a fresh one.
 */
const peformVectorIndex = async (collectionName: string, vector_name: string, database: Db, path: string) => {
    const collections = await database.listCollections(
        { name: collectionName }
    ).toArray()

    if (collections.length === 0) {
        throw new Error(`Collection ${collectionName} does not exist. Run \`prisma db push\` before creating vector search indexes.`)
    }

    const collection = database.collection(collectionName);

    const listsearchindexes = await collection.listSearchIndexes().toArray()
    const existing = listsearchindexes.find((i) => i.name === vector_name);

    if (existing) {
        if (hasUserIdFilter(existing)) {
            console.log(`Vector search index ${vector_name} already exists and is up to date. Skipping.`)
            return;
        }

        console.log(`Vector search index ${vector_name} exists but has no userId filter field — updating it.`);
        await collection.updateSearchIndex(vector_name, definitionFor(path));
        await waitUntilQueryable(collection, vector_name);
        return;
    }

    const result = await collection.createSearchIndex({
        name: vector_name,
        type: "vectorSearch",
        definition: definitionFor(path),
    });

    console.log(`New search index named ${result} is building.`);
    await waitUntilQueryable(collection, result);
}

/**
 * One index, `transaction_vector_index`, on
 * `FinalTransactionData.descriptionVector`. It's the only one the pipeline
 * actually queries — see the `$vectorSearch` stages in
 * `cluster_generator_tool.ts` and `llm_category_node.ts`, both of which read
 * `TRAN_VECTOR_INDEX_NAME`.
 *
 * There used to be a second, `merchant_vector_index` (`VECTOR_INDEX_NAME`),
 * identically defined on the same collection and field. It was a leftover from
 * the now fully commented-out `MerchantMapping` model in schema.prisma and was
 * never referenced by a single query — a duplicate index Atlas would maintain
 * on every write for nothing. Dropped deliberately; don't reintroduce it
 * without a query that reads it.
 */
const createVectorSearchIndex = async () => {
    try {
        const database = client.db("ai_advisor");
        const collectionName = "FinalTransactionData";
        const path = "descriptionVector";

        const transactionVectorName = process.env.TRAN_VECTOR_INDEX_NAME || "";

        if (!transactionVectorName) {
            throw new Error("TRAN_VECTOR_INDEX_NAME is not defined in environment variables.");
        }

        await peformVectorIndex(collectionName, transactionVectorName, database, path);

    } finally {
        await client.close();
    }

}

export default createVectorSearchIndex;
