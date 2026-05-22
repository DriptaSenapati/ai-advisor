import { tool } from "langchain";
import z from "zod";

const tranKeyNormalizerTool = tool((input) => {
    const { extractedData, keyMapping } = input;
    if (!extractedData || !keyMapping) {
        throw new Error("Both extractedData and keyMapping are required.");
    }

    return extractedData.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k === process.env.TEMP_ID_KEY ? process.env.TEMP_ID_KEY : keyMapping[k] || undefined, v]).filter(([k]) => k !== undefined)));

}, {
    name: "tranKeyNormalizerTool",
    description: "A tool to normalize the keys of the extracted transaction data. It takes the extracted data and the key mapping as input and returns the normalized data with standardized keys. The standardized keys should be date, description, creditAmount, debitAmount, and balance.",
    schema: z.object({
        extractedData: z.array(z.record(z.string(), z.string())).describe("The extracted transaction data in an array of key-value pair format where each element represents a row of transaction data.").optional(),
        keyMapping: z.record(z.string(), z.string()).describe("The key mapping that maps the original keys from the extracted data to the standardized keys. The standardized keys should be date, description, creditAmount, debitAmount, and balance.").optional(),
    }),
})

export { tranKeyNormalizerTool };