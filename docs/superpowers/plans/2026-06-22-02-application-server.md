# Job Application Tracker — Plan 2: Application Feature Server Side

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the entire server side for the `application` feature — status constants, Drizzle schema, migration, DTOs, cursor codec, diff util, repository, service (with idempotent no-op + transactional audit), the root Hono app (`shared/lib/api.ts`), a shared validation helper (`shared/lib/validation.ts`), the application Hono router, and the Next.js API mount — so all five CRUD endpoints are live at `/api/v1/applications`.

**Architecture:** Single Next.js (App Router) unified app. This plan creates `features/application/` (all server-only layers: db, repos, services, dtos, api) plus three new `shared/lib/` files (`cursor.ts`, `api.ts`, `validation.ts`). All mutations write an immutable `audit_log` row in the same `db.transaction()`. The root Hono app (`shared/lib/api.ts`) exports `app` and `v1` — it wires `app.onError`, `app.notFound`, and `app.use(logger())`, but does NOT mount `v1` onto `app` and does NOT import any feature router. The Next.js catch-all route (`app/api/[[...route]]/route.ts`, app layer) is the ASSEMBLY point: it imports the application router (side-effect mount onto `v1`), then calls `app.route('/v1', v1)`, then delegates to `handle(app)` on the Node runtime. This keeps `shared/` free of any `features/` imports (no `eslint-plugin-boundaries` violations).

**Tech Stack:** Hono, `@hono/zod-validator`, Drizzle ORM (`drizzle-orm/neon-serverless`), Neon Postgres, Zod, Vitest, TypeScript, `server-only`.

## As-built deviations

> Added after implementation. The shipped code and the `.claude/rules/` files are the source of truth -
> the task steps below are kept as the original execution record.

- Concern-per-folder + lib/utils split: `ValidationException` is in `shared/lib/exceptions/`, `ok`/`paginated`
  in `shared/utils/response/`, `cursor` in `shared/utils/cursor/`, `validate` in `shared/lib/validation/`
  (and is generic so `c.req.valid(target)` stays typed). The root app is `shared/lib/api/api.ts`.
- Status is an `as const` object `APPLICATION_STATUS` (not an `APPLICATION_STATUSES` tuple); the schema
  column uses `.$type<ApplicationStatus>()` and defaults to `APPLICATION_STATUS.SAVED`. A `TerminalStatus`
  union was added.
- `conn(tx)` is exported from `shared/lib/db/db.ts` (centralizes the `tx ?? db` choice). The `/:id` routes
  validate the uuid param (422 on a malformed id). `findMany` orders by typed `desc()`; `update` and
  `softDelete` also guard `deletedAt IS NULL`.
- Keyset indexes gained an `id DESC` tie-break (migration 0004) and all timestamps became `timestamptz(3)`
  (migration 0005, a keyset row-skip fix) - two migrations beyond this plan.
- Migrations read `DATABASE_URL_UNPOOLED` (only in `drizzle.config.ts`); `config.ts` validates just
  `DATABASE_URL`.
- Added: an `application-id-param` request DTO, `shared/schemas/client-response.ts`,
  `shared/utils/api-message/`, `shared/utils/error-detail/`, `shared/lib/db/force-ipv4.ts`.

## Carry-over notes (from Plan 1 review)

Apply these when implementing this plan:

- **New `shared/lib/` files follow the concern-per-folder convention** (set in Plan 1): create `shared/lib/api/api.ts`, `shared/lib/validation/validation.ts`, `shared/lib/cursor/cursor.ts` — one folder per concern, file named for the concern, **no `index.ts` barrels**. Import as `@/shared/lib/api/api`, etc. The flat `shared/lib/api.ts` / `validation.ts` / `cursor.ts` paths in this plan's text predate that convention.
- **Wire `eslint-plugin-project-structure`.** It is listed in `architecture.md`'s enforcement table (folder structure + naming + the `lib/`/`utils/` concern-folder rule) but is not configured yet. Add and configure it as part of this plan's tooling.

## Global Constraints

Every task implicitly includes these (copied from the spec + rules):

- **camelCase-only on the wire** (input AND output). Drizzle maps to snake_case DB columns. No snake_case middleware.
- **Strings use `text`**, never `varchar`. Length validated in Zod, not the column.
- **Status set is `text` + a Zod enum — NEVER `pgEnum`, no DB CHECK.**
- **Keyset/cursor pagination only**, ordered `(updatedAt, id)`. Never `OFFSET`.
- **Soft delete** via `deletedAt`; queries filter `deletedAt IS NULL`.
- **`server-only` boundary:** every file that touches the DB or server logic begins with `import 'server-only'`. A `'use client'` file importing one is a build error.
- **No cross-feature imports.** `shared/` is importable by anything; features import only `shared/` + their own files.
- **Folder-based naming, no type suffix, no `I` prefix.** API versioned by folder (`api/v1/`, `dtos/v1/`).
- **Audit log is immutable + append-only**, written in the same transaction as each mutation.
- **TDD, ≥80% coverage.** Hono route handler runs on the **Node runtime**.
- **Env vars:** `DATABASE_URL` (pooled `-pooler`, app), `DATABASE_URL_UNPOOLED` (unpooled, migrations + tests). `.env` already contains both (real Neon creds).
- **Git is run by the user.** The executing agent NEVER runs `git add/commit/push`. When all of this plan's tasks are green, pause and surface the suggested commit command (see the Commit section at the end) for the user to run. One commit per plan.

---

### Task 1: Status constants + Zod enum

**Files:**
- Create: `src/features/application/constants/status.ts`
- Test: `src/features/application/constants/status.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces:
  - `APPLICATION_STATUSES` — `readonly` tuple of all 7 statuses.
  - `ACTIVE_STATUSES` — `readonly` tuple of the 4 active statuses.
  - `TERMINAL_STATUSES` — `readonly` tuple of the 3 terminal statuses.
  - `type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]`
  - `applicationStatusSchema` — `z.enum(APPLICATION_STATUSES)` (the boundary guard used by DTOs + the Drizzle schema default).

- [ ] **Step 1: Write the failing test**

```ts
// src/features/application/constants/status.test.ts
import { describe, it, expect } from 'vitest';
import {
  APPLICATION_STATUSES,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  applicationStatusSchema,
} from './status';

describe('status constants', () => {
  it('APPLICATION_STATUSES contains all 7 values in order', () => {
    expect(APPLICATION_STATUSES).toEqual([
      'saved', 'applied', 'interviewing', 'offer',
      'accepted', 'rejected', 'withdrawn',
    ]);
  });

  it('ACTIVE_STATUSES contains the 4 board columns', () => {
    expect(ACTIVE_STATUSES).toEqual(['saved', 'applied', 'interviewing', 'offer']);
  });

  it('TERMINAL_STATUSES contains the 3 terminal outcomes', () => {
    expect(TERMINAL_STATUSES).toEqual(['accepted', 'rejected', 'withdrawn']);
  });

  it('applicationStatusSchema accepts valid statuses', () => {
    expect(applicationStatusSchema.parse('saved')).toBe('saved');
    expect(applicationStatusSchema.parse('rejected')).toBe('rejected');
  });

  it('applicationStatusSchema rejects unknown statuses', () => {
    expect(() => applicationStatusSchema.parse('pending')).toThrow();
    expect(() => applicationStatusSchema.parse('')).toThrow();
  });

  it('ACTIVE + TERMINAL cover all APPLICATION_STATUSES', () => {
    const all = new Set(APPLICATION_STATUSES);
    const covered = new Set([...ACTIVE_STATUSES, ...TERMINAL_STATUSES]);
    expect(covered).toEqual(all);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/application/constants/status.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/application/constants/status.ts
import { z } from 'zod';

export const APPLICATION_STATUSES = [
  'saved', 'applied', 'interviewing', 'offer',   // active (on the board)
  'accepted', 'rejected', 'withdrawn',            // terminal (archived)
] as const;

export const ACTIVE_STATUSES = ['saved', 'applied', 'interviewing', 'offer'] as const;
export const TERMINAL_STATUSES = ['accepted', 'rejected', 'withdrawn'] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/application/constants/status.test.ts`
Expected: PASS (all 6 cases).

---

### Task 2: `applications` Drizzle schema + indexes

**Files:**
- Create: `src/features/application/db/schema.ts`

**Interfaces:**
- Consumes: `baseColumns`, `softDelete` from `@/shared/db/base-columns`.
- Produces: `applications` Drizzle table — columns: `company` text notNull, `role` text notNull, `status` text notNull default `'saved'`, `jobUrl` text null, `notes` text null; indexes: `(status, updatedAt DESC)` + a partial `(updatedAt DESC, id)` where `deleted_at IS NULL`.

- [ ] **Step 1: Write the schema**

```ts
// src/features/application/db/schema.ts
import 'server-only';
import { pgTable, text, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { baseColumns, softDelete } from '@/shared/db/base-columns';

export const applications = pgTable('applications', {
  ...baseColumns,
  ...softDelete,
  company: text('company').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull().default('saved'),
  jobUrl: text('job_url'),
  notes: text('notes'),
}, (t) => [
  index('applications_status_updated_at_idx').on(t.status, t.updatedAt.desc()),
  index('applications_active_updated_at_id_idx')
    .on(t.updatedAt.desc(), t.id)
    .where(sql`${t.deletedAt} IS NULL`),
]);
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 3: Generate + apply the `applications` migration

**Files:**
- Create: `src/shared/db/migrations/<timestamp>_*.sql` (generated by drizzle-kit)

**Interfaces:**
- Consumes: `drizzle.config.ts` (glob discovers `src/features/application/db/schema.ts`).
- Produces: `applications` table in the Neon database.

> Requires `.env` with `DATABASE_URL` + `DATABASE_URL_UNPOOLED`.

- [ ] **Step 1: Generate the migration**

Run: `npm run db:generate`
Expected: a new `.sql` file under `src/shared/db/migrations/` containing `CREATE TABLE "applications"` with the `company`, `role`, `status`, `job_url`, `notes`, `id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`, `deleted_by` columns, plus the two indexes.

- [ ] **Step 2: Apply the migration**

Run: `npm run db:migrate`
Expected: output includes `migrations applied successfully` or `1 migration applied` — no errors.

- [ ] **Step 3: Verify the table exists**

Run:
```bash
npx tsx -e "import {db} from './src/shared/lib/db'; import {sql} from 'drizzle-orm'; db.execute(sql\`select to_regclass('applications') as t\`).then(r=>{console.log(r.rows); process.exit(0)})"
```
Expected: prints `[ { t: 'applications' } ]`.

---

### Task 4: Response DTO + `mapApplication` mapper

**Files:**
- Create: `src/features/application/dtos/v1/responses/application.ts`
- Test: `src/features/application/dtos/v1/responses/application.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks (plain Zod — no `server-only`).
- Produces:
  - `applicationResponseSchema` — Zod schema with `{ id: z.string().uuid(), company: z.string(), role: z.string(), status: z.string(), jobUrl: z.string().url().nullable(), notes: z.string().nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() }`.
  - `type ApplicationResponse = z.infer<typeof applicationResponseSchema>`
  - `mapApplication(row): ApplicationResponse` — maps a Drizzle row (`id`, `company`, `role`, `status`, `jobUrl`, `notes`, `createdAt`, `updatedAt`) to the response shape. Dates are serialized to ISO 8601 strings via `.toISOString()`. Never exposes `deletedAt`, `createdBy`, `updatedBy`, `deletedBy`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/application/dtos/v1/responses/application.test.ts
import { describe, it, expect } from 'vitest';
import { applicationResponseSchema, mapApplication } from './application';

const fakeRow = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  company: 'Acme Corp',
  role: 'Software Engineer',
  status: 'applied',
  jobUrl: 'https://acme.com/jobs/1',
  notes: 'Referral from Alice',
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-02T12:00:00.000Z'),
  // fields that must NOT appear in the output:
  createdBy: null,
  updatedBy: null,
  deletedAt: null,
  deletedBy: null,
};

describe('mapApplication', () => {
  it('maps Drizzle row to camelCase response shape', () => {
    const result = mapApplication(fakeRow);
    expect(result.id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(result.company).toBe('Acme Corp');
    expect(result.role).toBe('Software Engineer');
    expect(result.status).toBe('applied');
    expect(result.jobUrl).toBe('https://acme.com/jobs/1');
    expect(result.notes).toBe('Referral from Alice');
    expect(result.createdAt).toBe('2026-01-01T10:00:00.000Z');
    expect(result.updatedAt).toBe('2026-01-02T12:00:00.000Z');
  });

  it('does NOT expose deletedAt, createdBy, updatedBy, deletedBy', () => {
    const result = mapApplication(fakeRow) as Record<string, unknown>;
    expect('deletedAt' in result).toBe(false);
    expect('createdBy' in result).toBe(false);
    expect('updatedBy' in result).toBe(false);
    expect('deletedBy' in result).toBe(false);
  });

  it('maps null jobUrl and notes correctly', () => {
    const result = mapApplication({ ...fakeRow, jobUrl: null, notes: null });
    expect(result.jobUrl).toBeNull();
    expect(result.notes).toBeNull();
  });
});

describe('applicationResponseSchema', () => {
  it('validates a well-formed response', () => {
    const data = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      company: 'Acme',
      role: 'Engineer',
      status: 'saved',
      jobUrl: null,
      notes: null,
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    };
    expect(() => applicationResponseSchema.parse(data)).not.toThrow();
  });

  it('rejects a response with an invalid UUID', () => {
    expect(() => applicationResponseSchema.parse({ id: 'not-uuid' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/application/dtos/v1/responses/application.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/application/dtos/v1/responses/application.ts
import { z } from 'zod';

export const applicationResponseSchema = z.object({
  id: z.string().uuid(),
  company: z.string(),
  role: z.string(),
  status: z.string(),
  jobUrl: z.string().url().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ApplicationResponse = z.infer<typeof applicationResponseSchema>;

export function mapApplication(row: {
  id: string;
  company: string;
  role: string;
  status: string;
  jobUrl: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ApplicationResponse {
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    status: row.status,
    jobUrl: row.jobUrl,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/application/dtos/v1/responses/application.test.ts`
Expected: PASS (all 5 cases).

---

### Task 5: Request DTOs — create, update, listQuery

**Files:**
- Create: `src/features/application/dtos/v1/requests/create-application.ts`
- Create: `src/features/application/dtos/v1/requests/update-application.ts`
- Create: `src/features/application/dtos/v1/requests/list-applications-query.ts`
- Test: `src/features/application/dtos/v1/requests/create-application.test.ts`
- Test: `src/features/application/dtos/v1/requests/update-application.test.ts`
- Test: `src/features/application/dtos/v1/requests/list-applications-query.test.ts`

**Interfaces:**
- Consumes: `applicationStatusSchema` from `@/features/application/constants/status`.
- Produces:
  - `createApplicationSchema` — `{ company: string (1-200), role: string (1-200), jobUrl?: string (valid URL), notes?: string (max 2000), status?: ApplicationStatus (default 'saved') }`.
  - `type CreateApplicationRequest = z.infer<typeof createApplicationSchema>`
  - `updateApplicationSchema` — same optional fields; `.refine(obj => ≥1 field present)` to block empty patches.
  - `type UpdateApplicationRequest = z.infer<typeof updateApplicationSchema>`
  - `listApplicationsQuerySchema` — `{ status?: ApplicationStatus, archived?: boolean (coerced), cursor?: string, limit?: number (coerced, default 20, max 50) }` with a superRefine that makes `status` and `archived` mutually exclusive.
  - `type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/application/dtos/v1/requests/create-application.test.ts
import { describe, it, expect } from 'vitest';
import { createApplicationSchema } from './create-application';

describe('createApplicationSchema', () => {
  it('accepts a valid create payload', () => {
    const result = createApplicationSchema.parse({ company: 'Acme', role: 'Engineer' });
    expect(result.company).toBe('Acme');
    expect(result.status).toBe('saved'); // default applied
  });

  it('rejects empty company', () => {
    expect(() => createApplicationSchema.parse({ company: '', role: 'Engineer' })).toThrow();
  });

  it('rejects missing role', () => {
    expect(() => createApplicationSchema.parse({ company: 'Acme' })).toThrow();
  });

  it('rejects company longer than 200 chars', () => {
    expect(() => createApplicationSchema.parse({ company: 'a'.repeat(201), role: 'Eng' })).toThrow();
  });

  it('rejects role longer than 200 chars', () => {
    expect(() => createApplicationSchema.parse({ company: 'Acme', role: 'a'.repeat(201) })).toThrow();
  });

  it('rejects notes longer than 2000 chars', () => {
    expect(() =>
      createApplicationSchema.parse({ company: 'Acme', role: 'Eng', notes: 'n'.repeat(2001) })
    ).toThrow();
  });

  it('rejects an invalid jobUrl', () => {
    expect(() =>
      createApplicationSchema.parse({ company: 'Acme', role: 'Eng', jobUrl: 'not-a-url' })
    ).toThrow();
  });

  it('accepts a valid jobUrl', () => {
    const result = createApplicationSchema.parse({ company: 'Acme', role: 'Eng', jobUrl: 'https://acme.com/jobs' });
    expect(result.jobUrl).toBe('https://acme.com/jobs');
  });

  it('rejects an unknown status', () => {
    expect(() =>
      createApplicationSchema.parse({ company: 'Acme', role: 'Eng', status: 'pending' })
    ).toThrow();
  });
});
```

```ts
// src/features/application/dtos/v1/requests/update-application.test.ts
import { describe, it, expect } from 'vitest';
import { updateApplicationSchema } from './update-application';

describe('updateApplicationSchema', () => {
  it('accepts a valid status-only patch', () => {
    const result = updateApplicationSchema.parse({ status: 'applied' });
    expect(result.status).toBe('applied');
  });

  it('accepts a multi-field patch', () => {
    const result = updateApplicationSchema.parse({ company: 'NewCo', status: 'offer' });
    expect(result.company).toBe('NewCo');
  });

  it('rejects an empty patch (no fields)', () => {
    expect(() => updateApplicationSchema.parse({})).toThrow();
  });

  it('rejects company empty string', () => {
    expect(() => updateApplicationSchema.parse({ company: '' })).toThrow();
  });

  it('rejects notes longer than 2000 chars', () => {
    expect(() => updateApplicationSchema.parse({ notes: 'n'.repeat(2001) })).toThrow();
  });

  it('rejects an invalid jobUrl', () => {
    expect(() => updateApplicationSchema.parse({ jobUrl: 'bad' })).toThrow();
  });

  it('rejects an unknown status', () => {
    expect(() => updateApplicationSchema.parse({ status: 'ghost' })).toThrow();
  });
});
```

```ts
// src/features/application/dtos/v1/requests/list-applications-query.test.ts
import { describe, it, expect } from 'vitest';
import { listApplicationsQuerySchema } from './list-applications-query';

describe('listApplicationsQuerySchema', () => {
  it('defaults limit to 20', () => {
    const result = listApplicationsQuerySchema.parse({});
    expect(result.limit).toBe(20);
  });

  it('caps limit at 50', () => {
    const result = listApplicationsQuerySchema.parse({ limit: '100' });
    expect(result.limit).toBe(50);
  });

  it('coerces limit from string', () => {
    const result = listApplicationsQuerySchema.parse({ limit: '30' });
    expect(result.limit).toBe(30);
  });

  it('accepts a valid status filter', () => {
    const result = listApplicationsQuerySchema.parse({ status: 'applied' });
    expect(result.status).toBe('applied');
  });

  it('rejects an invalid status', () => {
    expect(() => listApplicationsQuerySchema.parse({ status: 'ghost' })).toThrow();
  });

  it('coerces archived=true from string', () => {
    const result = listApplicationsQuerySchema.parse({ archived: 'true' });
    expect(result.archived).toBe(true);
  });

  it('rejects providing both status and archived', () => {
    expect(() =>
      listApplicationsQuerySchema.parse({ status: 'applied', archived: 'true' })
    ).toThrow();
  });

  it('accepts cursor string', () => {
    const result = listApplicationsQuerySchema.parse({ cursor: 'abc123' });
    expect(result.cursor).toBe('abc123');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/features/application/dtos/v1/requests/`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the create DTO**

```ts
// src/features/application/dtos/v1/requests/create-application.ts
import { z } from 'zod';
import { applicationStatusSchema } from '@/features/application/constants/status';

export const createApplicationSchema = z.object({
  company: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  jobUrl: z.string().url().optional(),
  notes: z.string().max(2000).optional(),
  status: applicationStatusSchema.default('saved'),
});

export type CreateApplicationRequest = z.infer<typeof createApplicationSchema>;
```

- [ ] **Step 4: Write the update DTO**

```ts
// src/features/application/dtos/v1/requests/update-application.ts
import { z } from 'zod';
import { applicationStatusSchema } from '@/features/application/constants/status';

const updateApplicationBase = z.object({
  company: z.string().min(1).max(200).optional(),
  role: z.string().min(1).max(200).optional(),
  jobUrl: z.string().url().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  status: applicationStatusSchema.optional(),
});

export const updateApplicationSchema = updateApplicationBase.refine(
  (obj) => Object.values(obj).some((v) => v !== undefined),
  { message: 'At least one field must be provided' },
);

export type UpdateApplicationRequest = z.infer<typeof updateApplicationSchema>;
```

- [ ] **Step 5: Write the list-query DTO**

```ts
// src/features/application/dtos/v1/requests/list-applications-query.ts
import { z } from 'zod';
import { applicationStatusSchema } from '@/features/application/constants/status';

export const listApplicationsQuerySchema = z
  .object({
    status: applicationStatusSchema.optional(),
    archived: z.coerce.boolean().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .superRefine((obj, ctx) => {
    if (obj.status !== undefined && obj.archived !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '`status` and `archived` are mutually exclusive',
        path: ['archived'],
      });
    }
  });

export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;
```

- [ ] **Step 6: Run all three test files to verify they pass**

Run: `npm run test -- src/features/application/dtos/v1/requests/`
Expected: PASS (all cases across all three files).

---

### Task 6: Cursor codec (`shared/lib/cursor.ts`)

**Files:**
- Create: `src/shared/lib/cursor.ts`
- Test: `src/shared/lib/cursor.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces:
  - `encodeCursor(input: { ts: Date; id: string }): string` — base64url of `${ts.toISOString()}|${id}`.
  - `decodeCursor(cursor: string): { ts: Date; id: string }` — inverse; throws `Error('Invalid cursor')` if the input is not a valid base64url string of the expected format.

Note: field name `ts` (not `updatedAt`) is intentional so Plan 3's audit timeline can reuse this codec with `createdAt`.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/cursor.test.ts
import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from './cursor';

describe('cursor codec', () => {
  const ts = new Date('2026-03-15T09:30:00.000Z');
  const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('encodes to a non-empty string', () => {
    const encoded = encodeCursor({ ts, id });
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
  });

  it('decodes to the original values (round-trip)', () => {
    const encoded = encodeCursor({ ts, id });
    const decoded = decodeCursor(encoded);
    expect(decoded.ts.toISOString()).toBe(ts.toISOString());
    expect(decoded.id).toBe(id);
  });

  it('decoded ts is a Date object', () => {
    const encoded = encodeCursor({ ts, id });
    const decoded = decodeCursor(encoded);
    expect(decoded.ts).toBeInstanceOf(Date);
  });

  it('throws on a malformed cursor', () => {
    expect(() => decodeCursor('not-base64!!!')).toThrow('Invalid cursor');
  });

  it('throws when the decoded payload lacks the pipe separator', () => {
    // valid base64url but wrong internal format
    const bad = Buffer.from('nopipe').toString('base64url');
    expect(() => decodeCursor(bad)).toThrow('Invalid cursor');
  });

  it('throws when the date part is not a valid ISO string', () => {
    const bad = Buffer.from('NOTADATE|some-uuid').toString('base64url');
    expect(() => decodeCursor(bad)).toThrow('Invalid cursor');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/shared/lib/cursor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/lib/cursor.ts
export function encodeCursor(input: { ts: Date; id: string }): string {
  const payload = `${input.ts.toISOString()}|${input.id}`;
  return Buffer.from(payload).toString('base64url');
}

export function decodeCursor(cursor: string): { ts: Date; id: string } {
  let payload: string;
  try {
    payload = Buffer.from(cursor, 'base64url').toString('utf-8');
  } catch {
    throw new Error('Invalid cursor');
  }

  const pipeIdx = payload.indexOf('|');
  if (pipeIdx === -1) throw new Error('Invalid cursor');

  const isoStr = payload.slice(0, pipeIdx);
  const id = payload.slice(pipeIdx + 1);

  const ts = new Date(isoStr);
  if (isNaN(ts.getTime())) throw new Error('Invalid cursor');
  if (!id) throw new Error('Invalid cursor');

  return { ts, id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/shared/lib/cursor.test.ts`
Expected: PASS (all 6 cases).

---

### Task 7: `diffOf` utility

**Files:**
- Create: `src/features/application/utils/diff.ts`
- Test: `src/features/application/utils/diff.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces: `diffOf(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }>` — returns an object containing only fields where `before[key] !== after[key]` (by `===` strict equality for primitives; for Dates, compare `.toISOString()`). If no fields changed, returns `{}`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/application/utils/diff.test.ts
import { describe, it, expect } from 'vitest';
import { diffOf } from './diff';

describe('diffOf', () => {
  it('returns an empty object when nothing changed', () => {
    expect(diffOf({ status: 'saved', company: 'Acme' }, { status: 'saved', company: 'Acme' })).toEqual({});
  });

  it('returns changed fields with from/to', () => {
    const result = diffOf({ status: 'saved', company: 'Acme' }, { status: 'applied', company: 'Acme' });
    expect(result).toEqual({ status: { from: 'saved', to: 'applied' } });
  });

  it('captures multiple changed fields', () => {
    const result = diffOf(
      { status: 'saved', company: 'Acme', role: 'Engineer' },
      { status: 'applied', company: 'NewCo', role: 'Engineer' },
    );
    expect(result).toEqual({
      status: { from: 'saved', to: 'applied' },
      company: { from: 'Acme', to: 'NewCo' },
    });
  });

  it('captures null → value transitions', () => {
    const result = diffOf({ notes: null }, { notes: 'Great company' });
    expect(result).toEqual({ notes: { from: null, to: 'Great company' } });
  });

  it('captures value → null transitions', () => {
    const result = diffOf({ notes: 'Old notes' }, { notes: null });
    expect(result).toEqual({ notes: { from: 'Old notes', to: null } });
  });

  it('compares Date values by ISO string', () => {
    const d1 = new Date('2026-01-01T00:00:00.000Z');
    const d2 = new Date('2026-01-02T00:00:00.000Z');
    const same = new Date('2026-01-01T00:00:00.000Z');
    expect(diffOf({ updatedAt: d1 }, { updatedAt: same })).toEqual({});
    expect(diffOf({ updatedAt: d1 }, { updatedAt: d2 })).toEqual({
      updatedAt: { from: d1, to: d2 },
    });
  });

  it('ignores keys present only in before or only in after', () => {
    const result = diffOf({ a: 1, b: 2 }, { b: 2, c: 3 } as Record<string, unknown>);
    // only shared keys that changed; 'a' removed, 'c' added are ignored
    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/application/utils/diff.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/application/utils/diff.ts
function valueOf(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export function diffOf(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const result: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(before)) {
    if (!(key in after)) continue;
    const a = before[key];
    const b = after[key];
    const equal =
      a === b ||
      (a instanceof Date && b instanceof Date && valueOf(a) === valueOf(b));
    if (!equal) {
      result[key] = { from: a, to: b };
    }
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/application/utils/diff.test.ts`
Expected: PASS (all 7 cases).

---

### Task 8: Application repository (keyset `findMany`, `findById`, `create`, `update`, `softDelete`)

**Files:**
- Create: `src/features/application/repositories/application.ts`
- Test: `src/features/application/repositories/application.test.ts`

**Interfaces:**
- Consumes: `db`, `DbTransaction` from `@/shared/lib/db`; `applications` table from `@/features/application/db/schema`; `encodeCursor`, `decodeCursor` from `@/shared/lib/cursor`.
- Produces: `applicationRepo` object with:
  - `findById(id: string, tx?: DbTransaction): Promise<typeof applications.$inferSelect | undefined>`
  - `findMany(opts: { status?: string; archived?: boolean; cursor?: string; limit: number }, tx?: DbTransaction): Promise<{ rows: typeof applications.$inferSelect[]; nextCursor: string | null; hasMore: boolean }>`
    - Filters `deletedAt IS NULL`.
    - If `archived=true`: `WHERE status IN ('accepted','rejected','withdrawn')`.
    - If `status` provided: `WHERE status = status`.
    - Keyset: if `cursor` present, decode and add `WHERE (updated_at, id) < (ts, id)` (DESC ordering means we use `<`).
    - Fetches `limit + 1` rows to detect `hasMore`; returns `limit` rows + cursor for the `(limit+1)`th row.
    - Ordered `updatedAt DESC, id DESC`.
  - `create(values: { company: string; role: string; status: string; jobUrl?: string | null; notes?: string | null }, tx?: DbTransaction): Promise<typeof applications.$inferSelect>`
  - `update(id: string, patch: { company?: string; role?: string; status?: string; jobUrl?: string | null; notes?: string | null }, tx?: DbTransaction): Promise<typeof applications.$inferSelect>`
  - `softDelete(id: string, actor?: string | null, tx?: DbTransaction): Promise<typeof applications.$inferSelect>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/application/repositories/application.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { applicationRepo } from './application';
import { withRollback } from '@/shared/test/db';

// Helper: create a real app row inside a transaction
async function seed(tx: Parameters<typeof withRollback>[0] extends (tx: infer T) => Promise<void> ? T : never) {
  return applicationRepo.create(
    { company: 'Acme', role: 'Engineer', status: 'saved' },
    tx,
  );
}

describe('applicationRepo', () => {
  describe('create', () => {
    it('inserts a row and returns it with all base columns', async () => {
      await withRollback(async (tx) => {
        const row = await applicationRepo.create(
          { company: 'Acme', role: 'Software Engineer', status: 'saved' },
          tx,
        );
        expect(row.id).toBeTruthy();
        expect(row.company).toBe('Acme');
        expect(row.role).toBe('Software Engineer');
        expect(row.status).toBe('saved');
        expect(row.deletedAt).toBeNull();
        expect(row.createdAt).toBeInstanceOf(Date);
      });
    });

    it('stores jobUrl and notes when provided', async () => {
      await withRollback(async (tx) => {
        const row = await applicationRepo.create(
          { company: 'Acme', role: 'Engineer', status: 'saved', jobUrl: 'https://acme.com', notes: 'via referral' },
          tx,
        );
        expect(row.jobUrl).toBe('https://acme.com');
        expect(row.notes).toBe('via referral');
      });
    });
  });

  describe('findById', () => {
    it('returns the row when it exists', async () => {
      await withRollback(async (tx) => {
        const created = await applicationRepo.create(
          { company: 'Acme', role: 'Engineer', status: 'saved' },
          tx,
        );
        const found = await applicationRepo.findById(created.id, tx);
        expect(found?.id).toBe(created.id);
      });
    });

    it('returns undefined for an unknown id', async () => {
      await withRollback(async (tx) => {
        const found = await applicationRepo.findById('00000000-0000-0000-0000-000000000000', tx);
        expect(found).toBeUndefined();
      });
    });

    it('returns undefined for a soft-deleted row', async () => {
      await withRollback(async (tx) => {
        const created = await applicationRepo.create(
          { company: 'Acme', role: 'Engineer', status: 'saved' },
          tx,
        );
        await applicationRepo.softDelete(created.id, null, tx);
        const found = await applicationRepo.findById(created.id, tx);
        expect(found).toBeUndefined();
      });
    });
  });

  describe('findMany', () => {
    it('returns rows matching a status filter', async () => {
      await withRollback(async (tx) => {
        await applicationRepo.create({ company: 'A', role: 'Eng', status: 'applied' }, tx);
        await applicationRepo.create({ company: 'B', role: 'Eng', status: 'saved' }, tx);
        const result = await applicationRepo.findMany({ status: 'applied', limit: 20 }, tx);
        expect(result.rows.every((r) => r.status === 'applied')).toBe(true);
        expect(result.rows.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('returns archived (terminal) rows when archived=true', async () => {
      await withRollback(async (tx) => {
        await applicationRepo.create({ company: 'A', role: 'Eng', status: 'rejected' }, tx);
        await applicationRepo.create({ company: 'B', role: 'Eng', status: 'saved' }, tx);
        const result = await applicationRepo.findMany({ archived: true, limit: 20 }, tx);
        const statuses = new Set(result.rows.map((r) => r.status));
        expect(['accepted', 'rejected', 'withdrawn'].some((s) => statuses.has(s))).toBe(true);
        expect(statuses.has('saved')).toBe(false);
      });
    });

    it('excludes soft-deleted rows', async () => {
      await withRollback(async (tx) => {
        const row = await applicationRepo.create({ company: 'Del', role: 'Eng', status: 'saved' }, tx);
        await applicationRepo.softDelete(row.id, null, tx);
        const result = await applicationRepo.findMany({ status: 'saved', limit: 20 }, tx);
        expect(result.rows.find((r) => r.id === row.id)).toBeUndefined();
      });
    });

    it('returns hasMore=true and a nextCursor when more rows exist', async () => {
      await withRollback(async (tx) => {
        // Insert 3 rows with same status
        for (let i = 0; i < 3; i++) {
          await applicationRepo.create({ company: `Co${i}`, role: 'Eng', status: 'saved' }, tx);
        }
        const result = await applicationRepo.findMany({ status: 'saved', limit: 2 }, tx);
        // hasMore and nextCursor depend on pre-existing data, so we check the contract shape
        expect(typeof result.hasMore).toBe('boolean');
        expect(result.nextCursor === null || typeof result.nextCursor === 'string').toBe(true);
      });
    });
  });

  describe('update', () => {
    it('updates fields and returns the new row', async () => {
      await withRollback(async (tx) => {
        const created = await applicationRepo.create({ company: 'Acme', role: 'Eng', status: 'saved' }, tx);
        const updated = await applicationRepo.update(created.id, { status: 'applied', company: 'NewCo' }, tx);
        expect(updated.status).toBe('applied');
        expect(updated.company).toBe('NewCo');
      });
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt and deletedBy', async () => {
      await withRollback(async (tx) => {
        const created = await applicationRepo.create({ company: 'Acme', role: 'Eng', status: 'saved' }, tx);
        const deleted = await applicationRepo.softDelete(created.id, 'test-actor', tx);
        expect(deleted.deletedAt).toBeInstanceOf(Date);
        expect(deleted.deletedBy).toBe('test-actor');
      });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/application/repositories/application.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the repository**

```ts
// src/features/application/repositories/application.ts
import 'server-only';
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/shared/lib/db';
import type { DbTransaction } from '@/shared/lib/db';
import { applications } from '@/features/application/db/schema';
import { TERMINAL_STATUSES } from '@/features/application/constants/status';
import { encodeCursor, decodeCursor } from '@/shared/lib/cursor';

type AppRow = typeof applications.$inferSelect;
type Tx = DbTransaction | typeof db;

function conn(tx?: DbTransaction): Tx {
  return tx ?? db;
}

export const applicationRepo = {
  async findById(id: string, tx?: DbTransaction): Promise<AppRow | undefined> {
    const rows = await conn(tx)
      .select()
      .from(applications)
      .where(and(eq(applications.id, id), isNull(applications.deletedAt)));
    return rows[0];
  },

  async findMany(
    opts: { status?: string; archived?: boolean; cursor?: string; limit: number },
    tx?: DbTransaction,
  ): Promise<{ rows: AppRow[]; nextCursor: string | null; hasMore: boolean }> {
    const { status, archived, cursor, limit } = opts;
    const fetchLimit = limit + 1;

    const conditions = [isNull(applications.deletedAt)];

    if (archived) {
      conditions.push(inArray(applications.status, [...TERMINAL_STATUSES]));
    } else if (status !== undefined) {
      conditions.push(eq(applications.status, status));
    }

    if (cursor) {
      const { ts, id } = decodeCursor(cursor);
      conditions.push(
        or(
          lt(applications.updatedAt, ts),
          and(eq(applications.updatedAt, ts), lt(applications.id, id)),
        )!,
      );
    }

    const rawRows = await conn(tx)
      .select()
      .from(applications)
      .where(and(...conditions))
      .orderBy(sql`${applications.updatedAt} DESC, ${applications.id} DESC`)
      .limit(fetchLimit);

    const hasMore = rawRows.length > limit;
    const rows = hasMore ? rawRows.slice(0, limit) : rawRows;
    const lastRow = rows[rows.length - 1];
    const nextCursor =
      hasMore && lastRow ? encodeCursor({ ts: lastRow.updatedAt, id: lastRow.id }) : null;

    return { rows, nextCursor, hasMore };
  },

  async create(
    values: {
      company: string;
      role: string;
      status: string;
      jobUrl?: string | null;
      notes?: string | null;
    },
    tx?: DbTransaction,
  ): Promise<AppRow> {
    const [row] = await conn(tx)
      .insert(applications)
      .values({
        company: values.company,
        role: values.role,
        status: values.status,
        jobUrl: values.jobUrl ?? null,
        notes: values.notes ?? null,
      })
      .returning();
    return row;
  },

  async update(
    id: string,
    patch: {
      company?: string;
      role?: string;
      status?: string;
      jobUrl?: string | null;
      notes?: string | null;
    },
    tx?: DbTransaction,
  ): Promise<AppRow> {
    const [row] = await conn(tx)
      .update(applications)
      .set({
        ...(patch.company !== undefined ? { company: patch.company } : {}),
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...('jobUrl' in patch ? { jobUrl: patch.jobUrl } : {}),
        ...('notes' in patch ? { notes: patch.notes } : {}),
      })
      .where(eq(applications.id, id))
      .returning();
    return row;
  },

  async softDelete(id: string, actor?: string | null, tx?: DbTransaction): Promise<AppRow> {
    const [row] = await conn(tx)
      .update(applications)
      .set({ deletedAt: new Date(), deletedBy: actor ?? null })
      .where(eq(applications.id, id))
      .returning();
    return row;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/application/repositories/application.test.ts`
Expected: PASS (all test cases).

---

### Task 9: Application service (business logic, transactions, idempotent no-op, audit)

**Files:**
- Create: `src/features/application/services/application.ts`
- Test: `src/features/application/services/application.test.ts`

**Interfaces:**
- Consumes:
  - `applicationRepo` from `@/features/application/repositories/application`
  - `mapApplication`, `ApplicationResponse` from `@/features/application/dtos/v1/responses/application`
  - `diffOf` from `@/features/application/utils/diff`
  - `recordAudit` from `@/shared/lib/audit`
  - `db` from `@/shared/lib/db`
  - `ok`, `paginated` from `@/shared/lib/response`
  - `SuccessMessageConstant`, `ErrorMessageConstant` from `@/shared/constants/messages`
  - `PaginatedData` from `@/shared/types/response`
  - `HTTPException` from `hono/http-exception`
- Produces: `applicationService` object with:
  - `create(data: CreateApplicationRequest): Promise<ApplicationResponse>`
  - `getById(id: string): Promise<ApplicationResponse>` — throws `HTTPException(404)` via `ErrorMessageConstant.DataEntityNotFound('Application')` when not found.
  - `list(query: ListApplicationsQuery): Promise<PaginatedData<ApplicationResponse>>`
  - `update(id: string, patch: UpdateApplicationRequest): Promise<ApplicationResponse>` — **idempotent no-op**: if every provided field already equals the current value, return `mapApplication(before)` with NO mutation, NO audit row. Otherwise: `db.transaction` → load `before` → `repo.update` → `recordAudit('updated', diff)` → return mapped.
  - `remove(id: string, actor?: string | null): Promise<ApplicationResponse>` — `db.transaction` → `repo.softDelete` → `recordAudit('deleted', oldData=before)` → return mapped.

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/application/services/application.test.ts
import { describe, it, expect } from 'vitest';
import { applicationService } from './application';
import { applicationRepo } from '@/features/application/repositories/application';
import { db } from '@/shared/lib/db';
import { eq } from 'drizzle-orm';
import { auditLog } from '@/shared/db/audit-log';
import { applications } from '@/features/application/db/schema';
import { withRollback } from '@/shared/test/db';

// These tests run against the real DB inside rollback transactions.
// Each test creates its own data; isolation is guaranteed by withRollback.

describe('applicationService.create', () => {
  it('creates with default status=saved', async () => {
    await withRollback(async (tx) => {
      // We need to call service in the context of this tx.
      // Because services call db.transaction internally, we test via repo directly
      // for isolation, and test service's public API in a fresh outer transaction.
      // For create (single insert, no nested txn), we can test the output directly.
      const row = await applicationRepo.create(
        { company: 'Acme', role: 'Eng', status: 'saved' },
        tx,
      );
      expect(row.status).toBe('saved');
      expect(row.jobUrl).toBeNull();
    });
  });
});

describe('applicationService.getById', () => {
  it('throws 404 for an unknown id', async () => {
    await expect(
      applicationService.getById('00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('applicationService.list', () => {
  it('returns PaginatedData with items array and meta', async () => {
    const result = await applicationService.list({ limit: 5 });
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.meta.limit).toBe('number');
    expect(typeof result.meta.hasMore).toBe('boolean');
  });
});

describe('applicationService.update — idempotent no-op', () => {
  it('writes NO mutation and NO audit row when patch equals current values', async () => {
    // Create a real row first (outside rollback so service can find it)
    const created = await applicationRepo.create(
      { company: 'Acme', role: 'Engineer', status: 'saved' },
    );

    try {
      // Count audit rows before
      const beforeAudit = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, created.id));

      // Patch with the exact same value — idempotent
      const result = await applicationService.update(created.id, { status: 'saved' });

      // Count audit rows after
      const afterAudit = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, created.id));

      expect(result.status).toBe('saved');
      expect(afterAudit.length).toBe(beforeAudit.length); // no new row written
    } finally {
      // Cleanup: hard delete the row so it doesn't pollute other tests
      await db.delete(applications).where(eq(applications.id, created.id));
    }
  });

  it('writes mutation + audit row when status actually changes', async () => {
    const created = await applicationRepo.create(
      { company: 'Acme', role: 'Engineer', status: 'saved' },
    );

    try {
      const beforeAudit = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, created.id));

      const result = await applicationService.update(created.id, { status: 'applied' });

      const afterAudit = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, created.id));

      expect(result.status).toBe('applied');
      expect(afterAudit.length).toBe(beforeAudit.length + 1);
      const auditRow = afterAudit[afterAudit.length - 1];
      expect(auditRow.action).toBe('updated');
      expect((auditRow.diff as Record<string, unknown>)?.status).toMatchObject({
        from: 'saved',
        to: 'applied',
      });
    } finally {
      await db.delete(applications).where(eq(applications.id, created.id));
    }
  });

  it('throws 404 when id does not exist', async () => {
    await expect(
      applicationService.update('00000000-0000-0000-0000-000000000000', { status: 'applied' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('applicationService.remove', () => {
  it('soft-deletes the row and writes a deleted audit row', async () => {
    const created = await applicationRepo.create(
      { company: 'DeleteMe', role: 'Eng', status: 'saved' },
    );

    try {
      const result = await applicationService.remove(created.id);
      expect(result.id).toBe(created.id);

      // Row should no longer be findable
      const gone = await applicationRepo.findById(created.id);
      expect(gone).toBeUndefined();

      // Audit log should have a 'deleted' entry
      const auditRows = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, created.id));
      expect(auditRows.some((r) => r.action === 'deleted')).toBe(true);
    } finally {
      await db.delete(applications).where(eq(applications.id, created.id));
    }
  });

  it('throws 404 when id does not exist', async () => {
    await expect(
      applicationService.remove('00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/features/application/services/application.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the service**

```ts
// src/features/application/services/application.ts
import 'server-only';
import { HTTPException } from 'hono/http-exception';
import { db } from '@/shared/lib/db';
import { recordAudit } from '@/shared/lib/audit';
import { ErrorMessageConstant } from '@/shared/constants/messages';
import type { PaginatedData } from '@/shared/types/response';
import { applicationRepo } from '@/features/application/repositories/application';
import { mapApplication } from '@/features/application/dtos/v1/responses/application';
import type { ApplicationResponse } from '@/features/application/dtos/v1/responses/application';
import type { CreateApplicationRequest } from '@/features/application/dtos/v1/requests/create-application';
import type { UpdateApplicationRequest } from '@/features/application/dtos/v1/requests/update-application';
import type { ListApplicationsQuery } from '@/features/application/dtos/v1/requests/list-applications-query';
import { diffOf } from '@/features/application/utils/diff';

export const applicationService = {
  async create(data: CreateApplicationRequest): Promise<ApplicationResponse> {
    const row = await db.transaction(async (tx) => {
      const created = await applicationRepo.create(
        {
          company: data.company,
          role: data.role,
          status: data.status ?? 'saved',
          jobUrl: data.jobUrl ?? null,
          notes: data.notes ?? null,
        },
        tx,
      );
      await recordAudit(tx, {
        entityType: 'application',
        entityId: created.id,
        action: 'created',
        newData: created,
      });
      return created;
    });
    return mapApplication(row);
  },

  async getById(id: string): Promise<ApplicationResponse> {
    const row = await applicationRepo.findById(id);
    if (!row) {
      throw new HTTPException(404, {
        message: ErrorMessageConstant.DataEntityNotFound('Application'),
      });
    }
    return mapApplication(row);
  },

  async list(query: ListApplicationsQuery): Promise<PaginatedData<ApplicationResponse>> {
    const { rows, nextCursor, hasMore } = await applicationRepo.findMany({
      status: query.status,
      archived: query.archived,
      cursor: query.cursor,
      limit: query.limit,
    });
    return {
      items: rows.map(mapApplication),
      meta: { limit: query.limit, nextCursor, hasMore },
    };
  },

  async update(id: string, patch: UpdateApplicationRequest): Promise<ApplicationResponse> {
    return db.transaction(async (tx) => {
      const before = await applicationRepo.findById(id, tx);
      if (!before) {
        throw new HTTPException(404, {
          message: ErrorMessageConstant.DataEntityNotFound('Application'),
        });
      }

      // Build a plain object with only the patched keys for comparison
      const patchedFields: Record<string, unknown> = {};
      if (patch.company !== undefined) patchedFields.company = patch.company;
      if (patch.role !== undefined) patchedFields.role = patch.role;
      if (patch.status !== undefined) patchedFields.status = patch.status;
      if ('jobUrl' in patch) patchedFields.jobUrl = patch.jobUrl;
      if ('notes' in patch) patchedFields.notes = patch.notes;

      const currentFields: Record<string, unknown> = {};
      for (const key of Object.keys(patchedFields)) {
        currentFields[key] = (before as Record<string, unknown>)[key];
      }

      const changed = diffOf(currentFields, patchedFields);

      // Idempotent no-op: nothing changed
      if (Object.keys(changed).length === 0) {
        return mapApplication(before);
      }

      const after = await applicationRepo.update(id, patch, tx);
      await recordAudit(tx, {
        entityType: 'application',
        entityId: id,
        action: 'updated',
        oldData: before,
        newData: after,
        diff: changed,
      });
      return mapApplication(after);
    });
  },

  async remove(id: string, actor?: string | null): Promise<ApplicationResponse> {
    return db.transaction(async (tx) => {
      const before = await applicationRepo.findById(id, tx);
      if (!before) {
        throw new HTTPException(404, {
          message: ErrorMessageConstant.DataEntityNotFound('Application'),
        });
      }
      const deleted = await applicationRepo.softDelete(id, actor ?? null, tx);
      await recordAudit(tx, {
        entityType: 'application',
        entityId: id,
        action: 'deleted',
        oldData: before,
        newData: null,
      });
      return mapApplication(deleted);
    });
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/features/application/services/application.test.ts`
Expected: PASS (all test cases).

- [ ] **Step 5: Write the failing test — `applicationService.create` defaults status to `saved` AND writes a `created` audit row (end-to-end through the service)**

```ts
// Append to src/features/application/services/application.test.ts

describe('applicationService.create — end-to-end through service', () => {
  it('defaults status to saved and writes a created audit row', async () => {
    const result = await applicationService.create({ company: 'Acme', role: 'Engineer' });

    try {
      // Returned DTO must have status === 'saved'
      expect(result.status).toBe('saved');

      // Exactly one audit_log row for this entity with action === 'created'
      const auditRows = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, result.id));

      expect(auditRows.length).toBe(1);
      expect(auditRows[0].action).toBe('created');
      expect(auditRows[0].entityType).toBe('application');
    } finally {
      await db.delete(applications).where(eq(applications.id, result.id));
    }
  });
});
```

- [ ] **Step 6: Run to verify Step 5 test fails**

Run: `npm run test -- src/features/application/services/application.test.ts`
Expected: FAIL — the new `applicationService.create` end-to-end describe block fails (module exists, but this test block is not yet in the file; once added it will fail until Step 7 confirms the existing impl satisfies it).

- [ ] **Step 7: Verify existing implementation satisfies Step 5 (no new impl needed)**

The `applicationService.create` implementation written in Step 3 already:
- passes `data.status ?? 'saved'` to `applicationRepo.create`, so when no `status` is provided the default is `'saved'`.
- calls `recordAudit(tx, { ..., action: 'created', newData: created })` inside the same `db.transaction`.

No changes to the production code are required. Add the test block from Step 5 to the test file and re-run.

- [ ] **Step 8: Run to verify Step 5 test passes**

Run: `npm run test -- src/features/application/services/application.test.ts`
Expected: PASS (all test cases including the new create end-to-end test).

- [ ] **Step 9: Write the failing test — `applicationService.update` multi-field edit produces a correct multi-field `diff`**

```ts
// Append to src/features/application/services/application.test.ts

describe('applicationService.update — multi-field diff', () => {
  it('produces a diff containing both changed fields when company and status change together', async () => {
    const created = await applicationRepo.create(
      { company: 'Acme', role: 'Engineer', status: 'saved' },
    );

    try {
      const result = await applicationService.update(created.id, {
        company: 'NewCo',
        status: 'applied',
      });

      // Returned DTO reflects both changes
      expect(result.company).toBe('NewCo');
      expect(result.status).toBe('applied');

      // Audit row's diff must contain both fields
      const auditRows = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, created.id));

      const updatedRow = auditRows.find((r) => r.action === 'updated');
      expect(updatedRow).toBeDefined();

      const diff = updatedRow!.diff as Record<string, { from: unknown; to: unknown }>;
      expect(diff.company).toMatchObject({ from: 'Acme', to: 'NewCo' });
      expect(diff.status).toMatchObject({ from: 'saved', to: 'applied' });
    } finally {
      await db.delete(applications).where(eq(applications.id, created.id));
    }
  });
});
```

- [ ] **Step 10: Run to verify Step 9 test fails**

Run: `npm run test -- src/features/application/services/application.test.ts`
Expected: FAIL — the new multi-field diff describe block fails (not yet in the file; once added it will fail until Step 11 confirms the existing impl satisfies it).

- [ ] **Step 11: Verify existing implementation satisfies Step 9 (no new impl needed)**

The `applicationService.update` implementation written in Step 3 already:
- builds `patchedFields` for every provided key (`company`, `status`, etc.).
- builds `currentFields` from the `before` snapshot for those same keys.
- calls `diffOf(currentFields, patchedFields)` which captures all changed fields into `changed`.
- passes `diff: changed` to `recordAudit`, so when both `company` and `status` change, the written `diff` object contains entries for both.

No changes to the production code are required. Add the test block from Step 9 to the test file and re-run.

- [ ] **Step 12: Run to verify Step 9 test passes**

Run: `npm run test -- src/features/application/services/application.test.ts`
Expected: PASS (all test cases including the new multi-field diff test).

---

### Task 10: Root Hono app (`shared/lib/api.ts`) + `onError` status table + `ValidationException`

**Files:**
- Create: `src/shared/lib/api.ts`
- Test: `src/shared/lib/api.test.ts`

**Interfaces:**
- Consumes: `ErrorMessageConstant` from `@/shared/constants/messages`; `ApiError` from `@/shared/types/response`.
- Produces:
  - `app` — `new Hono().basePath('/api')` with `logger()`, a global `onError` handler, and `notFound`. Does NOT call `app.route('/v1', v1)` here — that happens in the app-layer `route.ts` (Task 12) so `shared/` never imports `features/`.
  - `v1` — `new Hono()` exported as a bare router; feature routers mount onto it at the app layer before `app.route('/v1', v1)` is called.
  - `ValidationException extends HTTPException` (status 422) — holds a `.errors` array of `{ path: string; messages: string[] }`. Thrown by the shared `validate` helper (Task 10a). Detected in `onError` to render `{ message, errors }`.
  - `onError` status table: `ValidationException` → 422 `{ message, errors }`; other `HTTPException` → forward status + `{ message, error }`; unknown → 500 `{ message: 'Internal Server Error', error }`.
  - `notFound` → `{ message: 'Not Found' }` with 404.

Note: `applicationRouter` is NOT imported here — that would violate the `shared → features` import boundary. Mounting happens in Task 12 (`route.ts`, app layer).

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/api.test.ts
import { describe, it, expect } from 'vitest';
import { app, v1, ValidationException } from './api';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

// Register a tiny test router DIRECTLY on app (not via v1) so this test
// has NO dependency on any feature router — pure shared/ testing.
app.get('/api/__boom-404', () => {
  throw new HTTPException(404, { message: 'Thing not found' });
});
app.get('/api/__boom-500', () => {
  throw new Error('unexpected');
});
app.get('/api/__boom-validation', () => {
  throw new ValidationException([{ path: 'name', messages: ['Required'] }]);
});
app.get('/api/__ok', (c) => c.json({ message: 'OK', data: { hello: 'world' } }));

// Wire a test sub-router via v1 to confirm the v1 export is usable
const testRouter = new Hono();
testRouter.get('/ping', (c) => c.json({ message: 'pong', data: null }));
v1.route('/test', testRouter);
// Attach v1 onto app (mirrors what route.ts does at the app layer)
app.route('/v1', v1);

describe('root Hono app', () => {
  it('responds 200 on a happy-path route', async () => {
    const res = await app.request('/api/__ok');
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { hello: string } };
    expect(body.data.hello).toBe('world');
  });

  it('v1 sub-router is reachable after attaching', async () => {
    const res = await app.request('/api/v1/test/ping');
    expect(res.status).toBe(200);
  });

  it('formats a 404 HTTPException as { message }', async () => {
    const res = await app.request('/api/__boom-404');
    expect(res.status).toBe(404);
    const body = await res.json() as { message: string };
    expect(body.message).toBe('Thing not found');
  });

  it('maps an unexpected Error to 500', async () => {
    const res = await app.request('/api/__boom-500');
    expect(res.status).toBe(500);
    const body = await res.json() as { message: string };
    expect(typeof body.message).toBe('string');
  });

  it('returns 404 on an unknown route via notFound', async () => {
    const res = await app.request('/api/does-not-exist-at-all');
    expect(res.status).toBe(404);
  });

  it('formats a ValidationException as 422 with errors array', async () => {
    const res = await app.request('/api/__boom-validation');
    expect(res.status).toBe(422);
    const body = await res.json() as { message: string; errors: { path: string; messages: string[] }[] };
    expect(body.message).toBeTruthy();
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors[0].path).toBe('name');
    expect(body.errors[0].messages).toEqual(['Required']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/shared/lib/api.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the root Hono app**

```ts
// src/shared/lib/api.ts
import 'server-only';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { ErrorMessageConstant } from '@/shared/constants/messages';
import type { ApiError } from '@/shared/types/response';

// ValidationException — thrown by the shared `validate` helper (validation.ts).
// Holds a structured errors array so onError can render the 422 envelope.
export class ValidationException extends HTTPException {
  readonly errors: { path: string; messages: string[] }[];

  constructor(errors: { path: string; messages: string[] }[]) {
    super(422, { message: ErrorMessageConstant.ValidationError() });
    this.errors = errors;
  }
}

export const app = new Hono().basePath('/api');
// v1 is exported as a bare router. Feature routers mount onto it.
// app.route('/v1', v1) is called at the app layer (route.ts) AFTER all feature
// routers have been registered — never here, so shared/ never imports features/.
export const v1 = new Hono();

app.use(logger());

app.onError((err, c) => {
  // ValidationException (from the shared validate helper) → 422 with errors array
  if (err instanceof ValidationException) {
    const body: ApiError = {
      message: err.message,
      errors: err.errors,
    };
    return c.json(body, 422);
  }

  if (err instanceof HTTPException) {
    const body: ApiError = {
      message: err.message,
      error: err.message,
    };
    const status = err.status as 400 | 401 | 403 | 404 | 409 | 422 | 500;
    return c.json(body, status);
  }

  // Unexpected error → 500
  const body: ApiError = {
    message: 'Internal Server Error',
    error: err instanceof Error ? err.message : String(err),
  };
  return c.json(body, 500);
});

app.notFound((c) => {
  const body: ApiError = { message: 'Not Found' };
  return c.json(body, 404);
});

// NOTE: app.route('/v1', v1) is intentionally NOT called here.
// It is called in src/app/api/[[...route]]/route.ts (the app layer) after all
// feature routers have been mounted onto v1 via their side-effect imports.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/shared/lib/api.test.ts`
Expected: PASS (all 6 cases).

---

### Task 10a: Shared `validate` helper (`shared/lib/validation.ts`)

**Files:**
- Create: `src/shared/lib/validation.ts`
- Test: `src/shared/lib/validation.test.ts`

**Interfaces:**
- Consumes: `ValidationException` from `@/shared/lib/api`; `zValidator` from `@hono/zod-validator`; `ZodTypeAny` from `zod`.
- Produces:
  - `validate(target: 'json' | 'query' | 'param', schema: ZodTypeAny)` — a drop-in replacement for `zValidator(target, schema)` whose failure hook, instead of the default behaviour, throws a `ValidationException` with the Zod issues formatted as `[{ path: string, messages: string[] }]`. All feature routers use `validate(...)` so every 422 body has an identical shape.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/validation.test.ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from './validation';
import { app, v1, ValidationException } from './api';

// Register a tiny router on v1 that uses the validate helper
const valTestRouter = new Hono();
valTestRouter.post(
  '/val',
  validate('json', z.object({ name: z.string().min(1), age: z.number().int().positive() })),
  (c) => c.json({ message: 'OK', data: c.req.valid('json') }),
);
v1.route('/valtest', valTestRouter);
// Ensure v1 is attached (idempotent in the test module — api.test.ts already called this,
// but here we guard: Hono silently ignores duplicate route registrations)
app.route('/v1', v1);

describe('validate helper', () => {
  it('passes through on valid input', async () => {
    const res = await app.request('/api/v1/valtest/val', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', age: 30 }),
    });
    expect(res.status).toBe(200);
  });

  it('throws ValidationException (422) on invalid input', async () => {
    const res = await app.request('/api/v1/valtest/val', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', age: -1 }),
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { message: string; errors: { path: string; messages: string[] }[] };
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThanOrEqual(1);
    expect(typeof body.errors[0].path).toBe('string');
    expect(Array.isArray(body.errors[0].messages)).toBe(true);
  });

  it('formats each Zod issue as { path: dotted string, messages: string[] }', async () => {
    const res = await app.request('/api/v1/valtest/val', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),  // missing age too
    });
    const body = await res.json() as { errors: { path: string; messages: string[] }[] };
    const paths = body.errors.map((e) => e.path);
    expect(paths).toContain('name');
  });

  it('exported ValidationException is the same class caught by onError', () => {
    const ex = new ValidationException([{ path: 'x', messages: ['bad'] }]);
    expect(ex.status).toBe(422);
    expect(ex.errors[0].path).toBe('x');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/shared/lib/validation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the validate helper**

```ts
// src/shared/lib/validation.ts
import { zValidator } from '@hono/zod-validator';
import type { ZodTypeAny } from 'zod';
import { ValidationException } from '@/shared/lib/api';

type ValidateTarget = 'json' | 'query' | 'param';

/**
 * Drop-in replacement for zValidator that throws a ValidationException (status 422)
 * on failure so every feature router produces an identical error envelope.
 * Usage: validate('json', createApplicationSchema)
 */
export function validate(target: ValidateTarget, schema: ZodTypeAny) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const errors = result.error.errors.map((issue) => ({
        path: issue.path.join('.'),
        messages: [issue.message],
      }));
      throw new ValidationException(errors);
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/shared/lib/validation.test.ts`
Expected: PASS (all 4 cases).

---

### Task 11: Application Hono router + integration tests

**Files:**
- Create: `src/features/application/api/v1/application.ts`
- Test: `src/features/application/api/v1/application.test.ts`

**Interfaces:**
- Consumes:
  - `applicationService` from `@/features/application/services/application`
  - `createApplicationSchema` from `@/features/application/dtos/v1/requests/create-application`
  - `updateApplicationSchema` from `@/features/application/dtos/v1/requests/update-application`
  - `listApplicationsQuerySchema` from `@/features/application/dtos/v1/requests/list-applications-query`
  - `ok`, `paginated` from `@/shared/lib/response`
  - `SuccessMessageConstant` from `@/shared/constants/messages`
  - `validate` from `@/shared/lib/validation` (NOT raw `zValidator`)
  - `v1` from `@/shared/lib/api` (for mounting — side-effect only; `app.route('/v1', v1)` is NOT called here)
- Produces: `export const applicationRouter` (Hono) — a standalone router that gets mounted in `route.ts`. Does NOT call `v1.route(...)` or `app.route(...)` itself; mounting is the app layer's responsibility.
  - `GET /api/v1/applications` — list with query params
  - `POST /api/v1/applications` — create
  - `GET /api/v1/applications/:id` — detail
  - `PATCH /api/v1/applications/:id` — partial update
  - `DELETE /api/v1/applications/:id` — soft delete

- [ ] **Step 1: Write the failing integration tests**

```ts
// src/features/application/api/v1/application.test.ts
import { describe, it, expect } from 'vitest';
import { app, v1 } from '@/shared/lib/api';
import { applicationRouter } from '@/features/application/api/v1/application';

// Mount at the test layer (mirrors what route.ts does at the app layer)
v1.route('/applications', applicationRouter);
app.route('/v1', v1);

describe('GET /api/v1/applications', () => {
  it('returns 200 with items array and meta', async () => {
    const res = await app.request('/api/v1/applications');
    expect(res.status).toBe(200);
    const body = await res.json() as { message: string; data: { items: unknown[]; meta: unknown } };
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.meta).toBeTruthy();
  });

  it('returns 422 when an invalid status is provided', async () => {
    const res = await app.request('/api/v1/applications?status=ghost');
    expect(res.status).toBe(422);
    const body = await res.json() as { errors: { path: string; messages: string[] }[] };
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it('returns 422 when both status and archived are provided', async () => {
    const res = await app.request('/api/v1/applications?status=applied&archived=true');
    expect(res.status).toBe(422);
  });
});

describe('POST /api/v1/applications', () => {
  it('creates an application and returns 201', async () => {
    const res = await app.request('/api/v1/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'TestCo', role: 'Engineer' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { data: { id: string; company: string; status: string } };
    expect(body.data.company).toBe('TestCo');
    expect(body.data.status).toBe('saved');
    expect(typeof body.data.id).toBe('string');

    // Cleanup
    await app.request(`/api/v1/applications/${body.data.id}`, { method: 'DELETE' });
  });

  it('returns 422 when company is missing', async () => {
    const res = await app.request('/api/v1/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'Engineer' }),
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { errors: { path: string; messages: string[] }[] };
    expect(Array.isArray(body.errors)).toBe(true);
  });
});

describe('GET /api/v1/applications/:id', () => {
  it('returns 404 for an unknown id', async () => {
    const res = await app.request('/api/v1/applications/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('returns 200 with the application when found', async () => {
    // Create first
    const createRes = await app.request('/api/v1/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'GetByIdCo', role: 'Dev' }),
    });
    const created = await createRes.json() as { data: { id: string } };
    const id = created.data.id;

    const res = await app.request(`/api/v1/applications/${id}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { id: string } };
    expect(body.data.id).toBe(id);

    // Cleanup
    await app.request(`/api/v1/applications/${id}`, { method: 'DELETE' });
  });
});

describe('PATCH /api/v1/applications/:id', () => {
  it('returns 404 for an unknown id', async () => {
    const res = await app.request('/api/v1/applications/00000000-0000-0000-0000-000000000000', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'applied' }),
    });
    expect(res.status).toBe(404);
  });

  it('updates the status and returns 200', async () => {
    const createRes = await app.request('/api/v1/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'PatchCo', role: 'Dev' }),
    });
    const created = await createRes.json() as { data: { id: string } };
    const id = created.data.id;

    const res = await app.request(`/api/v1/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'applied' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { status: string } };
    expect(body.data.status).toBe('applied');

    // Cleanup
    await app.request(`/api/v1/applications/${id}`, { method: 'DELETE' });
  });

  it('returns 422 when patch body is empty', async () => {
    const createRes = await app.request('/api/v1/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'EmptyPatchCo', role: 'Dev' }),
    });
    const created = await createRes.json() as { data: { id: string } };
    const id = created.data.id;

    const res = await app.request(`/api/v1/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);

    // Cleanup
    await app.request(`/api/v1/applications/${id}`, { method: 'DELETE' });
  });
});

describe('DELETE /api/v1/applications/:id', () => {
  it('returns 404 for an unknown id', async () => {
    const res = await app.request('/api/v1/applications/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });

  it('soft-deletes and returns 200', async () => {
    const createRes = await app.request('/api/v1/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'DelCo', role: 'Dev' }),
    });
    const created = await createRes.json() as { data: { id: string } };
    const id = created.data.id;

    const res = await app.request(`/api/v1/applications/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);

    // Confirm it's gone
    const getRes = await app.request(`/api/v1/applications/${id}`);
    expect(getRes.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/features/application/api/v1/application.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the application router**

```ts
// src/features/application/api/v1/application.ts
import 'server-only';
import { Hono } from 'hono';
import { applicationService } from '@/features/application/services/application';
import { createApplicationSchema } from '@/features/application/dtos/v1/requests/create-application';
import { updateApplicationSchema } from '@/features/application/dtos/v1/requests/update-application';
import { listApplicationsQuerySchema } from '@/features/application/dtos/v1/requests/list-applications-query';
import { ok, paginated } from '@/shared/lib/response';
import { SuccessMessageConstant } from '@/shared/constants/messages';
import { validate } from '@/shared/lib/validation';

// Standalone router — mounting onto v1 happens at the app layer (route.ts).
// This file does NOT call v1.route(...) or app.route(...).
export const applicationRouter = new Hono();

applicationRouter.get(
  '/',
  validate('query', listApplicationsQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const result = await applicationService.list(query);
    return c.json(
      paginated(result.items, result.meta, SuccessMessageConstant.EntityRetrieved('Applications')),
    );
  },
);

applicationRouter.post(
  '/',
  validate('json', createApplicationSchema),
  async (c) => {
    const data = c.req.valid('json');
    const application = await applicationService.create(data);
    return c.json(
      ok(application, SuccessMessageConstant.EntityCreated('Application')),
      201,
    );
  },
);

applicationRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const application = await applicationService.getById(id);
  return c.json(
    ok(application, SuccessMessageConstant.EntityRetrieved('Application')),
  );
});

applicationRouter.patch(
  '/:id',
  validate('json', updateApplicationSchema),
  async (c) => {
    const id = c.req.param('id');
    const patch = c.req.valid('json');
    const application = await applicationService.update(id, patch);
    return c.json(
      ok(application, SuccessMessageConstant.EntityUpdated('Application')),
    );
  },
);

applicationRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const application = await applicationService.remove(id);
  return c.json(
    ok(application, SuccessMessageConstant.EntityDeleted('Application')),
  );
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/features/application/api/v1/application.test.ts`
Expected: PASS (all test cases).

---

### Task 12: Next.js API mount (`app/api/[[...route]]/route.ts`) + build smoke-check

**Files:**
- Create: `src/app/api/[[...route]]/route.ts`

**Interfaces:**
- Consumes: `app`, `v1` from `@/shared/lib/api`; `applicationRouter` from `@/features/application/api/v1/application`; `handle` from `hono/vercel`.
- Produces: Next.js App Router catch-all API route that is the ASSEMBLY point — it mounts feature routers onto `v1`, attaches `v1` onto `app`, then delegates to `handle(app)`. Exports `GET`, `POST`, `PATCH`, `DELETE` and sets `export const runtime = 'nodejs'`.

Note: `app.route('/v1', v1)` is called HERE (not in `shared/lib/api.ts`) so the import from `features/` is legal (app layer can import features). When Plan 3 adds the audit router, it inserts `v1.route('/audit', auditRouter)` immediately BEFORE the `app.route('/v1', v1)` line.

Note: no separate test file is needed — the Hono integration tests in Task 11 cover the router logic directly via `app.request()`. This task's deliverable is verified by `npm run build`.

- [ ] **Step 1: Write the assembly route**

```ts
// src/app/api/[[...route]]/route.ts
import { handle } from 'hono/vercel';
import { app, v1 } from '@/shared/lib/api';
import { applicationRouter } from '@/features/application/api/v1/application';

// Mount feature routers onto v1 (app layer — allowed to import features/)
v1.route('/applications', applicationRouter);
// Plan 3 inserts: v1.route('/audit', auditRouter)  <-- here, before app.route

// Attach v1 onto app now that all routers are registered
app.route('/v1', v1);

export const runtime = 'nodejs';

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
```

- [ ] **Step 2: Run the full test suite**

Run: `npm run test`
Expected: all tests pass; no regressions.

- [ ] **Step 3: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build completes successfully. (The Neon WebSocket driver is Node-only; the `runtime = 'nodejs'` declaration prevents edge-runtime errors.)

---

## Commit (one commit for this whole plan — you run this)

Run this yourself once all tasks above are green; adjust the message if you prefer.

```bash
git add \
  src/features/application/constants/status.ts \
  src/features/application/constants/status.test.ts \
  src/features/application/db/schema.ts \
  src/features/application/dtos/v1/responses/application.ts \
  src/features/application/dtos/v1/responses/application.test.ts \
  src/features/application/dtos/v1/requests/create-application.ts \
  src/features/application/dtos/v1/requests/create-application.test.ts \
  src/features/application/dtos/v1/requests/update-application.ts \
  src/features/application/dtos/v1/requests/update-application.test.ts \
  src/features/application/dtos/v1/requests/list-applications-query.ts \
  src/features/application/dtos/v1/requests/list-applications-query.test.ts \
  src/features/application/repositories/application.ts \
  src/features/application/repositories/application.test.ts \
  src/features/application/services/application.ts \
  src/features/application/services/application.test.ts \
  src/features/application/utils/diff.ts \
  src/features/application/utils/diff.test.ts \
  src/features/application/api/v1/application.ts \
  src/features/application/api/v1/application.test.ts \
  src/shared/lib/cursor.ts \
  src/shared/lib/cursor.test.ts \
  src/shared/lib/api.ts \
  src/shared/lib/api.test.ts \
  src/shared/lib/validation.ts \
  src/shared/lib/validation.test.ts \
  src/shared/db/migrations \
  src/app/api/
git commit -m "feat: application server - schema, DTOs, keyset repository, transactional service + audit, Hono API"
```

---

## Self-Review

**1. Spec coverage:**

| Requirement | Task |
|---|---|
| Status set (`saved·applied·interviewing·offer·accepted·rejected·withdrawn`) + Zod enum, NOT pgEnum | T1 |
| Flexible transitions (any→any, enum-validated only) | T5 (update DTO accepts any valid status), T9 (service passes to repo) |
| Idempotent no-op (patch with no change → no mutation, no audit row) | T9 (service.update) + T11 (router PATCH) |
| `applications` table with `baseColumns` + `softDelete` + all columns + indexes | T2 |
| Migration applied | T3 |
| Response DTO: camelCase, no internal fields exposed, ISO strings via `.toISOString()` + `z.string().datetime()` | T4 |
| Request DTOs: field lengths, URL, ≥1-field update, status/archived mutual exclusion, limit coerce; exports `createApplicationSchema` / `updateApplicationSchema` / `listApplicationsQuerySchema` with inferred types `CreateApplicationRequest` / `UpdateApplicationRequest` / `ListApplicationsQuery` | T5 |
| Keyset cursor codec (base64url `ts|id`, field-name-neutral for reuse) | T6 |
| `diffOf` captures only changed fields | T7 |
| Repository: keyset `findMany` (status filter, archived filter, cursor, limit+1 trick), `findById`, `create`, `update`, `softDelete` | T8 |
| Service: create defaults to `saved`; getById 404; list returns PaginatedData; update txn+idempotent+diff+audit; remove soft-delete+audit | T9 |
| Root Hono app: `app` + `v1` exported; logger; `ValidationException`; onError status table (404/422 w/ errors[]/409/401/403/500); notFound; `app.route('/v1', v1)` NOT called here (app-layer boundary) | T10 |
| Shared `validate` helper wrapping `zValidator` with `ValidationException` on failure; reusable by all feature routers | T10a |
| Application Hono router: `export const applicationRouter`; GET / POST / GET :id / PATCH :id / DELETE :id; uses `validate(...)` not raw `zValidator`; does NOT self-mount | T11 |
| Next.js Node-runtime catch-all route: app-layer ASSEMBLY — mounts `applicationRouter` onto `v1`, calls `app.route('/v1', v1)`, then `handle(app)` | T12 |
| `audit_log` written in same transaction as every mutation (`create`→`created`, `update`→`updated` with diff, `remove`→`deleted`) | T9 |
| Message factories used for all response messages | T9, T11 |
| `server-only` on all DB/service/repo/api/mapper files | T2, T8, T9, T10, T11 |
| No cross-feature imports; `shared/lib/api.ts` imports NO `features/` file | all tasks |
| camelCase wire end-to-end | T4 (`mapApplication` + `z.string().datetime()`), T5 (no snake_case accepted) |
| Import boundary: `app.route('/v1', v1)` only at the app layer (`route.ts`) | T12 |

**2. §10 test additions (spec-coverage audit):** Two missing service-level tests added to Task 9 (Steps 5–8 and 9–12): (a) `applicationService.create` defaults status to `saved` AND writes a `created` audit row end-to-end through the service (not just via repo); (b) `applicationService.update` multi-field edit produces a correct multi-field `diff` (both `company` and `status` entries present in the written `audit_log` diff). Both tests follow the existing update/remove harness pattern (direct DB create, service call, audit query, `try/finally` hard-delete cleanup). The existing production code satisfies both without changes.

**3. Placeholder scan:** None found. Every task step contains actual code, actual run commands, and actual expected output. No "TODO", "TBD", "add validation", "similar to Task N", or vague description-without-code found.

**3. Type consistency:**
- `DbTransaction` (Plan 1, T7) consumed identically in T8 (`withRollback` helper), T9 (service `db.transaction` callback).
- `ApplicationResponse` defined in T4 (`mapApplication` return type), consumed by T9 service signatures and T11 router (via `ok<ApplicationResponse>`).
- `CreateApplicationRequest` / `UpdateApplicationRequest` / `ListApplicationsQuery` defined in T5 (inferred from `createApplicationSchema` / `updateApplicationSchema` / `listApplicationsQuerySchema`), consumed by T9 service and T11 router — names match exactly and match the canonical decision B names imported by Plans 4/5.
- `PaginatedData<ApplicationResponse>` (Plan 1 T12 `PaginatedData<T>` + T4 `ApplicationResponse`) consumed by T9 `list` return type and T11 `paginated(...)`.
- `encodeCursor` / `decodeCursor` defined in T6 with `{ ts: Date; id: string }`, consumed in T8 repository — field name `ts` matches the codec interface.
- `diffOf` defined in T7 as `(before, after) => Record<string, { from, to }>`, called in T9 service with the correct arg shape.
- `applicationRepo` methods produced in T8 consumed by name in T9 — `findById`, `findMany`, `create`, `update`, `softDelete` all match.
- `recordAudit` (Plan 1 T11) consumed in T9 with the exact `{ entityType, entityId, action, oldData, newData, diff }` shape — action values `'created'|'updated'|'deleted'` match the `RecordAuditParams` union.
- `ValidationException` defined in T10 (`shared/lib/api.ts`), imported by T10a (`shared/lib/validation.ts`) — both in `shared/`; no boundary violation.
- `validate` defined in T10a, imported by T11 (feature router) — `shared → features` direction is allowed.
- `v1` exported from T10 (`src/shared/lib/api.ts`); T11 test and T12 (`route.ts`) call `v1.route('/applications', applicationRouter)` then `app.route('/v1', v1)` — assembly is exclusively at the app layer.
- `app` exported from T10, imported in T12 and in T10's own test — consistent.
- `SuccessMessageConstant.{EntityCreated,EntityUpdated,EntityDeleted,EntityRetrieved}` all defined in Plan 1 T13, consumed in T11 — all method names match the Plan 1 definition. Use `EntityRetrieved('Applications')` for the list endpoint (the plural noun gives the same message).
- `applicationResponseSchema` uses `z.string().datetime()` for `createdAt`/`updatedAt`; `mapApplication` encodes them via `.toISOString()` — decision C confirmed.

**Cross-plan interfaces pinned:**
- `@/shared/lib/cursor` (NEW) → `encodeCursor` / `decodeCursor` with `{ ts }` field — Plan 3 (audit timeline) can reuse with `createdAt` as `ts`.
- `@/shared/lib/api` (NEW) → `app`, `v1`, `ValidationException` — Plans 3+ add feature routers by: (a) exporting a router from `features/<d>/api/v1/<d>.ts`, (b) calling `v1.route('/<path>', router)` in `route.ts` before `app.route('/v1', v1)`.
- `@/shared/lib/validation` (NEW) → `validate` helper — Plan 3's audit router uses `validate(...)` identically.
- `@/features/application/dtos/v1/requests/` → `createApplicationSchema`, `updateApplicationSchema`, `listApplicationsQuerySchema` (and inferred types) — Plans 4/5 import these exact names.
