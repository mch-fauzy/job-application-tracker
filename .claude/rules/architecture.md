# Architecture — Feature-Based, one unified Next.js app

> The enforceable structure for this **single fullstack Next.js (App Router) app** (Feature-Based,
> "Pattern B"): Next.js + Hono + Drizzle + shadcn/ui + Neon, deployed as one app on Vercel. There
> is no separate FE/BE.

## Folder structure

`features/` is organized by **domain** (`features/application`, `features/audit`, …). Each feature
is **flat** — there is **no `server/` subfolder**; the server/client split is enforced by
directives + `server-only`, not by folders.

```
src/
├── app/                            # routing/orchestration only (thin)
│   ├── api/[[...route]]/route.ts   # Hono mount (imports each feature router)  — Next-mandated name
│   ├── (dashboard)/.../page.tsx    # RSC: prefetchQuery + HydrationBoundary
│   ├── layout.tsx  providers.tsx   # QueryClientProvider, ThemeProvider
│   └── globals.css
├── features/<domain>/              # e.g. application/
│   ├── api/v1/<d>.ts               # server-only — Hono router, versioned by folder
│   ├── services/<d>.ts             # server-only — business logic + transactions + recordAudit
│   ├── repositories/<d>.ts         # server-only — Drizzle data access (accepts a tx)
│   ├── dtos/v1/requests/<name>.ts  # Zod input schema + inferred type (params)
│   ├── dtos/v1/responses/<name>.ts # Zod response schema + inferred type + mapper (return shape)
│   ├── db/schema.ts                # NOT server-only — pure table metadata (drizzle-kit imports it)
│   ├── components/<name>.tsx       # 'use client' — shadcn UI
│   ├── hooks/use-<name>.ts         # 'use client' — TanStack Query (fetch → /api/v1)
│   ├── contexts/<name>.tsx         # 'use client' — React Context (Provider + use… consumer hook)
│   └── constants/  types/  utils/  # NOTE: no feature-level lib/ (Bulletproof React — lib is shared-only)
└── shared/                         # importable by ANY feature or app
    ├── components/ui/  components/app/   # shadcn primitives + app-wide shared UI
    ├── lib/<concern>/      # infra buckets: db/, audit/, api/, validation/, query-client/, exceptions/
    ├── utils/<concern>/    # pure-helper buckets: cursor/, diff/, response/, error-detail/
    ├── db/                 # baseColumns, audit_log schema, migrations/
    ├── hooks/  schemas/  types/  constants/
```

> **Do not over-scaffold.** Only create a subfolder when its first file exists.
>
> **Exception — general-purpose utility buckets (`utils/` in either layer; `lib/` at `shared/`
> only — Bulletproof React keeps `lib/` out of features):** these are named for a *file kind*, not a
> concern, so each concern gets its **own subfolder** from the start (`shared/lib/db/db.ts` +
> `lib/db/force-ipv4.ts`, `lib/audit/audit.ts`, `lib/query-client/query-client.ts`,
> `shared/utils/slugify/slugify.ts`, `features/<d>/utils/sort/sort.ts`).
> The file is named for the concern (folder-based naming, **no `index.ts` barrels**) and its test
> colocates inside. This keeps these buckets navigable and gives a concern a home before its second
> file lands. **Single-role folders** (`services/`, `repositories/`, `api/`, `db/`, `components/`,
> `hooks/`, `dtos/.../requests|responses/`) and **small peer collections** (`constants/`, `types/`,
> `schemas/`) stay flat — their files are peers of one role/kind and follow the flat `<name>.ts` naming.

### `lib/` vs `utils/` — which bucket?

Both buckets are concern-per-folder. **The discriminator is the import set** (the same one the lint
rule enforces), not "generic vs app-specific":

| Bucket | Holds | Examples |
|---|---|---|
| **`utils/`** | **Pure helper functions** whose imports are *only* language built-ins, `@/shared/types`/`constants`, or other utils — **no** `server-only`, `@/shared/lib/**`, or framework/infra packages. | `utils/cursor/` (base64url codec), `utils/diff/`, `utils/response/` (the `ok()`/`paginated()` envelope builders — pure, only import types) |
| **`lib/`** | Modules that **import infrastructure or a framework** (`server-only`, Neon/Drizzle, Hono, `ws`, TanStack), hold state/singletons, or have side effects. | `lib/db/`, `lib/audit/`, `lib/api/`, `lib/validation/`, `lib/query-client/`, `lib/exceptions/` (extends Hono's `HTTPException`) |

So `response`'s builders are `utils/` (they import only types), while `exceptions/validation-exception`
is `lib/` (it imports Hono's `HTTPException`) — both decided by **the same import test**, no judgment
call. A concern-private helper with a single caller (e.g. `errorDetail` in `api.ts`) stays
**colocated with its concern**, not promoted to a bucket.

**`lib/` is shared-only** (Bulletproof React keeps `lib/` out of features). A feature that needs
framework-coupled, stateful client glue — e.g. a React Context for dependency injection — puts it in
the feature's flat **`contexts/`** folder (the `Provider` + the `use…` consumer hook in one file,
the hook throwing outside its provider), **not** a feature `lib/`. Feature-level data lives in `hooks/`
(TanStack Query), pure helpers in `utils/`, and React context in `contexts/`.

**Enforcement (deliberately light):** ESLint `no-restricted-imports` forbids any `**/utils/**` file
from importing the two **stable** infra signals — `server-only` and `@/shared/lib/**` — so a util can
never depend on infrastructure. This needs **no maintenance** (no npm-package list): adding a
dependency never touches the config. The finer call (e.g. a pure helper mistakenly left in `lib/`, as
`cursor` and `errorDetail` were) is **review-backed** against the table above — an earlier attempt to
lint it via an infra-package allowlist was removed as too arbitrary and high-maintenance.

## Import boundaries (the rules that matter)

Unidirectional flow — **`shared → features → app`**:

| Rule | Enforced by |
|------|-------------|
| `shared/` importable by anything | OK |
| A feature imports `shared/` + **its own** files only — **no cross-feature imports** (`features/a` ✗→ `features/b`) | ESLint (error) |
| `app/` composes features; nothing imports `app/` | OK |
| Used by 2+ features → lift to `shared/` | convention |
| Cross-cutting infra (e.g. `recordAudit`, the `audit_log` schema) lives in `shared/` so any feature can use it without a cross-feature import | convention + ESLint |

Within a feature: `db → repositories → services → (api router | RSC page)`; `hooks → fetch → api`;
`components → hooks`. Components never call services or `fetch` directly.

## Server/client boundary

- **Runtime server logic** (`api/` routers, `services/`, `repositories/`, response **mappers**,
  `shared/lib/db/db.ts`, `recordAudit`) begins with **`import 'server-only'`** → importing it from a
  `'use client'` file is a **build error**.
- **Exception — Drizzle schema/metadata files** (`db/schema.ts`, `shared/db/base-columns.ts`,
  `shared/db/audit-log.ts`) are **NOT** `server-only`. drizzle-kit (the migration CLI) imports them
  directly and `server-only` throws outside an RSC bundler, so it cannot be present. They are pure
  table-shape metadata (no connection string, no queries, no secrets), so nothing security-critical
  leaks: the connection + queries live in `shared/lib/db/db.ts`, which stays `server-only`. Vitest
  aliases `server-only` to an empty stub (`tests/stubs/server-only.js`) so node-env tests can import
  `db.ts`.
- `components/` and `hooks/` are `'use client'`. They reach the server only via `fetch` to the Hono
  API. Zod **schemas** (request + response) are plain and shareable by both sides.
- **Server Components** (`page.tsx`) may call a feature **service directly** (`await`) — hooks are
  unavailable in RSC. **Client Components** use hooks. (See [client.md](./client.md) for the split.)

## File naming — folder-based, NO type suffix

Role comes from the **folder**; the file is named for the **domain/concern**. This is the
Next/shadcn/Drizzle idiom and is internally consistent.

| Concern | File |
|---|---|
| Hono router | `features/<d>/api/v1/<d>.ts` (versioned by folder) |
| Service | `features/<d>/services/<d>.ts` |
| Repository | `features/<d>/repositories/<d>.ts` |
| Request DTO | `features/<d>/dtos/v1/requests/<name>.ts` |
| Response DTO | `features/<d>/dtos/v1/responses/<name>.ts` |
| Drizzle table | `features/<d>/db/schema.ts` |
| Hook | `features/<d>/hooks/use-<name>.ts` (`use-` is React-mandated, not a suffix) |
| Component | `features/<d>/components/<name>.tsx` (kebab file, `PascalCase` export) |
| Types / Constants | `features/<d>/{types,constants}/<name>.ts` (flat — peer collections) |
| React Context | `features/<d>/contexts/<name>.tsx` (flat — `Provider` + `use…` hook in one file) |
| Utils (feature or shared) | `features/<d>/utils/<concern>/<concern>.ts` · `shared/utils/<concern>/…` (concern-per-folder, no `index.ts` barrels) |
| Lib (shared only) | `shared/lib/<concern>/<concern>.ts` (no feature-level `lib/`) |

- **No `.service.ts` / `.repository.ts` / `.controller.ts` / `.entity.ts` / `.request.ts` /
  `.response.ts` etc. suffixes** — the folder is the marker.
- **No `I` prefix** on interfaces (`ApplicationResponse`, not `IApplicationResponse`). `interface`
  for object shapes, `type` for unions. Avoid `any` — return `unknown`, narrow at the call site.
- **Enum-like constants — no TS `enum`** (ESLint-enforced via `no-restricted-syntax`). Use an
  `as const` object with a **CONSTANT_CASE singular** name, **UPPER_CASE keys**, lowercase wire/DB
  values, and a **derived union type** `type X = (typeof OBJ)[keyof typeof OBJ]`. Reference members
  by name (`APPLICATION_STATUS.SAVED`) and validate at the boundary with `z.enum(OBJ)` (Zod 4 —
  replaces the deprecated `z.nativeEnum`). Member-name casing is convention + review, not lint
  (a linter cannot tell an enum-like object from an ordinary one).
- **Colocation:** a multi-file concern (a component `A` with parts `A1`/`A2`/`A3`) lives in its own
  folder (`components/<a>/…`), not scattered as siblings.
- **Don't export what's only used in its own file** (CLAUDE.md #10).
- **API versioning is folder-based (not a filename suffix):** the *contract* is versioned —
  `api/v1/<d>.ts` (router) + `dtos/v1/{requests,responses}/`. `services/`, `repositories/`, `db/` stay
  un-versioned (shared implementation). v2 adds `api/v2/<d>.ts` + `dtos/v2/…` beside v1; the URL is
  `/api/v{n}`.

## Shared base columns (used by ALL tables)

Drizzle has no entity inheritance, so define a **`baseColumns`** helper in `shared/db/` and spread
it into every table:

```ts
// shared/db/base-columns.ts (NOT server-only - pure metadata, imported by drizzle-kit)
export const baseColumns = {
  id: uuid('id').defaultRandom().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  createdBy: text('created_by'),                  // actor, null until auth
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow().notNull().$onUpdate(() => new Date()),
  updatedBy: text('updated_by'),                  // actor, null until auth
};
export const softDelete = {
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  deletedBy: text('deleted_by'),                  // actor, null until auth
};
```

Spread `softDelete` only into tables that soft-delete. The append-only `audit_log` uses a subset
(`id` + `created_at` + its own `created_by`) — it does **not** spread `baseColumns`.
`createdBy/updatedBy/deletedBy` are `text` null (actor, **auth-ready**): populated from the request
actor (null in the single-user MVP) by the **same service** that writes the audit row, so entity
attribution and the audit log can never drift.

## Enforcement (violations error, not just documented)

| Concern | Tool |
|---|---|
| Import boundaries (no cross-feature, `shared→features→app`, client✗→server-only) | ESLint **`eslint-plugin-boundaries`** (or `import/no-restricted-paths`) at **error** |
| Runtime server/client boundary | **`server-only`** package |
| Bloated files | ESLint `max-lines` ~300 (skip blanks/comments), `max-lines-per-function` ~50, `max-depth` 4, `complexity` ~10 |
| Folder structure + naming + colocation | **`eslint-plugin-project-structure`** |
| Concern-per-folder in utility buckets (`lib/` + `utils/`): each concern in its **own** subfolder, no loose files mixing concerns | **`eslint-plugin-project-structure`** `folderStructure` — `lib/` + `utils/` allow **only subfolders** (a bare `lib/<x>.ts` / `utils/<x>.ts` errors). Single-role folders + `constants/`/`types/`/`schemas/` exempt (stay flat). **`lib/` at `shared/` only — no feature `lib/`** is convention + review, not encoded (the plugin's glob syntax has no any-except form) |
| `utils/` purity (a util must not depend on infrastructure) | **ESLint `no-restricted-imports`** scoped to `**/utils/**` — forbids the two stable signals `server-only` + `@/shared/lib/**` (no npm-package list, zero maintenance). The finer lib-vs-utils call is review-backed |
| TS `enum` (use `as const` object) | **ESLint `no-restricted-syntax`** — `TSEnumDeclaration` errors |
| Unused / internal-only exports + dead files/deps | **`knip`** + `import/no-unused-modules` + TS `noUnusedLocals`/`noUnusedParameters` |

Run lint + `knip` in **CI** and a **husky pre-commit** hook so violations fail for humans and
Claude Code alike.
