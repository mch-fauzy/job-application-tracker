# Job Application Tracker — Design Spec (PRD)

- Date: 2026-06-22
- Status: approved (brainstorm) → ready for writing-plans
- Authoritative rules: [`.claude/rules/domain.md`](../../../.claude/rules/domain.md) ·
  [`architecture.md`](../../../.claude/rules/architecture.md) ·
  [`server.md`](../../../.claude/rules/server.md) · [`client.md`](../../../.claude/rules/client.md)
- Research backing: [`docs/research.md`](../../research.md)

This spec is the design of record. The `.claude/rules/` files are the *enforceable* form of it; where
they go deeper (boundaries, the audit log, the DTO pattern) this spec points rather than duplicates.

## 1. Problem & who it's for

A job seeker juggles many applications across many companies, each at a different stage, over weeks.
Spreadsheets and Notion templates get unwieldy past ~50 rows, and the incumbents (Teal, Huntr) have
bloated into paywalled AI-resume suites (Teal+ ~$29/mo; Huntr free caps at 40 jobs). **Who:** a single
job seeker. **The one job:** *track every application through an ordered status pipeline and see the
full, immutable history of when each changed stage.* See [research.md](../../research.md) §1.

## 2. What's out there, and why build anyway

Focused, free, web-first pipeline tracking is the gap the incumbents left when they pivoted to paid
resume tooling. We are deliberately *small*: one board, one history, no AI upsell. The engineering
signal is an **immutable audit trail written transactionally with each change** — load-bearing here
(a pipeline tracker *is* state + history), which is exactly when that architecture reads as judgment
rather than over-engineering ([research.md](../../research.md) §3).

## 3. Scope

**In (MVP):** create / edit / soft-delete applications; change status by **drag** (between active
columns) or **card menu**; an **Archived** view for terminal outcomes with **Reopen**; a
per-application **audit timeline**; **infinite scroll** per column; seed data; the root README.

**Out / deferred (documented as README "next steps"):** auth (the **#1** next step), search /
filter / sort, manual intra-column ordering, list virtualization, normalized companies, a modal
(intercepting-routes) detail view, a hard terminal-lock / reopen-confirm, bulk actions, multiple
boards.

**Assumptions:** single user; tens-to-low-hundreds of *active* cards (so no virtualization, no
search needed at MVP); a job search is a pipeline (board UI fits); dates like "applied on" are
recoverable from the timeline (so no separate date columns).

## 4. Architecture (one unified app)

A single Next.js (App Router) app, Feature-Based "Pattern B", with an in-app Hono API, Drizzle, and
Neon, on one Vercel deploy. **Two data paths, one DTO contract:** Server Components prefetch by
calling a feature **service directly** (`prefetchQuery` + `HydrationBoundary`); Client Components go
through **hooks → `fetch` → `/api/v1`**. Per-feature layering: `api/` (Hono router) → `services/`
(business rules + transactions + `recordAudit`) → `repositories/` (Drizzle). Full detail in the
rules files; this spec does not restate boundaries or naming. API
versioning is folder-based (`api/v1/`, `dtos/v1/`; services/repos/db un-versioned). We also mirror
`mind-id-p3mo` where it does not fight the fullstack: message-constant factories, a flat `config.ts`,
and a status-table `app.onError`; the wire stays camelCase-only (the shared-DTO benefit).

## 5. Domain model (recap — authoritative in `domain.md`)

- **Status set:** `saved · applied · interviewing · offer` (active, on the board) +
  `accepted · rejected · withdrawn` (terminal, archived). A TS `const` + Zod enum; the DB column is
  **`text`** (no `pgEnum`/CHECK) so a new status is code-only.
- **Transitions:** flexible, enum-validated, any → any (no strict FSM). **Idempotent** no-op when the
  target equals the current status (no mutation, no audit row).
- **Archived is derived** (`status ∈ terminal`) — no `isArchived` column.

## 6. Data model

`applications` spreads `baseColumns` + `softDelete`. Columns: `company` (text, req), `role` (text,
req), `status` (text, default `saved`), `jobUrl` (text null), `notes` (text null). `baseColumns`
carries `id`, `createdAt`/`createdBy`, `updatedAt`/`updatedBy`; `softDelete` carries
`deletedAt`/`deletedBy`. The `*By` columns are `text` null (actor, **auth-ready** — null in the MVP),
populated from the request actor by the **same service** that writes the audit row.

`audit_log` (in `shared/`, generic + append-only + immutable) is written via `recordAudit(tx, …)` in
the same transaction as every mutation (see [server.md](../../../.claude/rules/server.md)). A status
change is an `updated` whose `diff.status = { from, to }`. **No data-model change** to the audit
design from this spec.

Indexes: `(status, updatedAt DESC)` for board + archived (keyset pagination); a partial index
`(updatedAt DESC, id DESC) WHERE deleted_at IS NULL` on the hot path. The trailing `id DESC` completes
the `(updatedAt, id)` cursor sort key (migration 0004). Timestamp columns are pinned to millisecond
precision (`timestamptz(3)`, migration 0005) so the cursor (a JS Date, ms-precision) never ties against
a finer DB value and drops rows at a page boundary.

## 7. API contract (`/api/v1`, camelCase only)

The endpoint list + DTO shapes are in [`domain.md`](../../../.claude/rules/domain.md). Key points:
**one `PATCH /:id` handles all field updates including `status`** (no separate `/status` endpoint —
status is just a field; the audit stays `updated` with `diff.status`, consistent with the
generic-action design, and idempotency means a no-op when the patch changes nothing); listing is
**keyset/cursor** paginated (`(updatedAt, id)`), never `OFFSET`; `status` and `archived` query params
are mutually exclusive; the timeline reads from `GET /audit?entityType=application&entityId=<id>`.
All responses use a **standardized envelope** (the `mind-id-p3mo` convention): `{ message, data }`
success, `{ message, error, errors }` error, validation `422` as `{ path, messages }[]`, and paginated
`data: { items, meta }` with cursor `meta = { limit, nextCursor, hasMore }`. The envelope is transport —
the response DTO is the inner `data` (RSC uses it directly; the client unwraps `.data`).

## 8. UX & flows

- **Board:** 4 active columns, each an independent `useInfiniteQuery` (keyset), sorted
  `updatedAt DESC`. Drag a card between columns → status change, **optimistic** via the rolio pattern
  (`setQueryData` immediately; defer invalidation until all in-flight drags settle via
  `pendingDragCountRef`; roll back on error; the DnD mutation opts out of global auto-invalidation
  with `meta:{ invalidates: [] }`). Dropping a card in its own column = no-op. Card menu "Move to →"
  is the touch / non-drag fallback.
- **Going terminal:** card-menu action ("Mark Accepted/Rejected", "Withdraw") → the card optimistically
  leaves the board → appears in Archived.
- **Archived view** (`/archived`): the terminal cards, each with **Reopen → <active status>** (a
  submenu of the 4 active statuses). Reopen is its own **optimistic** hook (`useReopenApplication`):
  the card leaves the archived list at once and reappears in its active column after the refetch.
- **Card actions & delete:** the card shows only **company, role, status** (plus a drag handle and a
  menu). Its actions (move / mark-terminal / edit / delete) are injected once at the board via a
  **context** (`ApplicationActionsProvider`) and read by each card through `use()`, so columns forward
  no handlers. **Delete** is a **deferred-commit undo**: the card is removed optimistically and the
  server `DELETE` is held behind a ~5s undo toast (Undo cancels it with no request, no audit row).
- **Detail + timeline:** route `/applications/[id]`, composed at the **`app/` layer** (RSC renders the
  application detail from `features/application` + the `<AuditTimeline>` from `features/audit`, each
  prefetched). The timeline renders events chronologically (Created → Status A→B → Edited → Marked
  Rejected → Reopened), each with a timestamp, from `diff`.
- **Forms:** react-hook-form + `@hookform/resolvers/zod`, the shared request DTO as the resolver
  (shadcn `Form` is built on RHF).
- **dnd-kit performance:** `MeasuringStrategy.WhileDragging`, `React.memo` columns + cards with stable
  props, a **pointer-based `collisionDetection`** (`pointerWithin` with a `rectIntersection` fallback for
  keyboard drag, so a drop registers as soon as the cursor enters a column), and a **stable
  `DndContext id`** (dnd-kit's `aria-describedby` id otherwise drifts between server and client and
  warns on hydration). The board uses `useDraggable`/`useDroppable` directly, not a sortable list (no
  intra-column ordering). **No virtualization** (it breaks dnd-kit drag; infinite scroll keeps cards
  mounted, which is DnD-safe).

## 9. Error handling

Services throw `HTTPException` (or domain errors extending it); the root Hono app's `app.onError`
formats the error envelope `{ message, error?, errors? }`; `app.notFound` for unknown routes. Zod
validation failures → `422` with `errors: [{ path, messages }]`; unknown id → `404`; `409` reserved for future conflict rules. On the client,
optimistic mutations roll back by invalidating on error, and the API error envelope surfaces in the
form / a toast. No error is silently swallowed.

## 10. Testing strategy (TDD, Vitest + RTL, ≥80%)

- **Services:** create defaults to `saved`; a status change writes app + audit in **one**
  transaction; the **idempotent no-op** writes nothing; soft delete writes a `deleted` audit row;
  invalid status rejected; multi-field edit produces a correct `diff`.
- **Mappers / DTOs:** Drizzle row → response shape, camelCase, field exposure; Zod request validation
  (required fields, URL, lengths).
- **Audit:** `recordAudit` population by action; **immutability** (an UPDATE/DELETE on `audit_log`
  throws); keyset pagination boundaries.
- **Client:** optimistic move + rollback on error; auto-invalidation tagging; infinite-scroll fetch
  of the next page.

## 11. Deployment

One Vercel project + Neon. Migrations (`drizzle-kit migrate` against `DATABASE_URL_UNPOOLED`) run as a
deploy/CI step, not at runtime; the audit immutability trigger + `REVOKE` is a custom-SQL migration.
The Hono route handler is `runtime = 'nodejs'` (the `neon-serverless` driver needs Node). Env:
`DATABASE_URL` (pooled) for the app, `DATABASE_URL_UNPOOLED` (unpooled) for migrations. A seed script
populates a handful of realistic applications so the live URL opens to a populated board.

## 12. How AI was used — and one thing it got wrong (for the README)

AI (Claude) drove research, the architecture rules, and this spec under close human direction. **One
thing it got wrong that was caught:** it first proposed an audit `action` of `status_changed`. A
reviewer pointed out that an edit touching *both* name and status would make `status_changed` overlap
`updated` — ambiguous. Corrected to a **generic CRUD `action`** (`created`/`updated`/`deleted`) with
the specifics in a `diff` (a status change is an `updated` whose `diff.status` is set). Secondary
catches: a claim that dnd-kit was abandoned (verified false — only its docs repo was archived), and a
push to derive `created_by`/`updated_by` that the reviewer overrode in favor of base-entity parity.

## 13. README plan (the `requirements.md` sections)

The root `README.md` (written during implementation) covers: what it is + how to run; who it's for +
the one job; why the problem + how we know it's worth solving ([research.md](../../research.md));
what's out there + why build anyway; scope in / out + why; assumptions; **three questions for a real
user** (below); how you'd know it works + what's next; the AI note (§12).

## 14. Three questions for a real user

1. When a card moves stages, do you need the previous stage's date remembered (e.g. "applied on
   May 3"), or is a chronological history enough? *(Tests whether deriving dates from the timeline
   suffices or we need explicit date fields.)*
2. How many applications do you track at once, and over what span? *(Validates the single-user,
   no-search, infinite-scroll, no-virtualization assumptions.)*
3. When an application is rejected, do you want it gone from view, kept for reference, or resurfaced
   if the company re-engages? *(Validates the Archived + Reopen model vs. a simple delete.)*

## 15. How you'd know it's working, and what's next

**Working:** the live URL opens to a populated board; you can create, drag between stages, mark
terminal, reopen, edit, and delete; the timeline shows every change with timestamps and never
contradicts the current status; the repo runs from the README. **Next:** auth (#1, then `created_by`
populates and queries scope by `userId`), search/filter, then the deferred items in §3.
