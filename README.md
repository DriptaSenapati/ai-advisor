# AI Financial Advisor

An AI-powered financial assistant that processes bank statement PDFs, normalizes transaction data, clusters similar transactions by semantic similarity, and categorizes them using LLM labeling. Built to evolve into a full financial intelligence engine with spending insights and goal-setting capabilities.

---

## Features

- **PDF Extraction** — Parses bank statement PDFs into structured transaction rows using coordinate-based column mapping
- **Statement Normalization** — Renames keys, detects errors, corrects data, and separates valid from invalid transactions
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
| LLM | OpenAI `gpt-4.1` |
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
├── index.ts                          # Entry point
├── graph.ts                          # Main LangGraph pipeline
├── graph_state.ts                    # Zod state schema
├── envConfig.ts                      # Environment config loader
├── prismaClient.ts                   # Singleton Prisma client
├── helpers/index.ts                  # Shared utilities and CATEGORIES list
├── models/index.ts                   # LLM + embedding configs, prompt templates
├── graphs/
│   ├── statement_normalizer_subgraph.ts
│   └── transaction_category_subgraph.ts
├── modules/
│   ├── pdf/pdf_extractor.ts
│   ├── nodes/                        # LangGraph node implementations
│   └── graphTools/                   # Tool implementations called by nodes
├── seeds/
│   └── create_vector_search_index.ts
└── scripts/
    ├── checkpoint-runner.ts
    └── reset-db.ts
prisma/schema.prisma
```

---

## Pipeline

```
PDF File
  ↓
[PDF Extractor]        — extract text with coordinates → map to columns
  ↓
[Statement Normalizer] — rename keys → detect errors → correct → save to DB
  ↓
[Cluster Generator]    — embed descriptions → vector cluster (sim > 0.9)
  ↓
[LLM Categorizer]      — batch label clusters with category + merchant
  ↓
[Stats Aggregator]     — compute MonthlyStats + RecurringPatterns
  ↓
[Insight LLM]          — single LLM call → natural language InsightReport
```

---

## Database Models

| Model | Purpose |
|---|---|
| `NormalizedTransactions` | Valid transactions after normalization |
| `ExceptionTransactions` | Transactions that failed validation |
| `FinalTransactionData` | Transactions with description embeddings and cluster assignment |
| `Cluster` | Groups of similar transactions with category metadata |
| `MonthlyStats` | Aggregated per-month spending statistics |
| `RecurringPattern` | Detected recurring expenses (subscriptions, EMIs, bills) |
| `InsightReport` | LLM-generated natural language insight reports |
| `Goal` | User financial goals with feasibility analysis |

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

Create `.env.development` (see variables below):

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

### Run

```bash
npm run dev       # development with hot reload
npm run build     # compile TypeScript
npm run start     # run compiled build
npm run test:vec  # test vector search
```

---

## Insight Tiers

Insights are progressively richer as more statement history is available:

| Months of Data | Tier | Unlocks |
|---|---|---|
| 1 month | Tier 1 | Spending breakdown, cash flow, recurring expenses |
| 2–5 months | Tier 2 | Month-over-month trends, impulse spend detection |
| 6+ months | Tier 3 | Seasonal patterns, anomaly detection, category creep |

---

## Goal Types

- `save_amount` — save a target amount by a deadline
- `reduce_category` — cut a category's monthly spend
- `emergency_fund` — build N months of expenses as a buffer
- `debt_payoff` — pay off a loan faster
