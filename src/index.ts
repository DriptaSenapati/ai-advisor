

// import { buildTransactionData } from "./modules/pdf/pdf_extractor.js";
import "./envConfig.js";
import { advisorAgentGraph } from "./graph.js";

const advisorAgent = advisorAgentGraph.compile();
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


// advisorAgent.invoke({
//     statementPath: "assets\\2025_statement.pdf",
//     messages: [],
//     // llmFeedbackLoop: {
//     //     maxLLMRetryAttempt: 3
//     // }
// }).then((response) => {
//     console.log("Ran Statement Correction Agent successfully.");

//     // const jsonData = JSON.stringify(response.exceptions, null, 4);

//     // fs.writeFile("./extracted_data.json", jsonData, 'utf8', (err) => {
//     //     if (err) {
//     //         console.error('Error writing to file', err);
//     //     } else {
//     //         console.log(`Data written to ./extracted_data.json as JSON.`);
//     //     }
//     // });

//     // const jsonDataError = JSON.stringify(response.errorData, null, 4);

//     // fs.writeFile("./error_data.json", jsonDataError, 'utf8', (err) => {
//     //     if (err) {
//     //         console.error('Error writing to file', err);
//     //     } else {
//     //         console.log(`Data written to ./error_data.json as JSON.`);
//     //     }
//     // });

// }).catch((error) => {
//     console.error("Error invoking the agent:", error);
// });