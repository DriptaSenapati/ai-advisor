import { tool } from "langchain";
import z from "zod";

const llmCategoryTool = tool(async (input) => {
    const { finalTransactionStats: { min, max, avg, median } } = input;

}, {
    name: "LLM Category Tool",
    description: "A tool that uses a language model to categorize transactions based on their descriptions. It takes in transaction data and returns the most likely category for each transaction along with a confidence score.",
    schema: z.object({
        finalTransactionStats: z.object({
            min: z.number(),
            max: z.number(),
            avg: z.number(),
            median: z.number(),
        })
    })
})