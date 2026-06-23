# Project Rules (Job Application Tracker)

These project rules are authoritative for this codebase and take precedence over more general
conventions on conflict (specific > general). They encode the architecture this **single Next.js
fullstack app** commits to from day one.

- **Structure & conventions** → [architecture.md](./architecture.md) — Feature-Based ("Pattern B"),
  import boundaries, server/client boundary, folder-based naming, enforcement, `baseColumns`.
- **Server & data** → [server.md](./server.md) — Hono API, Drizzle + Neon, transactions, the DTO
  pattern, the immutable audit log, migrations.
- **Client & UI** → [client.md](./client.md) — RSC vs client split, TanStack Query + fetch + Zod,
  shadcn/Tailwind, forms.
- **Domain + API contract** → [domain.md](./domain.md) — the status set (`text` + Zod enum),
  transition model, idempotency, the `applications` data model, and the `/api/v1` surface.

## Where each concern lives

| Concern | Source of truth |
|---------|-----------------|
| **Structure, boundaries, naming, enforcement** | **[architecture.md](./architecture.md)** |
| **Hono API, Drizzle, transactions, audit log, DTOs** | **[server.md](./server.md)** |
| **RSC/client split, TanStack Query, shadcn** | **[client.md](./client.md)** |
| **Domain rules, status flow, endpoints** | **[domain.md](./domain.md)** |

Cross-cutting standards (applied throughout): the workflow order is Research → Plan → **TDD** →
Code Review → Commit; **≥80% test coverage**; immutability + small focused files; standard security
hygiene (validate inputs, no hardcoded secrets).

## Locked technical choices

Do not silently change; flag if a task requires deviating.

| Area | Choice |
|------|--------|
| App shape | **One unified Next.js (App Router) app** (no separate FE/BE) |
| Package manager | **npm** |
| UI | React + **shadcn/ui** + Tailwind; **TanStack Query**; **react-hook-form**; **dnd-kit** (kanban) |
| API | **Hono** mounted in-app (`app/api/[[...route]]/route.ts`, `hono/vercel`, Node runtime) |
| ORM / DB | **Drizzle** + **Neon Postgres** — `drizzle-orm/neon-serverless` (WebSocket `Pool`, for transactions) |
| Validation | **Zod** at every boundary (request DTOs + client forms) |
| Wire format | URI-versioned `/api/v1/...`; **camelCase end-to-end** (DB columns snake_case) |
| Auth | **None (single-user MVP)** — structure is auth-ready (audit `created_by` nullable; clean `userId` extension) |
| Tests | **Vitest** + React Testing Library (Playwright optional E2E) |
| Deploy | **One Vercel app** + **Neon** |
