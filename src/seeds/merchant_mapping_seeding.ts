import fs from 'fs';
import prisma from '../prismaClient.js';
import { embeddingsModel } from '../models/index.js';

const read_seed_mapping = async (json_path: string) => {
    const mapping_data: Record<string, Record<string, string[]>> = JSON.parse(fs.readFileSync(json_path, 'utf-8'));

    const mapping_data_list: { category: string, embedText: string; }[] = Object.entries(mapping_data).map(([category, categoryValues]) => {
        return { category, embedText: category + " " + categoryValues.merchants!.join(" ") + " " + categoryValues.patterns!.join(" ") + " " + categoryValues.keywords!.join(" ") }
    })
    const categoryEmbeddings = await update_category_embedding(mapping_data_list.map(item => item.embedText))

    if (!categoryEmbeddings) {
        console.error('Failed to generate category embeddings. Aborting seeding process.');
        return;
    }

    try {
        await prisma.merchantMapping.createMany({
            data: mapping_data_list.map(item => ({
                category: item.category,
                embedText: item.embedText,
                embedding: categoryEmbeddings ? (categoryEmbeddings[item.embedText] as number[]) : []
            }))
        })

        console.log('Merchant mapping data seeded successfully.')



    } catch (error) {
        console.error('Error seeding merchant mapping data:', error);
    }
}


const update_category_embedding = async (embedTexts: string[]): Promise<Record<string, number[]> | undefined> => {
    try {
        const embed: number[][] = await embeddingsModel.embedDocuments(embedTexts)
        console.log('Embeddings generated successfully.')
        //console.log(embed.map((e) => e.length)) // 1536

        return Object.fromEntries(embedTexts.map((text, idx) => [text, embed[idx] as number[]]))

    } catch (error) {
        console.error('Error generating embeddings:', error);
    }
}

export { read_seed_mapping };