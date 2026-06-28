# MGX Investor Onboarding Assistant

AI-assisted KYC onboarding for institutional investors. The app guides an investor through identity, ownership, source-of-wealth/funds, and FATCA/PEP declarations; documents are uploaded, extracted to Markdown by Claude vision (tables preserved), classified into doc types, and run through a validation rule set before being persisted for compliance review.

Two surfaces:
- **`/onboarding`** — investor-facing chat. The agent drives the flow.
- **`/compliance`** — internal reviewer workspace. Sees red flags, names to screen, RFIs, audit trail.

## Stack

- **TanStack Start** (React 19 + Vite 8) — SSR React with server functions for the backend.
- **PostgreSQL 16** + **Drizzle ORM** — schema in [src/server/db/schema.ts](src/server/db/schema.ts), migrations in `drizzle/`.
- **TanStack Query** — client cache for case state.
- **Claude API** (`@anthropic-ai/sdk`) — document vision extraction, structured classification, and (optionally) the conversation agent.
- **Docker Compose** — Postgres + app, both containerized.
- **Playwright** + **Vitest** — E2E + unit testing.

## Architecture at a glance

```
Frontend (React)
  ConversationFeed dispatches typed AgentEvents
       │
       ▼
sendAgentEvent (server fn)
       │
       ▼
Agent.respond(case, event)  ◄── one of:
       │                       ├── RuleBasedAgent (default; deterministic)
       │                       └── LLMAgent       (Claude tool use; AGENT_TYPE=llm)
       ▼
AgentResponse { messages, patch, audit }
       │
       ▼
persistCase → Postgres → returned to client → cache splice
```

Independent pipeline for uploaded documents:
```
File → ./uploads/<caseId>/  (disk)
     → Claude vision (extraction.ts)  → Markdown with tables
     → Claude tool use (classification.ts)  → typed doc fields
     → Rule engine (validation.ts)  → checklist + red flags + extracted fields
     → Updated case persisted; client dispatches `documents_uploaded` to the agent for a wrap-up message
```

Key files:
- [src/lib/agent/types.ts](src/lib/agent/types.ts) — `AgentEvent`, `AgentResponse`, `Agent` interface
- [src/server/agent/rule-based.ts](src/server/agent/rule-based.ts) — default deterministic agent
- [src/server/agent/llm.ts](src/server/agent/llm.ts) — Claude-driven agent with tool use
- [src/server/agent/sendEvent.ts](src/server/agent/sendEvent.ts) — single server fn the UI dispatches into
- [src/server/extraction.ts](src/server/extraction.ts) / [classification.ts](src/server/classification.ts) / [validation.ts](src/server/validation.ts) — upload pipeline
- [src/server/uploads.ts](src/server/uploads.ts) — orchestrates the pipeline + persists
- [src/server/anthropic-errors.ts](src/server/anthropic-errors.ts) — retry on transient + typed friendly errors

## Prerequisites

- Node 22 (or Bun)
- Docker Desktop with Compose v2
- An Anthropic API key

## Setup

```sh
cp .env.example .env
# edit .env: paste your ANTHROPIC_API_KEY
```

Then pick one of the two run modes below.

## Run mode A — full docker (recommended)

Brings up Postgres + app together. Best for "just try it":

```sh
docker compose up -d --build
```

App at http://localhost:3000. Migrations run automatically on container start. To follow logs: `docker compose logs -f app`. To stop: `docker compose down`. To stop and drop the DB volume: `docker compose down -v`.

## Run mode B — local dev

Just Postgres in docker, app on host with hot reload:

```sh
docker compose up -d postgres
npm install
npm run db:migrate
npm run dev          # http://localhost:5173 (or next free port)
```

## Configuration

| Env var               | Default                                          | Notes |
|-----------------------|--------------------------------------------------|-------|
| `DATABASE_URL`        | `postgresql://ioa:ioa@localhost:5432/ioa`        | Inside docker compose this becomes `postgres:5432`. |
| `UPLOAD_DIR`          | `./uploads`                                      | Volume-mounted in docker. |
| `ANTHROPIC_API_KEY`   | —                                                | Required for uploads and the LLM agent. |
| `ANTHROPIC_MODEL`     | `claude-opus-4-7`                                | Override to use sonnet/haiku for cost tuning. |
| `AGENT_TYPE`          | `rule`                                           | `rule` for the deterministic agent, `llm` for the Claude-driven one. |
| `PORT`                | `3000`                                           | Server port (docker maps to host 3000). |
| `OPENSANCTIONS_BASE_URL` | `https://api.opensanctions.org` | Override for self-hosted Yente. The screening service uses this for sanctions/PEP lookups. |

## Tests

```sh
npm test               # vitest — unit tests (39 currently)
npm run test:e2e       # playwright — uploads a real PDF through the full pipeline
```

The E2E tests target a running stack at `http://localhost:3000`. Start the docker stack first, or set `PLAYWRIGHT_BASE_URL` to point at a dev server.

> **Cost note:** Each E2E run makes ~2 Claude API calls per upload (~$0.005). The unit tests are pure functions and free.

## NPM scripts

| Script           | Purpose                                                          |
|------------------|------------------------------------------------------------------|
| `dev`            | Vite dev server with HMR                                         |
| `build`          | Production build → `dist/client` + `dist/server/server.js`       |
| `start`          | Run `dist/server/server.js` with the static-file wrapper          |
| `db:generate`    | Generate a new Drizzle migration from `schema.ts`                |
| `db:migrate`     | Apply migrations (uses `drizzle-kit migrate`)                    |
| `db:seed`        | Insert empty case shells (idempotent)                            |
| `db:studio`      | Open Drizzle Studio against the local DB                         |
| `test`           | Vitest, one-shot                                                 |
| `test:watch`     | Vitest in watch mode                                             |
| `test:e2e`       | Playwright E2E suite                                             |
| `lint` / `format`| ESLint / Prettier                                                |

## Switching to the LLM agent

```sh
AGENT_TYPE=llm
```

What changes:
- Every agent dispatch goes to Claude with the system prompt from `LLMAgent.describeRole()` and three tools (`emit_message`, `update_case`, `add_audit_event`).
- The investor's chat sounds different (and varies). The deterministic state machine is gone.
- Total turn latency goes up by 2–10s depending on `ANTHROPIC_MODEL`, but **the user sees each message land individually** as the LLM emits tool calls — see Streaming below.
- Each turn costs ~$0.003–0.02. Watch your spend.

The frontend, the database schema, the validation pipeline, and the Playwright tests are **unchanged** when you flip the flag. The agent's contract is what's behind `src/lib/agent/types.ts`.

## Streaming

The frontend dispatches every event through [src/lib/agent/stream-client.ts](src/lib/agent/stream-client.ts) → [src/server/agent/streamEvent.ts](src/server/agent/streamEvent.ts) → `Agent.streamRespond()`. The server returns a Server-Sent-Events stream of `StreamChunk`s:

- `message_complete` — one agent message ready to render.
- `patch` — structured case-state change.
- `audit` — one audit entry.
- `done` — terminal event with the persisted case.
- `error` — terminal event.

The rule-based agent emits all chunks in one batch (it's synchronous). The LLM agent emits a `message_complete` chunk every time Claude finishes an `emit_message` tool call — so the user sees each agent message appear as it's generated, not after the whole turn finishes. While streaming, a typing indicator renders at the bottom of the conversation.

The wire format on the request side matches TanStack Start's server-fn protocol (seroval-serialized `{data: ...}` body + `x-tsr-serverFn: true` header), so CSRF and validation work as for any other server fn.

## Extending

### Add a new validation rule

Edit [src/server/validation.ts](src/server/validation.ts). Each rule is a branch inside `validateDocument()` keyed by `doc.document_type`. To add a new check: extend the relevant switch case to push a `RedFlag` or update a `ChecklistItem`. Add a corresponding test to [src/server/validation.test.ts](src/server/validation.test.ts).

### Add a new document type

1. Add the type literal to `DOCUMENT_TYPES` in [src/server/classification.ts](src/server/classification.ts).
2. Add a `humanLabelFor` mapping for the UI label.
3. Add a `case` branch in `validateDocument()` to define what checklist item + flags it produces.

### Add a new conversation flow step

If you're on the rule-based agent, edit [src/server/agent/rule-based.ts](src/server/agent/rule-based.ts) — add a branch to the `respond()` switch + (likely) a new `AgentEvent` variant in [src/lib/agent/types.ts](src/lib/agent/types.ts).

If you're on the LLM agent, the system prompt and tool surface in [src/server/agent/llm.ts](src/server/agent/llm.ts) drive behavior. Tighten the prompt; add new tool fields as needed.

### Add a new server fn

Drop it in `src/server/*.ts`. Export the result of `createServerFn(...).validator(...).handler(...)`. Import directly from client code — TanStack Start compiles the body to a server RPC stub on the client side.

## Notes & known limitations

- **No auth.** Anyone with the URL can read/write any case.
- **Local disk storage** for uploaded files. Swap for S3/R2 by replacing the writes in [uploads.ts](src/server/uploads.ts).
- **Sanctions/PEP screening** uses the public [OpenSanctions](https://www.opensanctions.org/) API — real sanctions + PEP data, no auth required for moderate use. Run via the **Run screening** button on the Compliance → Screening tab; matches surface with their datasets (e.g. `us_ofac_sdn`, `eu_fsf`) and topics (`sanction`, `role.pep`, `crime`, `wanted`). For higher throughput or air-gapped deployments, point `OPENSANCTIONS_BASE_URL` at a self-hosted [Yente](https://www.opensanctions.org/docs/yente/) instance.
- **API key in `.env`** — gitignored, but be careful with backups and `docker compose down -v`.
- **CSRF protection** is the default on server fns. Browser usage works; direct curl needs `Origin` + `x-tsr-serverFn: true` headers.
- **`npm audit` shows 4 moderate vulnerabilities** in the `@esbuild-kit/esm-loader` chain pulled by `drizzle-kit`. These are dev-only (a malicious website can make cross-origin requests to a running `drizzle-kit studio` instance) and **do not affect production** — the production server uses `drizzle-orm/node-postgres/migrator` directly via [migrate.mjs](migrate.mjs) and never loads `drizzle-kit`. The latest `drizzle-kit@0.31.10` still ships the same dep chain; we accept the dev-only risk until upstream fixes it.

## Useful Postgres queries

```sh
docker exec -it ioa-postgres psql -U ioa -d ioa

# inspect cases
select id, key, current_stage, progress_pct,
       jsonb_array_length(coalesce(data->'conversation','[]'::jsonb)) as msgs,
       jsonb_array_length(coalesce(data->'uploadedDocuments','[]'::jsonb)) as docs,
       jsonb_array_length(coalesce(data->'checklist','[]'::jsonb)) as items
from cases order by key;

# look at recent uploads
select file_name, classified_as, extraction_status, byte_size
from uploaded_documents order by received_at desc limit 10;

# tail the audit log
select at, actor, type, detail from audit_events order by at desc limit 20;
```
