# Job Application Tracker — Plan 3: Audit Feature READ Side (Timeline)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `features/audit` READ side — the per-application timeline endpoint `GET /api/v1/audit`. This plan produces the response DTO + mapper, the request DTO, the repository (keyset pagination on `audit_log`), the service, and the Hono router, then mounts the router into the app-layer file `src/app/api/[[...route]]/route.ts`. The audit WRITE side (`recordAudit`, the `audit_log` table, the immutability trigger) was completed in Plan 1 — this plan only reads.

**Architecture:** One unified Next.js (App Router) app, Feature-Based "Pattern B". The `features/audit` feature owns the read side (`api/`, `services/`, `repositories/`, `dtos/`). Cross-cutting `auditLog` table and `recordAudit` remain in `shared/` — `features/audit` imports them from there (no cross-feature import). The cursor codec (`encodeCursor`/`decodeCursor`) built in Plan 2 is reused with `ts = createdAt` (the audit log orders by `(createdAt, id) DESC`; it is append-only and has no `updatedAt`). The `auditRouter` is mounted in `src/app/api/[[...route]]/route.ts` (the app-layer file created in Plan 2) — `shared/lib/api.ts` is NOT modified here, because `shared/` must never import `features/`.

**Tech Stack:** Next.js, TypeScript, Hono, `@hono/zod-validator`, Drizzle ORM (`drizzle-orm/neon-serverless`), Zod, Vitest. npm.

## As-built deviations

> Added after implementation. The shipped code and the `.claude/rules/` files are the source of truth -
> the task steps below are kept as the original execution record.

- Request DTO is stricter than the steps: `entityType` uses the `entityTypeSchema` allowlist (unknown
  types return 422, fail-closed), `cursor` is `.refine(isDecodableCursor)`, and `limit` clamps with
  `.transform((n) => Math.min(n, 50))`. The response DTO uses the typed `auditActionSchema` and
  `z.iso.datetime()`.
- The repository reads through `conn(tx)` and extracts a `seekPastCursor()` helper; the router imports
  `paginated` from `shared/utils/response/` and `validate` from `shared/lib/validation/`.
- `AUDIT_ACTION` and `ENTITY_TYPE` are `as const` objects (singular names) in `shared/constants/`.
- The repo / service / router tests are `*.integration.test.ts` (real Neon), not unit tests.

## Carry-over notes (from Plan 1 review)

Apply these when implementing this plan:

- **Extract `AUDIT_ACTIONS` as the single source for the audit action set.** Create `shared/constants/audit-actions.ts` (`export const AUDIT_ACTIONS = ['created', 'updated', 'deleted'] as const` + `export type AuditAction = (typeof AUDIT_ACTIONS)[number]`, mirroring `APPLICATION_STATUSES`). Derive this read side's Zod `action` enum from it, and switch `RecordAuditParams.action` in `shared/lib/audit/audit.ts` from its inline union to `AuditAction`. One source drives the write-side type and the read-side Zod guard, preventing drift.
- **`shared/lib/api` paths** in this plan's text are now `shared/lib/api/api.ts` (concern-per-folder convention from Plan 1, files created in Plan 2).

## Global Constraints

Every task implicitly includes these (copied from the spec + rules):

- **camelCase-only on the wire** (input AND output). No snake_case middleware.
- **Strings use `text`**, never `varchar`. Length validated in Zod.
- **Keyset/cursor pagination only.** The audit timeline orders by `(createdAt, id)` DESC (audit_log is append-only — it has `createdAt`, not `updatedAt`). Never `OFFSET`.
- **`server-only` boundary** on every DB/server file. No cross-feature imports (features import only `shared/` + own files).
- **Folder-based naming, no type suffix, no `I` prefix.** API versioned by folder (`api/v1/`, `dtos/v1/`).
- **TDD, ≥80% coverage.** Hono route handler runs on the Node runtime.
- **Env:** `DATABASE_URL` (pooled) app, `DATABASE_URL_UNPOOLED` (unpooled) migrations/tests — both already in `.env`.
- **Git is run by the user.** The executing agent NEVER runs `git add/commit/push`. When all of this plan's tasks are green, pause and surface the suggested commit command (see the Commit section at the end) for the user to run. One commit per plan.

---

### Task 1: Audit response DTO + `mapAuditEvent` mapper

**Files:**
- Create: `src/features/audit/dtos/v1/responses/audit.ts`
- Test: `src/features/audit/dtos/v1/responses/audit.test.ts`

**Interfaces:**
- Consumes: nothing from the project (pure Zod schema + mapper type).
- Produces:
  - `auditEventResponseSchema` — Zod schema for one audit timeline event. Exposed fields ONLY: `id`, `action`, `diff`, `createdAt` (ISO string), `createdBy`. Does NOT expose `oldData`, `newData`, `ipAddress`, `userAgent`, `requestId`, `source`, `entityType`, `entityId`.
  - `type AuditEventResponse` — inferred from the schema.
  - `mapAuditEvent(row): AuditEventResponse` — mapper from a Drizzle `auditLog` row to `AuditEventResponse`. Encodes `createdAt` as an ISO string. Fields not in `AuditEventResponse` are dropped.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/audit/dtos/v1/responses/audit.test.ts
import { describe, it, expect } from 'vitest';
import { auditEventResponseSchema, mapAuditEvent } from './audit';

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  entityType: 'application',
  entityId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  action: 'updated' as const,
  createdBy: null,
  createdAt: new Date('2024-01-15T10:00:00.000Z'),
  oldData: { status: 'saved' },
  newData: { status: 'applied' },
  diff: { status: { from: 'saved', to: 'applied' } },
  ipAddress: null,
  userAgent: null,
  requestId: null,
  source: null,
  ...overrides,
});

describe('auditEventResponseSchema', () => {
  it('validates a well-formed audit event', () => {
    const result = auditEventResponseSchema.parse({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      action: 'updated',
      diff: { status: { from: 'saved', to: 'applied' } },
      createdAt: '2024-01-15T10:00:00.000Z',
      createdBy: null,
    });
    expect(result.id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(result.action).toBe('updated');
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z');
    expect(result.createdBy).toBeNull();
    expect(result.diff).toEqual({ status: { from: 'saved', to: 'applied' } });
  });

  it('rejects missing id', () => {
    expect(() =>
      auditEventResponseSchema.parse({ action: 'created', diff: null, createdAt: '2024-01-15T10:00:00.000Z', createdBy: null }),
    ).toThrow();
  });
});

describe('mapAuditEvent', () => {
  it('maps a drizzle row to AuditEventResponse with ISO createdAt', () => {
    const mapped = mapAuditEvent(makeRow());
    expect(mapped.id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(mapped.action).toBe('updated');
    expect(mapped.createdAt).toBe('2024-01-15T10:00:00.000Z');
    expect(mapped.createdBy).toBeNull();
    expect(mapped.diff).toEqual({ status: { from: 'saved', to: 'applied' } });
  });

  it('does NOT expose oldData, newData, ipAddress, userAgent, entityType, entityId', () => {
    const mapped = mapAuditEvent(makeRow()) as Record<string, unknown>;
    expect('oldData' in mapped).toBe(false);
    expect('newData' in mapped).toBe(false);
    expect('ipAddress' in mapped).toBe(false);
    expect('userAgent' in mapped).toBe(false);
    expect('entityType' in mapped).toBe(false);
    expect('entityId' in mapped).toBe(false);
  });

  it('passes through a status-change diff shape { status: { from, to } }', () => {
    const mapped = mapAuditEvent(makeRow({ diff: { status: { from: 'saved', to: 'applied' } } }));
    expect(mapped.diff).toEqual({ status: { from: 'saved', to: 'applied' } });
  });

  it('maps a created event with null diff', () => {
    const mapped = mapAuditEvent(makeRow({ action: 'created', diff: null, oldData: null }));
    expect(mapped.action).toBe('created');
    expect(mapped.diff).toBeNull();
  });

  it('maps a createdBy actor when present', () => {
    const mapped = mapAuditEvent(makeRow({ createdBy: 'user-abc' }));
    expect(mapped.createdBy).toBe('user-abc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/audit/dtos/v1/responses/audit.test.ts`
Expected: FAIL — module `./audit` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/audit/dtos/v1/responses/audit.ts
import { z } from 'zod';

// No server-only — the schema is plain Zod; the mapper only uses Date.toISOString().
// Both are safe to import from client code (e.g. client hooks parsing the JSON response).

export const auditEventResponseSchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  diff: z.unknown().nullable(),
  createdAt: z.string().datetime(),  // ISO 8601 string — encode at the mapper via .toISOString()
  createdBy: z.string().nullable(),
});

export type AuditEventResponse = z.infer<typeof auditEventResponseSchema>;

// The row shape expected from Drizzle — only the columns we need to map.
// Using a structural type so the mapper doesn't import the server-only auditLog table.
interface AuditRow {
  id: string;
  action: string;
  diff: unknown;
  createdAt: Date;
  createdBy: string | null;
}

export function mapAuditEvent(row: AuditRow): AuditEventResponse {
  return {
    id: row.id,
    action: row.action,
    diff: row.diff ?? null,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/audit/dtos/v1/responses/audit.test.ts`
Expected: PASS — all 6 assertions green.

---

### Task 2: `listAuditQuerySchema` request DTO

**Files:**
- Create: `src/features/audit/dtos/v1/requests/audit.ts`
- Test: `src/features/audit/dtos/v1/requests/audit.test.ts`

**Interfaces:**
- Consumes: nothing from the project (pure Zod).
- Produces:
  - `listAuditQuerySchema` — Zod schema for query-string params: `{ entityType: string (accepts 'application'; required), entityId: string (uuid; required), cursor?: string, limit?: number (coerced, default 20, max 50) }`.
  - `type ListAuditQuery` — inferred type.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/audit/dtos/v1/requests/audit.test.ts
import { describe, it, expect } from 'vitest';
import { listAuditQuerySchema } from './audit';

describe('listAuditQuerySchema', () => {
  it('accepts valid required params', () => {
    const result = listAuditQuerySchema.parse({
      entityType: 'application',
      entityId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });
    expect(result.entityType).toBe('application');
    expect(result.entityId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(result.limit).toBe(20);
    expect(result.cursor).toBeUndefined();
  });

  it('rejects missing entityId', () => {
    expect(() => listAuditQuerySchema.parse({ entityType: 'application' })).toThrow();
  });

  it('rejects missing entityType', () => {
    expect(() => listAuditQuerySchema.parse({ entityId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })).toThrow();
  });

  it('rejects a non-uuid entityId', () => {
    expect(() =>
      listAuditQuerySchema.parse({ entityType: 'application', entityId: 'not-a-uuid' }),
    ).toThrow();
  });

  it('coerces a string limit to a number and applies the default', () => {
    const result = listAuditQuerySchema.parse({
      entityType: 'application',
      entityId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      limit: '10',
    });
    expect(result.limit).toBe(10);
  });

  it('caps limit at 50', () => {
    const result = listAuditQuerySchema.parse({
      entityType: 'application',
      entityId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      limit: '200',
    });
    expect(result.limit).toBe(50);
  });

  it('rejects limit below 1', () => {
    expect(() =>
      listAuditQuerySchema.parse({
        entityType: 'application',
        entityId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        limit: '0',
      }),
    ).toThrow();
  });

  it('passes through an optional cursor string', () => {
    const result = listAuditQuerySchema.parse({
      entityType: 'application',
      entityId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      cursor: 'eyJ0cyI6IjIwMjQtMDEtMTUiLCJpZCI6ImFhYWEifQ==',
    });
    expect(result.cursor).toBe('eyJ0cyI6IjIwMjQtMDEtMTUiLCJpZCI6ImFhYWEifQ==');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/audit/dtos/v1/requests/audit.test.ts`
Expected: FAIL — module `./audit` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/audit/dtos/v1/requests/audit.ts
import { z } from 'zod';

// No server-only — shared between the Hono validate() helper and (optionally) client hooks.

export const listAuditQuerySchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
  cursor: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20),
});

export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/audit/dtos/v1/requests/audit.test.ts`
Expected: PASS — all 8 assertions green.

---

### Task 3: Audit repository — `findByEntity` with keyset pagination

**Files:**
- Create: `src/features/audit/repositories/audit.ts`
- Test: `src/features/audit/repositories/audit.test.ts`

**Interfaces:**
- Consumes: `@/shared/db/audit-log` → `auditLog`, `@/shared/lib/db` → `db`, `DbTransaction`, `@/shared/lib/cursor` → `encodeCursor`, `decodeCursor`, `@/shared/test/db` → `withRollback`.
- Produces:
  - `auditRepo.findByEntity(params: { entityType: string; entityId: string; cursor?: string; limit: number }, tx?: DbTransaction): Promise<{ rows: (typeof auditLog.$inferSelect)[]; nextCursor: string | null; hasMore: boolean }>`
  - Keyset ordered by `(createdAt DESC, id DESC)`. Filters by `entityType` + `entityId`. Decodes the cursor with `decodeCursor` (field `ts = createdAt`), applying `(createdAt, id) < (cursor.ts, cursor.id)` for the next page. Fetches `limit + 1` rows to detect `hasMore`; trims the extra row; encodes `nextCursor` with `encodeCursor({ ts: row.createdAt, id: row.id })` from the last row of the page.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/audit/repositories/audit.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { auditLog } from '@/shared/db/audit-log';
import { withRollback } from '@/shared/test/db';
import { auditRepo } from './audit';

// Helper to insert a minimal audit row inside a transaction
async function insertRow(
  tx: Parameters<Parameters<typeof withRollback>[0]>[0],
  overrides: Partial<typeof auditLog.$inferInsert> = {},
) {
  const [row] = await tx.insert(auditLog).values({
    entityType: 'application',
    entityId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    action: 'created',
    ...overrides,
  }).returning();
  return row;
}

describe('auditRepo.findByEntity', () => {
  it('returns rows in createdAt DESC order', async () => {
    await withRollback(async (tx) => {
      const entityId = crypto.randomUUID();
      // Insert rows with different timestamps by setting createdAt explicitly
      await tx.insert(auditLog).values([
        { entityType: 'application', entityId, action: 'created',  createdAt: new Date('2024-01-01T08:00:00Z') },
        { entityType: 'application', entityId, action: 'updated',  createdAt: new Date('2024-01-01T09:00:00Z') },
        { entityType: 'application', entityId, action: 'updated',  createdAt: new Date('2024-01-01T10:00:00Z') },
      ]);

      const result = await auditRepo.findByEntity({ entityType: 'application', entityId, limit: 20 }, tx);

      expect(result.rows).toHaveLength(3);
      // most recent first
      expect(result.rows[0].action).toBe('updated');
      expect(result.rows[0].createdAt.getTime()).toBeGreaterThan(result.rows[1].createdAt.getTime());
      expect(result.rows[1].createdAt.getTime()).toBeGreaterThan(result.rows[2].createdAt.getTime());
    });
  });

  it('returns only rows for the specified entityId', async () => {
    await withRollback(async (tx) => {
      const entityIdA = crypto.randomUUID();
      const entityIdB = crypto.randomUUID();
      await tx.insert(auditLog).values([
        { entityType: 'application', entityId: entityIdA, action: 'created' },
        { entityType: 'application', entityId: entityIdB, action: 'created' },
      ]);

      const result = await auditRepo.findByEntity({ entityType: 'application', entityId: entityIdA, limit: 20 }, tx);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].entityId).toBe(entityIdA);
    });
  });

  it('sets hasMore false when total rows <= limit', async () => {
    await withRollback(async (tx) => {
      const entityId = crypto.randomUUID();
      await tx.insert(auditLog).values({ entityType: 'application', entityId, action: 'created' });

      const result = await auditRepo.findByEntity({ entityType: 'application', entityId, limit: 20 }, tx);

      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });
  });

  it('sets hasMore true and returns a nextCursor when there is a next page', async () => {
    await withRollback(async (tx) => {
      const entityId = crypto.randomUUID();
      // Insert 3 rows; fetch with limit=2 → hasMore = true
      await tx.insert(auditLog).values([
        { entityType: 'application', entityId, action: 'created',  createdAt: new Date('2024-01-01T08:00:00Z') },
        { entityType: 'application', entityId, action: 'updated',  createdAt: new Date('2024-01-01T09:00:00Z') },
        { entityType: 'application', entityId, action: 'updated',  createdAt: new Date('2024-01-01T10:00:00Z') },
      ]);

      const page1 = await auditRepo.findByEntity({ entityType: 'application', entityId, limit: 2 }, tx);

      expect(page1.rows).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();
    });
  });

  it('paginates correctly across a cursor boundary', async () => {
    await withRollback(async (tx) => {
      const entityId = crypto.randomUUID();
      await tx.insert(auditLog).values([
        { entityType: 'application', entityId, action: 'created',  createdAt: new Date('2024-01-01T08:00:00Z') },
        { entityType: 'application', entityId, action: 'updated',  createdAt: new Date('2024-01-01T09:00:00Z') },
        { entityType: 'application', entityId, action: 'updated',  createdAt: new Date('2024-01-01T10:00:00Z') },
      ]);

      const page1 = await auditRepo.findByEntity({ entityType: 'application', entityId, limit: 2 }, tx);
      expect(page1.rows).toHaveLength(2);
      expect(page1.hasMore).toBe(true);

      const page2 = await auditRepo.findByEntity(
        { entityType: 'application', entityId, limit: 2, cursor: page1.nextCursor! },
        tx,
      );
      expect(page2.rows).toHaveLength(1);
      expect(page2.hasMore).toBe(false);
      expect(page2.nextCursor).toBeNull();

      // The two pages together cover all 3 rows with no duplicates
      const allIds = [...page1.rows.map((r) => r.id), ...page2.rows.map((r) => r.id)];
      expect(new Set(allIds).size).toBe(3);
    });
  });

  it('returns empty result for an unknown entityId', async () => {
    await withRollback(async (tx) => {
      const result = await auditRepo.findByEntity({
        entityType: 'application',
        entityId: crypto.randomUUID(),
        limit: 20,
      }, tx);
      expect(result.rows).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/audit/repositories/audit.test.ts`
Expected: FAIL — module `./audit` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/audit/repositories/audit.ts
import 'server-only';
import { and, eq, or, lt, desc } from 'drizzle-orm';
import { auditLog } from '@/shared/db/audit-log';
import { db, type DbTransaction } from '@/shared/lib/db';
import { encodeCursor, decodeCursor } from '@/shared/lib/cursor';

type AuditRow = typeof auditLog.$inferSelect;

interface FindByEntityParams {
  entityType: string;
  entityId: string;
  cursor?: string;
  limit: number;
}

interface FindByEntityResult {
  rows: AuditRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

async function findByEntity(
  params: FindByEntityParams,
  tx?: DbTransaction,
): Promise<FindByEntityResult> {
  const client = tx ?? db;
  const { entityType, entityId, cursor, limit } = params;

  // Build cursor filter for keyset (createdAt, id) DESC:
  // "before the cursor" means strictly earlier timestamp, OR same timestamp but smaller id (uuid lexicographic)
  let cursorFilter = undefined;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    cursorFilter = or(
      lt(auditLog.createdAt, decoded.ts),
      and(
        eq(auditLog.createdAt, decoded.ts),
        lt(auditLog.id, decoded.id),
      ),
    );
  }

  const filter = and(
    eq(auditLog.entityType, entityType),
    eq(auditLog.entityId, entityId),
    cursorFilter,
  );

  // Fetch limit + 1 to detect hasMore; order in SQL (no JS re-sort needed)
  const fetched = await client
    .select()
    .from(auditLog)
    .where(filter)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit + 1);

  const hasMore = fetched.length > limit;
  const rows = hasMore ? fetched.slice(0, limit) : fetched;

  const lastRow = rows.at(-1);
  const nextCursor = hasMore && lastRow
    ? encodeCursor({ ts: lastRow.createdAt, id: lastRow.id })
    : null;

  return { rows, nextCursor, hasMore };
}

export const auditRepo = { findByEntity };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/audit/repositories/audit.test.ts`
Expected: PASS — all 6 assertions green.

---

### Task 4: Audit service — `listTimeline`

**Files:**
- Create: `src/features/audit/services/audit.ts`
- Test: `src/features/audit/services/audit.test.ts`

**Interfaces:**
- Consumes: `@/features/audit/repositories/audit` → `auditRepo`, `@/features/audit/dtos/v1/responses/audit` → `mapAuditEvent`, `@/shared/types/response` → `PaginatedData`, `@/shared/test/db` → `withRollback`, `@/shared/db/audit-log` → `auditLog`.
- Produces:
  - `auditService.listTimeline(query: { entityType: string; entityId: string; cursor?: string; limit: number }): Promise<PaginatedData<AuditEventResponse>>`
  - Calls `auditRepo.findByEntity`, maps each row with `mapAuditEvent`, returns `{ items: AuditEventResponse[], meta: { limit, nextCursor, hasMore } }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/audit/services/audit.test.ts
import { describe, it, expect } from 'vitest';
import { auditLog } from '@/shared/db/audit-log';
import { withRollback } from '@/shared/test/db';
import { auditService } from './audit';

describe('auditService.listTimeline', () => {
  it('returns a PaginatedData envelope with mapped AuditEventResponse items', async () => {
    await withRollback(async (tx) => {
      const entityId = crypto.randomUUID();
      await tx.insert(auditLog).values({
        entityType: 'application',
        entityId,
        action: 'created',
        diff: null,
        oldData: null,
        newData: { company: 'Acme', role: 'Engineer', status: 'saved' },
      });

      const result = await auditService.listTimeline({
        entityType: 'application',
        entityId,
        limit: 20,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].action).toBe('created');
      expect(result.items[0].diff).toBeNull();
      expect(typeof result.items[0].createdAt).toBe('string'); // ISO string
      // Sensitive fields must not be present
      expect('oldData' in result.items[0]).toBe(false);
      expect('newData' in result.items[0]).toBe(false);
    });
  });

  it('builds meta with limit, nextCursor, and hasMore', async () => {
    await withRollback(async (tx) => {
      const entityId = crypto.randomUUID();
      await tx.insert(auditLog).values([
        { entityType: 'application', entityId, action: 'created', createdAt: new Date('2024-01-01T08:00:00Z') },
        { entityType: 'application', entityId, action: 'updated', createdAt: new Date('2024-01-01T09:00:00Z') },
        { entityType: 'application', entityId, action: 'updated', createdAt: new Date('2024-01-01T10:00:00Z') },
      ]);

      const result = await auditService.listTimeline({
        entityType: 'application',
        entityId,
        limit: 2,
      });

      expect(result.meta.limit).toBe(2);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.nextCursor).not.toBeNull();
    });
  });

  it('maps a status-change diff { status: { from, to } } through to the response item', async () => {
    await withRollback(async (tx) => {
      const entityId = crypto.randomUUID();
      await tx.insert(auditLog).values({
        entityType: 'application',
        entityId,
        action: 'updated',
        diff: { status: { from: 'saved', to: 'applied' } },
        oldData: { status: 'saved' },
        newData: { status: 'applied' },
      });

      const result = await auditService.listTimeline({
        entityType: 'application',
        entityId,
        limit: 20,
      });

      expect(result.items[0].diff).toEqual({ status: { from: 'saved', to: 'applied' } });
    });
  });

  it('returns empty items and hasMore false when no rows exist', async () => {
    await withRollback(async (_tx) => {
      const result = await auditService.listTimeline({
        entityType: 'application',
        entityId: crypto.randomUUID(),
        limit: 20,
      });

      expect(result.items).toHaveLength(0);
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.nextCursor).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/audit/services/audit.test.ts`
Expected: FAIL — module `./audit` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/audit/services/audit.ts
import 'server-only';
import { auditRepo } from '@/features/audit/repositories/audit';
import { mapAuditEvent, type AuditEventResponse } from '@/features/audit/dtos/v1/responses/audit';
import type { PaginatedData } from '@/shared/types/response';

interface ListTimelineQuery {
  entityType: string;
  entityId: string;
  cursor?: string;
  limit: number;
}

async function listTimeline(query: ListTimelineQuery): Promise<PaginatedData<AuditEventResponse>> {
  const { rows, nextCursor, hasMore } = await auditRepo.findByEntity({
    entityType: query.entityType,
    entityId: query.entityId,
    cursor: query.cursor,
    limit: query.limit,
  });

  return {
    items: rows.map(mapAuditEvent),
    meta: {
      limit: query.limit,
      nextCursor,
      hasMore,
    },
  };
}

export const auditService = { listTimeline };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/audit/services/audit.test.ts`
Expected: PASS — all 4 assertions green.

---

### Task 5: Audit Hono router + mount into `src/app/api/[[...route]]/route.ts`

**Files:**
- Create: `src/features/audit/api/v1/audit.ts`
- Modify: `src/app/api/[[...route]]/route.ts` (the app-layer Next.js catch-all, created in Plan 2) — import `auditRouter` and add `v1.route('/audit', auditRouter)` BEFORE the `app.route('/v1', v1)` call. Do NOT modify `src/shared/lib/api.ts` — `shared/` must never import `features/`.
- Test: `src/features/audit/api/v1/audit.test.ts`

**Interfaces:**
- Consumes: `@/features/audit/services/audit` → `auditService`, `@/features/audit/dtos/v1/requests/audit` → `listAuditQuerySchema`, `@/shared/lib/validation` → `validate`, `@/shared/lib/response` → `paginated`, `@/shared/constants/messages` → `SuccessMessageConstant`, `@/shared/lib/api` → the root `app` (for integration test).
- Produces:
  - `auditRouter` — Hono router handling `GET /` with `validate('query', listAuditQuerySchema)` → `auditService.listTimeline` → `paginated(...)` response. The router does NOT call `app.route()` or `v1.route()` itself.
  - Mounted as `v1.route('/audit', auditRouter)` in `src/app/api/[[...route]]/route.ts`, before `app.route('/v1', v1)`.
  - `GET /api/v1/audit?entityType=application&entityId=<uuid>` → 200 with the standard paginated envelope.
  - Missing or invalid `entityId` → 422 with `{ message, errors: [{ path, messages }] }` (rendered by `app.onError` via the `ValidationException` thrown by `validate`).

- [ ] **Step 1: Write the failing test**

```ts
// src/features/audit/api/v1/audit.test.ts
import { describe, it, expect } from 'vitest';
import { app } from '@/shared/lib/api';
import { auditLog } from '@/shared/db/audit-log';
import { withRollback } from '@/shared/test/db';
import { db } from '@/shared/lib/db';

// Integration tests call app.request() — the Hono test helper that skips HTTP.
// The service hits the REAL db via withRollback for isolation.
// Note: because app.request() is transport-level, it cannot share a tx with withRollback.
// Instead we use a unique entityId that has no rows, then test a seed-and-fetch pattern
// using direct inserts before the request. A cleanup afterEach is not needed because
// the audit_log INSERT is committed but the entityId is random (never collides).

describe('GET /api/v1/audit', () => {
  it('returns 422 when entityId is missing', async () => {
    const res = await app.request('/api/v1/audit?entityType=application');
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toHaveProperty('message');
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors[0]).toHaveProperty('path');
    expect(Array.isArray(body.errors[0].messages)).toBe(true);
  });

  it('returns 422 when entityId is not a uuid', async () => {
    const res = await app.request('/api/v1/audit?entityType=application&entityId=not-a-uuid');
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toHaveProperty('message');
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it('returns 422 when entityType is missing', async () => {
    const res = await app.request('/api/v1/audit?entityId=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toHaveProperty('message');
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it('returns 200 with the paginated envelope for a known entityId with no rows', async () => {
    const entityId = crypto.randomUUID();
    const res = await app.request(
      `/api/v1/audit?entityType=application&entityId=${entityId}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('message');
    expect(body.data).toHaveProperty('items');
    expect(body.data).toHaveProperty('meta');
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.items).toHaveLength(0);
    expect(body.data.meta.hasMore).toBe(false);
    expect(body.data.meta.nextCursor).toBeNull();
  });

  it('returns audit events in the response for a seeded entityId', async () => {
    // Insert directly (committed — random entityId never collides)
    const entityId = crypto.randomUUID();
    await db.insert(auditLog).values({
      entityType: 'application',
      entityId,
      action: 'created',
      diff: null,
    });

    const res = await app.request(
      `/api/v1/audit?entityType=application&entityId=${entityId}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].action).toBe('created');
    expect(body.data.items[0]).toHaveProperty('id');
    expect(body.data.items[0]).toHaveProperty('createdAt');
    // Sensitive fields must not appear in the response item
    expect('oldData' in body.data.items[0]).toBe(false);
    expect('newData' in body.data.items[0]).toBe(false);
    expect('ipAddress' in body.data.items[0]).toBe(false);

    // Cleanup — direct delete is OK here because it is a test helper acting outside the trigger scope;
    // alternatively, accept the committed row (random entityId, no production impact).
    // For test cleanliness we leave it committed: row count is negligible in Neon test branch.
  });

  it('respects the limit query param', async () => {
    const entityId = crypto.randomUUID();
    await db.insert(auditLog).values([
      { entityType: 'application', entityId, action: 'created',  createdAt: new Date('2024-01-01T08:00:00Z') },
      { entityType: 'application', entityId, action: 'updated',  createdAt: new Date('2024-01-01T09:00:00Z') },
      { entityType: 'application', entityId, action: 'updated',  createdAt: new Date('2024-01-01T10:00:00Z') },
    ]);

    const res = await app.request(
      `/api/v1/audit?entityType=application&entityId=${entityId}&limit=2`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(2);
    expect(body.data.meta.hasMore).toBe(true);
    expect(body.data.meta.nextCursor).not.toBeNull();
    expect(body.data.meta.limit).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/audit/api/v1/audit.test.ts`
Expected: FAIL — `auditRouter` not mounted / `app` does not handle `/api/v1/audit`.

- [ ] **Step 3: Write the Hono router**

```ts
// src/features/audit/api/v1/audit.ts
import 'server-only';
import { Hono } from 'hono';
import { auditService } from '@/features/audit/services/audit';
import { listAuditQuerySchema } from '@/features/audit/dtos/v1/requests/audit';
import { validate } from '@/shared/lib/validation';
import { paginated } from '@/shared/lib/response';
import { SuccessMessageConstant } from '@/shared/constants/messages';

export const auditRouter = new Hono();

auditRouter.get(
  '/',
  validate('query', listAuditQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const data = await auditService.listTimeline({
      entityType: query.entityType,
      entityId: query.entityId,
      cursor: query.cursor,
      limit: query.limit,
    });
    return c.json(
      paginated(data.items, data.meta, SuccessMessageConstant.EntityRetrieved('Audit events')),
      200,
    );
  },
);
```

- [ ] **Step 4: Mount the router into `src/app/api/[[...route]]/route.ts`**

Open `src/app/api/[[...route]]/route.ts` (built in Plan 2). It already contains:

```ts
import { app, v1 } from '@/shared/lib/api';
import { applicationRouter } from '@/features/application/api/v1/application';
v1.route('/applications', applicationRouter);
app.route('/v1', v1);
// ...
```

Add the `auditRouter` import and mount line IMMEDIATELY BEFORE `app.route('/v1', v1)` — do NOT touch `src/shared/lib/api.ts`:

```ts
// Add import alongside the other feature router imports:
import { auditRouter } from '@/features/audit/api/v1/audit';

// Add mount line before app.route('/v1', v1):
v1.route('/applications', applicationRouter);
v1.route('/audit', auditRouter);        // inserted before app.route('/v1', v1)
app.route('/v1', v1);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/features/audit/api/v1/audit.test.ts`
Expected: PASS — all 6 assertions green (including 422 validations and 200 envelopes).

- [ ] **Step 6: Run the full test suite**

Run: `npm run test`
Expected: all tests across all tasks in this plan PASS. Coverage at or above 80%.

---

## Commit (one commit for this whole plan — you run this)

Once all tasks above are green, run this yourself:

```bash
git add src/features/audit src/app/api/[[...route]]/route.ts
git commit -m "feat: audit timeline read API (GET /api/v1/audit)"
```

The `src/features/audit` path covers everything this plan creates: `dtos/v1/responses/audit.ts`, `dtos/v1/requests/audit.ts`, `repositories/audit.ts`, `services/audit.ts`, `api/v1/audit.ts`, and their test files. The `src/app/api/[[...route]]/route.ts` entry covers the one-line mount added in Task 5.

Run this yourself once all tasks above are green; adjust the message if you prefer.

---

## Self-Review

- **Spec coverage (Plan 3 scope):** response DTO + `mapAuditEvent` ✓ (T1), request DTO `listAuditQuerySchema` ✓ (T2), repository `findByEntity` keyset on `(createdAt, id)` DESC ✓ (T3), service `listTimeline` → `PaginatedData` ✓ (T4), Hono router + mount into `src/app/api/[[...route]]/route.ts` ✓ (T5). The audit WRITE side (`recordAudit`, `audit_log` schema, immutability trigger) is Plan 1 scope — not touched here.
- **Placeholders:** none — every step contains real TypeScript code with exact paths, real Vitest assertions, and exact run commands with expected output.
- **Cursor reuse:** `encodeCursor`/`decodeCursor` from Plan 2 (`@/shared/lib/cursor`) are consumed in `auditRepo.findByEntity` with `ts = createdAt` (the audit log has no `updatedAt`), exactly as specified.
- **Boundary fix (Fix 1):** `auditRouter` is mounted in `src/app/api/[[...route]]/route.ts` (app layer), NOT in `shared/lib/api.ts`. This prevents `shared/` from importing `features/`, which would be an `eslint-plugin-boundaries` ERROR. The mount line `v1.route('/audit', auditRouter)` is inserted before `app.route('/v1', v1)`.
- **Sort fix (Fix 2):** `auditRepo.findByEntity` uses `.orderBy(desc(auditLog.createdAt), desc(auditLog.id))` directly in SQL. The previous JS re-sort after an ASC query has been removed; `hasMore` detection via `limit + 1` now works correctly.
- **Tie-break fix (Fix 3):** cursor predicate second branch uses `eq(auditLog.createdAt, decoded.ts)` (exact match), not `lte`. Full predicate: `lt(createdAt, ts) OR (eq(createdAt, ts) AND lt(id, decoded.id))`.
- **Shared validator (Fix 4):** the router uses `validate('query', listAuditQuerySchema)` from `@/shared/lib/validation` — no inline `zValidator` callback. 422 responses are rendered by `app.onError` via the `ValidationException` thrown inside `validate`, producing `{ message, errors: [{ path, messages }] }`. Integration tests now assert on `body.errors[0].path` and `body.errors[0].messages`.
- **Canonical names (Fix 5):** request schema is `listAuditQuerySchema` (type `ListAuditQuery`). `auditEventResponseSchema.createdAt` is `z.string().datetime()`; `mapAuditEvent` encodes via `.toISOString()`.
- **Field exposure:** `mapAuditEvent` in T1 exposes ONLY `{ id, action, diff, createdAt, createdBy }`. Tests assert that `oldData`, `newData`, `ipAddress`, `userAgent`, `entityType`, `entityId` are absent from the mapped object and from the HTTP response body.
- **Status-change diff shape:** T1 includes an explicit test that `diff: { status: { from, to } }` passes through the mapper unmodified, as required by domain.md's audit semantics.
- **No cross-feature imports:** `features/audit` imports only from `shared/` and its own subfolders. The `auditLog` table and `withRollback` come from `shared/`. No `shared/` file in this plan imports any `features/` file.
- **`server-only`:** every file touching Drizzle or business logic (`repositories/audit.ts`, `services/audit.ts`, `api/v1/audit.ts`) starts with `import 'server-only'`. DTOs and the mapper are plain and client-safe.
- **Open dependency:** Tasks 3–5 require the Neon test connection in `.env` (`DATABASE_URL`). The `audit_log` table must already exist (Plan 1 Task 8). Plan 2's `validate` helper (`shared/lib/validation.ts`) must exist before Task 5.
