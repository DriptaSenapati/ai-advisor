# AI Financial Advisor — Backend

An AI-powered financial analysis engine that processes bank statement PDFs, normalizes and categorizes transactions, detects recurring patterns in both expenses and income, and generates tier-based natural language insights — all orchestrated through a LangGraph pipeline.

---

## Features

### Statement Processing
- **Text and image PDF support** — automatic detection; text-based statements use coordinate-based column mapping, scanned pages fall back to GPT vision extraction
- **Multi-bank support** — statements from multiple banks are processed independently and merged into a unified transaction history with per-bank attribution
- **Extraction quality scoring** — each uploaded statement receives a confidence score and gap analysis based on balance continuity validation
- **Deduplication** — content hash prevents the same statement from being processed twice

### Transaction Normalization
- **LLM-driven key mapping** — maps any bank's raw column headers to a standard schema (`date`, `description`, `creditAmount`, `debitAmount`, `balance`)
- **Error detection and correction** — identifies merged PDF columns, malformed amounts, and balance summary rows; corrects or removes them automatically
- **Exception tracking** — rows that fail validation are preserved in a separate collection with full audit trail

### Transaction Categorization
- **Vector clustering** — transaction descriptions are embedded (`text-embedding-3-small`, 1536-dim) and grouped by cosine similarity (threshold 0.9) before any LLM call
- **Batch LLM categorization** — clusters are sent in batches of 30 to the LLM, which assigns `merchantName`, `payeeName` (for P2P transfers), `category`, `confidence`, and a rationale per cluster
- **12 predefined categories** — see [Transaction Categories](#transaction-categories)

### Insights Engine
- **Monthly stats aggregation** — computes income, expenses, savings rate, closing balance, category breakdown with MoM delta and 6-month rolling average, top merchants, weekday vs. weekend split, and time-of-month distribution for every month in the dataset
- **Tier-based insights** — the LLM receives a different subset of insight sections depending on data history: Tier 1 (1 month), Tier 2 (2–5 months), Tier 3 (6+ months)
- **Algorithmic duplicate detection** — same merchant + same exact amount appearing 2+ times in the same month is flagged before the LLM call; results are injected into the prompt as pre-computed facts
- **Key summary** — every report includes a `keySummary` with top risks (with ₹ amounts), positives, and a single most-impactful action item
- **Data quality warning** — if any month has >15% uncategorized spend, a warning is surfaced in the report

### Recurring Pattern Detection
- **Debit patterns** — subscriptions, SIPs, EMIs, utility bills, and P2P outflows detected when a merchant or payee appears in 3+ months with a consistent exact amount
- **Periodic income detection** — credits are grouped by source (merchant, payee, or unnamed cluster) across months, with IQR-based range computation (`rangeMin` / `rangeMax`) rather than exact-amount matching, since income varies month to month
- **Income classification** — each credit source is labeled: `salary`, `rental_income`, `freelance`, `investment_return`, `transfer_in`, or `unknown`
- **Active/inactive tracking** — patterns inactive for 2+ months are marked `isActive: false`

### Goal Advisor
- **Monte Carlo simulation** — runs 10,000 simulations over the user's historical surplus trend to compute goal probability at p10/p50/p90
- **Feasibility tiers** — `achievable` (≥70%), `stretch` (≥40%), `not_feasible` (<40%)
- **Goal types** — `save_amount`, `reduce_category`, `emergency_fund`, `debt_payoff`
- **LLM guidance** — generates up to 5 ranked suggestions by monthly saving impact and up to 3 quick wins, grounded in the user's actual recurring expenses and top categories

### Developer Experience
- **LangGraph checkpointing** — every pipeline node's state is persisted to SQLite; any node can be resumed from a checkpoint without re-running earlier stages
- **LangSmith tracing** — full pipeline traces for every run
- **Full recompute mode** — regenerate all monthly stats and insights across all months without uploading a new statement

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 + TypeScript (ESM, strict) |
| AI Orchestration | LangChain + LangGraph |
| LLM | OpenAI GPT-5.1 |
| Embeddings | OpenAI `text-embedding-3-small` (1536-dim) |
| Database | MongoDB Atlas (vector search) |
| ORM | Prisma v6 |
| PDF Extraction | mupdf |
| Schema Validation | Zod |
| Tracing | LangSmith |
| Checkpointing | `@langchain/langgraph-checkpoint-sqlite` |

---

## Pipeline Overview

```
Bank Statement PDF
       │
       ▼
pdfExtractorNode
  Detects text vs. image PDF
  Text: coordinate-based column extraction via mupdf
  Image: page-by-page GPT vision extraction
  Outputs: raw rows + extraction confidence score
       │
       ▼
statementNormalizerSubgraph
  1. keyMapperNode            — LLM maps raw headers → standard schema keys
  2. tranKeyNormToolNode      — renames keys, preserves tempId
  3. statementErrorFetchNode  — hardcoded ACTION_REMOVE / ACTION_INCORRECT rules
  4. statementCorrectionToolNode — LLM corrects flagged rows
  5. statementExceptionFinalNode — valid → NormalizedTransactions
                                   invalid → ExceptionTransactions
       │
       ▼
transactionCategorySubgraph
  1. clusterGeneratorToolNode — embeds descriptions → FinalTransactionData
                                vector cluster (sim > 0.9) → Cluster records
  2. llmCategoryNode          — batches of 30 clusters → LLM assigns
                                merchantName, payeeName, category, confidence
       │
       ▼
insightsAgentGraph (triggered per upload or on-demand full recompute)
  1. statsAggregatorToolNode  — aggregates FinalTransactionData → MonthlyStats
  2. recurringPatternToolNode — 5-pass detection:
                                Pass 1/2: debit merchants + payees (exact amount)
                                Pass 3/4: credit merchants + payees (IQR range)
                                Pass 5:   unnamed credit clusters (by clusterId)
  3. insightsNode             — assembles prompt with all stats, patterns, and
                                pre-computed duplicate suspects → LLM → InsightReport
       │
       ▼
goalAdvisorGraph (on-demand per goal)
  goalAnalysisNode — Monte Carlo simulation + LLM guidance
```

---

## Database Models

| Model | Description |
|---|---|
| `StatementMetadata` | One record per uploaded statement: bank name, period, content hash, processing status |
| `NormalizedTransactions` | Valid transactions post-normalization |
| `ExceptionTransactions` | Rows that failed validation (all fields nullable) |
| `FinalTransactionData` | Normalized transactions with embedding vectors and cluster assignment |
| `Cluster` | Merchant-level group: `merchantName`, `payeeName`, `category`, `confidence`, centroid vector |
| `MonthlyStats` | Aggregated per month: income, expenses, savings rate, category breakdown, top merchants, weekday/weekend split |
| `RecurringPattern` | Detected recurring debit and credit patterns with frequency, amount range, and classification |
| `InsightReport` | LLM-generated insight report: `insights` JSON + `rawStatsSnapshot` + `chartData` |
| `Goal` | User-defined financial goal with type, target amount, deadline, and simulation result |

---

## Transaction Categories

```
Food & Dining        Groceries              Transport
Shopping             Bills & Utilities      Health & Medical
Entertainment & Subscriptions              Education
Travel & Accommodation                     Finance & Investments
Transfers & Payments                       Other
```

**Category boundaries:**
- `Finance & Investments` — mutual funds, SIP, stocks, FD, insurance premiums (LIC, term, health)
- `Transfers & Payments` — UPI P2P, NEFT, IMPS, loan EMIs, credit card payments. Not insurance or SIP.
- `Bills & Utilities` — electricity, internet, mobile, gas, rent

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

Create vector search indexes in MongoDB Atlas on `FinalTransactionData.descriptionVector` (dimensions: 1536, similarity: cosine).

---

## Running

### Development

```bash
npm run dev          # nodemon + tsx with hot reload
npm run build        # compile TypeScript
```

### Pipeline Runner (Development)

The checkpoint runner lets you run any pipeline stage in isolation. State is persisted to `dev-checkpoints.sqlite` after every node, so you can resume from any point without re-running earlier stages.

**Full pipeline (PDF → categorize → insights):**
```bash
npm run dev:checkpoint
```

**Advisor graph only (PDF → normalize → categorize):**
```bash
npm run dev:checkpoint -- --graph=advisor
npm run dev:checkpoint -- --graph=advisor --from=normalize
npm run dev:checkpoint -- --graph=advisor --from=categorize
npm run dev:checkpoint -- --graph=advisor --from=llm
```

**Insights graph:**
```bash
# Per-statement (recomputes only months covered by that upload)
npm run dev:checkpoint -- --graph=insights --metadataId=<id>
npm run dev:checkpoint -- --graph=insights --metadataId=<id> --from=recurring
npm run dev:checkpoint -- --graph=insights --metadataId=<id> --from=insights

# Full recompute (all months across all banks, no upload needed)
npm run dev:checkpoint -- --graph=insights
npm run dev:checkpoint -- --graph=insights --from=recurring
npm run dev:checkpoint -- --graph=insights --from=insights
```

**Goal advisor:**
```bash
npm run dev:checkpoint -- --graph=goal --goalId=<id>
```

### Inspection Scripts

```bash
npx tsx src/scripts/inspect-insight.ts          # print latest InsightReport
npx tsx src/scripts/check-credit-patterns.ts    # list all recurring patterns
npx tsx src/scripts/inspect-goal.ts             # print latest GoalAdvisor output
npx tsx src/scripts/check-monthly-stats.ts      # print MonthlyStats summary
```

---

## Project Structure

```
src/
├── index.ts                             # Entry point
├── graph.ts                             # Graph registry
├── graph_state.ts                       # Zod state schemas
├── helpers/index.ts                     # parseTransactionDate, CATEGORIES
├── models/index.ts                      # LLM configs, prompt templates, Zod output schemas
├── graphs/
│   ├── statement_normalizer_subgraph.ts
│   ├── transaction_category_subgraph.ts
│   └── goal_advisor_graph.ts
├── modules/
│   ├── goalManager.ts                   # Monte Carlo simulation
│   ├── pdf/pdf_extractor.ts
│   ├── nodes/
│   │   ├── pdf_extractor_tool_node.ts
│   │   ├── state_normalizer_nodes/      # 5 normalization nodes
│   │   ├── transaction_category_nodes/  # cluster + LLM category nodes
│   │   ├── ai_insights_nodes/           # stats, recurring, insights LLM
│   │   └── goal_advisor_nodes/
│   └── graphTools/
│       ├── statement_normalizer_tools/
│       ├── transaction_category_tools/
│       └── insights_gen_tools/          # statsAggregatorTool, recurringPatternTool
├── scripts/
│   ├── checkpoint-runner.ts
│   ├── inspect-insight.ts
│   ├── check-credit-patterns.ts
│   ├── inspect-goal.ts
│   └── check-monthly-stats.ts
└── seeds/create_vector_search_index.ts
prisma/schema.prisma
```

---

## What's Next

### REST API (next milestone)

Express server exposing the existing pipelines as HTTP endpoints:

```
POST /statements/upload          → validate, store PDF, enqueue processing job
GET  /statements                 → list with status and confidence score
GET  /statements/:id             → metadata + gap analysis
GET  /statements/:id/transactions

GET  /insights                   → latest InsightReport
POST /insights/generate          → trigger full recompute

GET  /goals                      → active goals with feasibility
POST /goals
PATCH /goals/:id
DELETE /goals/:id
```

PDF processing (30–120s) runs in a BullMQ worker — never in-request. Progress events stream to clients via WebSocket.

### Frontend

React dashboard consuming the REST API:
- Upload flow with real-time processing progress
- Spending insights dashboard — health tiles, monthly timeline, 6 section cards with drill-down charts
- Recurring expenses view — debit obligations and periodic income sources
- Goal tracker — feasibility gauge, monthly target, ranked suggestions

### Multi-tenancy

Add `userId` (JWT-scoped) to `StatementMetadata`, `FinalTransactionData`, `InsightReport`, and `Goal`. Every DB query filters by user. PDFs stored in S3 per user.

### Infrastructure

```
Frontend (Vercel) → Express API + BullMQ worker → MongoDB Atlas
                    Redis (job queue + WebSocket pub/sub)
                    S3 (PDF storage)
```
