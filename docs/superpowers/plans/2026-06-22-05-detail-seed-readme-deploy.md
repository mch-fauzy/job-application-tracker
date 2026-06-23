# Job Application Tracker — Plan 5: Detail + Timeline Page, Seed Script, README, and Deployment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the final layer of the application: the per-application detail + audit-timeline RSC page (combining `features/application` and `features/audit` at the `app/` layer), the seed script that populates the live demo board via the service path (so every row has real audit history), the submission README (the complete real text as required by `requirements.md`), and the deployment steps (Vercel + Neon + migration-as-deploy-step). Plans 1–4 are complete: shared infra, the application server + `/api/v1/applications`, the audit read API + `auditEventResponse` DTO, and the client board + hooks + providers.

**Architecture:** One unified Next.js (App Router) app, Feature-Based "Pattern B". This plan builds the `features/audit` client hooks + components; the `features/application` single-detail hook + component; the `app/applications/[id]/page.tsx` RSC composition (prefetch both features via services, `HydrationBoundary`); and the `scripts/seed.ts` Node script (imports services + db, runs outside Next.js). The README and deployment are prose-and-config deliverables whose verification is a required-sections checklist + `npm run build` passing.

**Tech Stack:** Next.js App Router, React, TypeScript, Hono, Drizzle ORM (`drizzle-orm/neon-serverless`), `@neondatabase/serverless`, Zod, `@tanstack/react-query`, Vitest, React Testing Library, shadcn/ui, Tailwind, tsx (seed runner).

## As-built deviations

> Added after Plans 1-4. As of this audit, Plan 5 is NOT yet implemented: the detail + timeline page
> (`app/applications/[id]`), the seed script, the README, and the Vercel deployment all remain. When
> building, follow the as-built conventions in the `.claude/rules/` files and the Plan 4 as-built note:
> context-injected card actions, the shared `use-infinite-scroll` hook, centralized envelope schemas
> (`applicationEnvelopeSchema` / `applicationPageEnvelopeSchema`), concern-per-folder lib/utils, and
> `DATABASE_URL_UNPOOLED` for migrations.

## Carry-over notes (from Plan 1 review)

Apply these when implementing this plan:

- **Parallelize the detail + timeline prefetch.** `app/applications/[id]/page.tsx` prefetches the application detail and the audit timeline — issue them with `Promise.all`, not sequentially, so the two service reads do not waterfall (Vercel `async-parallel` / `server-parallel-fetching`).
- **Dedupe per-request reads with `React.cache()`.** If the same row is read by both the page and a nested RSC during prefetch, wrap the service read in `React.cache()` for per-request deduplication (Vercel `server-cache-react`).
- **Document the least-privilege audit role as a deploy hardening step (README next-steps).** The `audit_log` immutability is guaranteed by the triggers (UPDATE/DELETE/TRUNCATE all blocked regardless of role), so this is defense-in-depth, not a blocker. The `REVOKE ... FROM PUBLIC` in migrations 0001/0002 is only fully effective when `DATABASE_URL` connects as a non-owner Neon role granted `SELECT, INSERT` on `audit_log` (the owner keeps implicit rights). Note the role-provisioning step in the README.

## Global Constraints

Every task implicitly includes these (copied from the spec + rules):

- **camelCase-only on the wire** (input AND output). Drizzle maps to snake_case DB columns. No snake_case middleware.
- **Strings use `text`**, never `varchar`. Length validated in Zod, not the column.
- **Status set is `text` + a Zod enum — NEVER `pgEnum`, no DB CHECK.**
- **Keyset/cursor pagination only**, ordered `(createdAt DESC, id)` for the timeline. Never `OFFSET`.
- **Soft delete** via `deletedAt`; queries filter `deletedAt IS NULL`.
- **`server-only` boundary:** every file that touches the DB or server logic begins with `import 'server-only'`. A `'use client'` file importing one is a build error.
- **No cross-feature imports.** `shared/` is importable by anything; features import only `shared/` + their own files.
- **Folder-based naming, no type suffix, no `I` prefix.** API versioned by folder (`api/v1/`, `dtos/v1/`).
- **Audit log is immutable + append-only**, written in the same transaction as each mutation. The seed script calls `applicationService` (so `recordAudit` is invoked via the normal service path) — it never inserts into `audit_log` directly.
- **TDD, ≥80% coverage.** Hono route handler runs on the **Node runtime** (`neon-serverless` needs it).
- **RSC pages may `await` a feature service directly** for prefetch (`prefetchQuery`/`prefetchInfiniteQuery` + `dehydrate` + `HydrationBoundary`); client components use hooks → fetch → `/api/v1`. Never Server Actions as a `queryFn`.
- **Migrations** (`drizzle-kit migrate` against `DATABASE_URL_UNPOOLED`) run as a deploy/CI step, NOT at runtime.
- **Env vars:** `DATABASE_URL` (pooled `-pooler`, app), `DATABASE_URL_UNPOOLED` (unpooled, migrations + seed).
- **Git is run by the user.** The executing agent NEVER runs `git add/commit/push`. This plan has TWO user-run commits: the Plan 5 code commit, and the FINAL docs commit (README + AI note + other docs) which is the project's last commit, made only after everything is prod-ready.

---

### Task 1: `useTimeline(applicationId)` — infinite hook + test

**Files:**
- Create: `src/features/audit/hooks/use-timeline.ts`
- Test: `src/features/audit/hooks/use-timeline.test.ts`

**Interfaces:**
- Consumes: `GET /api/v1/audit?entityType=application&entityId=<id>&cursor=<c>&limit=<n>`, `auditEventResponseSchema` (`features/audit/dtos/v1/responses/audit.ts`), `queryKeys.timeline.detail(id)` (`shared/constants/query-keys.ts`).
- Produces: `useTimeline(applicationId: string)` — a `useInfiniteQuery` that returns pages of `AuditEventResponse`, keyed by `['timeline', 'detail', id]`, with `getNextPageParam` reading `meta.nextCursor`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/audit/hooks/use-timeline.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useTimeline } from './use-timeline';

const mockPage1 = {
  message: 'Audit events retrieved successfully',
  data: {
    items: [
      { id: 'evt-1', action: 'created', diff: null, createdAt: '2026-06-22T10:00:00Z', createdBy: null },
    ],
    meta: { limit: 20, nextCursor: 'cursor-abc', hasMore: true },
  },
};
const mockPage2 = {
  message: 'Audit events retrieved successfully',
  data: {
    items: [
      { id: 'evt-2', action: 'updated', diff: { status: { from: 'saved', to: 'applied' } }, createdAt: '2026-06-22T09:00:00Z', createdBy: null },
    ],
    meta: { limit: 20, nextCursor: null, hasMore: false },
  },
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useTimeline', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('fetches the first page and exposes items', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockPage1,
    }));

    const { result } = renderHook(() => useTimeline('app-id-1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.pages[0].items).toHaveLength(1);
    expect(result.current.data?.pages[0].items[0].id).toBe('evt-1');
    expect(result.current.hasNextPage).toBe(true);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/api/v1/audit?');
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('entityId=app-id-1');
  });

  it('follows nextCursor on fetchNextPage', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockPage1 })
      .mockResolvedValueOnce({ ok: true, json: async () => mockPage2 });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useTimeline('app-id-1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    result.current.fetchNextPage();
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));

    expect(result.current.data?.pages[1].items[0].id).toBe('evt-2');
    expect(result.current.hasNextPage).toBe(false);
    const secondCallUrl = mockFetch.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain('cursor=cursor-abc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/audit/hooks/use-timeline.test.ts`
Expected: FAIL — `useTimeline` is not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/audit/hooks/use-timeline.ts
'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { auditEventResponseSchema } from '@/features/audit/dtos/v1/responses/audit';
import { queryKeys } from '@/shared/constants/query-keys';

const paginatedAuditSchema = z.object({
  message: z.string(),
  data: z.object({
    items: z.array(auditEventResponseSchema),
    meta: z.object({
      limit: z.number(),
      nextCursor: z.string().nullable(),
      hasMore: z.boolean(),
    }),
  }),
});

export function useTimeline(applicationId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.timeline.detail(applicationId),
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        entityType: 'application',
        entityId: applicationId,
        limit: '20',
      });
      if (pageParam) params.set('cursor', pageParam as string);
      const res = await fetch(`/api/v1/audit?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch timeline');
      const parsed = paginatedAuditSchema.parse(await res.json());
      return parsed.data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.meta.hasMore ? lastPage.meta.nextCursor : undefined,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/audit/hooks/use-timeline.test.ts`
Expected: PASS (both cases).

---

### Task 2: `AuditTimeline` component — render logic + RTL test

**Files:**
- Create: `src/features/audit/components/audit-timeline.tsx`
- Test: `src/features/audit/components/audit-timeline.test.tsx`

**Interfaces:**
- Consumes: `useTimeline(applicationId)`.
- Produces: `AuditTimeline({ applicationId: string })` (`'use client'`) — renders all pages of events chronologically (earliest at the top). A `created` event renders "Application created". An `updated` event with `diff.status` renders "Status: <from> → <to>". An `updated` event without `diff.status` renders "Application updated". A `deleted` event renders "Application deleted". Each event shows a human-readable timestamp (`toLocaleString()`). A "Load more" button appears when `hasNextPage` is true.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/audit/components/audit-timeline.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditTimeline } from './audit-timeline';

// Mock useTimeline so we control the returned data
vi.mock('@/features/audit/hooks/use-timeline', () => ({
  useTimeline: vi.fn(),
}));
import { useTimeline } from '@/features/audit/hooks/use-timeline';

const mockUseTimeline = vi.mocked(useTimeline);

function makeTimeline(events: object[], hasNextPage = false) {
  return {
    data: { pages: [{ items: events, meta: { limit: 20, nextCursor: null, hasMore: false } }] },
    isLoading: false,
    isError: false,
    hasNextPage,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
  };
}

describe('AuditTimeline', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders "Application created" for a created event', () => {
    mockUseTimeline.mockReturnValue(makeTimeline([
      { id: 'evt-1', action: 'created', diff: null, createdAt: '2026-06-22T10:00:00Z', createdBy: null },
    ]) as ReturnType<typeof useTimeline>);
    render(<AuditTimeline applicationId="app-1" />);
    expect(screen.getByText('Application created')).toBeInTheDocument();
  });

  it('renders "Status: saved → applied" for an updated event with diff.status', () => {
    mockUseTimeline.mockReturnValue(makeTimeline([
      { id: 'evt-2', action: 'updated', diff: { status: { from: 'saved', to: 'applied' } }, createdAt: '2026-06-22T11:00:00Z', createdBy: null },
    ]) as ReturnType<typeof useTimeline>);
    render(<AuditTimeline applicationId="app-1" />);
    expect(screen.getByText('Status: saved → applied')).toBeInTheDocument();
  });

  it('renders "Application updated" for an updated event without diff.status', () => {
    mockUseTimeline.mockReturnValue(makeTimeline([
      { id: 'evt-3', action: 'updated', diff: { role: { from: 'Dev', to: 'Senior Dev' } }, createdAt: '2026-06-22T12:00:00Z', createdBy: null },
    ]) as ReturnType<typeof useTimeline>);
    render(<AuditTimeline applicationId="app-1" />);
    expect(screen.getByText('Application updated')).toBeInTheDocument();
  });

  it('renders "Application deleted" for a deleted event', () => {
    mockUseTimeline.mockReturnValue(makeTimeline([
      { id: 'evt-4', action: 'deleted', diff: null, createdAt: '2026-06-22T13:00:00Z', createdBy: null },
    ]) as ReturnType<typeof useTimeline>);
    render(<AuditTimeline applicationId="app-1" />);
    expect(screen.getByText('Application deleted')).toBeInTheDocument();
  });

  it('shows a "Load more" button when hasNextPage is true', () => {
    const fetchNextPage = vi.fn();
    mockUseTimeline.mockReturnValue({
      ...makeTimeline([], true),
      fetchNextPage,
    } as ReturnType<typeof useTimeline>);
    render(<AuditTimeline applicationId="app-1" />);
    const btn = screen.getByRole('button', { name: /load more/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it('shows a loading state', () => {
    mockUseTimeline.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    } as unknown as ReturnType<typeof useTimeline>);
    render(<AuditTimeline applicationId="app-1" />);
    expect(screen.getByText(/loading timeline/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/audit/components/audit-timeline.test.tsx`
Expected: FAIL — `AuditTimeline` is not defined.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/features/audit/components/audit-timeline.tsx
'use client';

import { useTimeline } from '@/features/audit/hooks/use-timeline';
import type { AuditEventResponse } from '@/features/audit/dtos/v1/responses/audit';

function formatEvent(event: AuditEventResponse): string {
  if (event.action === 'created') return 'Application created';
  if (event.action === 'deleted') return 'Application deleted';
  // action === 'updated'
  const diff = event.diff as Record<string, unknown> | null;
  if (diff && typeof diff['status'] === 'object' && diff['status'] !== null) {
    const statusChange = diff['status'] as { from: string; to: string };
    return `Status: ${statusChange.from} → ${statusChange.to}`;
  }
  return 'Application updated';
}

interface AuditTimelineProps {
  applicationId: string;
}

export function AuditTimeline({ applicationId }: AuditTimelineProps) {
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useTimeline(applicationId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading timeline…</p>;
  }
  if (isError) {
    return <p className="text-sm text-destructive">Failed to load timeline.</p>;
  }

  const allEvents = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">History</h2>
      {allEvents.length === 0 && (
        <p className="text-sm text-muted-foreground">No history yet.</p>
      )}
      <ol className="space-y-3">
        {allEvents.map((event) => (
          <li key={event.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
            <span className="text-sm font-medium">{formatEvent(event)}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(event.createdAt).toLocaleString()}
            </span>
          </li>
        ))}
      </ol>
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="text-sm text-primary hover:underline disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/audit/components/audit-timeline.test.tsx`
Expected: PASS (all five cases).

---

### Task 3: `useApplication(id)` detail hook + `ApplicationDetail` component + tests

**Files:**
- Create: `src/features/application/hooks/use-application.ts`
- Create: `src/features/application/components/application-detail.tsx`
- Test: `src/features/application/hooks/use-application.test.ts`
- Test: `src/features/application/components/application-detail.test.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/applications/:id`, `applicationResponseSchema` (`features/application/dtos/v1/responses/application.ts`), `queryKeys.applications.detail(id)`.
- Produces:
  - `useApplication(id: string)` — `useQuery` for a single application, key `['applications', 'detail', id]`.
  - `ApplicationDetail({ id: string })` — `'use client'` component that renders company, role, status, jobUrl, notes, createdAt, updatedAt. Shows a loading skeleton while fetching, an error message on failure.

- [ ] **Step 1: Write the failing hook test**

```ts
// src/features/application/hooks/use-application.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useApplication } from './use-application';

const mockApp = {
  message: 'Application retrieved successfully',
  data: {
    id: 'app-1',
    company: 'Acme Corp',
    role: 'Senior Engineer',
    status: 'applied',
    jobUrl: 'https://acme.com/jobs/1',
    notes: 'Good fit',
    createdAt: '2026-06-22T08:00:00Z',
    updatedAt: '2026-06-22T10:00:00Z',
  },
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useApplication', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('fetches the application by id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockApp,
    }));
    const { result } = renderHook(() => useApplication('app-1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.id).toBe('app-1');
    expect(result.current.data?.company).toBe('Acme Corp');
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/api/v1/applications/app-1');
  });

  it('exposes an error state when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Application not found', error: null }),
    }));
    const { result } = renderHook(() => useApplication('bad-id'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

- [ ] **Step 2: Run hook test to verify it fails**

Run: `npm run test -- src/features/application/hooks/use-application.test.ts`
Expected: FAIL — `useApplication` is not defined.

- [ ] **Step 3: Write the hook**

```ts
// src/features/application/hooks/use-application.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { applicationResponseSchema } from '@/features/application/dtos/v1/responses/application';
import { queryKeys } from '@/shared/constants/query-keys';

const singleApplicationSchema = z.object({
  message: z.string(),
  data: applicationResponseSchema,
});

export function useApplication(id: string) {
  return useQuery({
    queryKey: queryKeys.applications.detail(id),
    queryFn: async () => {
      const res = await fetch(`/api/v1/applications/${id}`);
      if (!res.ok) throw new Error(`Failed to fetch application: ${res.status}`);
      return singleApplicationSchema.parse(await res.json()).data;
    },
    enabled: !!id,
  });
}
```

- [ ] **Step 4: Run hook test to verify it passes**

Run: `npm run test -- src/features/application/hooks/use-application.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Write the failing component test**

```tsx
// src/features/application/components/application-detail.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApplicationDetail } from './application-detail';

vi.mock('@/features/application/hooks/use-application', () => ({
  useApplication: vi.fn(),
}));
import { useApplication } from '@/features/application/hooks/use-application';

const mockUseApplication = vi.mocked(useApplication);

describe('ApplicationDetail', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows a loading state', () => {
    mockUseApplication.mockReturnValue({
      data: undefined, isLoading: true, isError: false,
    } as ReturnType<typeof useApplication>);
    render(<ApplicationDetail id="app-1" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders application fields when loaded', () => {
    mockUseApplication.mockReturnValue({
      data: {
        id: 'app-1',
        company: 'Acme Corp',
        role: 'Senior Engineer',
        status: 'applied',
        jobUrl: 'https://acme.com/jobs/1',
        notes: 'Great benefits',
        createdAt: '2026-06-22T08:00:00.000Z',
        updatedAt: '2026-06-22T10:00:00.000Z',
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useApplication>);
    render(<ApplicationDetail id="app-1" />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Senior Engineer')).toBeInTheDocument();
    expect(screen.getByText('applied')).toBeInTheDocument();
    expect(screen.getByText('Great benefits')).toBeInTheDocument();
  });

  it('shows an error state', () => {
    mockUseApplication.mockReturnValue({
      data: undefined, isLoading: false, isError: true,
    } as ReturnType<typeof useApplication>);
    render(<ApplicationDetail id="app-1" />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run component test to verify it fails**

Run: `npm run test -- src/features/application/components/application-detail.test.tsx`
Expected: FAIL — `ApplicationDetail` is not defined.

- [ ] **Step 7: Write the component**

```tsx
// src/features/application/components/application-detail.tsx
'use client';

import { useApplication } from '@/features/application/hooks/use-application';

interface ApplicationDetailProps {
  id: string;
}

export function ApplicationDetail({ id }: ApplicationDetailProps) {
  const { data, isLoading, isError } = useApplication(id);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading application…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-destructive">Failed to load application.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{data.role}</h1>
        <p className="text-lg text-muted-foreground">{data.company}</p>
      </div>

      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold">
          {data.status}
        </span>
      </div>

      {data.jobUrl && (
        <p className="text-sm">
          <span className="font-medium">Job URL: </span>
          <a
            href={data.jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline break-all"
          >
            {data.jobUrl}
          </a>
        </p>
      )}

      {data.notes && (
        <div className="space-y-1">
          <p className="text-sm font-medium">Notes</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.notes}</p>
        </div>
      )}

      <div className="text-xs text-muted-foreground space-y-0.5">
        <p>Created: {new Date(data.createdAt).toLocaleString()}</p>
        <p>Last updated: {new Date(data.updatedAt).toLocaleString()}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run both tests to verify they pass**

Run: `npm run test -- src/features/application/hooks/use-application.test.ts src/features/application/components/application-detail.test.tsx`
Expected: PASS (all cases).

---

### Task 4: `app/applications/[id]/page.tsx` — RSC compose (prefetch + HydrationBoundary)

**Files:**
- Create: `src/app/applications/[id]/page.tsx`

**Interfaces:**
- Consumes (server-side, direct service calls — no HTTP):
  - `applicationService.getById(id)` — throws `HTTPException` (status 404) for unknown id; returns `ApplicationResponse`.
  - `auditService.listTimeline({ entityType: 'application', entityId: id, limit: 20 })` — returns `PaginatedData<AuditEventResponse>`.
  - `getQueryClient()` from `@/shared/lib/query-client`.
  - `queryKeys.applications.detail(id)` and `queryKeys.timeline.detail(id)`.
- Consumes (client-side, rendered inside `HydrationBoundary`):
  - `<ApplicationDetail id={id} />` from `features/application/components/application-detail`.
  - `<AuditTimeline applicationId={id} />` from `features/audit/components/audit-timeline`.
- Produces: an RSC page that prefetches both the application and the first page of its timeline, dehydrates the cache, and wraps the client components in `HydrationBoundary` so they render without a loading flash. Calls `notFound()` for unknown ids.

> **Note on testing RSC pages:** Next.js RSC pages cannot be imported and rendered in Vitest/jsdom without a special harness. The verification for this task is therefore a **type-check + build check** (`npx tsc --noEmit && npm run build`), NOT a unit test. This is stated explicitly here to avoid generating a fake test.

- [ ] **Step 1: Write the RSC page**

```tsx
// src/app/applications/[id]/page.tsx
import { notFound } from 'next/navigation';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/shared/lib/query-client';
import { queryKeys } from '@/shared/constants/query-keys';
import { applicationService } from '@/features/application/services/application';
import { auditService } from '@/features/audit/services/audit';
import { ApplicationDetail } from '@/features/application/components/application-detail';
import { AuditTimeline } from '@/features/audit/components/audit-timeline';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ApplicationDetailPage({ params }: PageProps) {
  const { id } = await params;
  const queryClient = getQueryClient();

  // Verify the application exists; call notFound() if the service throws a 404.
  try {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.applications.detail(id),
      queryFn: () => applicationService.getById(id),
    });
  } catch (err: unknown) {
    // HTTPException from Hono has a .status property
    const status = (err as { status?: number }).status;
    if (status === 404) notFound();
    throw err; // re-throw unexpected errors
  }

  // Prefetch the first page of the timeline (keyset — first page has no cursor).
  await queryClient.prefetchInfiniteQuery({
    queryKey: queryKeys.timeline.detail(id),
    queryFn: () =>
      auditService.listTimeline({ entityType: 'application', entityId: id, limit: 20 }),
    initialPageParam: null,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="container mx-auto max-w-2xl py-8 space-y-10 px-4">
        <ApplicationDetail id={id} />
        <hr className="border-border" />
        <AuditTimeline applicationId={id} />
      </div>
    </HydrationBoundary>
  );
}
```

- [ ] **Step 2: Type-check + build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds. If the build references services/imports that don't yet exist (Plans 2–3 incomplete), note the missing exports and scaffold empty stubs marked `TODO` — **do not invent business logic**.

---

### Task 5: `scripts/seed.ts` + `db:seed` npm script

**Files:**
- Create: `scripts/seed.ts`
- Modify: `package.json` (add `db:seed` script)
- Test: `scripts/seed.test.ts` (pure-function shape test — no DB required)

**Interfaces:**
- Consumes: `applicationService.create(data)`, `applicationService.update(id, patch)` (the normal service path, which calls `db.transaction` + `recordAudit` internally — **never** inserts into `audit_log` directly).
- Produces:
  - `buildSeedApplications()` — pure function, returns an array of `CreateApplicationInput` objects (the shape passed to `applicationService.create`). Exported for the test.
  - The seed script calls `applicationService.create` for each application, then calls `applicationService.update` for a subset (status changes) to generate timeline events. Logs progress to stdout. Exits with code 0 on success, 1 on error.
  - `package.json` `"db:seed": "tsx scripts/seed.ts"`.
  - Running `npm run db:seed` against a live Neon DB populates it with the seed data, including audit rows (the demo board is not empty when the live URL opens).

- [ ] **Step 1: Write the failing shape test (no DB)**

```ts
// scripts/seed.test.ts
import { describe, it, expect } from 'vitest';
import { buildSeedApplications } from './seed';

describe('buildSeedApplications', () => {
  const apps = buildSeedApplications();

  it('returns an array of application inputs', () => {
    expect(Array.isArray(apps)).toBe(true);
    expect(apps.length).toBeGreaterThanOrEqual(5);
  });

  it('every entry has required fields: company, role, status', () => {
    for (const app of apps) {
      expect(typeof app.company).toBe('string');
      expect(app.company.length).toBeGreaterThan(0);
      expect(typeof app.role).toBe('string');
      expect(app.role.length).toBeGreaterThan(0);
      expect(['saved', 'applied', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn'])
        .toContain(app.status ?? 'saved');
    }
  });

  it('includes variety: at least 2 different statuses across entries', () => {
    const statuses = new Set(apps.map((a) => a.status ?? 'saved'));
    expect(statuses.size).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- scripts/seed.test.ts`
Expected: FAIL — `buildSeedApplications` is not defined.

- [ ] **Step 3: Write the seed script with `buildSeedApplications` exported**

```ts
// scripts/seed.ts
// Node script — not bundled by Next.js. Run with: npx tsx scripts/seed.ts
// Uses the normal service path so every application gets a `created` audit row
// and status-change `updated` audit rows.

import { applicationService } from '../src/features/application/services/application';

export interface SeedApplicationInput {
  company: string;
  role: string;
  status?: 'saved' | 'applied' | 'interviewing' | 'offer' | 'accepted' | 'rejected' | 'withdrawn';
  jobUrl?: string;
  notes?: string;
}

export function buildSeedApplications(): SeedApplicationInput[] {
  return [
    {
      company: 'Stripe',
      role: 'Senior Software Engineer',
      status: 'interviewing',
      jobUrl: 'https://stripe.com/jobs/listing/senior-software-engineer',
      notes: 'Recruiter screen done. Technical interview scheduled.',
    },
    {
      company: 'Linear',
      role: 'Full-Stack Engineer',
      status: 'applied',
      jobUrl: 'https://linear.app/jobs',
      notes: 'Applied via referral from former colleague.',
    },
    {
      company: 'Vercel',
      role: 'Developer Experience Engineer',
      status: 'saved',
      jobUrl: 'https://vercel.com/careers',
      notes: 'Dream role. Tailor cover letter before applying.',
    },
    {
      company: 'Planetscale',
      role: 'Backend Engineer',
      status: 'offer',
      jobUrl: 'https://planetscale.com/jobs',
      notes: 'Offer received 2026-06-18. Reviewing compensation package.',
    },
    {
      company: 'Fly.io',
      role: 'Infrastructure Engineer',
      status: 'rejected',
      notes: 'Passed technical, failed system design round.',
    },
    {
      company: 'Turso',
      role: 'Developer Advocate',
      status: 'withdrawn',
      jobUrl: 'https://turso.tech/careers',
      notes: 'Withdrew after accepting a better offer elsewhere.',
    },
    {
      company: 'Neon',
      role: 'Product Engineer',
      status: 'saved',
      jobUrl: 'https://neon.tech/careers',
    },
  ];
}

// Status upgrade paths — pairs of [fromStatus, toStatus] for apps we want to have timeline history.
// These are applied in order after all apps are created.
const STATUS_UPGRADES: Record<string, Array<'saved' | 'applied' | 'interviewing' | 'offer' | 'accepted' | 'rejected' | 'withdrawn'>> = {
  Stripe: ['applied', 'interviewing'],
  Linear: ['applied'],
  Planetscale: ['applied', 'interviewing', 'offer'],
  'Fly.io': ['applied', 'interviewing', 'rejected'],
  Turso: ['applied', 'withdrawn'],
};

async function seed() {
  console.log('Seeding job application tracker…');
  const seedApps = buildSeedApplications();

  const created: Array<{ id: string; company: string }> = [];

  for (const appInput of seedApps) {
    // Create each application at its final status by first creating it as 'saved'
    // (the service default) and then updating through the intermediate statuses.
    // This generates a realistic timeline of audit events for each application.
    const app = await applicationService.create({
      company: appInput.company,
      role: appInput.role,
      status: 'saved',
      jobUrl: appInput.jobUrl,
      notes: appInput.notes,
    });
    created.push({ id: app.id, company: app.company });
    console.log(`  ✓ Created: ${app.company} — ${app.role} [${app.id}]`);

    // Apply status upgrades in sequence (each generates an 'updated' audit row with diff.status).
    const upgrades = STATUS_UPGRADES[appInput.company] ?? [];
    // Append the final status if it isn't 'saved' and wasn't covered by the upgrade path.
    const allSteps: string[] = [...upgrades];
    if (appInput.status && appInput.status !== 'saved' && allSteps[allSteps.length - 1] !== appInput.status) {
      allSteps.push(appInput.status);
    }

    for (const nextStatus of allSteps) {
      await applicationService.update(app.id, { status: nextStatus as typeof appInput.status });
      console.log(`    → ${nextStatus}`);
    }
  }

  console.log(`\nSeeded ${created.length} applications with full audit history.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
```

- [ ] **Step 4: Add `db:seed` script to `package.json`**

In `package.json`, add to the `"scripts"` section:
```json
"db:seed": "tsx scripts/seed.ts"
```

- [ ] **Step 5: Run shape test to verify it passes**

Run: `npm run test -- scripts/seed.test.ts`
Expected: PASS (all three cases — no DB needed, pure function only).

- [ ] **Step 6: Manual smoke-test (requires live Neon `DATABASE_URL`)**

With a valid `.env`:
```bash
npm run db:seed
```
Expected output:
```
Seeding job application tracker…
  ✓ Created: Stripe — Senior Software Engineer [<uuid>]
    → applied
    → interviewing
  ✓ Created: Linear — Full-Stack Engineer [<uuid>]
    → applied
  ✓ Created: Vercel — Developer Experience Engineer [<uuid>]
  ✓ Created: Planetscale — Backend Engineer [<uuid>]
    → applied
    → interviewing
    → offer
  ✓ Created: Fly.io — Infrastructure Engineer [<uuid>]
    → applied
    → interviewing
    → rejected
  ✓ Created: Turso — Developer Advocate [<uuid>]
    → applied
    → withdrawn
  ✓ Created: Neon — Product Engineer [<uuid>]

Seeded 7 applications with full audit history.
```

Verify the live board shows populated columns and each application's timeline page shows events.

---

### Task 6: Root `README.md`

**Files:**
- Create/replace: `README.md` (root)

**Interfaces:**
- Produces: the complete submission README covering every section required by `requirements.md`. No section may be a placeholder or a stub.

> **Verification (not a unit test):** After writing, confirm every `requirements.md` section appears:
> - [ ] What it is, and how to run it
> - [ ] Who it's for, and the one job it has to do well
> - [ ] Why this problem, and how you know it's worth solving
> - [ ] What's already out there, and why you built this anyway
> - [ ] What you put in scope, what you left out, and why
> - [ ] Where you didn't have answers, what you assumed
> - [ ] Three questions you'd ask a real user before building more
> - [ ] How you'd know it's working, and what you'd do next
> - [ ] How AI was used (incl. one thing it got wrong)
> - [ ] Deployment / live URL / how to run locally

Then run `npm run build` and confirm it exits 0.

- [ ] **Step 1: Write the README**

Write the following content to `README.md` at the project root:

```markdown
# Job Application Tracker

A single-user kanban-style job application tracker. Track every application through an ordered
status pipeline — Saved → Applied → Interviewing → Offer → Accepted / Rejected / Withdrawn —
and see the **full, immutable history** of every change to each application.

**Live URL:** https://job-application-tracker-<your-vercel-slug>.vercel.app

---

## How to run locally

**Prerequisites:** Node 20+, npm, a [Neon](https://neon.tech) Postgres database.

```bash
# 1. Clone and install
git clone https://github.com/<your-github-username>/job-application-tracker.git
cd job-application-tracker
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and fill in DATABASE_URL (pooled Neon string)
# and DATABASE_URL_UNPOOLED (unpooled Neon string)

# 3. Run migrations
npm run db:migrate

# 4. (Optional) Seed demo data
npm run db:seed

# 5. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To run tests: `npm run test`

---

## Who it's for, and the one job it has to do well

A **single job seeker** in an active search — juggling tens of applications across different
companies, each at a different stage, over several weeks.

**The one job:** track every application through an ordered pipeline and see the complete,
tamper-proof history of when each changed stage.

---

## Why this problem, and how I know it's worth solving

Job searching is fundamentally a pipeline management problem: you have many items (applications)
moving through a known set of stages, and you need to know exactly where each one stands —
and when it got there. Spreadsheets work at small scale but collapse past ~20-30 rows: no
visual pipeline, no history, manual status updates, and zero structure.

The insight that makes this worth building as an engineering exercise is the **audit trail**.
A pipeline tracker *is* state + history — you cannot understand where an application is today
without knowing where it's been. Writing that history transactionally (so status and timeline
can never drift) is exactly the kind of architectural constraint that rewards being deliberate.

---

## What's already out there, and why I built this anyway

**Teal** and **Huntr** are the main players. Both have pivoted toward paid AI-resume suites
(Teal+ ~$29/month; Huntr free tier caps at 40 jobs). The free tier of Huntr covers basic
tracking but adds friction — account setup, AI prompts, upsell modals — on top of the core
task. There is no lightweight, free, open-source, web-first tool that just does the pipeline.

This project is deliberately small: one board, one history, no AI upsell. The tradeoff is
worth it because simplicity is the feature at this problem size.

---

## What's in scope, what's out, and why

**In (MVP):**
- Create, edit, and soft-delete applications
- Change status by dragging between board columns or via a card menu
- Archived view for terminal outcomes (Accepted / Rejected / Withdrawn)
- Reopen an archived application back to any active status
- Per-application audit timeline showing every change with timestamps
- Infinite scroll per board column (keyset pagination, never OFFSET)
- Seed script for demo data

**Out / deferred (documented next steps, in priority order):**
- **Auth** — the #1 next step. The data model is auth-ready (`created_by`/`updated_by` columns
  on every table, nullable now, populated from `userId` once auth is wired). No auth was a
  deliberate scope cut for a single-user MVP.
- Search, filter, sort
- Manual intra-column ordering (deferred to avoid the LexoRank/fractional-rank complexity trap)
- List virtualization (breaks dnd-kit drag; infinite scroll keeps cards mounted, which is DnD-safe)
- Normalized company entities (YAGNI at single-user scale)
- Modal / intercepting-routes detail view
- Hard terminal-lock / reopen-confirm dialog
- Bulk actions, multiple boards

---

## Assumptions

- **Single user.** There is no auth. Anyone with the URL can see and edit everything. This is
  documented as the #1 next step.
- **Tens to low hundreds of active cards.** No virtualization, no search needed at MVP scale.
- **A job search is a pipeline.** The kanban board is the right metaphor — not a table, not a
  list. The four active columns map to the natural stages.
- **Dates like "applied on May 3" are recoverable from the timeline.** There are no separate
  date columns (e.g. `appliedAt`). If a user needs them, the audit history has them.
- **No strict state machine.** Rejection can arrive from any stage; people withdraw mid-process;
  mis-clicks need correction. The backend validates only that the target is a valid status —
  it does not enforce a strict FSM. A forward-only lock is a documented next step.

---

## Three questions I'd ask a real user before building more

1. **When a card moves stages, do you need that previous stage's date remembered explicitly
   (e.g. "applied on May 3"), or is a chronological history enough?**
   *(Tests whether deriving dates from the audit timeline is sufficient, or whether explicit date
   columns like `appliedAt` are a must-have.)*

2. **How many applications do you track at once, and over what time span?**
   *(Validates the single-user, no-search, infinite-scroll, no-virtualization assumptions.
   If the answer is "hundreds spanning 6 months", search and archiving UX move up the priority list.)*

3. **When an application is rejected, do you want it gone from view, kept for reference, or
   resurfaced if the company re-engages?**
   *(Validates the Archived + Reopen model versus a simple soft delete. If users never reopen,
   the Archived view is less important than a clean "dismiss" action.)*

---

## How I'd know it's working, and what I'd do next

**Working:**
- The live URL opens to a populated board (seed data).
- You can create an application, drag it between columns, mark it terminal, reopen it, edit it,
  and delete it.
- The per-application timeline page shows every change with timestamps and never contradicts
  the current status — because status and history are written in the same database transaction.
- The test suite passes (`npm run test`), and the repo runs from this README.

**What's next (in priority order):**
1. **Auth** — wire a session provider (e.g. NextAuth / Clerk); populate `created_by`/`updated_by`
   from the session; scope all queries to the authenticated user's `userId`. The data model is
   already prepared.
2. Search and filter across applications.
3. Explicit date fields (`appliedAt`, `interviewedAt`) if user research confirms the timeline
   alone is insufficient.
4. Modal / intercepting-routes detail view for a faster flow without full navigation.
5. Manual intra-column ordering via LexoRank / fractional ranks (deferred now to avoid the
   complexity trap before validating it's needed).

---

## How I used AI

Claude (claude.ai/code) drove the majority of research, architectural rules, and planning documents
under close human direction. Specifically: domain modeling, the Hono + Drizzle + Neon architecture
rules, the TanStack Query invalidation pattern, and all five implementation plans were drafted by AI
and reviewed/corrected before any code was written.

**One thing AI got wrong that I caught:** Claude's first proposal used an audit `action` of
`status_changed`. I caught that this would be ambiguous — an edit touching *both* the role name
and the status in the same `PATCH` would need to be both `updated` *and* `status_changed` at once.
The corrected design uses a **generic CRUD `action`** (`created` / `updated` / `deleted`) with the
specifics in a structured `diff` field (a status change is an `updated` whose `diff.status = { from, to }`).
This is simpler, consistent, and extensible.

Secondary catches: a claim that dnd-kit was abandoned (only its documentation repository was
archived; the library itself is actively maintained), and a push to derive the `created_by`/`updated_by`
actor from context rather than explicit base columns (overridden to match the base-entity pattern
for consistency and auth-readiness).
```

- [ ] **Step 2: Verify all sections are present**

Review the written README and confirm each required `requirements.md` section is covered (see checklist above the step). Every section should have real prose — no "TBD" or "TODO" markers.

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: exit 0, no errors.

---

### Task 7: Deployment — migration-on-deploy step, `.env.example`, `vercel.json`

**Files:**
- Modify: `README.md` (add `## Deployment` section — written here in full)
- Modify: `.env.example` (ensure it has both env vars + any new ones from Plans 1–5)
- Create: `vercel.json` (only the `buildCommand` override to run migrations before build)

**Interfaces:**
- Produces:
  - A `vercel.json` that runs `drizzle-kit migrate` (against `DATABASE_URL_UNPOOLED`) as part of the Vercel build so migrations are applied before the Next.js build.
  - An up-to-date `.env.example` with exactly the two env vars the app requires (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`).
  - A `## Deployment` section in `README.md` with the exact steps a human runs to deploy from scratch.

> **Note:** No live deployment is performed during this plan task. The plan documents the exact steps. The human implementing the plan runs them. `npm run build` is the verification.

- [ ] **Step 1: Read the current `.env.example`**

Confirm it contains:
```bash
DATABASE_URL=
DATABASE_URL_UNPOOLED=
```
If it does not, update it to include both. No other secret env vars are needed for this app.

- [ ] **Step 2: Create `vercel.json`**

```json
{
  "buildCommand": "npm run db:migrate && next build"
}
```

This tells Vercel to run `drizzle-kit migrate` (which uses `DATABASE_URL_UNPOOLED`) before `next build`. The migration uses the unpooled connection string because Neon's connection pooler does not support the DDL transactions that drizzle-kit migrate requires.

- [ ] **Step 3: Add `## Deployment` section to `README.md`**

Append the following section to the existing `README.md` (after the "How I used AI" section):

```markdown
---

## Deployment

The app is deployed as a single Vercel project backed by a Neon Postgres database.

### One-time setup

1. **Create a Neon project** at [neon.tech](https://neon.tech). Note the connection strings:
   - **Pooled** (`-pooler` in the hostname) → `DATABASE_URL` (used by the running app)
   - **Unpooled** (no `-pooler`) → `DATABASE_URL_UNPOOLED` (used by migrations only)

2. **Create a Vercel project** and connect your GitHub repository.

3. **Set environment variables** in Vercel project settings → Environment Variables:
   - `DATABASE_URL` = the pooled Neon connection string
   - `DATABASE_URL_UNPOOLED` = the unpooled Neon connection string

   These are not secret-typed in Vercel by default; treat them as secrets and do not commit them.

4. **Deploy.** Vercel automatically runs `npm run db:migrate && next build` on every push to
   `main` (configured in `vercel.json`). Migrations run against `DATABASE_URL_UNPOOLED` before
   the Next.js build; the running app uses the pooled `DATABASE_URL`.

5. **Seed the database** (first deploy only):

   ```bash
   # Run locally with DATABASE_URL pointing at the production Neon branch (or a staging branch).
   DATABASE_URL=<pooled-prod-url> DATABASE_URL_UNPOOLED=<unpooled-prod-url> npm run db:seed
   ```

   Or set the env vars in your local `.env` temporarily. The seed script calls the application
   service, so each application gets a proper audit trail.

### Re-deploys

Push to `main`. Vercel picks it up, runs migrations (idempotent — already-applied migrations are
skipped by drizzle-kit), then builds and deploys. No manual steps needed.

### Local development against production data

Not recommended. Use a Neon branch for local development:
- Create a branch in the Neon console.
- Use that branch's connection strings in your local `.env`.
- Run `npm run db:migrate` against the branch.
```

- [ ] **Step 4: Verify build passes with `vercel.json` present**

Run: `npm run build`
Expected: exit 0. (The `vercel.json` `buildCommand` is Vercel-specific and does not affect `npm run build` locally.)

---

## Commit A - Plan 5 code (you run this)

Run this yourself after all tasks in this plan pass their tests and the build is green. Adjust the message if you prefer.

```bash
git add \
  src/features/audit/hooks/use-timeline.ts \
  src/features/audit/hooks/use-timeline.test.ts \
  src/features/audit/components/audit-timeline.tsx \
  src/features/audit/components/audit-timeline.test.tsx \
  src/features/application/hooks/use-application.ts \
  src/features/application/hooks/use-application.test.ts \
  src/features/application/components/application-detail.tsx \
  src/features/application/components/application-detail.test.tsx \
  src/app/applications/[id]/page.tsx \
  scripts/seed.ts \
  scripts/seed.test.ts \
  package.json \
  vercel.json
git commit -m "feat: application detail + audit timeline page, seed script"
```

## Final commit - docs (you run this LAST, after all 5 plans are done and the app is prod-ready)

**This is the last commit of the whole project.** Make it only after every plan's code works, all tests pass, the live URL is verified, and the app is confirmed prod-ready. Do not commit docs alongside or before code is stable.

```bash
git add README.md
git commit -m "docs: README, AI-usage note, and deployment docs"
```

Run this yourself; adjust the message if you prefer.

---

## Self-Review

- **README prose:** Task 6 contains the FULL actual README text — every `requirements.md` section has real drafted prose. No placeholders, no "TBD", no cross-references to "write X here". The three questions are verbatim from spec §14. The AI note covers both the `status_changed`→generic-`updated` catch (spec §12) and the secondary catches. The scope in/out list matches spec §3. The "how you'd know it works" mirrors spec §15. The deployment section in Task 7 is also complete, real prose.
- **Hooks return `.data` (envelope unwrapped — canonical decision D):** `useTimeline` parses the paginated envelope with the `paginatedAuditSchema` and returns `parsed.data` (`PaginatedData<AuditEventResponse>` = `{ items, meta }`). `useApplication` parses the single envelope with `singleApplicationSchema` and returns `.data` (an `ApplicationResponse`). The RSC prefetch `queryFn`s call the services directly — `applicationService.getById(id)` returns `ApplicationResponse`, `auditService.listTimeline(...)` returns `PaginatedData<AuditEventResponse>` — so the prefetch cache shapes match the hooks' unwrapped shapes exactly. The timeline component reads `data.pages.flatMap(p => p.items)` (not `p.data.items`). `getNextPageParam: (lastPage) => lastPage.meta.hasMore ? lastPage.meta.nextCursor : undefined`.
- **ISO-string dates in all mocks (canonical decision C):** `applicationResponseSchema` and `auditEventResponseSchema` type `createdAt`/`updatedAt` as `z.string().datetime()` (server emits ISO strings). Every test mock in Tasks 1, 2, 3, and the seed-builder test uses ISO strings (e.g. `createdAt: '2026-06-22T10:00:00Z'`), never `new Date(...)`. `ApplicationDetail` and `AuditTimeline` treat `createdAt`/`updatedAt` as strings and wrap with `new Date(value).toLocaleString()` for display.
- **Seed passes `status: 'saved'` — type-checks cleanly:** `applicationService.create` takes `CreateApplicationRequest` whose Zod `.default('saved')` makes `status` required-after-parse in the inferred type. The seed passes `status: 'saved'` explicitly to every `create` call, then drives subsequent `update` calls through the intermediate statuses to generate realistic timeline history. No TypeScript error.
- **Detail page composes both features at `app/` layer:** `app/applications/[id]/page.tsx` (Task 4) is an RSC that prefetches via `applicationService.getById` and `auditService.listTimeline` (in-process, no HTTP self-hop), dehydrates the cache, and renders `<ApplicationDetail/>` (from `features/application`) and `<AuditTimeline/>` (from `features/audit`) inside `HydrationBoundary`. No cross-feature imports; `app/` is the composer. `notFound()` is called on 404. The timeline renders a status change as "Status: <from> → <to>" from `diff.status = { from, to }`.
- **Seed via service path:** `scripts/seed.ts` calls `applicationService.create` and `applicationService.update` — the same path that calls `db.transaction(…)` + `recordAudit(…)` internally. The seed never inserts into `audit_log` directly. The seed test (`buildSeedApplications`) is a pure-function shape test that runs without a DB.
- **All `requirements.md` README sections covered:** what it is + how to run ✓; who it's for + the one job ✓; why the problem + worth solving ✓; what's out there + why build anyway ✓; scope in/out + why ✓; assumptions ✓; three questions ✓; how you'd know it works + next steps ✓; AI note ✓.
- **TDD applied where meaningful:** Tasks 1–3 and 5 have real Vitest tests (hook tests mock `fetch`, component tests mock the hook, seed test is pure). Task 4 (RSC page) explicitly states that RSC pages cannot be imported in jsdom and uses `tsc --noEmit` + `npm run build` as the verification — this is acknowledged rather than covered up with a fake test. Task 6 (README) and Task 7 (deploy) are prose deliverables; their verification is a section checklist + `npm run build`.
- **Naming and boundaries:** all new files follow folder-based naming (no type suffixes), camelCase exports, no `I` prefix. `features/audit/hooks` and `features/audit/components` are `'use client'`; `features/application/hooks` and `features/application/components` are `'use client'`. No cross-feature imports anywhere — `app/` is the composer.
- **Keyset pagination on the timeline:** `useTimeline` uses `useInfiniteQuery` with `initialPageParam: null` and `getNextPageParam` from `meta.nextCursor`. The RSC prefetch uses `prefetchInfiniteQuery` with the same `initialPageParam`. Consistent with Plan 3's `auditService.listTimeline` contract.
- **Open dependency:** Tasks 1–5 depend on Plans 2–4 being complete (the service interfaces, DTOs, and Hono routes must exist). If they do not, the build check in Task 4 will surface the missing exports as type errors — resolve by completing Plans 2–4 first.
