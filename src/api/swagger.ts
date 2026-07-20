import swaggerJsDoc from "swagger-jsdoc";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// glob requires forward slashes — path.join on Windows returns backslashes
const routesDir = join(__dirname, "routes").replace(/\\/g, "/");

const options: swaggerJsDoc.Options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "AI Financial Advisor API",
            version: "1.0.0",
            description: "REST API for the AI Financial Advisor — processes bank statements, generates tier-based insights, and provides goal feasibility analysis.",
        },
        servers: [{ url: "/api/v1", description: "API v1" }],
        tags: [
            { name: "Health", description: "Uptime check" },
            { name: "Statements", description: "PDF upload and processing pipeline" },
            { name: "Insights", description: "LLM-generated financial insight reports" },
            { name: "Goals", description: "Financial goal management and Monte Carlo analysis" },
            { name: "Transactions", description: "Transaction browsing and aggregations" },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    description: "Token from POST /api/auth/sign-in/email → paste the `token` field here",
                },
            },
            schemas: {
                AcceptedResponse: {
                    type: "object",
                    properties: {
                        success: { type: "boolean", example: true },
                        data: { type: "object" },
                    },
                },
                ErrorResponse: {
                    type: "object",
                    properties: {
                        success: { type: "boolean", example: false },
                        error: {
                            type: "object",
                            properties: {
                                code: { type: "string" },
                                message: { type: "string" },
                                details: {},
                            },
                        },
                    },
                },
            },
            responses: {
                ValidationError: {
                    description: "Request validation failed",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: { success: false, error: { code: "VALIDATION_ERROR", message: "Request validation failed" } },
                        },
                    },
                },
                NotFound: {
                    description: "Resource not found",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: { success: false, error: { code: "NOT_FOUND", message: "Resource not found" } },
                        },
                    },
                },
                RateLimited: {
                    description: "Rate limit exceeded",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: { success: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
                        },
                    },
                },
                Unauthorized: {
                    description: "Authentication required",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
                        },
                    },
                },
            },
        },
        security: [{ bearerAuth: [] }],
    },
    apis: [
        `${routesDir}/*.ts`,
        `${routesDir}/*.js`,
    ],
};

const swaggerSpec = swaggerJsDoc(options);
export default swaggerSpec;
