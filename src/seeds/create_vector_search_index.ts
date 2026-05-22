import { Db, MongoClient } from "mongodb"

const client = new MongoClient(process.env.DATABASE_URL || "");


const peformVectorIndex = async (collectionName: string, vector_name: string, database: Db, path: string) => {
    const collections = await database.listCollections(
        { name: collectionName }
    ).toArray()

    if (collections.length === 0) {
        console.log("Creating collection...")
        throw new Error(`Collection ${collectionName} does not exist. Please seed the merchant mapping data before creating the vector search index.`)

    }

    const collection = database.collection(collectionName);

    const listsearchindexes = await collection.listSearchIndexes().toArray()

    const alreadyExists = listsearchindexes.some(
        (i) => i.name === vector_name
    )
    if (alreadyExists) {
        console.log(`Vector search index ${vector_name} already exists. Skipping index creation.`)
        return;
    }


    const index = {
        name: vector_name,
        type: "vectorSearch",
        definition: {
            "fields": [
                {
                    "type": "vector",
                    "numDimensions": 1536,
                    "path": path,
                    "similarity": "cosine",
                    "quantization": "scalar"
                }
            ]
        }
    }


    const result = await collection.createSearchIndex(index);

    console.log(`New search index named ${result} is building.`);

    console.log(`Polling to check if the ${result} index is ready. This may take up to a minute.`)

    let isQueryable = false;
    while (!isQueryable) {
        const cursor = collection.listSearchIndexes();
        for await (const searchIndex of cursor) {
            if (searchIndex.name === result) {
                if ((searchIndex as any).queryable) {
                    console.log(`${result} is ready for querying.`);
                    isQueryable = true;
                } else {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        }
    }
}

const createVectorSearchIndex = async () => {
    try {
        const database = client.db("ai_advisor");
        const collectionNames = ["FinalTransactionData"];
        const merchantVectorName = process.env.VECTOR_INDEX_NAME || "";
        const transactionVectorName = process.env.TRAN_VECTOR_INDEX_NAME || "";

        if (!merchantVectorName) {
            throw new Error("VECTOR_INDEX_NAME is not defined in environment variables.");
        }

        if (!transactionVectorName) {
            throw new Error("TRAN_VECTOR_INDEX_NAME is not defined in environment variables.");
        }

        await Promise.all(collectionNames.map(name => peformVectorIndex(name, name === "MerchantMapping" ? merchantVectorName : transactionVectorName, database,
            name === "MerchantMapping" ? "embedding" : "descriptionVector"
        )));

    } finally {
        await client.close();
    }

}

export default createVectorSearchIndex;