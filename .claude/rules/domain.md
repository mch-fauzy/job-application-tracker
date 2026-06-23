# Domain — Job Application Tracker (status pipeline + immutable history)

> The domain layer for this **single-user** app. Authoritative for the status set, transition rules,
> the `applications` data model, and the `/api/v1` contract. Structure/boundaries →
> [architecture.md](./architecture.md); Hono/Drizzle/audit → [server.md](./server.md); RSC/client →
> [client.md](./client.md).

## The product (one job)

A single job seeker tracks applications through an **ordered status pipeline** and sees the **full,
immutable history** of every change to each application. **No auth** (single-user MVP; structure is
auth-ready). The load-bearing guarantee is the append-only `audit_log`, written **transactionally**
with every mutation, so the timeline can never drift from the current state.

## Status set (`text` column + Zod enum — NOT `pgEnum`)

The status set is a TS `const` + a Zod enum, validated at the API boundary. The DB column is `text`
(no `pgEnum`, no CHECK) so adding/removing a status is code-only — no migration.

```ts
// features/application/constants/status.ts
// enum-like const object (no TS enum), CONSTANT_CASE name + UPPER_CASE keys - see architecture.md
export const APPLICATION_STATUS = {
  SAVED: 'saved', APPLIED: 'applied', INTERVIEWING: 'interviewing', OFFER: 'offer',  // active (board)
  ACCEPTED: 'accepted', REJECTED: 'rejected', WITHDRAWN: 'withdrawn',                // terminal (archived)
} as const;
export const ACTIVE_STATUSES = [APPLICATION_STATUS.SAVED, APPLICATION_STATUS.APPLIED, APPLICATION_STATUS.INTERVIEWING, APPLICATION_STATUS.OFFER] as const;
export const TERMINAL_STATUSES = [APPLICATION_STATUS.ACCEPTED, APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.WITHDRAWN] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUS)[keyof typeof APPLICATION_STATUS];
// applicationStatusSchema = z.enum(APPLICATION_STATUS)  in dtos/ (Zod 4; replaces z.nativeEnum)
```

| Group | Values | Where |
|---|---|---|
| **Active** | `saved · applied · interviewing · offer` | the 4 board columns |
| **Terminal** | `accepted · rejected · withdrawn` | the Archived view |

Default status on create: `saved`. "Archived" is **derived** (`status ∈ TERMINAL_STATUSES`) — there
is **no `isArchived` column**.

## Transitions — flexible, enum-validated (NOT a strict FSM)

Strict forward-only is wrong for this domain (rejection arrives from any stage, people withdraw
mid-process, mis-clicks get corrected). The backend validates **only** that the target is a valid
status; it does not enforce an FSM.

| From → To | Allowed | UI affordance |
|---|---|---|
| active → active | yes | drag between columns, or card menu "Move to →" |
| active → terminal | yes | card menu ("Mark Accepted/Rejected", "Withdraw") → card leaves the board |
| terminal → active | yes | **Reopen → <active status>** in the Archived view |
| terminal → terminal | yes | menu in the Archived view (edge case, allowed) |

- **Idempotent:** if a `PATCH` changes nothing (every provided field already equals the current value
  — e.g. a card dropped in its own column, or an unchanged edit), it is a **no-op** — no mutation, no
  audit row (the API returns the unchanged resource).
- A hard terminal-lock / reopen-confirm is **deliberately deferred** (next step). Drag/menu actions
  are already deliberate, and the audit log makes every move reversible and visible.
- **Within a column: fixed sort** (`updatedAt DESC`). No manual intra-column reordering (no
  `position`/rank field) — deferred to avoid a fractional-ranking (LexoRank) tech-debt trap.

## `applications` data model

`features/application/db/schema.ts` (server-only) — spreads `baseColumns` + `softDelete` (see
[architecture.md](./architecture.md)).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` `defaultRandom()` PK | baseColumns |
| `createdAt` / `updatedAt` | `timestamptz` | baseColumns (`updatedAt` via `$onUpdate`) |
| `createdBy` / `updatedBy` | `text` null | actor, auth-ready (null in the MVP) |
| `deletedAt` / `deletedBy` | `timestamptz` / `text` null | softDelete |
| `company` | `text` not null | required (Zod 1-200 chars) |
| `role` | `text` not null | required (Zod 1-200 chars) |
| `status` | `text` not null default `'saved'` | value set = the Zod enum (no `pgEnum`/CHECK) |
| `jobUrl` | `text` null | valid URL (Zod) |
| `notes` | `text` null | optional (Zod max ~2000) |

- Indexes: `(status, updatedAt DESC)` for board columns + archived; on the hot keyset path a
  **partial** index `(updatedAt DESC, id DESC) WHERE deleted_at IS NULL` (the `id DESC` completes
  the `(updatedAt, id)` cursor sort key so the tie-break needs no extra sort).
- `company` is **free text**, not a normalized entity (YAGNI for single-user).
- Dates like "applied on" are **derived from the audit timeline**, not stored as columns.

## API surface (`/api/v1`, camelCase wire, Zod DTOs)

```
GET    /applications?status=<s>&cursor=<c>&limit=<n>   # one active column's page (keyset)
GET    /applications?archived=true&cursor=&limit=      # all terminal cards (Archived view)
POST   /applications                                   # create (default status 'saved')
GET    /applications/:id                               # detail
PATCH  /applications/:id                               # partial update: any of company/role/jobUrl/notes/status
DELETE /applications/:id                               # soft delete
GET    /audit?entityType=application&entityId=<id>&cursor=&limit=   # timeline (features/audit)
```

**DTOs** (request = the boundary guard, shared with client forms; response = the contract for both
data paths). camelCase end-to-end.

| DTO | Shape |
|---|---|
| `createApplicationRequest` | `{ company, role, jobUrl?, notes?, status? = 'saved' }` |
| `updateApplicationRequest` | `{ company?, role?, jobUrl?, notes?, status? }` (≥1 field; `status` ∈ enum) |
| `listApplicationsQuery` | `{ status? | archived?, cursor?, limit? = 20 (max 50) }` |
| `applicationResponse` (item) | `{ id, company, role, status, jobUrl, notes, createdAt, updatedAt }` |
| `auditEventResponse` (item) | `{ id, action, diff, createdAt, createdBy }` |

List endpoints return the standard paginated envelope (below) — the item schema + the envelope compose
it, so there is no separate `*ListResponse` DTO.

- **One `PATCH` for all fields including `status`** (no separate `/status` endpoint) — status is just
  another field; the audit `action` stays `updated` with `diff.status` set, matching the generic-action
  design (a single edit can change status + fields together). Extract a `/status` sub-resource only if
  real transition guards or side-effects are added later.
- `status` and `archived` query params are mutually exclusive (one column vs the terminal group).
- Keyset cursor encodes `(updatedAt, id)`; never `OFFSET`.
- `entityType` on `/audit` is validated against an allowlist (`ENTITY_TYPE`, the enum-like const
  mirroring `APPLICATION_STATUS`) — an unwired type returns **422** (fail-closed), not an empty page.
  `AUDIT_ACTION` and `ENTITY_TYPE` (in `shared/constants/`) are the single source for the audit
  action set and the auditable entity set, driving both the write side (`recordAudit`) and the read
  guard so they cannot drift.
- Errors via `app.onError` + `HTTPException` (see [server.md](./server.md)): `404` unknown id, `422`
  Zod validation, `409` reserved for future conflict rules.

### Response envelope (standardized — `mind-id-p3mo` convention)

All responses use a standard envelope (helper in `shared/`; errors via `app.onError`). The **response
DTO is the inner `data`** (the contract both paths share) — RSC uses it directly, the client parses the
envelope and reads `.data`.

| Case | Shape |
|---|---|
| success (single) | `{ message, data: T }` |
| success (list) | `{ message, data: { items: T[], meta } }`, `meta = { limit, nextCursor, hasMore }` |
| error | `{ message, error?, errors? }` |
| validation (422) | `{ message, errors: [{ path, messages: string[] }] }` |

Cursor `meta` is **keyset** (`nextCursor` encodes `(updatedAt, id)`, `hasMore` flags another page) — no
offset `total`/`page`. Column counts, if shown, come from a cheap separate count.

## Audit semantics (application-specific)

Every mutation writes one `audit_log` row in the **same transaction** via `recordAudit(tx, …)` (see
[server.md](./server.md)). `action` is generic CRUD; the specifics live in `diff`.

| Operation | `action` | `old_data` | `new_data` | `diff` |
|---|---|---|---|---|
| create | `created` | null | snapshot | null |
| edit fields / change status / reopen / mark-terminal | `updated` | snapshot | snapshot | changed fields |
| soft delete | `deleted` | snapshot | null | null |

- A **status change** is an `updated` whose `diff.status = { from, to }`; the timeline renders
  "Status: A → B" from it. Reopen and mark-terminal are status changes — same `updated` shape.
- The idempotent no-op writes **nothing** (no audit row).

## Board & Archived (UX domain rules)

- **Board:** 4 active columns; each is an independent `useInfiniteQuery` (keyset), sorted
  `updatedAt DESC`. Drag a card between columns = status change (optimistic, rolio pattern — see
  [client.md](./client.md)). Dropping a card in its own column = no-op.
- **Going terminal:** card-menu action → optimistic removal from the board → lands in Archived.
- **Archived view** (`/archived`): the terminal cards, with **Reopen → <active status>** (a submenu
  of the 4 active statuses).
- **Detail + timeline:** route `/applications/[id]`, composed at the `app/` layer (RSC renders the
  application detail + the audit timeline, each prefetched).

## Scope — in / out / next

- **In (MVP):** create/edit/soft-delete applications; status change via drag + menu; Archived +
  Reopen; per-application audit timeline; infinite scroll; seed data; the root README.
- **Out / deferred (documented as next steps):** auth (the #1 next step), search/filter/sort,
  manual intra-column ordering, list virtualization, normalized companies, modal (intercepting
  routes) detail, a hard terminal-lock / reopen-confirm, bulk actions, multiple boards.
