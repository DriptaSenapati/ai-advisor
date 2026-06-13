# AI Financial Advisor

An AI-powered financial assistant that processes bank statement PDFs, categorizes transactions by merchant and spending type, detects recurring expenses, and generates natural language spending insights.

---

## Features

- **Multi-format PDF Support** — Works with both text-based and scanned/image-based bank statements, with automatic detection
- **Multi-bank Support** — Upload statements from multiple banks; each bank's transaction history is clustered and categorized independently
- **Transaction Categorization** — Groups similar transactions by merchant and labels them with category, confidence score, and rationale
- **Spending Insights** — Aggregates monthly statistics and generates natural language insights tailored to available data history
- **Recurring Expense Detection** — Identifies subscriptions, EMIs, and regular bills across months
- **Goal Advisor** — Analyzes spending patterns to assess financial goal feasibility and surface actionable suggestions
- **Extraction Quality Scoring** — Rates each uploaded statement with a confidence score based on validation results

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| AI Orchestration | LangChain + LangGraph |
| LLM | OpenAI GPT |
| Database | MongoDB Atlas (vector search) |
| ORM | Prisma v6 |
| Tracing | LangSmith |

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
```

### Database

```bash
npm run prisma:push
```

---

## Running

```bash
npm run dev        # development with hot reload
npm run build      # compile TypeScript
npm run start      # run compiled build
```

---

## Roadmap

- **REST API** — HTTP endpoints for statement upload, transaction queries, insight retrieval, and goal management
- **Web Frontend** — React dashboard for uploads, spending breakdowns, and goal tracking
- **Real-time Progress** — WebSocket updates during PDF processing
- **Goal Setting UI** — Define and track financial goals with AI-driven feasibility analysis
