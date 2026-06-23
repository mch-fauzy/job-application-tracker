# Server & Data — Hono API + Drizzle + Neon

> The server half of the unified app. Layering inside each feature:
> **`api/` (Hono router) → `services/` (business logic) → `repositories/` (Drizzle data access)**,
> with `dtos/` defining typed params and return shapes. All files here are **`server-only`**.

## Hono API (mounted in Next.js)

- **Mount** at `src/app/api/[[...route]]/route.ts` via `hono/vercel`:

  ```ts
  // app/api/[[...route]]/route.ts
  import { handle } from 'hono/vercel';
  import { app } from '@/shared/lib/api/api';   // the root Hono instance
  export const runtime = 'nodejs';          // NOT edge — neon-serverless needs Node
  export const GET = handle(app);
  export const POST = handle(app);
  export const PATCH = handle(app);
  export const DELETE = handle(app);
  ```

- **Root app + versioning + modular routers:** `new Hono().basePath('/api')` + a **`/v1` router group**;
  mount per-feature sub-routers with `v1.route('/applications', applicationRouter)`. Each feature exports
  its v1 router from `features/<d>/api/v1/<d>.ts` (v2 lives beside it: `api/v2/<d>.ts`). No CORS
  (same-origin inside Next.js).
- **Validation:** `@hono/zod-validator` using the **request DTO** — `zValidator('json', schema)` /
  `'query'` / `'param'`; read typed input via `c.req.valid('json')`.
- **Errors:** services throw `HTTPException` (or domain exceptions extending it); the root app's
  `app.onError` maps them to the `ApiError` envelope via a **status table** (422 validation, 404
  not-found, 409 conflict, 401/403 auth-ready, 500 fallback — mirrors `mind-id-p3mo`'s global filter).
  `app.notFound` for unknown routes. No `.filter.ts` files.
- **Messages:** response/error `message` strings come from `shared/constants/` factories
  (`SuccessMessageConstant.EntityCreated('Application')`, `ErrorMessageConstant.DataEntityNotFound(…)`)
  — one source for all messages, same pattern as `mind-id-p3mo`.
- **Logger:** `app.use(logger())` registered first.

## DTO pattern (defined params + return)

Every endpoint has an explicit request DTO and response DTO:

- **Request DTO** — `features/<d>/dtos/v1/requests/<name>.ts`: a Zod schema + its inferred type. Used
  by `zValidator` on the server **and** by client forms. The single source of truth for input.
- **Response DTO** — `features/<d>/dtos/v1/responses/<name>.ts`: a Zod **response schema** (defines the
  exact returned shape) + inferred type + a **mapper** (`mapApplication(row) => ApplicationResponse`)
  from the Drizzle row to that shape. The mapper controls which fields are exposed and maps to
  camelCase.
- The **same response DTO is the contract for both data paths**: the Hono router returns it (and
  the client `responseSchema.parse()`s it), and a Server Component calling the service directly gets
  the same shape. Keep the response schema free of `server-only` imports so the client can use it.

## Response envelope (standardized — `mind-id-p3mo` convention)

Every endpoint returns a standard envelope. A `shared/` helper builds success responses; `app.onError`
builds error ones. The **response DTO is the inner `data`** (the shared contract) — the envelope wraps
it on the HTTP path only, so a Server Component calling the service gets the bare DTO, and the client
parses the envelope then reads `.data`.

```ts
// shared/types/response.ts (plain, client-shareable)
interface ApiResponse<T> { message: string; data: T }
interface PaginatedData<T> {
  items: T[];
  meta: { limit: number; nextCursor: string | null; hasMore: boolean };  // keyset, no offset total
}
interface ApiError { message: string; error?: string | null; errors?: unknown | null }
// validation 422: { message, errors: Array<{ path: string, messages: string[] }> }
```

- Success helpers (`ok`, `paginated`) live in `shared/`; the cursor `meta` carries `nextCursor`
  (`(updatedAt, id)`) + `hasMore`, never an offset `total`.
- `app.onError` maps `HTTPException` + domain errors to `ApiError`; the `@hono/zod-validator` hook
  formats Zod issues to `{ path, messages }[]` at **422**.

## Drizzle + Neon

- **Driver: `drizzle-orm/neon-serverless` (WebSocket `Pool`).** `neon-http` has **no interactive
  transactions** — and we require atomic mutation-plus-audit writes, so it is not an option.

  ```ts
  // shared/lib/db/db.ts (server-only)
  import 'server-only';
  import { Pool, neonConfig } from '@neondatabase/serverless';
  import { drizzle } from 'drizzle-orm/neon-serverless';
  import ws from 'ws';
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL!, max: 5 }); // POOLED url
  export const db = drizzle({ client: pool });
  ```

- **Two connection strings:** `DATABASE_URL` = **pooled** (`-pooler`) for app queries;
  `DATABASE_URL_UNPOOLED` = **unpooled** for migrations only (Neon/Vercel's standard name).
- **Config:** a flat `shared/config.ts` (`export const config = { ... } as const`, read from
  `process.env`) centralizes env access — same pattern as `mind-id-p3mo`'s `config.ts`.
- **Repositories** wrap Drizzle queries and accept an optional `tx` so they can run inside a
  transaction. No business logic in repositories.
- **Columns:** `text` for strings (Postgres idiom; length validated in Zod — `varchar(n)` only for
  a deliberate DB cap), `timestamptz` (`withTimezone: true`) via `baseColumns`, the **status set is
  `text` + a Zod enum** at the boundary (NOT `pgEnum`/CHECK, so adding a status is code-only — see
  [domain.md](./domain.md)), `uuid().defaultRandom()` PKs, `jsonb` for audit snapshots/diff.

## Transactions (atomic mutation + audit)

Every mutation that must stay consistent with its history runs inside one `db.transaction()`, and
writes the `audit_log` row in the **same** transaction:

```ts
// features/application/services/application.ts (server-only)
return db.transaction(async (tx) => {
  const before = await applicationRepo.findById(id, tx);
  // ...domain checks (idempotency, transition validity — see domain.md)...
  const after = await applicationRepo.update(id, patch, tx);
  await recordAudit(tx, { entityType: 'application', entityId: id, action: 'updated',
    oldData: before, newData: after, diff: diffOf(before, after), ...requestMeta });
  return mapApplication(after);
});
```

## Audit log (generic, append-only, immutable)

Cross-cutting → the `audit_log` Drizzle schema + the `recordAudit` write helper live in **`shared/`**
(`shared/db/` + `shared/lib/audit/audit.ts`), so any feature's service can record without a cross-feature
import. The **`features/audit`** feature owns the **read** side (timeline UI + read service/repo +
response DTOs).

| Column | Type | Purpose |
|---|---|---|
| `id` | `uuid` `defaultRandom()` | PK (uuidv7 is the scale path) |
| `entity_type` | `text` | polymorphic — `application` now, any entity later |
| `entity_id` | `uuid` | the audited row id |
| `action` | `text` | **generic operation**: `created` / `updated` / `deleted` |
| `created_by` | `text` null | actor — nullable now (no auth); auth-ready |
| `created_at` | `timestamptz` `defaultNow()` | when |
| `old_data`, `new_data` | `jsonb` | full snapshots |
| `diff` | `jsonb` | `{ field: { from, to } }` — what changed (incl. `status`) |
| `ip_address` `inet`, `user_agent`/`request_id`/`source` `text` | null | request metadata |

- **`action` is generic CRUD, not `status_changed`** — a multi-field edit would make a semantic
  `status_changed` overlap `updated`. The operation goes in `action`; the specifics go in `diff`. A
  status change is an `updated` whose `diff.status` is set; the timeline renders "Status: A → B"
  from `diff.status`. Population: `created` → `old_data` null; `deleted` → `new_data` null;
  `updated` → both + `diff`. `action` is stored explicitly (clarity + indexing), not inferred.
- **Hybrid snapshot + diff:** snapshots for reconstruction, diff for readability.
- **Immutable:** a `BEFORE UPDATE OR DELETE` trigger that `RAISE EXCEPTION` + `REVOKE UPDATE,
  DELETE` from the app role (defense-in-depth).
- **Indexes:** `(entity_type, entity_id, created_at DESC, id DESC)` (the trailing `id DESC`
  completes the `(createdAt, id)` keyset sort key so the cursor tie-break needs no extra sort),
  `(created_at)`, `(created_by)`.
  GIN(`diff`)/BRIN(`created_at`) deferred to scale.

## Migrations

- Schema discovered by a glob in `drizzle.config.ts` (feature `db/schema.ts` files + `shared/db/`);
  output to `shared/db/migrations`.
- `npm run db:generate -- --name <snake_case>` then `drizzle-kit migrate` (**never `push` in prod**).
  Run `migrate` against `DATABASE_URL_UNPOOLED` as a **deploy/CI step**. A descriptive `--name` is
  **required** (a wrapper script blocks drizzle's random `adjective_noun` names); the file and its
  `meta/_journal.json` tag must stay in sync.
- The audit immutability **trigger + REVOKE** is a **custom-SQL** migration:
  `npm run db:generate:custom -- --name <snake_case>`, then hand-write the `CREATE FUNCTION` /
  `CREATE TRIGGER` / `REVOKE` SQL.
