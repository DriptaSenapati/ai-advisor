

// import { buildTransactionData } from "./modules/pdf/pdf_extractor.js";
import "./envConfig.js";
import { advisorAgentGraph, insightsAgentGraph } from "./graph.js";
import fs from "fs";
import { read_seed_mapping } from "./seeds/merchant_mapping_seeding.js";
import createVectorSearchIndex from "./seeds/create_vector_search_index.js";

// const text = buildTransactionData("assets\\2025_statement.pdf");

// console.log(text);


// llm.invoke([
//     [
//         "system",
//         "You are a helpful assistant.",
//     ],
//     ["human", "Extract the transaction data from the PDF file located at 'assets\\2025_statement.pdf' and return it in a structured format."],
// ]).then((response) => {
//     console.log(response);
// }).catch((error) => {
//     console.error("Error invoking the model:", error);
// });





// createVectorSearchIndex().catch(console.dir);

// // read_seed_mapping("./default_merchant_mappings.json")

const transactionCategoryAgent = advisorAgentGraph.compile();
const advisorAgent = insightsAgentGraph.compile();


transactionCategoryAgent.invoke({
    statementPath: "assets\\hdfc.pdf",
    messages: [],
    // llmFeedbackLoop: {
    //     maxLLMRetryAttempt: 3
    // }
}).then(() => {
    console.log("Ran Statement Correction Agent successfully.");
    console.log("Starting Insights Agent...");

    setTimeout(() => {
        advisorAgent.invoke({
            isFirstRun: true,
        }).then(() => {
            console.log("Insights Agent ran successfully");
        }).catch((error) => {
            console.error("Error invoking the insights agent:", error);
        });
    }, 1000);


}).catch((error) => {
    console.error("Error invoking the agent:", error);
});