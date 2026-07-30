import "./envConfig.js";
import { advisorAgentGraph, insightsAgentGraph } from "./graph.js";
import { DEV_USER_ID } from "./config/dev-user.js";

// createVectorSearchIndex().catch(console.dir);

const transactionCategoryAgent = advisorAgentGraph.compile();
const insightsAgent = insightsAgentGraph.compile();

transactionCategoryAgent.invoke({
    userId: DEV_USER_ID,
    statementPath: "assets\\hdfc.pdf",
    bankName: "HDFC",
    messages: [],
}).then((advisorResult: any) => {
    console.log("Ran Statement Correction Agent successfully.");
    console.log("Starting Insights Agent...");

    setTimeout(() => {
        insightsAgent.invoke({
            userId: DEV_USER_ID,
            statementMetadataId: advisorResult.statementMetadataId,
        }).then(() => {
            console.log("Insights Agent ran successfully");
        }).catch((error: any) => {
            console.error("Error invoking the insights agent:", error);
        });
    }, 1000);

}).catch((error: any) => {
    console.error("Error invoking the agent:", error);
});
