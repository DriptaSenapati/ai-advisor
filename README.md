# AI Financial Advisor

An AI-powered financial assistant that processes bank statement PDFs, normalizes transaction data, clusters similar transactions by semantic similarity, and categorizes them using LLM labeling. Built to evolve into a full financial intelligence engine with spending insights and goal-setting capabilities.

---

## Features

- **PDF Extraction** — Parses bank statement PDFs using coordinate-based column mapping (text-based) or vision LLM per page (image-based/scanned), with automatic detection and fallback
- **Basic Details Extraction** — Extracts bank name, account number, and statement period from page 1 via vision LLM
- **Statement Normalization** — Renames keys, detects errors, corrects data, and separates valid from invalid transactions
- **Balance Gap Analysis** — Validates closing balance continuity across consecutive transactions; records gaps and their values
- **Extraction Confidence Score** — Weighted penalty score (0–1) combining exception rate (×0.8) and balance gap rate (×0.2)
- **Semantic Clustering** — Embeds transaction descriptions with OpenAI, clusters by cosine similarity > 0.9 (merchant-level groupings)
- **LLM Categorization** — Labels each cluster with merchant name, category, confidence, and rationale in batches of 30
- **Spending Insights** — Aggregates monthly stats and generates natural language insights via a single LLM call
- **Goal Advisor** — Analyzes spending patterns to assess financial goal feasibility and surface quick wins

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript (ESM, strict) |
| AI Orchestration | LangChain + LangGraph |
| LLM | OpenAI `gpt-5.1` |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims) |
| Database | MongoDB Atlas (vector search) |
| ORM | Prisma v6 |
| PDF Parsing | mupdf |
| Validation | Zod |
| Tracing | LangSmith |

---

## Project Structure

```
src/
├── index.ts                              # Entry point
├── graph.ts                              # Main LangGraph pipeline
├── graph_state.ts                        # Zod state schema (agentGraphSchema, insightsAgentGraphSchema)
├── envConfig.ts                          # Environment config loader
├── prismaClient.ts                       # Singleton Prisma client
├── helpers/index.ts                      # Shared utilities and CATEGORIES list
├── models/index.ts                       # LLM configs, prompt templates, structured output schemas
├── graphs/
│   ├── statement_normalizer_subgraph.ts  # Normalize → correct → validate
│   ├── balace_analyzer_subgraph.ts       # Balance gap → confidence score
│   └── transaction_category_subgraph.ts  # Cluster → LLM categorize
├── modules/
│   ├── pdf/pdf_extractor.ts              # mupdf extraction, image detection, page rendering
│   ├── nodes/                            # LangGraph node implementations
│   │   ├── pdf_extractor_tool_node.ts
│   │   ├── state_normalizer_nodes/
│   │   ├── transaction_category_nodes/
│   │   ├── balance_analyzer_nodes/
│   │   └── ai_insights_nodes/
│   └── graphTools/                       # Tool implementations called by nodes
├── seeds/
│   └── create_vector_search_index.ts
└── scripts/
    ├── checkpoint-runner.ts
    ├── reset-db.ts
    ├── pdf-extractor-runner.ts
    ├── pdf-node-runner.ts
    ├── balance-analyzer-runner.ts
    └── graph-visualizer.ts
prisma/schema.prisma
```

---

## Pipeline

```
PDF File
  ↓
[PDF Extractor Node]
  ├─ Detect image-based (char count < 50)
  ├─ Extract basic details (bank name, account no., period) via vision LLM (page 1)
  ├─ Text path:  mupdf coordinate mapping → StatementExtractedData
  └─ Image path: vision LLM per page → transactionData (skips key mapper)
  ↓
[Statement Normalizer Subgraph]
  ├─ (text path)  keyMapperNode → tranKeyNormToolNode ─┐
  └─ (image path) skip ──────────────────────────────→ statementErrorFetchNode
                                                         → statementCorrectionToolNode
                                                         → statementExceptionFinalToolNode
                                                           → NormalizedTransactions / ExceptionTransactions
  ↓
[Balance Analyzer Subgraph]
  ├─ balanceGapAnalyzerNode   — diff closing balances, record mismatches
  └─ confidenceCalculatorNode — confidence = 1 - (exceptionRate×0.8) - (gapRate×0.2)
  ↓
[Transaction Category Subgraph]
  ├─ clusterGeneratorToolNode — embed descriptions → FinalTransactionData → Cluster
  └─ llmCategoryNode          — batch label clusters → merchantName, category, confidence
```

---

## Database Models

| Model | Purpose |
|---|---|
| `StatementMetadata` | Per-upload record: bank name, account number, period, key mapping, gap analysis, confidence score |
| `StatementExtractedData` | Raw rows from PDF extraction (text or vision), linked to metadata |
| `NormalizedTransactions` | Valid transactions after normalization |
| `ExceptionTransactions` | Transactions that failed validation |
| `ErrorPdfExtract` | Error rows flagged by LLM during correction |
| `FinalTransactionData` | Transactions with description embeddings and cluster assignment |
| `Cluster` | Groups of similar transactions with category metadata |
| `MonthlyStats` | Aggregated per-month spending statistics |
| `RecurringPattern` | Detected recurring expenses (subscriptions, EMIs, bills) |
| `InsightReport` | LLM-generated natural language insight reports |
| `Goal` | User financial goals with feasibility analysis |

### `StatementMetadata` fields of note

| Field | Description |
|---|---|
| `bankName` | Extracted via vision LLM from page 1 |
| `accountNumber` | Extracted via vision LLM from page 1 |
| `statementPeriodStart/End` | From vision LLM if available, otherwise min/max transaction date |
| `balanceGaps` | Array of `{ fromDate, toDate, description, balanceDiff, expectedAmount, gap }` |
| `balanceGapCount` | Count of mismatched balance transitions |
| `extractionConfidence` | Float 0–1 weighted penalty score |

---

## Transaction Categories

```
Food & Dining · Groceries · Transport · Shopping · Bills & Utilities
Health & Medical · Entertainment & Subscriptions · Education
Travel & Accommodation · Finance & Investments · Transfers & Payments · Other
```

---

## Setup

### Prerequisites
- Node.js 18+
- MongoDB Atlas cluster with vector search enabled
- OpenAI API key

### Install

```bash
npm install
```

### Environment

Create `.env.development`:

```env
OPENAI_API_KEY=
DATABASE_URL=
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=ai_advisor
LANGSMITH_TRACING=true
VECTOR_INDEX_NAME=merchant_vector_index
TRAN_VECTOR_INDEX_NAME=transaction_vector_index
VECTOR_DIMENSIONS=1536
TEMP_ID_KEY=tempId
BATCH_SIZE=40
CHUNK_SIZE=20
PDF_PASSWORD=
PDF_PASSWORD_HDFC=
```

### Database

```bash
npm run prisma:push
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with hot reload (nodemon + tsx) |
| `npm run build` | Compile TypeScript |
| `npm run start` | Run compiled build |
| `npm run dev:checkpoint` | Run advisor or insights pipeline with LangGraph checkpointing |
| `npm run reset:db` | Clear DB collections by stage |
| `npm run extract:pdf` | Run standalone PDF text extractor, write JSON output |
| `npm run run:pdf-node` | Run `pdfExtractorToolNode` in isolation (detection + LLM + DB save) |
| `npm run analyze:balance` | Run balance gap + confidence analysis for all or one metadata record |
| `npm run graph:visualize` | Generate Mermaid + PNG diagrams for all graphs |
| `npm run prisma:push` | Sync Prisma schema to MongoDB |

### Checkpoint runner flags

```bash
# Advisor graph
npm run dev:checkpoint                            # full run from PDF
npm run dev:checkpoint -- --from=normalize        # resume from normalization
npm run dev:checkpoint -- --from=balance          # resume from balance analysis
npm run dev:checkpoint -- --from=categorize       # resume from clustering
npm run dev:checkpoint -- --from=llm              # re-run LLM categorization only

# Insights graph
npm run dev:checkpoint -- --graph=insights
npm run dev:checkpoint -- --graph=insights --months=3
npm run dev:checkpoint -- --graph=insights --from=recurring
npm run dev:checkpoint -- --graph=insights --from=insights
```

### Reset DB flags

```bash
npm run reset:db                              # clear everything
npm run reset:db -- --stage=normalize         # clear from normalization onwards
npm run reset:db -- --stage=balance           # reset balance gaps + confidence on StatementMetadata
npm run reset:db -- --stage=categorize        # clear FinalTransactionData + Cluster
npm run reset:db -- --stage=llm               # reset Cluster category fields to null
npm run reset:db -- --stage=metadata          # clear StatementMetadata + StatementExtractedData
npm run reset:db -- --graph=insights          # clear all insight collections
```

---

## Roadmap

### Multi-Bank Support
`StatementMetadata` tracks each upload. Open decisions: consolidated vs per-account insights, hash-only vs date-range deduplication, full re-cluster vs incremental cluster merge on new uploads.

### Goal Setting
Users define financial goals (save amount, reduce category spend, emergency fund, debt payoff). `goalAdvisorGraph` pre-computes feasibility, monthly target delta, and gap, then LLM returns suggestions and quick wins.

### REST API & Web App Backend
HTTP API layer to expose pipeline capabilities — statement upload, transaction queries, insight retrieval, goal management — enabling a web front-end on top of the existing AI and data infrastructure.
