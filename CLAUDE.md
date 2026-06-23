# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **single-user Job Application Tracker**: track each application through an ordered status pipeline
(`Saved → Applied → Interviewing → Offer → Accepted / Rejected / Withdrawn`) and see the full history
of every stage change.

The load-bearing guarantee is an **immutable, append-only `audit_log`** written in the **same
transaction** as each mutation, so the status and its history can never drift or be tampered with.
**No auth** (single-user MVP, deliberate scope cut, structure is auth-ready).

Business rules are authoritative in **`.claude/rules/`** (table below). Do **not** invent domain
rules beyond what they state.

## Architecture (one unified fullstack app)

A **single Next.js (App Router) app** — Feature-Based ("Pattern B") — deployed as **one app on
Vercel** with **Neon Postgres**.

| Rule file | Covers |
|------|--------|
| [`.claude/rules/architecture.md`](.claude/rules/architecture.md) | Feature-Based structure, import boundaries, server/client boundary, naming, enforcement, `baseColumns` |
| [`.claude/rules/server.md`](.claude/rules/server.md) | Hono API, Drizzle + Neon, transactions, the DTO pattern, the audit log, migrations |
| [`.claude/rules/client.md`](.claude/rules/client.md) | RSC vs client split, TanStack Query + fetch + Zod, shadcn/Tailwind, forms |
| [`.claude/rules/domain.md`](.claude/rules/domain.md) | Status set, transitions, idempotency, the `applications` model, the `/api/v1` surface |

### The big picture that spans files

- **One app, two data paths.** **Server Components** fetch initial data by calling a
  feature's **service directly** (`await`, in-process, no HTTP self-hop), wrapped with TanStack
  `prefetchQuery` + `HydrationBoundary`. **Client Components** (the interactive board, mutations,
  forms) go through **hooks → `fetch` → the Hono HTTP API** (`/api/v1`). The **response DTO is the
  single contract** both paths return.
- **Request lifecycle (server):** Hono router (`/api/v1/...`) → `@hono/zod-validator` (request DTO)
  → **service** (business rules; multi-step writes in a `db.transaction()`; calls `recordAudit`) →
  **repository** (Drizzle) → response DTO (Zod schema + mapper) → `app.onError` formats thrown
  `HTTPException`s.
- **The audit log is the core guarantee.** Every mutation writes an immutable `audit_log` row in
  the **same transaction** (so status and history can never drift). Immutability is enforced at the
  DB level (a `BEFORE UPDATE OR DELETE` trigger + revoked grants). See `.claude/rules/server.md`.

## Tech stack (locked)

| Area | Choice |
|------|--------|
| Framework | **Next.js** (App Router) + React + TypeScript |
| UI | **shadcn/ui** + Tailwind; **react-hook-form**; **dnd-kit** (kanban board) |
| API | **Hono** mounted in-app at `app/api/[[...route]]/route.ts` (`hono/vercel`, Node runtime) |
| Data | **Drizzle ORM** + **Neon Postgres** (`drizzle-orm/neon-serverless` WebSocket `Pool`) |
| Data fetching | **TanStack Query** + `fetch` + shared **Zod** DTOs (not Hono RPC `hc`) |
| Validation | **Zod** (request DTOs via `@hono/zod-validator`; client forms) |
| Tests | **Vitest** + React Testing Library (Playwright optional for E2E) |
| Package manager | **npm** |
| Deploy | **One Vercel app** + **Neon** |

## Commands

> Scripts live in `package.json`. `db:generate`/`db:generate:custom` require an explicit `--name`
> (a wrapper script blocks drizzle's random migration names).

```bash
npm run dev                  # next dev
npm run build                # next build
npm run start                # next start (prod)
npm run lint                 # eslint (+ boundaries/structure rules)
npm run knip                 # unused files/exports/deps
npm run test                 # vitest run --project unit (hermetic; pre-commit gated)
npm run test -- <file>       # run a single unit test file
npm run test:integration     # vitest run --project integration (real Neon; *.integration.test.ts)
npm run db:generate -- --name <snake_case>          # drizzle-kit generate (name REQUIRED, no random names)
npm run db:generate:custom -- --name <snake_case>   # custom migration (e.g. the audit immutability trigger)
npm run db:migrate           # drizzle-kit migrate (uses the DIRECT/unpooled Neon URL)
```

Two env vars: `DATABASE_URL` (**pooled** `-pooler` Neon string, for the app) and
`DATABASE_URL_UNPOOLED` (**unpooled**, for migrations only — Neon/Vercel's standard name).

## Deployment

**One Vercel project + Neon.** The Next.js app (frontend + the in-app Hono API) deploys as a single
unit. Migrations (`drizzle-kit migrate` against `DATABASE_URL_UNPOOLED`) run as a **deploy/CI step**,
not at runtime. The Hono route handler runs on the **Node runtime** (`export const runtime =
'nodejs'`) — the `neon-serverless` driver needs it (edge is incompatible). The Neon database connection is
supplied via environment variables (see Commands).

## Gotchas

- **Transactions force the driver.** `drizzle-orm/neon-http` has **no interactive transactions**.
  We use `drizzle-orm/neon-serverless` (WebSocket `Pool`, `neonConfig.webSocketConstructor = ws`)
  because the audit log must be written atomically with each mutation.
- **`server-only` boundary.** Every Drizzle/service/repository/router/recordAudit file imports
  `server-only`; a `'use client'` file importing one is a **build error**. Client code reaches the
  server only via `fetch` to the Hono API.
- **Never use Server Actions as a TanStack Query `queryFn`** (they run serially → break concurrent
  refetch). Client data goes through the Hono API.
- **camelCase-only on the wire — input AND output** (Drizzle maps to snake_case DB columns). The
  API does not accept snake_case input; no snake_case response middleware.
- **String columns use `text`** (Postgres idiom), with length validated at the Zod boundary.
- **Status is `text` + a Zod enum, not `pgEnum`** — adding/removing a status is code-only (no
  `ALTER TYPE` migration). See `.claude/rules/domain.md`.
- **Folder-based naming, no type suffixes, no `I` prefix.** See `.claude/rules/architecture.md`.

## Workflow & rules precedence

- Follow the workflow in order: Research & Reuse → Plan → **TDD** → Code Review → Commit. The
  ≥80% coverage bar and test-first discipline apply.
- **The `.claude/rules/` files are authoritative** for structure, boundaries, and domain behavior;
  they override broader conventions on conflict.
- **Report mid-implementation decisions** before proceeding — never silently change scope.
