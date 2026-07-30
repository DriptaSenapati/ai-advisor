# AI Financial Advisor — Backend

An AI-powered financial analysis engine that processes bank statement PDFs, normalizes and categorizes transactions, detects recurring patterns in both expenses and income, flags anomalies, runs Monte Carlo goal simulations, and generates tier-based natural language insights — orchestrated through LangGraph and exposed as a multi-tenant REST API backed by a BullMQ job queue.

It runs as **two processes**: an Express API (`src/api/server.ts`) and a BullMQ worker (`src/worker.ts`). The API never runs a pipeline in-request — it enqueues and returns `202`; the worker executes and publishes progress over Redis pub/sub, which the API relays to clients as Server-Sent Events.

The React client that consumes it lives in the sibling `ai_advisor_ui/` project.

---

## Features

### API & Authentication
- **REST API** at `/api/v1` with a consistent envelope (`{ success, data, meta? }` / `{ success, error: { code, message, details? } }`), OpenAPI docs at `/api/docs`
- **better-auth** — email/password plus optional Google OAuth, session cookies for browsers and bearer tokens for scripts, scoped across subdomains so SSE can authenticate
- **Multi-tenancy end to end** — every statement, transaction, cluster, aggregate, report and goal carries `userId`, and every query filters on it
- **Async job flow with SSE progress** — one user-scoped event stream carries every running job, each frame carrying the statement's full status projection, plus a snapshot on connect so a reconnecting tab resynchronises
- **Rate limits** per operation (upload 10/h, process 10/h, insights 5/h, goal analysis 10/h)

### Subscription Plans
- **Three plans** — First light (free) / Glow / Radiant — with the catalog, feature flags and limits in one typed object (`src/config/plans.ts`)
- **Served publicly** at `GET /plans`, so the marketing site renders prices and its comparison matrix from the very object that enforces them
- **Enforced server-side** — `requireFeature()` returns `403 PLAN_REQUIRED` naming the plan that would allow it; upload and goal quotas are checked before a job is enqueued
- **Response projection** — `/insights/latest` is *cut down* rather than refused for mid-tier plans, so one endpoint serves both the summary band and the full report without the withheld sections ever crossing the wire
- **Priority processing** — paid plans' jobs are enqueued ahead of free ones

### Statement Processing
- **Text and image PDF support** — automatic detection; text-based statements use coordinate-based column mapping, scanned pages fall back to GPT vision extraction
- **Multi-bank support** — statements from multiple banks are processed independently and merged into a unified transaction history with per-bank attribution
- **Extraction quality scoring** — each uploaded statement receives a confidence score and gap analysis based on balance continuity validation
- **Deduplication** — content hash prevents the same statement from being processed twice
- **The Illuminate gate** — uploading only *reads* the statement. Nothing is normalized, embedded, clustered or categorized until the user approves what was extracted, so they can see the bank, period and row count and back out before the expensive half runs. Every answer is written to an append-only decision log
- **Password recovery** — a statement blocked on a PDF password keeps its upload, so the retry is the password alone: same id, same content hash, no re-upload

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
- **Bounded recommendations** — up to 4 ranked actions, each with a ₹ monthly impact deterministically capped at the median spend of the category it targets, so a one-off transfer cannot be sold as a recurring saving
- **Recovery projection** — cumulative baseline vs. with-plan paths with a p10–p90 band, precomputed per recommendation

### Anomaly Detection
- **Seven deterministic detectors**, no LLM — duplicate charges, merchant outliers, category-spike contributors, fees and interest, subscription price rises, balance risk, and large opaque transfers
- **Every finding is a real row** with a transaction id, date and amount, so flags are sortable, filterable and linkable; the LLM only narrates them, joined on a closed `kind` enum rather than by array position
- **Idempotent** — a dedupe key means re-running the pipeline on every upload never multiplies findings

### Payee Canonicalisation
- **Token-based name matching** — `SENAPATI D`, `SENAPATID` and `Dripta Senapati` are recognised as one person despite transposed and abbreviated tokens, with segmentation against a per-user vocabulary and three guards against merging distinct people
- **Provenance kept** — every merge is recorded, so the UI can show which spellings were folded into a name and a wrong merge stays discoverable

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
| API | Express 5 (helmet, cors, express-rate-limit) |
| Auth | better-auth (Prisma-backed, session cookies + bearer) |
| Job queue | BullMQ + ioredis; Redis pub/sub for SSE progress |
| AI Orchestration | LangChain + LangGraph |
| LLM | OpenAI GPT-5.1 |
| Embeddings | OpenAI `text-embedding-3-small` (1536-dim) |
| Database | MongoDB Atlas (vector search) |
| ORM | Prisma v6 |
| PDF Extraction | mupdf |
| Uploads | multer (disk, 20 MB limit) |
| Schema Validation | Zod |
| API docs | swagger-jsdoc + swagger-ui-express (`/api/docs`) |
| Queue dashboard | Bull Board (`/admin/queues`, Basic Auth) |
| Tracing | LangSmith |
| Checkpointing | `@langchain/langgraph-checkpoint-sqlite` |

---

## Pipeline Overview

The pipeline runs in **two phases with a user decision between them** — the Illuminate gate. Uploading extracts and stops; nothing expensive runs until the user approves.

```
═══ PHASE 1 ════════════════════════════════════════════════
Bank Statement PDF  (POST /statements/upload → 202, pdf.extract enqueued)
       │
       ▼
pdfExtractorNode
  Detects text vs. image PDF
  Text: coordinate-based column extraction via mupdf
  Image: page-by-page GPT vision extraction
  Outputs: raw rows + extraction confidence score
       │
       ▼
  ══ THE GATE ══  job ends. The uploaded file is deleted. Nothing else runs.
       │          The user sees bank, period and row count, and decides.
       │
       │  POST /statements/:id/process   (or /decline, which enqueues nothing)
       ▼
═══ PHASE 2 ════════════════════════════════════════════════
rehydrateNode — restores the state phase 1 held in memory
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
insightsAgentGraph (auto-triggered per upload, or on-demand full recompute)
  1. payeeCanonicalizerTool   — folds spelling variants of one person into a
                                canonical name; runs first because everything
                                below reads the field it rewrites
  2. statsAggregatorToolNode  — aggregates FinalTransactionData → MonthlyStats
  3. recurringPatternToolNode — 5-pass detection:
                                Pass 1/2: debit merchants + payees (exact amount)
                                Pass 3/4: credit merchants + payees (IQR range)
                                Pass 5:   unnamed credit clusters (by clusterId)
  4. redFlagDetectorToolNode  — 7 deterministic Mongo detectors → TransactionFlag
                                (after recurring, which one detector reads;
                                 before insights, which narrates the findings)
  5. insightsNode             — assembles prompt with all stats, patterns, flags
                                and pre-computed duplicate suspects → LLM
                                → InsightReport + chartData + recovery projection
       │
       ▼
goalAdvisorGraph (on-demand per goal)
  1. goalIntentGateNode — LLM screens and classifies the free-text goal.
                          A rejection deletes the row; nothing refused is kept
  2. goalAnalysisNode   — Monte Carlo simulation + LLM guidance
```

Progress is published at **every node boundary** and relayed to the client over SSE, so a run is never silent for minutes at a time.

---

## Database Models

| Model | Description |
|---|---|
| `User` · `Session` · `Account` · `Verification` | better-auth identity tables (plain string ids, not ObjectId) |
| `Subscription` | Which plan a user is on. **A missing row means the free plan**, so there is nothing to backfill |
| `StatementMetadata` | One record per uploaded statement: bank name, period, content hash, four status fields, gate decision |
| `StatementGateDecision` | Append-only log of every answer at the Illuminate gate. Deliberately *not* cascaded by delete — an audit log a delete erases is not an audit log |
| `NormalizedTransactions` | Valid transactions post-normalization |
| `ExceptionTransactions` | Rows that failed validation (all fields nullable) |
| `FinalTransactionData` | Normalized transactions with embedding vectors and cluster assignment |
| `Cluster` | Merchant-level group: `merchantName`, `payeeName`, `category`, `confidence`, centroid |
| `PayeeAlias` | Which payee spellings were folded into which canonical name |
| `MonthlyStats` | Aggregated per month: income, expenses, savings rate, category breakdown, top merchants, weekday/weekend split |
| `RecurringPattern` | Detected recurring debit and credit patterns with frequency, amount range, and classification |
| `TransactionFlag` | One row per anomaly finding, joined to the transaction it points at |
| `InsightReport` | LLM-generated insight report: `insights` JSON + `rawStatsSnapshot` + `chartData` |
| `Goal` | User-defined financial goal with type, target amount, deadline, and simulation result |

---

## Subscription Plans

| | First light | Glow | Radiant |
|---|---|---|---|
| Statement uploads | **1** | ∞ | ∞ |
| Spending dashboard · categories · statement history | ✓ | ✓ | ✓ |
| Cash-flow analysis · key summary | — | ✓ | ✓ |
| Recurring detection · anomaly flags · multi-bank | — | ✓ | ✓ |
| Trend vs. your own baseline | — | — | ✓ |
| Full AI report · goal simulation · priority processing | — | — | ✓ |

`src/config/plans.ts` is the single source of truth — the catalog, the feature keys, the limits and the marketing comparison rows in one typed object. `GET /plans` serves it unauthenticated so the pricing page renders from the very thing that enforces the rules.

Three things worth knowing before changing any of it:

- **The field is `plan`, never `tier`.** `InsightReport.tier` already means data depth (1/2/3, from how many months exist) and decides which prose sections the LLM populates.
- **Gating is access-time, never pipeline-time.** The pipeline computes everything for every plan, so an upgrade fills every screen with no reprocessing — which is also what the pricing FAQ promises. The upload quota is what actually bounds the cost of a free account.
- **BullMQ's `priority: 0` means "no priority", and such jobs run *before* prioritized ones.** So every `queue.add` call site passes an explicit non-zero value; one that forgets does not merely lose the benefit, it outranks the paid plans.

```bash
npm run check:plans                              # 18 assertions, read-only
npm run grant:plan -- --email=x@y.z --plan=glow  # dry run; --yes to write
```

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

- Node.js 22+
- MongoDB Atlas cluster with vector search enabled
- Redis (a container is started for you by `npm run dev:all`)
- OpenAI API key

### Install

```bash
npm install
```

### Environment

Create `.env.development` (and `.env.production` for a production run). **Never commit these.**

```env
# Core
OPENAI_API_KEY=
DATABASE_URL=                          # MongoDB Atlas connection string
REDIS_URL=redis://localhost:6379

# Auth — BETTER_AUTH_SECRET is required; auth throws at import time without it
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3001  # public origin of this API; its scheme
                                       # decides the cookie's Secure flag
WEB_ORIGINS=http://localhost:3000      # comma-separated browser origins (CORS +
                                       # better-auth trustedOrigins). No wildcard.
COOKIE_DOMAIN=                         # e.g. .example.com in production.
                                       # Leave EMPTY on localhost.
GOOGLE_CLIENT_ID=                      # optional — omit both to disable Google
GOOGLE_CLIENT_SECRET=                  # sign-in cleanly rather than mid-redirect

# Vector search
TRAN_VECTOR_INDEX_NAME=transaction_vector_index
VECTOR_DIMENSIONS=1536

# Pipeline tuning
TEMP_ID_KEY=tempId
BATCH_SIZE=40
CHUNK_SIZE=20
PDF_PASSWORD=
PDF_PASSWORD_HDFC=

# Ops
PORT=3001
BULL_BOARD_USER=                       # CHANGE BOTH IN PRODUCTION — they default
BULL_BOARD_PASSWORD=                   # to admin/admin123
SKIP_DB_BOOTSTRAP=                     # true to skip the startup db push (dev only)

# Tracing
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=ai_advisor
```

Every entry point must `import "./envConfig.js"` rather than `dotenv/config` — the latter unconditionally loads a file literally named `.env`, ignoring `NODE_ENV`.

### Database

Schema sync and the Atlas vector index are **run automatically on every API start** (`src/config/bootstrap-db.ts`), before the port is bound — so an API that cannot guarantee its own schema never answers requests. Both steps are idempotent.

To do it by hand:

```bash
npm run prisma:push
```

The one vector search index is on `FinalTransactionData.descriptionVector` (1536-dim, cosine) **with `userId` declared as a filter field** — without that declaration, one tenant's transactions consume another's candidate budget.

---

## Running

### Development

The system runs as two processes (Express API + BullMQ worker) against Redis. One command starts all three:

```bash
npm run dev:all      # Redis + API + worker, one terminal, one Ctrl+C
```

It brings Redis up first (skipping Docker entirely if something already answers on `REDIS_URL`), then runs the API and worker under `concurrently` with `api`/`worker` line prefixes. Redis is a detached container and stays up after Ctrl+C — `npm run redis:down` stops it.

Individually, if you'd rather have separate terminals:

```bash
npm run dev:redis    # just the Redis gate
npm run dev:api      # Express API server  (src/api/server.ts)
npm run dev:worker   # BullMQ worker       (src/worker.ts)

npm run dev          # legacy CLI entry point (src/index.ts)
```

Note that `dev:api` and `dev:worker` run under nodemon, so stopping the backend means killing the whole process tree — killing just the server leaves nodemon alive to restart it.

### Containers

The whole backend, in the shape it deploys in:

```bash
npm run docker:up      # redis + api + worker, all with restart: unless-stopped
npm run docker:logs    # follow api + worker
npm run docker:down    # stop and remove all three
```

`dev:all` and `docker:up` both bind port 3001 — use one or the other.

One image, two entry points — compose selects between them with `command:`. `prisma generate` runs inside the build (the client is platform-specific, so a host-generated one is useless in a Linux container), and `api`/`worker` share the `uploads` volume at the same mount path because the job payload passes an absolute file path between them.

### Production (without containers)

```bash
npm run build        # tsc + copy Prisma's native query engine into build/
npm run start:all    # API + worker under one supervisor
```

Or, preferably, run the two as independent services:

```bash
npm run start:api
npm run start:worker
```

Two services is the recommended topology — the API must stay responsive while the worker runs multi-minute PDF pipelines, and they warrant different scaling and restart policies. `start:all` uses `--kill-others`, so either process exiting takes the other down for the supervisor to restart; that's the right behaviour for a single-VM deploy and the wrong one where a real orchestrator is available.

`concurrently` and `cross-env` are runtime `dependencies` rather than dev ones, so that `npm ci --omit=dev` still yields a tree the start scripts can run in.

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

### Inspection & Ops Scripts

```bash
npm run check:plans                             # plan catalog invariants + the
                                                # /insights/latest projection
npm run grant:plan -- --list                    # who is on which plan
npm run grant:plan -- --email=x@y.z --plan=glow # dry run; add --yes to write
npm run check:flags                             # assert flag dedupe-key uniqueness
npm run check:payees                            # dry-run the payee merge; --sweep
                                                # to compare thresholds
npm run merge:payees                            # apply it out of band
npm run repair:categories                       # classify clusters left uncategorised
npm run verify:gate -- assets/x.pdf             # drive the Illuminate gate and assert
npm run inspect:gate                            # gate status fields + decision log
npm run watch:progress                          # tail the SSE pub/sub channel

npx tsx src/scripts/inspect-insight.ts          # print latest InsightReport
npx tsx src/scripts/check-credit-patterns.ts    # list all recurring patterns
npx tsx src/scripts/inspect-goal.ts             # print latest GoalAdvisor output
npx tsx src/scripts/check-monthly-stats.ts      # print MonthlyStats summary
```

Destructive helpers, all scoped and refusing to run without `--yes`:

```bash
npm run wipe:app-data -- --yes    # empty every app collection, keep users/sessions
npm run drain:queues              # empty pdf.extract + pdf.process
npm run clean:verify              # remove only the verification user's rows
```

There is no test runner in this project; verification convention is a `check:*` / `verify:*` script that drives the real services and asserts.

---

## Project Structure

```
src/
├── index.ts                             # Legacy CLI entry point
├── worker.ts                            # BullMQ worker — runs every pipeline
├── auth.ts                              # better-auth configuration
├── graph.ts                             # Graph registry
├── graph_state.ts                       # Zod state schemas
├── config/
│   ├── plans.ts                         # Plan catalog — features, limits, comparison rows
│   ├── origins.ts                       # WEB_ORIGINS + COOKIE_DOMAIN
│   └── bootstrap-db.ts                  # startup db push + vector index
├── api/
│   ├── server.ts                        # app.listen()
│   ├── app.ts                           # Express app: helmet, cors, auth mount, routes
│   ├── response.ts                      # ok()/created()/accepted() envelope helpers
│   ├── errors.ts                        # ApiError + subclasses (incl. PlanRequiredError)
│   ├── routes/                          # statements, insights, goals, transactions,
│   │                                    #   recurring, users, plans
│   ├── controllers/                     # thin req/res → service delegation
│   ├── services/                        # business logic, Prisma queries, queue enqueue
│   ├── validators/                      # Zod schemas per route group
│   ├── middleware/                      # authenticate, entitlement, upload,
│   │                                    #   rateLimiter, validate, errorHandler
│   └── sse/manager.ts                   # per-user SSE registry, Redis subscribe → write
├── queue/                               # queue definitions + progress publishing
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
├── scripts/                             # checkpoint-runner, grant-plan, check-plans,
│                                        #   verify-gate, repair-categories, and ~20 more
└── seeds/create_vector_search_index.ts
prisma/schema.prisma
```

---

## REST API

Base path `/api/v1`. Everything except `/health` and `/plans` requires a session cookie or `Authorization: Bearer <token>`. Full OpenAPI at `/api/docs`.

```
GET    /health                            no auth
GET    /plans                             no auth — the plan catalog + comparison matrix

POST   /statements/upload                 multipart; extracts only (phase 1) → 202
POST   /statements/:id/process            the Illuminate gate: authorise phase 2 → 202
POST   /statements/:id/decline            record a refusal; enqueues nothing
POST   /statements/:id/unlock             retry a password-blocked PDF, password only
GET    /statements                        ?page&limit&bankName&status&gate
GET    /statements/:id                    · /status · /transactions
GET    /statements/:id/progress           SSE — user-scoped, snapshot on connect
DELETE /statements/:id

GET    /insights/latest                   projected by plan — see Subscription Plans
GET    /insights · /insights/:id
GET    /insights/flags · /insights/flags/summary
POST   /insights/generate                 full recompute, or scoped to one statement

GET    /goals · /goals/:id                POST · PATCH · DELETE
POST   /goals/:id/analyze                 Monte Carlo run → 202, watch SSE

GET    /recurring · /recurring/summary · /recurring/:id/transactions

GET    /transactions                      · /summary · /categories · /categories/:category
GET    /transactions/merchants · /payee-aliases · /rhythm

GET    /users/me                          · /me/entitlements
POST   /users/me/avatar                   · DELETE /me/avatar
```

---

## Deployment

Three hosts on one registrable domain, so the session cookie stays same-site — which is what keeps SSE authenticated, since `EventSource` cannot send an `Authorization` header:

```
example.com       marketing site  ─┐
app.example.com   signed-in app   ─┴─ one Next.js deployment (ai_advisor_ui)
api.example.com   this Express API + BullMQ worker

                  ↓
        MongoDB Atlas · Redis · local disk for in-flight uploads
```

`COOKIE_DOMAIN` must be the registrable domain with a leading dot (`.example.com`), and both web origins must appear in `WEB_ORIGINS`. Keep those in sync with the three `NEXT_PUBLIC_*` values in the frontend or the cookie is silently dropped.

Uploaded PDFs land on local disk and are **deleted as soon as extraction finishes** — the only exception is a statement blocked on its password, whose bytes are held so the retry needs nothing but the password. S3 storage and account-number encryption at rest are not implemented.

---

## Known Gaps

| Severity | Issue |
|---|---|
| 🟡 | `StatementMetadata.contentHash` is unique **globally**, not per user — two users holding the same statement PDF collide, and the second sees an id they cannot access. Should be `@@unique([userId, contentHash])` |
| 🟡 | Vector-search readiness is awaited with a hardcoded `setTimeout` retry loop in `cluster_generator_tool.ts` |
| 🟡 | Bull Board defaults to `admin`/`admin123` when its env vars are unset — override in production |
| 🟢 | No cross-bank duplicate detection for the same real-world transaction appearing in two statements |
| 🟢 | No email verification flow, which is why a password account cannot link a Google identity (`account_not_linked`). This is better-auth's safe default, deliberately not overridden |
| 🟢 | `StatementMetadata.accountNumber` is stored in plaintext |
| 🟢 | Billing is not integrated — a plan is assigned (`npm run grant:plan`), not purchased |
