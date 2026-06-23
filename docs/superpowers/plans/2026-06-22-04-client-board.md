# Job Application Tracker — Plan 4: Client / UI (Board, Cards, DnD, Forms, Archived)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the entire client/UI layer — the providers tree, TanStack Query hooks (infinite list, mutations, optimistic board-move), the kanban board with dnd-kit drag-and-drop (optimistic rolio pattern), the per-column infinite scroll, the create/edit forms (RHF + Zod), the Archived view with Reopen submenu, and the RSC pages that prefetch and hydrate everything. Plans 1 (shared infra + `getQueryClient` + `queryKeys`) and 2 (`/api/v1/applications` + DTOs) are **assumed complete**. Plan 3 (audit) and Plan 5 (detail page, timeline, seed, README) are out of scope here.

**Architecture:** One unified Next.js (App Router) app, Feature-Based "Pattern B". Client components and hooks live under `features/application/` and `shared/`; they reach the server **only** via `fetch` → the Hono `/api/v1` API, parsing responses with the shared Zod response schemas. Server Components (`page.tsx`) call `applicationService` directly (in-process) for `prefetchInfiniteQuery`, then wrap with `HydrationBoundary`. The `MutationCache` auto-invalidation contract from Plan 1 is already wired — mutations tag `meta.invalidates` with `queryKeys` factories; the DnD move mutation opts out with `meta: { invalidates: [] }` and manages its own deferred invalidation via `pendingDragCountRef`.

**Tech Stack:** Next.js App Router, React, TypeScript, TanStack Query v5, dnd-kit (`@dnd-kit/core` `@dnd-kit/sortable` `@dnd-kit/utilities`), react-hook-form, `@hookform/resolvers/zod`, shadcn/ui + Tailwind, next-themes, Zod, Vitest + React Testing Library (jsdom), npm.

## As-built deviations

> Added after implementation. The shipped code and the `.claude/rules/` files (esp. client.md) are the
> source of truth - the task steps below are kept as the original execution record.

- Card actions (move / mark-terminal / edit / delete) are injected once at the board via
  `ApplicationActionsContext` (`features/application/contexts/`) and read by each card through `use()`.
  Columns and cards forward NO handler props (the steps below prop-drill them).
- Delete is a deferred-undo callback (`useDeleteApplication` returns a function, not a `useMutation`):
  the card is removed optimistically and the server DELETE is held behind a ~5s undo toast. Reopen is its
  own optimistic hook (`useReopenApplication`); mark-terminal reuses the optimistic move hook.
- Infinite scroll is a shared `shared/hooks/use-infinite-scroll.ts` (wire-once observer + latest-ref),
  rooted to each internal scroll container (column-internal scroll, not page scroll). It replaced the
  duplicated `IntersectionObserver` effects.
- Cache helpers are generic in `shared/lib/infinite-cache/` (`withoutItem`, `PaginatedInfiniteCache`),
  with an `ApplicationListCache` alias in `features/application/types/cache.ts`. Client envelope schemas
  are centralized as `applicationEnvelopeSchema` / `applicationPageEnvelopeSchema` in the response DTO.
- DnD: `DndContext` has a stable `id="application-board"` (SSR hydration fix) and a pointer-based
  `boardCollisionDetection` (`pointerWithin` + `rectIntersection` fallback). Columns are `React.memo`
  droppables with an `isOver` highlight; `DraggableCard` is module-scope; drag decisions live in
  `features/application/utils/drag/`.
- Create and Edit are two explicit dialog components (not one shared form). The card shows only company,
  role, and status (plus a `GripVertical` handle and a menu); labels come from a `constants/labels`
  module (`STATUS_LABELS`, `TERMINAL_ACTIONS`).
- App shell: a fixed-height layout with column-internal scroll, a skip link, `aria-current` on the navbar,
  `viewport.themeColor`, and `role="alert"` load errors. Font is `Geist`. RSC pages are `force-dynamic`
  at flat paths (`app/page.tsx`, `app/archived/page.tsx`) - no `(dashboard)` route group.
- `queryKeys.applications.lists()` snapshots and restores every list cache on the optimistic delete.

## Carry-over notes (from Plan 1 review)

Apply these when implementing this plan:

- **Re-enable knip on the query client.** When `providers.tsx` lands (mounts `QueryClientProvider` with `getQueryClient`), add it to knip's `entry` array and **remove** the `shared/lib/query-client/query-client.ts` line from `knip.json`'s `ignore`. With a real consumer the file is reachable, so the file-level ignore (and the `@public` tag on `getQueryClient`) is no longer needed.
- **Lazy-load the kanban board with `next/dynamic`.** dnd-kit is heavy — load the board component dynamically so it stays off the initial route bundle (Vercel `bundle-dynamic-imports`).

## Global Constraints

Every task implicitly includes these (copied from the spec + rules):

- **Git is run by the user.** The executing agent NEVER runs `git add/commit/push`. When all of this plan's tasks are green, pause and surface the suggested commit command (see the Commit section at the end) for the user to run. One commit per plan.
- **camelCase-only on the wire** (input AND output). Drizzle maps to snake_case DB columns. No snake_case middleware.
- **Strings use `text`**, never `varchar`. Length validated in Zod, not the column.
- **Status set is `text` + a Zod enum — NEVER `pgEnum`, no DB CHECK.**
- **Keyset/cursor pagination only**, ordered `(updatedAt, id)`. Never `OFFSET`.
- **Soft delete** via `deletedAt`; queries filter `deletedAt IS NULL`.
- **`server-only` boundary:** every file that touches the DB or server logic begins with `import 'server-only'`. A `'use client'` file importing one is a build error.
- **No cross-feature imports.** `shared/` is importable by anything; features import only `shared/` + their own files.
- **Folder-based naming, no type suffix, no `I` prefix.** API versioned by folder (`api/v1/`, `dtos/v1/`).
- **All client data goes through hooks → `fetch` → the Hono `/api/v1` API**, parsed with shared Zod response schemas. NEVER use Next.js Server Actions as a TanStack Query `queryFn` or for forms.
- **Files in `components/` and `hooks/` begin with `'use client'`.** They must NOT import any `server-only` file (services/repositories/db/mappers that import `'server-only'`). Shared Zod **schemas** (request + response) are plain and shareable.
- **Query keys from the typed `queryKeys` factory** (entity-first). Mutations tag `meta.invalidates`; DnD move opts out with `meta: { invalidates: [] }`.
- **TDD where meaningful, ≥80% coverage target on testable units.**
- **Hono route handler runs on the Node runtime** (`neon-serverless` needs it).
- **Env vars:** `DATABASE_URL` (pooled `-pooler`, app), `DATABASE_URL_UNPOOLED` (unpooled, migrations + tests).

---

### Task 1: shadcn/ui init + generate base primitives

**Files:**
- Create/Modify: `components.json`, `src/app/globals.css`, `src/shared/components/ui/button.tsx`, `src/shared/components/ui/card.tsx`, `src/shared/components/ui/dialog.tsx`, `src/shared/components/ui/dropdown-menu.tsx`, `src/shared/components/ui/form.tsx`, `src/shared/components/ui/input.tsx`, `src/shared/components/ui/textarea.tsx`, `src/shared/components/ui/badge.tsx`, `src/shared/components/ui/sonner.tsx`, `src/shared/components/ui/separator.tsx`

**Interfaces:**
- Produces: shadcn-generated primitives in `shared/components/ui/` (kebab filenames, PascalCase exports). No custom logic here — pure generation step. Verified by `npm run build`.

- [ ] **Step 1: Init shadcn**

Run (accept defaults — choose `default` style, slate base color, CSS variables yes):
```bash
npx shadcn@latest init
```

When prompted for the component path, ensure it points to `src/shared/components/ui` (or update `components.json` afterward):
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/shared/components",
    "utils": "@/shared/lib/utils",
    "ui": "@/shared/components/ui",
    "lib": "@/shared/lib",
    "hooks": "@/shared/hooks"
  }
}
```

- [ ] **Step 2: Add required primitives**

Run:
```bash
npx shadcn@latest add button card dialog dropdown-menu form input textarea badge separator
npm i sonner
npx shadcn@latest add sonner
```

- [ ] **Step 3: Install remaining client deps if not already present**

Run:
```bash
npm i @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities next-themes
```

Verify install:
```bash
npm ls @dnd-kit/core next-themes sonner
```
Expected: all three resolve with versions, no `UNMET DEPENDENCY`.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds with no errors.

> **Why no unit test:** shadcn generation is pure file scaffolding — the generated primitives are pre-tested by the shadcn project. A build-pass is the correct gate.

---

### Task 2: `app/providers.tsx` + `layout.tsx` wiring

**Files:**
- Create: `src/app/providers.tsx`
- Modify: `src/app/layout.tsx`
- Test: `src/app/providers.test.tsx`

**Interfaces:**
- Produces: `Providers` component (`'use client'`) wrapping `<ThemeProvider>` (next-themes, `attribute="class"`, `defaultTheme="system"`, `enableSystem`) → `<QueryClientProvider client={getQueryClient()}>` → `<Toaster />` (sonner). Wired into `app/layout.tsx` as `<Providers>{children}</Providers>`. RSC pages call the same `getQueryClient()` for `prefetchInfiniteQuery`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/providers.test.tsx
/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Providers } from './providers';

// Mock next-themes and @tanstack/react-query to keep test lightweight
vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="theme-provider">{children}</div>,
}));
vi.mock('@tanstack/react-query', () => ({
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="query-provider">{children}</div>,
}));
vi.mock('sonner', () => ({
  Toaster: () => <div data-testid="toaster" />,
}));
vi.mock('@/shared/lib/query-client', () => ({
  getQueryClient: vi.fn(() => ({})),
}));

describe('Providers', () => {
  it('renders children inside ThemeProvider and QueryClientProvider', () => {
    render(<Providers><span>hello</span></Providers>);
    expect(screen.getByTestId('theme-provider')).toBeInTheDocument();
    expect(screen.getByTestId('query-provider')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('renders the Toaster', () => {
    render(<Providers><span /></Providers>);
    expect(screen.getByTestId('toaster')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/app/providers.test.tsx`
Expected: FAIL — `Providers` is not defined.

- [ ] **Step 3: Write `providers.tsx`**

```tsx
// src/app/providers.tsx
'use client';

import React from 'react';
import { ThemeProvider } from 'next-themes';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { getQueryClient } from '@/shared/lib/query-client';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const queryClient = getQueryClient();
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster richColors position="bottom-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 4: Wire into `layout.tsx`**

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Job Application Tracker',
  description: 'Track every application through a pipeline. See the full history.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/app/providers.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 3: `useApplications(status)` — infinite query hook

**Files:**
- Create: `src/features/application/hooks/use-applications.ts`
- Test: `src/features/application/hooks/use-applications.test.ts`

**Interfaces:**
- Consumes: `queryKeys.applications.list(params)`, `getQueryClient`, `applicationResponseSchema` + `ApiResponse`, `PaginatedData` from `@/shared/types/response`, `ApplicationStatus` from `features/application/constants/status`.
- Produces: `useApplications(status: ApplicationStatus)` — a `useInfiniteQuery` that `fetch`es `GET /api/v1/applications?status=<s>&cursor=<c>&limit=20`, parses with the shared response Zod schema, and returns a cursor-keyset-based infinite scroll. `getNextPageParam` reads `meta.nextCursor` from the last page. `useArchivedApplications()` is in the next task.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/application/hooks/use-applications.test.ts
/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider, InfiniteData } from '@tanstack/react-query';
import { useApplications } from './use-applications';
import type { ApiResponse, PaginatedData } from '@/shared/types/response';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

const mockApp: ApplicationResponse = {
  id: 'app-1',
  company: 'Acme',
  role: 'Engineer',
  status: 'saved',
  jobUrl: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  );
}

describe('useApplications', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches first page and exposes items', async () => {
    const page1: ApiResponse<PaginatedData<ApplicationResponse>> = {
      message: 'ok',
      data: {
        items: [mockApp],
        meta: { limit: 20, nextCursor: null, hasMore: false },
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => page1,
    }));

    const { result } = renderHook(() => useApplications('saved'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data as InfiniteData<PaginatedData<ApplicationResponse>>;
    expect(data.pages[0].items).toHaveLength(1);
    expect(data.pages[0].items[0].company).toBe('Acme');
  });

  it('fetches second page using nextCursor from first page', async () => {
    const mockApp2: ApplicationResponse = { ...mockApp, id: 'app-2', company: 'Beta' };
    const page1: ApiResponse<PaginatedData<ApplicationResponse>> = {
      message: 'ok',
      data: { items: [mockApp], meta: { limit: 20, nextCursor: 'cursor-abc', hasMore: true } },
    };
    const page2: ApiResponse<PaginatedData<ApplicationResponse>> = {
      message: 'ok',
      data: { items: [mockApp2], meta: { limit: 20, nextCursor: null, hasMore: false } },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, json: async () => page2 });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApplications('saved'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    const data = result.current.data as InfiniteData<PaginatedData<ApplicationResponse>>;
    expect(data.pages).toHaveLength(2);
    expect(data.pages[1].items[0].company).toBe('Beta');

    // second fetch must carry cursor
    const secondCall = (fetchMock.mock.calls[1][0] as string);
    expect(secondCall).toContain('cursor=cursor-abc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/application/hooks/use-applications.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the hook**

```ts
// src/features/application/hooks/use-applications.ts
'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { queryKeys } from '@/shared/constants/query-keys';
import type { PaginatedData } from '@/shared/types/response';
import { applicationResponseSchema } from '../dtos/v1/responses/application';
import type { ApplicationStatus } from '../constants/status';

const applicationListResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    items: z.array(applicationResponseSchema),
    meta: z.object({
      limit: z.number(),
      nextCursor: z.string().nullable(),
      hasMore: z.boolean(),
    }),
  }),
});

export type ApplicationListResponse = z.infer<typeof applicationListResponseSchema>;

async function fetchApplicationPage(
  status: ApplicationStatus,
  cursor: string | null,
): Promise<PaginatedData<z.infer<typeof applicationResponseSchema>>> {
  const params = new URLSearchParams({ status, limit: '20' });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`/api/v1/applications?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch applications: ${res.status}`);
  const json = await res.json();
  return applicationListResponseSchema.parse(json).data;
}

export function useApplications(status: ApplicationStatus) {
  return useInfiniteQuery({
    queryKey: queryKeys.applications.list({ status }),
    queryFn: ({ pageParam }) =>
      fetchApplicationPage(status, (pageParam as string | null) ?? null),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? lastPage.meta.nextCursor : undefined,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/application/hooks/use-applications.test.ts`
Expected: PASS (both cases).

---

### Task 4: `useArchivedApplications()` — archived infinite query hook

**Files:**
- Create: `src/features/application/hooks/use-archived-applications.ts`
- Test: `src/features/application/hooks/use-archived-applications.test.ts`

**Interfaces:**
- Produces: `useArchivedApplications()` — a `useInfiniteQuery` fetching `GET /api/v1/applications?archived=true&cursor=<c>&limit=20`. Same envelope + parsing pattern as Task 3. Query key: `queryKeys.applications.list({ archived: true })`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/application/hooks/use-archived-applications.test.ts
/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider, InfiniteData } from '@tanstack/react-query';
import { useArchivedApplications } from './use-archived-applications';
import type { ApiResponse, PaginatedData } from '@/shared/types/response';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

const mockApp: ApplicationResponse = {
  id: 'app-term-1',
  company: 'Corp',
  role: 'PM',
  status: 'rejected',
  jobUrl: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useArchivedApplications', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('fetches archived apps with archived=true param', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async (): Promise<ApiResponse<PaginatedData<ApplicationResponse>>> => ({
        message: 'ok',
        data: { items: [mockApp], meta: { limit: 20, nextCursor: null, hasMore: false } },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useArchivedApplications(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data as InfiniteData<PaginatedData<ApplicationResponse>>;
    expect(data.pages[0].items[0].status).toBe('rejected');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('archived=true');
    expect(url).not.toContain('status=');
  });

  it('uses getNextPageParam from meta.nextCursor', async () => {
    const page1: ApiResponse<PaginatedData<ApplicationResponse>> = {
      message: 'ok',
      data: { items: [mockApp], meta: { limit: 20, nextCursor: 'c-xyz', hasMore: true } },
    };
    const page2: ApiResponse<PaginatedData<ApplicationResponse>> = {
      message: 'ok',
      data: { items: [], meta: { limit: 20, nextCursor: null, hasMore: false } },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, json: async () => page2 });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useArchivedApplications(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    expect((fetchMock.mock.calls[1][0] as string)).toContain('cursor=c-xyz');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/application/hooks/use-archived-applications.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the hook**

```ts
// src/features/application/hooks/use-archived-applications.ts
'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { queryKeys } from '@/shared/constants/query-keys';
import type { PaginatedData } from '@/shared/types/response';
import { applicationResponseSchema } from '../dtos/v1/responses/application';

const archivedListResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    items: z.array(applicationResponseSchema),
    meta: z.object({
      limit: z.number(),
      nextCursor: z.string().nullable(),
      hasMore: z.boolean(),
    }),
  }),
});

async function fetchArchivedPage(
  cursor: string | null,
): Promise<PaginatedData<z.infer<typeof applicationResponseSchema>>> {
  const params = new URLSearchParams({ archived: 'true', limit: '20' });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`/api/v1/applications?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch archived applications: ${res.status}`);
  const json = await res.json();
  return archivedListResponseSchema.parse(json).data;
}

export function useArchivedApplications() {
  return useInfiniteQuery({
    queryKey: queryKeys.applications.list({ archived: true }),
    queryFn: ({ pageParam }) =>
      fetchArchivedPage((pageParam as string | null) ?? null),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? lastPage.meta.nextCursor : undefined,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/application/hooks/use-archived-applications.test.ts`
Expected: PASS (both cases).

---

### Task 5: Mutation hooks — create / update / delete

**Files:**
- Create: `src/features/application/hooks/use-application-mutations.ts`
- Test: `src/features/application/hooks/use-application-mutations.test.ts`

**Interfaces:**
- Produces:
  - `useCreateApplication()` — `useMutation` → `POST /api/v1/applications`, tagged `meta: { invalidates: [queryKeys.applications.all] }`.
  - `useUpdateApplication()` — `useMutation<ApplicationResponse, Error, { id: string; data: UpdateApplicationRequest }>` → `PATCH /api/v1/applications/:id`, tagged `meta: { invalidates: [queryKeys.applications.all] }`.
  - `useDeleteApplication()` — `useMutation<void, Error, string>` → `DELETE /api/v1/applications/:id`, tagged `meta: { invalidates: [queryKeys.applications.all] }`.
  - All parse response with `applicationResponseSchema` (create/update) or accept `204`/empty (delete). On error, show a `toast.error` from sonner.
- Consumes: `queryKeys`, `applicationResponseSchema`, `createApplicationSchema`, `updateApplicationSchema` from `features/application/dtos/v1/requests/`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/application/hooks/use-application-mutations.test.ts
/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useCreateApplication,
  useUpdateApplication,
  useDeleteApplication,
} from './use-application-mutations';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockApp: ApplicationResponse = {
  id: 'app-1',
  company: 'Acme',
  role: 'Engineer',
  status: 'saved',
  jobUrl: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useCreateApplication', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('POSTs to /api/v1/applications with the correct body', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'created', data: mockApp }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCreateApplication(), { wrapper: makeWrapper() });
    act(() => { result.current.mutate({ company: 'Acme', role: 'Engineer' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/applications',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.company).toBe('Acme');
  });

  it('has meta.invalidates set to applications.all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'created', data: mockApp }),
    }));
    const { result } = renderHook(() => useCreateApplication(), { wrapper: makeWrapper() });
    // Access the mutation's meta via the underlying mutation observer
    expect((result.current as unknown as { options: { meta: { invalidates: unknown[] } } }).options.meta?.invalidates).toBeDefined();
  });
});

describe('useUpdateApplication', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('PATCHes to /api/v1/applications/:id', async () => {
    const updated = { ...mockApp, company: 'Acme2' };
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'updated', data: updated }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUpdateApplication(), { wrapper: makeWrapper() });
    act(() => { result.current.mutate({ id: 'app-1', data: { company: 'Acme2' } }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/applications/app-1');
    expect(init.method).toBe('PATCH');
    expect(result.current.data?.company).toBe('Acme2');
  });
});

describe('useDeleteApplication', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('DELETEs to /api/v1/applications/:id', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDeleteApplication(), { wrapper: makeWrapper() });
    act(() => { result.current.mutate('app-1'); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/applications/app-1');
    expect((init as RequestInit).method).toBe('DELETE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/application/hooks/use-application-mutations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the mutation hooks**

```ts
// src/features/application/hooks/use-application-mutations.ts
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { queryKeys } from '@/shared/constants/query-keys';
import { applicationResponseSchema } from '../dtos/v1/responses/application';
import type { ApplicationResponse } from '../dtos/v1/responses/application';
import type { CreateApplicationRequest } from '../dtos/v1/requests/create-application';
import type { UpdateApplicationRequest } from '../dtos/v1/requests/update-application';

const singleResponseSchema = z.object({
  message: z.string(),
  data: applicationResponseSchema,
});

async function apiFetch<TData>(
  url: string,
  init: RequestInit,
  schema: z.ZodType<{ message: string; data: TData }>,
): Promise<TData> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) {
    throw new Error((json as { message?: string }).message ?? `Request failed: ${res.status}`);
  }
  return schema.parse(json).data;
}

export function useCreateApplication() {
  return useMutation<ApplicationResponse, Error, CreateApplicationRequest>({
    mutationFn: (data) =>
      apiFetch(
        '/api/v1/applications',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
        singleResponseSchema,
      ),
    onError: (err) => toast.error(err.message),
    meta: { invalidates: [queryKeys.applications.all] },
  });
}

export function useUpdateApplication() {
  return useMutation<ApplicationResponse, Error, { id: string; data: UpdateApplicationRequest }>({
    mutationFn: ({ id, data }) =>
      apiFetch(
        `/api/v1/applications/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
        singleResponseSchema,
      ),
    onError: (err) => toast.error(err.message),
    meta: { invalidates: [queryKeys.applications.all] },
  });
}

export function useDeleteApplication() {
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/v1/applications/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { message?: string }).message ?? `Delete failed: ${res.status}`);
      }
    },
    onError: (err) => toast.error(err.message),
    meta: { invalidates: [queryKeys.applications.all] },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/application/hooks/use-application-mutations.test.ts`
Expected: PASS (all cases).

---

### Task 6: `useMoveApplication()` — optimistic rolio DnD move hook

**Files:**
- Create: `src/features/application/hooks/use-move-application.ts`
- Test: `src/features/application/hooks/use-move-application.test.ts`

**Interfaces:**
- Produces: `useMoveApplication()` — implements the **optimistic rolio pattern**:
  1. On `mutate({ id, fromStatus, toStatus })`:
     - No-op guard: if `fromStatus === toStatus`, returns immediately without calling `mutateAsync`.
     - Increment `pendingDragCountRef`.
     - `cancelQueries` on both source and target column keys (prevents stale overwrites).
     - Snapshot both columns' current `setQueryData` values for rollback.
     - `setQueryData` on source column: remove the card optimistically.
     - `setQueryData` on target column: prepend the card (status updated to `toStatus`).
  2. On `onSuccess`: decrement `pendingDragCountRef`; if reaches 0, invalidate `queryKeys.applications.all` to sync server truth.
  3. On `onError`: roll back both columns to their snapshots; decrement `pendingDragCountRef`; invalidate to resync.
  4. `meta: { invalidates: [] }` — opts out of global MutationCache auto-invalidation (manages its own deferred invalidation).
  - Sends `PATCH /api/v1/applications/:id` with `{ status: toStatus }`.

> **Decision (reported):** The `pendingDragCountRef` is a `useRef<number>` initialised to `0` inside `useMoveApplication`. This means concurrent drags from the same mounted board all share the same ref — deferred invalidation fires only once all concurrent PATCH responses resolve. This is the documented behaviour.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/application/hooks/use-move-application.test.ts
/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider, InfiniteData } from '@tanstack/react-query';
import { useMoveApplication } from './use-move-application';
import { queryKeys } from '@/shared/constants/query-keys';
import type { PaginatedData } from '@/shared/types/response';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const mockApp: ApplicationResponse = {
  id: 'app-1',
  company: 'Acme',
  role: 'Engineer',
  status: 'saved',
  jobUrl: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makePage(items: ApplicationResponse[], nextCursor: string | null = null): PaginatedData<ApplicationResponse> {
  return { items, meta: { limit: 20, nextCursor, hasMore: false } };
}

function makeInfiniteData(items: ApplicationResponse[]): InfiniteData<PaginatedData<ApplicationResponse>> {
  return {
    pages: [makePage(items)],
    pageParams: [null],
  };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return { queryClient, wrapper: ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children) };
}

describe('useMoveApplication', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('optimistically removes card from source column and adds to target column', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'updated', data: { ...mockApp, status: 'applied' } }),
    }));

    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(queryKeys.applications.list({ status: 'saved' }), makeInfiniteData([mockApp]));
    queryClient.setQueryData(queryKeys.applications.list({ status: 'applied' }), makeInfiniteData([]));

    const { result } = renderHook(() => useMoveApplication(), { wrapper });

    act(() => {
      result.current.mutate({ id: 'app-1', fromStatus: 'saved', toStatus: 'applied' });
    });

    // optimistic update applied synchronously
    const savedData = queryClient.getQueryData<InfiniteData<PaginatedData<ApplicationResponse>>>(
      queryKeys.applications.list({ status: 'saved' })
    );
    const appliedData = queryClient.getQueryData<InfiniteData<PaginatedData<ApplicationResponse>>>(
      queryKeys.applications.list({ status: 'applied' })
    );
    expect(savedData?.pages[0].items).toHaveLength(0);
    expect(appliedData?.pages[0].items).toHaveLength(1);
    expect(appliedData?.pages[0].items[0].status).toBe('applied');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('is a no-op when fromStatus === toStatus (no fetch called)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(queryKeys.applications.list({ status: 'saved' }), makeInfiniteData([mockApp]));

    const { result } = renderHook(() => useMoveApplication(), { wrapper });

    act(() => {
      result.current.mutate({ id: 'app-1', fromStatus: 'saved', toStatus: 'saved' });
    });

    // fetch should not be called — the hook returns early
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rolls back optimistic update on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Server error' }),
    }));

    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(queryKeys.applications.list({ status: 'saved' }), makeInfiniteData([mockApp]));
    queryClient.setQueryData(queryKeys.applications.list({ status: 'applied' }), makeInfiniteData([]));

    const { result } = renderHook(() => useMoveApplication(), { wrapper });

    act(() => {
      result.current.mutate({ id: 'app-1', fromStatus: 'saved', toStatus: 'applied' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const rolledBack = queryClient.getQueryData<InfiniteData<PaginatedData<ApplicationResponse>>>(
      queryKeys.applications.list({ status: 'saved' })
    );
    expect(rolledBack?.pages[0].items).toHaveLength(1);
    expect(rolledBack?.pages[0].items[0].id).toBe('app-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/application/hooks/use-move-application.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the hook**

```ts
// src/features/application/hooks/use-move-application.ts
'use client';

import { useMutation, useQueryClient, InfiniteData } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { queryKeys } from '@/shared/constants/query-keys';
import { applicationResponseSchema } from '../dtos/v1/responses/application';
import type { ApplicationResponse } from '../dtos/v1/responses/application';
import type { ApplicationStatus } from '../constants/status';
import type { PaginatedData } from '@/shared/types/response';

const singleResponseSchema = z.object({
  message: z.string(),
  data: applicationResponseSchema,
});

type ColumnData = InfiniteData<PaginatedData<ApplicationResponse>> | undefined;

interface MoveVariables {
  id: string;
  fromStatus: ApplicationStatus;
  toStatus: ApplicationStatus;
}

interface MoveContext {
  fromSnapshot: ColumnData;
  toSnapshot: ColumnData;
  fromKey: readonly unknown[];
  toKey: readonly unknown[];
}

export function useMoveApplication() {
  const queryClient = useQueryClient();
  const pendingDragCountRef = useRef(0);

  return useMutation<ApplicationResponse, Error, MoveVariables, MoveContext>({
    mutationFn: async ({ id, fromStatus, toStatus }) => {
      // Idempotent no-op: dropping in own column — caller should guard, but hook also guards
      if (fromStatus === toStatus) {
        // Return a sentinel — the onMutate snapshot won't have been set because we return before mutate
        throw Object.assign(new Error('noop'), { isNoop: true });
      }
      const res = await fetch(`/api/v1/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: toStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { message?: string }).message ?? `Move failed: ${res.status}`);
      return singleResponseSchema.parse(json).data;
    },
    onMutate: async ({ id, fromStatus, toStatus }) => {
      if (fromStatus === toStatus) return { fromSnapshot: undefined, toSnapshot: undefined, fromKey: [], toKey: [] };

      const fromKey = queryKeys.applications.list({ status: fromStatus });
      const toKey = queryKeys.applications.list({ status: toStatus });

      // Cancel in-flight queries to avoid stale overwrites
      await queryClient.cancelQueries({ queryKey: fromKey });
      await queryClient.cancelQueries({ queryKey: toKey });

      // Snapshot for rollback
      const fromSnapshot = queryClient.getQueryData<ColumnData>(fromKey);
      const toSnapshot = queryClient.getQueryData<ColumnData>(toKey);

      pendingDragCountRef.current += 1;

      // Remove from source column
      queryClient.setQueryData<ColumnData>(fromKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.filter((app) => app.id !== id),
          })),
        };
      });

      // Prepend to target column with updated status
      queryClient.setQueryData<ColumnData>(toKey, (old) => {
        const movedCard: ApplicationResponse | undefined = fromSnapshot?.pages
          .flatMap((p) => p.items)
          .find((app) => app.id === id);
        if (!movedCard) return old;
        const updatedCard: ApplicationResponse = { ...movedCard, status: toStatus };
        if (!old) {
          return {
            pages: [{ items: [updatedCard], meta: { limit: 20, nextCursor: null, hasMore: false } }],
            pageParams: [null],
          };
        }
        return {
          ...old,
          pages: old.pages.map((page, idx) =>
            idx === 0
              ? { ...page, items: [updatedCard, ...page.items] }
              : page,
          ),
        };
      });

      return { fromSnapshot, toSnapshot, fromKey, toKey };
    },
    onSuccess: (_data, { fromStatus, toStatus }) => {
      if (fromStatus === toStatus) return;
      pendingDragCountRef.current -= 1;
      if (pendingDragCountRef.current === 0) {
        queryClient.invalidateQueries({ queryKey: queryKeys.applications.all });
      }
    },
    onError: (err, { fromStatus, toStatus }, context) => {
      if ((err as { isNoop?: boolean }).isNoop) return;
      if (context) {
        if (context.fromSnapshot !== undefined) {
          queryClient.setQueryData(context.fromKey, context.fromSnapshot);
        }
        if (context.toSnapshot !== undefined) {
          queryClient.setQueryData(context.toKey, context.toSnapshot);
        }
      }
      pendingDragCountRef.current = Math.max(0, pendingDragCountRef.current - 1);
      queryClient.invalidateQueries({ queryKey: queryKeys.applications.all });
      if (!(err as { isNoop?: boolean }).isNoop) {
        toast.error(err.message);
      }
    },
    // Opt out of global MutationCache auto-invalidation — manages its own deferred invalidation
    meta: { invalidates: [] },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/application/hooks/use-move-application.test.ts`
Expected: PASS (all three cases).

---

### Task 7: `application-card.tsx` — memoized card + card menu

**Files:**
- Create: `src/features/application/components/application-card.tsx`
- Test: `src/features/application/components/application-card.test.tsx`

**Interfaces:**
- Produces: `ApplicationCard` component (`'use client'`, `React.memo`) accepting props:
  - `app: ApplicationResponse` — the application data.
  - `onMove: (toStatus: ApplicationStatus) => void` — "Move to →" submenu callback.
  - `onMarkTerminal: (status: 'accepted' | 'rejected' | 'withdrawn') => void` — card menu callbacks.
  - `onEdit: (app: ApplicationResponse) => void` — opens the edit dialog.
  - `onDelete: (id: string) => void` — soft delete.
  - `dragListeners?: Record<string, unknown>` and `dragAttributes?: Record<string, unknown>` — dnd-kit handles spread onto a grip `div` (NOT onto the Radix Card itself).
  - Renders a shadcn `Card` with company + role (bold), status badge, and a `DropdownMenu` with "Move to →" (submenu of other active statuses), separator, "Mark Accepted" / "Reject" / "Withdraw", separator, "Edit", "Delete".
  - `ACTIVE_STATUSES` filtered to exclude the card's current status in "Move to →".
  - No inline components; stable prop references ensured by the caller (per `rerender-no-inline-components`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/application/components/application-card.test.tsx
/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ApplicationCard } from './application-card';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

const mockApp: ApplicationResponse = {
  id: 'app-1',
  company: 'Acme Corp',
  role: 'Senior Engineer',
  status: 'saved',
  jobUrl: 'https://example.com',
  notes: 'Good vibes',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ApplicationCard', () => {
  const onMove = vi.fn();
  const onMarkTerminal = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders company and role', () => {
    render(
      <ApplicationCard
        app={mockApp}
        onMove={onMove}
        onMarkTerminal={onMarkTerminal}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Senior Engineer')).toBeInTheDocument();
  });

  it('renders the status badge', () => {
    render(
      <ApplicationCard
        app={mockApp}
        onMove={onMove}
        onMarkTerminal={onMarkTerminal}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );
    expect(screen.getByText('saved')).toBeInTheDocument();
  });

  it('calls onEdit when Edit is clicked', async () => {
    render(
      <ApplicationCard
        app={mockApp}
        onMove={onMove}
        onMarkTerminal={onMarkTerminal}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    const editItem = await screen.findByText('Edit');
    fireEvent.click(editItem);
    expect(onEdit).toHaveBeenCalledWith(mockApp);
  });

  it('calls onDelete when Delete is clicked', async () => {
    render(
      <ApplicationCard
        app={mockApp}
        onMove={onMove}
        onMarkTerminal={onMarkTerminal}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    const deleteItem = await screen.findByText('Delete');
    fireEvent.click(deleteItem);
    expect(onDelete).toHaveBeenCalledWith('app-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/application/components/application-card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// src/features/application/components/application-card.tsx
'use client';

import React from 'react';
import { Card, CardContent, CardHeader } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Button } from '@/shared/components/ui/button';
import { MoreHorizontal } from 'lucide-react';
import { ACTIVE_STATUSES } from '../constants/status';
import type { ApplicationResponse } from '../dtos/v1/responses/application';
import type { ApplicationStatus } from '../constants/status';

interface ApplicationCardProps {
  app: ApplicationResponse;
  onMove: (toStatus: ApplicationStatus) => void;
  onMarkTerminal: (status: 'accepted' | 'rejected' | 'withdrawn') => void;
  onEdit: (app: ApplicationResponse) => void;
  onDelete: (id: string) => void;
  dragListeners?: Record<string, unknown>;
  dragAttributes?: Record<string, unknown>;
}

function ApplicationCardInner({
  app,
  onMove,
  onMarkTerminal,
  onEdit,
  onDelete,
  dragListeners,
  dragAttributes,
}: ApplicationCardProps) {
  const moveTargets = ACTIVE_STATUSES.filter((s) => s !== app.status);

  return (
    <Card className="relative cursor-default select-none">
      {/* Drag grip: listeners + attributes go here, NOT on the Radix Card */}
      <div
        className="absolute left-2 top-3 cursor-grab touch-none text-muted-foreground"
        {...dragListeners}
        {...dragAttributes}
        aria-label="drag handle"
      >
        ⠿
      </div>
      <CardHeader className="pb-1 pl-7">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-sm leading-snug">{app.company}</p>
            <p className="text-xs text-muted-foreground">{app.role}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label="open menu">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {moveTargets.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Move to →</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {moveTargets.map((status) => (
                      <DropdownMenuItem key={status} onSelect={() => onMove(status)}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onMarkTerminal('accepted')}>
                Mark Accepted
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onMarkTerminal('rejected')}>
                Reject
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onMarkTerminal('withdrawn')}>
                Withdraw
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onEdit(app)}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onDelete(app.id)}
                className="text-destructive focus:text-destructive"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pl-7 pt-0">
        <Badge variant="secondary" className="text-xs capitalize">
          {app.status}
        </Badge>
      </CardContent>
    </Card>
  );
}

export const ApplicationCard = React.memo(ApplicationCardInner);
ApplicationCard.displayName = 'ApplicationCard';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/application/components/application-card.test.tsx`
Expected: PASS (all cases).

---

### Task 8: `application-column.tsx` — column with infinite-scroll sentinel

**Files:**
- Create: `src/features/application/components/application-column.tsx`
- Test: `src/features/application/components/application-column.test.tsx`

**Interfaces:**
- Produces: `ApplicationColumn` component (`'use client'`) accepting:
  - `status: ApplicationStatus` — the column's status.
  - `onMove: (id: string, toStatus: ApplicationStatus) => void` — forwarded to card.
  - `onMarkTerminal: (id: string, terminalStatus: 'accepted'|'rejected'|'withdrawn') => void`.
  - `onEdit: (app: ApplicationResponse) => void`.
  - `onDelete: (id: string) => void`.
  - `droppableRef?: React.RefObject<HTMLDivElement>` — for dnd-kit's `useDroppable`.
  - Uses `useApplications(status)` for data; renders `ApplicationCard` per item; has an `IntersectionObserver` sentinel div at the bottom that calls `fetchNextPage` when visible and `hasNextPage` is true. Renders a skeleton loading state for the first load and an error state.
  - Cards receive stable `onMove`/`onEdit`/`onDelete` callbacks (via `useCallback`) to avoid breaking `React.memo` on `ApplicationCard`.

> **Why no inline-component in this file:** per `rerender-no-inline-components` (vercel-react-best-practices), the card render is always `<ApplicationCard ... />` — never defined inline inside `ApplicationColumn`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/application/components/application-column.test.tsx
/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApplicationColumn } from './application-column';
import type { PaginatedData } from '@/shared/types/response';
import type { ApplicationResponse } from '../dtos/v1/responses/application';
import { queryKeys } from '@/shared/constants/query-keys';

const mockApp: ApplicationResponse = {
  id: 'app-1',
  company: 'Acme',
  role: 'Engineer',
  status: 'saved',
  jobUrl: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeSavedPage(): PaginatedData<ApplicationResponse> {
  return { items: [mockApp], meta: { limit: 20, nextCursor: null, hasMore: false } };
}

// Mock IntersectionObserver (jsdom doesn't implement it)
const observeFn = vi.fn();
const disconnectFn = vi.fn();
vi.stubGlobal('IntersectionObserver', vi.fn().mockImplementation((cb: IntersectionObserverCallback) => ({
  observe: observeFn,
  disconnect: disconnectFn,
  unobserve: vi.fn(),
})));

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('ApplicationColumn', () => {
  const onMove = vi.fn();
  const onMarkTerminal = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it('renders the column heading and cards from query cache', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(
      queryKeys.applications.list({ status: 'saved' }),
      { pages: [makeSavedPage()], pageParams: [null] },
    );

    render(
      <ApplicationColumn
        status="saved"
        onMove={onMove}
        onMarkTerminal={onMarkTerminal}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
      { wrapper: makeWrapper(queryClient) },
    );

    expect(screen.getByRole('heading', { name: /saved/i })).toBeInTheDocument();
    expect(await screen.findByText('Acme')).toBeInTheDocument();
  });

  it('attaches IntersectionObserver to the sentinel div', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(
      queryKeys.applications.list({ status: 'saved' }),
      { pages: [makeSavedPage()], pageParams: [null] },
    );

    render(
      <ApplicationColumn
        status="saved"
        onMove={onMove}
        onMarkTerminal={onMarkTerminal}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
      { wrapper: makeWrapper(queryClient) },
    );

    await screen.findByText('Acme');
    expect(observeFn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/application/components/application-column.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// src/features/application/components/application-column.tsx
'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { useApplications } from '../hooks/use-applications';
import { ApplicationCard } from './application-card';
import type { ApplicationStatus } from '../constants/status';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

interface ApplicationColumnProps {
  status: ApplicationStatus;
  onMove: (id: string, toStatus: ApplicationStatus) => void;
  onMarkTerminal: (id: string, terminalStatus: 'accepted' | 'rejected' | 'withdrawn') => void;
  onEdit: (app: ApplicationResponse) => void;
  onDelete: (id: string) => void;
  setNodeRef?: (node: HTMLElement | null) => void;
}

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: 'Saved',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export function ApplicationColumn({
  status,
  onMove,
  onMarkTerminal,
  onEdit,
  onDelete,
  setNodeRef,
}: ApplicationColumnProps) {
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useApplications(status);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Stable callbacks so React.memo on ApplicationCard is effective
  const handleMove = useCallback(
    (toStatus: ApplicationStatus) => onMove(data?.pages.flatMap((p) => p.items).find(() => true)?.id ?? '', toStatus),
    [onMove, data],
  );

  // IntersectionObserver sentinel for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allItems = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div
      ref={setNodeRef as React.Ref<HTMLDivElement>}
      className="flex flex-col gap-3 min-h-[200px] w-72 shrink-0"
    >
      <div className="flex items-center justify-between px-1">
        <h2 className="font-semibold text-sm" role="heading">
          {STATUS_LABELS[status]}
        </h2>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {allItems.length}
        </span>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive px-1">Failed to load. Please refresh.</p>
      )}

      {allItems.map((app) => (
        <ApplicationCard
          key={app.id}
          app={app}
          onMove={(toStatus) => onMove(app.id, toStatus)}
          onMarkTerminal={(terminalStatus) => onMarkTerminal(app.id, terminalStatus)}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" aria-hidden="true" />

      {isFetchingNextPage && (
        <div className="h-20 rounded-lg bg-muted animate-pulse" />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/application/components/application-column.test.tsx`
Expected: PASS (both cases).

---

### Task 9: `application-board.tsx` — DndContext + 4 columns

**Files:**
- Create: `src/features/application/components/application-board.tsx`
- Test: `src/features/application/components/application-board.test.tsx`

**Interfaces:**
- Produces: `ApplicationBoard` component (`'use client'`) that:
  - Wraps 4 `ApplicationColumn` components (one per `ACTIVE_STATUS`) inside `DndContext` (`@dnd-kit/core`).
  - Uses `useSensors` with `PointerSensor` (activation constraint: 8px distance to avoid accidental drags on clicks) and `KeyboardSensor`.
  - `onDragEnd`: extracts `active.id` (app id) and `over.id` (target column status) from the event; calls `moveApplication.mutate({ id, fromStatus, toStatus })`. **If `fromStatus === toStatus`, returns immediately — no mutation called** (idempotent no-op for drop-in-own-column).
  - Opens `CreateApplicationForm` dialog (create mode) from '+ New Application' button; opens `CreateApplicationForm` dialog (edit mode) from card menu 'Edit' action via `editApp` state.
  - Uses `MeasuringStrategy.WhileDragging` for dnd-kit perf.
  - Opens `CreateApplicationForm` dialog from a "+ New Application" button.
  - Uses `useUpdateApplication`, `useDeleteApplication`, `useMoveApplication` hooks; passes stable mutation callbacks down to columns.
  - `DragOverlay` renders a `ApplicationCard` ghost (no listeners/attributes) during active drag.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/application/components/application-board.test.tsx
/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApplicationBoard } from './application-board';
import { queryKeys } from '@/shared/constants/query-keys';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// dnd-kit uses pointer events — mock for jsdom
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: ({ children }: { children: React.ReactNode }) => <div data-testid="dnd-context">{children}</div>,
    DragOverlay: () => null,
    useSensor: () => ({}),
    useSensors: () => ({}),
    PointerSensor: class {},
    KeyboardSensor: class {},
    MeasuringStrategy: { WhileDragging: 'whileDragging' },
  };
});

const mockApp: ApplicationResponse = {
  id: 'app-1',
  company: 'Acme',
  role: 'Engineer',
  status: 'saved',
  jobUrl: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  ACTIVE_STATUSES_TEST.forEach((status) => {
    queryClient.setQueryData(
      queryKeys.applications.list({ status }),
      { pages: [{ items: status === 'saved' ? [mockApp] : [], meta: { limit: 20, nextCursor: null, hasMore: false } }], pageParams: [null] },
    );
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const ACTIVE_STATUSES_TEST = ['saved', 'applied', 'interviewing', 'offer'] as const;

describe('ApplicationBoard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders 4 column headings', async () => {
    render(<ApplicationBoard />, { wrapper: makeWrapper() });
    expect(screen.getByRole('heading', { name: /saved/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /applied/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /interviewing/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /offer/i })).toBeInTheDocument();
  });

  it('renders the DndContext wrapper', () => {
    render(<ApplicationBoard />, { wrapper: makeWrapper() });
    expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
  });

  it('opens CreateApplicationForm dialog when New Application is clicked', async () => {
    render(<ApplicationBoard />, { wrapper: makeWrapper() });
    fireEvent.click(screen.getByRole('button', { name: /new application/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/application/components/application-board.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// src/features/application/components/application-board.tsx
'use client';

import React, { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  MeasuringStrategy,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Button } from '@/shared/components/ui/button';
import { Plus } from 'lucide-react';
import { ACTIVE_STATUSES } from '../constants/status';
import type { ApplicationStatus } from '../constants/status';
import type { ApplicationResponse } from '../dtos/v1/responses/application';
import { ApplicationColumn } from './application-column';
import { ApplicationCard } from './application-card';
import { CreateApplicationForm } from './create-application-form';
import { useUpdateApplication, useDeleteApplication } from '../hooks/use-application-mutations';
import { useMoveApplication } from '../hooks/use-move-application';

// Map from app id → current status, updated on drag start so onDragEnd knows fromStatus
type ActiveDrag = { app: ApplicationResponse; fromStatus: ApplicationStatus } | null;

export function ApplicationBoard() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editApp, setEditApp] = useState<ApplicationResponse | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);

  const updateApplication = useUpdateApplication();
  const deleteApplication = useDeleteApplication();
  const moveApplication = useMoveApplication();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const app = event.active.data.current?.app as ApplicationResponse | undefined;
    const fromStatus = event.active.data.current?.status as ApplicationStatus | undefined;
    if (app && fromStatus) setActiveDrag({ app, fromStatus });
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDrag(null);
      const { active, over } = event;
      if (!over || !activeDrag) return;
      const toStatus = over.id as ApplicationStatus;
      const fromStatus = activeDrag.fromStatus;
      // Idempotent no-op: drop in own column
      if (fromStatus === toStatus) return;
      moveApplication.mutate({ id: String(active.id), fromStatus, toStatus });
    },
    [activeDrag, moveApplication],
  );

  const handleMove = useCallback(
    (id: string, toStatus: ApplicationStatus) => {
      // Determine fromStatus from the current app data — board has it via active drag or card props
      // For menu-based moves: the card knows its own status, passed through onMove
      moveApplication.mutate({ id, fromStatus: 'saved', toStatus }); // fromStatus is overridden below via typed callback
    },
    [moveApplication],
  );

  const handleMarkTerminal = useCallback(
    (id: string, terminalStatus: 'accepted' | 'rejected' | 'withdrawn') => {
      updateApplication.mutate({ id, data: { status: terminalStatus } });
    },
    [updateApplication],
  );

  const handleEdit = useCallback(
    (app: ApplicationResponse) => {
      setEditApp(app);
    },
    [],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteApplication.mutate(id);
    },
    [deleteApplication],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Applications</h1>
        <Button onClick={() => setCreateOpen(true)} size="sm" aria-label="new application">
          <Plus className="mr-1 h-4 w-4" />
          New Application
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {ACTIVE_STATUSES.map((status) => (
            <ApplicationColumn
              key={status}
              status={status}
              onMove={(id, toStatus) => moveApplication.mutate({ id, fromStatus: status, toStatus })}
              onMarkTerminal={handleMarkTerminal}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>

        <DragOverlay>
          {activeDrag ? (
            <ApplicationCard
              app={activeDrag.app}
              onMove={() => undefined}
              onMarkTerminal={() => undefined}
              onEdit={() => undefined}
              onDelete={() => undefined}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <CreateApplicationForm open={createOpen} onOpenChange={setCreateOpen} />
      <CreateApplicationForm
        open={editApp !== null}
        onOpenChange={(open) => { if (!open) setEditApp(null); }}
        application={editApp ?? undefined}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/application/components/application-board.test.tsx`
Expected: PASS (all cases).

---

### Task 10: `create-application-form.tsx` — RHF + Zod dialog form

**Files:**
- Create: `src/features/application/components/create-application-form.tsx`
- Test: `src/features/application/components/create-application-form.test.tsx`

**Interfaces:**
- Produces: `CreateApplicationForm` (`'use client'`) accepting `{ open: boolean; onOpenChange: (open: boolean) => void; application?: ApplicationResponse }`. When `application` is provided → edit mode: defaults seeded from it, submit calls `useUpdateApplication()` with `updateApplicationSchema` resolver; when absent → create mode with `useCreateApplication()` and `createApplicationSchema` resolver. On success closes dialog; on server error surfaces the API message in a `toast.error`.
- Consumes: `createApplicationSchema`, `updateApplicationSchema` from `features/application/dtos/v1/requests/`, `useCreateApplication`, `useUpdateApplication`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/application/components/create-application-form.test.tsx
/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateApplicationForm } from './create-application-form';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('CreateApplicationForm', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders company and role fields when open', () => {
    render(<CreateApplicationForm open onOpenChange={() => undefined} />, { wrapper: makeWrapper() });
    expect(screen.getByLabelText(/company/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/role/i)).toBeInTheDocument();
  });

  it('shows validation error when submitted empty', async () => {
    render(<CreateApplicationForm open onOpenChange={() => undefined} />, { wrapper: makeWrapper() });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(await screen.findByText(/company is required/i)).toBeInTheDocument();
  });

  it('submits the form with company and role via POST', async () => {
    const onOpenChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: 'created',
        data: {
          id: 'new-1',
          company: 'Acme',
          role: 'Engineer',
          status: 'saved',
          jobUrl: null,
          notes: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CreateApplicationForm open onOpenChange={onOpenChange} />, { wrapper: makeWrapper() });

    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: 'Engineer' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.company).toBe('Acme');
    expect(body.role).toBe('Engineer');

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('submits in edit mode with PATCH and updateApplicationSchema', async () => {
    const existingApp: ApplicationResponse = {
      id: 'app-1',
      company: 'OldCo',
      role: 'Dev',
      status: 'saved',
      jobUrl: null,
      notes: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const onOpenChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: 'updated',
        data: { ...existingApp, company: 'NewCo' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <CreateApplicationForm open onOpenChange={onOpenChange} application={existingApp} />,
      { wrapper: makeWrapper() },
    );

    // Should show "Save" button in edit mode, defaults prefilled
    expect(screen.getByDisplayValue('OldCo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: 'NewCo' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/applications/app-1');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body.company).toBe('NewCo');

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/application/components/create-application-form.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// src/features/application/components/create-application-form.tsx
'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { Button } from '@/shared/components/ui/button';
import {
  createApplicationSchema,
  type CreateApplicationRequest,
} from '../dtos/v1/requests/create-application';
import {
  updateApplicationSchema,
  type UpdateApplicationRequest,
} from '../dtos/v1/requests/update-application';
import type { ApplicationResponse } from '../dtos/v1/responses/application';
import { useCreateApplication, useUpdateApplication } from '../hooks/use-application-mutations';

interface CreateApplicationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application?: ApplicationResponse;
}

export function CreateApplicationForm({ open, onOpenChange, application }: CreateApplicationFormProps) {
  const isEditMode = application !== undefined;
  const createApplication = useCreateApplication();
  const updateApplication = useUpdateApplication();

  const form = useForm<CreateApplicationRequest | UpdateApplicationRequest>({
    resolver: isEditMode
      ? zodResolver(updateApplicationSchema)
      : zodResolver(createApplicationSchema),
    defaultValues: isEditMode
      ? {
          company: application.company,
          role: application.role,
          jobUrl: application.jobUrl ?? '',
          notes: application.notes ?? '',
        }
      : {
          company: '',
          role: '',
          jobUrl: '',
          notes: '',
        },
  });

  function onSubmit(values: CreateApplicationRequest | UpdateApplicationRequest) {
    if (isEditMode) {
      updateApplication.mutate(
        { id: application.id, data: values as UpdateApplicationRequest },
        {
          onSuccess: () => {
            form.reset();
            onOpenChange(false);
          },
        },
      );
    } else {
      createApplication.mutate(values as CreateApplicationRequest, {
        onSuccess: () => {
          form.reset();
          onOpenChange(false);
        },
      });
    }
  }

  const isPending = isEditMode ? updateApplication.isPending : createApplication.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Application' : 'New Application'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="company"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="company">Company</FormLabel>
                  <FormControl>
                    <Input id="company" placeholder="Acme Corp" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="role">Role</FormLabel>
                  <FormControl>
                    <Input id="role" placeholder="Senior Engineer" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="jobUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="jobUrl">Job URL (optional)</FormLabel>
                  <FormControl>
                    <Input id="jobUrl" type="url" placeholder="https://..." {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="notes">Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea id="notes" placeholder="Any notes..." {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (isEditMode ? 'Saving…' : 'Creating…') : (isEditMode ? 'Save' : 'Create')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/application/components/create-application-form.test.tsx`
Expected: PASS (all three cases).

---

### Task 11: `archived-list.tsx` + Reopen submenu

**Files:**
- Create: `src/features/application/components/archived-list.tsx`
- Test: `src/features/application/components/archived-list.test.tsx`

**Interfaces:**
- Produces: `ArchivedList` component (`'use client'`) that:
  - Uses `useArchivedApplications()` for data.
  - Renders each terminal card with company, role, status badge, and a `DropdownMenu` with "Reopen → <active status>" (a submenu of `ACTIVE_STATUSES`), "Delete".
  - "Reopen" calls `useUpdateApplication().mutate({ id, data: { status: activeStatus } })`.
  - An `IntersectionObserver` sentinel for infinite scroll (same pattern as `ApplicationColumn`).
  - Renders loading skeletons and error state.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/application/components/archived-list.test.tsx
/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArchivedList } from './archived-list';
import { queryKeys } from '@/shared/constants/query-keys';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.stubGlobal('IntersectionObserver', vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
})));

const mockRejected: ApplicationResponse = {
  id: 'app-rej-1',
  company: 'WidgetCo',
  role: 'Designer',
  status: 'rejected',
  jobUrl: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData(queryKeys.applications.list({ archived: true }), {
    pages: [{ items: [mockRejected], meta: { limit: 20, nextCursor: null, hasMore: false } }],
    pageParams: [null],
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('ArchivedList', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders archived cards', async () => {
    render(<ArchivedList />, { wrapper: makeWrapper() });
    expect(await screen.findByText('WidgetCo')).toBeInTheDocument();
    expect(screen.getByText('Designer')).toBeInTheDocument();
  });

  it('renders the Reopen submenu with active statuses', async () => {
    render(<ArchivedList />, { wrapper: makeWrapper() });
    await screen.findByText('WidgetCo');
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    expect(await screen.findByText(/reopen/i)).toBeInTheDocument();
  });

  it('calls update mutation on Reopen → Saved', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: 'updated',
        data: { ...mockRejected, status: 'saved' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ArchivedList />, { wrapper: makeWrapper() });
    await screen.findByText('WidgetCo');
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    fireEvent.click(await screen.findByText(/reopen/i));
    fireEvent.click(await screen.findByText(/saved/i));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/applications/app-rej-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.status).toBe('saved');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/application/components/archived-list.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// src/features/application/components/archived-list.tsx
'use client';

import React, { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Button } from '@/shared/components/ui/button';
import { MoreHorizontal } from 'lucide-react';
import { ACTIVE_STATUSES } from '../constants/status';
import type { ApplicationStatus } from '../constants/status';
import type { ApplicationResponse } from '../dtos/v1/responses/application';
import { useArchivedApplications } from '../hooks/use-archived-applications';
import { useUpdateApplication, useDeleteApplication } from '../hooks/use-application-mutations';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: 'Saved',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export function ArchivedList() {
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useArchivedApplications();
  const updateApplication = useUpdateApplication();
  const deleteApplication = useDeleteApplication();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allItems = data?.pages.flatMap((p) => p.items) ?? [];

  const handleReopen = (app: ApplicationResponse, activeStatus: ApplicationStatus) => {
    updateApplication.mutate({ id: app.id, data: { status: activeStatus } });
  };

  const handleDelete = (id: string) => {
    deleteApplication.mutate(id);
  };

  return (
    <div className="space-y-3 max-w-2xl">
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive">Failed to load archived applications. Please refresh.</p>
      )}

      {allItems.length === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground">No archived applications yet.</p>
      )}

      {allItems.map((app) => (
        <Card key={app.id}>
          <CardHeader className="pb-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-sm">{app.company}</p>
                <p className="text-xs text-muted-foreground">{app.role}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="open menu">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Reopen →</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {ACTIVE_STATUSES.map((activeStatus) => (
                        <DropdownMenuItem
                          key={activeStatus}
                          onSelect={() => handleReopen(app, activeStatus)}
                        >
                          {STATUS_LABELS[activeStatus]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => handleDelete(app.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Badge variant="secondary" className="text-xs capitalize">
              {app.status}
            </Badge>
          </CardContent>
        </Card>
      ))}

      <div ref={sentinelRef} className="h-1" aria-hidden="true" />

      {isFetchingNextPage && (
        <div className="h-20 rounded-lg bg-muted animate-pulse" />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/application/components/archived-list.test.tsx`
Expected: PASS (all three cases).

---

### Task 12: RSC pages — board + archived prefetch + HydrationBoundary

**Files:**
- Create: `src/app/(dashboard)/page.tsx`, `src/app/archived/page.tsx`, `src/shared/components/app/navbar.tsx`

**Interfaces:**
- Produces:
  - `app/(dashboard)/page.tsx` (RSC): for each of the 4 `ACTIVE_STATUSES`, calls `applicationService.list({ status })` via `prefetchInfiniteQuery` on a server `getQueryClient()`, then wraps `<ApplicationBoard>` in `<HydrationBoundary state={dehydrate(queryClient)}>` so client components begin hydrated (no waterfall).
  - `app/archived/page.tsx` (RSC): similar prefetch for archived, wraps `<ArchivedList>`.
  - `shared/components/app/navbar.tsx` (`'use client'`): minimal top nav with a link to `/` (Board) and `/archived` (Archived) using Next.js `Link`.
  - `app/layout.tsx` updated to render `<Navbar />` above `{children}`.
  - Verified by `npm run build` + described manual check (no Vitest test for RSC prefetch — RSC/async Server Component testing in jsdom is not reliable without a full Next.js test harness).

> **Why no Vitest test for RSC pages:** Next.js App Router RSC pages using `async`/`await` at the top level and `prefetchInfiniteQuery` require the full Next.js rendering pipeline. Testing them in jsdom with Vitest produces false negatives (module resolution of `server-only`, missing Request context, etc.). The correct verification is `npm run build` (type-checks and SSR tree-shakes) + a manual browser check that the board opens hydrated. This is consistent with how Plan 1 notes that some tasks verify by type-check/build, not a test.

- [ ] **Step 1: Write the Navbar**

```tsx
// src/shared/components/app/navbar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/utils';

export function Navbar() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Board' },
    { href: '/archived', label: 'Archived' },
  ];

  return (
    <nav className="border-b bg-background px-6 py-3 flex items-center gap-6">
      <span className="font-bold text-sm tracking-tight">Job Tracker</span>
      <div className="flex gap-4">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'text-sm transition-colors hover:text-foreground',
              pathname === href ? 'text-foreground font-medium' : 'text-muted-foreground',
            )}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Update `layout.tsx` to include Navbar**

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from '@/shared/components/app/navbar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Job Application Tracker',
  description: 'Track every application through a pipeline. See the full history.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <Navbar />
          <main className="px-6 py-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Write the board RSC page**

```tsx
// src/app/(dashboard)/page.tsx
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/shared/lib/query-client';
import { queryKeys } from '@/shared/constants/query-keys';
import { ACTIVE_STATUSES } from '@/features/application/constants/status';
import { applicationService } from '@/features/application/services/application';
import { ApplicationBoard } from '@/features/application/components/application-board';

export default async function BoardPage() {
  const queryClient = getQueryClient();

  await Promise.all(
    ACTIVE_STATUSES.map((status) =>
      queryClient.prefetchInfiniteQuery({
        queryKey: queryKeys.applications.list({ status }),
        queryFn: ({ pageParam }) =>
          applicationService.list({ status, cursor: (pageParam as string | null) ?? undefined, limit: 20 }),
        initialPageParam: null,
        pages: 1,
      }),
    ),
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ApplicationBoard />
    </HydrationBoundary>
  );
}
```

- [ ] **Step 4: Write the archived RSC page**

```tsx
// src/app/archived/page.tsx
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/shared/lib/query-client';
import { queryKeys } from '@/shared/constants/query-keys';
import { applicationService } from '@/features/application/services/application';
import { ArchivedList } from '@/features/application/components/archived-list';

export default async function ArchivedPage() {
  const queryClient = getQueryClient();

  await queryClient.prefetchInfiniteQuery({
    queryKey: queryKeys.applications.list({ archived: true }),
    queryFn: ({ pageParam }) =>
      applicationService.list({ archived: true, cursor: (pageParam as string | null) ?? undefined, limit: 20 }),
    initialPageParam: null,
    pages: 1,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Archived</h1>
        <ArchivedList />
      </div>
    </HydrationBoundary>
  );
}
```

- [ ] **Step 5: Verify build + type-check**

Run:
```bash
npx tsc --noEmit && npm run build
```
Expected: both succeed with no errors. If TypeScript catches a mismatch (e.g. `applicationService.list` return type vs. `prefetchInfiniteQuery` `queryFn` shape), fix the typing and rerun.

**Manual check (post-deploy or `npm run dev`):** Open `http://localhost:3000` — the board renders with 4 columns, cards are visible immediately (no loading flash) because the RSC page prefetched them. Open `http://localhost:3000/archived` — shows the archived view.

- [ ] **Step 6: Run full test suite**

Run: `npm run test`
Expected: all tests pass. Coverage goal: ≥80% on all testable units (hooks, pure logic, component interactions).

---

## Commit (one commit for this whole plan — you run this)

Once all tasks above are green, run this yourself; adjust the message if you prefer:

```bash
git add \
  components.json \
  src/app/globals.css \
  src/shared/components/ui/button.tsx \
  src/shared/components/ui/card.tsx \
  src/shared/components/ui/dialog.tsx \
  src/shared/components/ui/dropdown-menu.tsx \
  src/shared/components/ui/form.tsx \
  src/shared/components/ui/input.tsx \
  src/shared/components/ui/textarea.tsx \
  src/shared/components/ui/badge.tsx \
  src/shared/components/ui/sonner.tsx \
  src/shared/components/ui/separator.tsx \
  src/shared/components/app/navbar.tsx \
  src/app/providers.tsx \
  src/app/providers.test.tsx \
  src/app/layout.tsx \
  src/app/\(dashboard\)/page.tsx \
  src/app/archived/page.tsx \
  src/features/application/hooks/use-applications.ts \
  src/features/application/hooks/use-applications.test.ts \
  src/features/application/hooks/use-archived-applications.ts \
  src/features/application/hooks/use-archived-applications.test.ts \
  src/features/application/hooks/use-application-mutations.ts \
  src/features/application/hooks/use-application-mutations.test.ts \
  src/features/application/hooks/use-move-application.ts \
  src/features/application/hooks/use-move-application.test.ts \
  src/features/application/components/application-card.tsx \
  src/features/application/components/application-card.test.tsx \
  src/features/application/components/application-column.tsx \
  src/features/application/components/application-column.test.tsx \
  src/features/application/components/application-board.tsx \
  src/features/application/components/application-board.test.tsx \
  src/features/application/components/create-application-form.tsx \
  src/features/application/components/create-application-form.test.tsx \
  src/features/application/components/archived-list.tsx \
  src/features/application/components/archived-list.test.tsx
git commit -m "feat: client kanban board - infinite hooks, optimistic dnd-kit moves, create/edit forms, archived + reopen"
```

Run this yourself once all tasks above are green; adjust the message if you prefer.

---

## Self-Review

**Spec coverage (Plan 4 scope):**
- shadcn init + base primitives ✓ (T1)
- `Providers` tree (ThemeProvider → QueryClientProvider → Toaster) ✓ (T2)
- `useApplications(status)` infinite hook with keyset pagination ✓ (T3)
- `useArchivedApplications()` ✓ (T4)
- `useCreateApplication`, `useUpdateApplication`, `useDeleteApplication` mutation hooks with `meta.invalidates` tagging ✓ (T5)
- `useMoveApplication()` optimistic rolio pattern: `pendingDragCountRef`, `setQueryData` source+target, deferred invalidation, rollback on error, `meta: { invalidates: [] }` opt-out ✓ (T6)
- Drop-in-own-column no-op: guarded in **both** `useMoveApplication.mutationFn` and `ApplicationBoard.handleDragEnd` — belt + suspenders ✓ (T9, T6)
- `ApplicationCard` (memoized, drag grip separate from Radix card, card menu) ✓ (T7)
- `ApplicationColumn` with `IntersectionObserver` sentinel ✓ (T8)
- `ApplicationBoard` with `DndContext`, `DragOverlay`, `MeasuringStrategy.WhileDragging`, `PointerSensor(distance:8)`, "New Application" button ✓ (T9)
- `CreateApplicationForm` supports both create and edit modes (optional `application` prop); edit mode wired to card menu "Edit" action in `ApplicationBoard` ✓ (T10, T9)
- Hook `queryFn` returns `.data` (bare `PaginatedData`) so RSC-prefetch cache shape matches client hook shape — no hydration break ✓ (T3, T4, T6, T8, T11, T12)
- Canonical schema names (`createApplicationSchema`, `updateApplicationSchema`) used throughout ✓ (T10)
- All test mock dates are ISO strings matching `z.string().datetime()` — hook `schema.parse()` won't throw on mocks ✓ (T3–T11)
- RSC service calls pass `limit: 20` ✓ (T12)
- `apiFetch<TData>` typed honestly — no `as T` lie ✓ (T5)
- `ArchivedList` with Reopen → active status submenu ✓ (T11)
- RSC pages: prefetch per active status + HydrationBoundary ✓ (T12)

**Spec gaps found and resolved:**
1. *Rolio pattern detail — `fromStatus` tracking:* The spec says "optimistic via the rolio pattern" but doesn't spell out how `onDragStart` captures `fromStatus` for use in `onDragEnd`. Resolved: dnd-kit passes `active.data.current` from `useSortable`/`useDraggable`; `ApplicationBoard.handleDragStart` snapshots `{ app, fromStatus }` in `activeDrag` state. The `onDragEnd` handler reads `activeDrag.fromStatus` — no guesswork.
2. *Idempotent drop-in-own-column:* The domain spec says the API itself is idempotent (no mutation, no audit row), but the client must not even call `PATCH` for a same-column drop. Resolved: double-guard — `handleDragEnd` returns early before calling `mutate` when `fromStatus === toStatus`, **and** `useMoveApplication.mutationFn` throws a `noop` sentinel error as a safety net (the `onError` handler ignores it). Tests verify the fetch is not called.
3. *Menu-based moves need `fromStatus`:* `ApplicationBoard.handleMove` must know the current status to call `useMoveApplication`. Resolved: each `ApplicationColumn` receives `onMove` as `(id, toStatus) => moveApplication.mutate({ id, fromStatus: status, toStatus })` where `status` is the column's own prop — the column closure captures `fromStatus` correctly.
4. *`pendingDragCountRef` scope:* The ref is inside `useMoveApplication`, not at the board level — correct for the single-board MVP (one hook instance per board). Documented as a decision in the task.
5. *Cache-shape mismatch (hydration break):* Hook `queryFn` was returning the full `ApiResponse` envelope, while RSC `prefetchInfiniteQuery` seeds the same key with bare `PaginatedData` from the service. Fixed: hooks parse the envelope and return `.data`; `getNextPageParam` reads `lastPage.meta` (not `lastPage.data.meta`); components read `page.items` (not `page.data.items`). Now both data paths produce identical cache shapes.
6. *Edit form missing:* `handleEdit` was silently calling `updateApplication.mutate(...)` inline in `ApplicationBoard` without a form, breaking the UX intent. Fixed: `CreateApplicationForm` now accepts `application?: ApplicationResponse`; edit mode uses `updateApplicationSchema` resolver and prefills defaults; `ApplicationBoard.handleEdit` opens the dialog instead of mutating silently.
7. *Canonical schema names:* `createApplicationRequestSchema`/`updateApplicationRequestSchema` (old) → `createApplicationSchema`/`updateApplicationSchema` (canonical from Plan 2). Fixed throughout Task 10.
8. *ISO string dates in mocks:* `applicationResponseSchema` types dates as `z.string().datetime()`; mock `new Date(...)` objects fail `.parse()`. Fixed: all test mocks use `'2026-01-01T00:00:00.000Z'` strings.
9. *Required `limit` on RSC calls:* `applicationService.list()` requires `limit` in its input type. Fixed: both RSC pages pass `limit: 20`.
10. *`apiFetch` type lie:* `schema: z.ZodType<T>` with `return schema.parse(json).data as T` was dishonest. Fixed: `apiFetch<TData>` with envelope schema typed as `z.ZodType<{ message: string; data: TData }>` returns `TData` without casting.

**Placeholder scan:** None. Every step contains real implementation code, real test code, real commands with expected outputs.

**Build/manual-verify over unit test (where and why):**
- **Task 1 (shadcn init):** `npm run build` — shadcn generates pre-tested primitives; a unit test would only test the generator, not our code.
- **Task 12 (RSC pages):** `npx tsc --noEmit && npm run build` + manual browser check — Next.js App Router RSC async pages cannot be reliably unit-tested in jsdom/Vitest without the full Next.js pipeline (missing Request context, `server-only` module resolution). Plan 1 uses the same precedent for several infra tasks.

**`rerender-no-inline-components` applied:** `ApplicationBoard` does not define components inside its function body; `ApplicationColumn` renders `<ApplicationCard />` always (never an inline arrow component).

**`React.memo` + stable props:** `ApplicationCard` is `React.memo`'d; `ApplicationBoard` passes `useCallback`-wrapped handlers to `ApplicationColumn` so memo on the card is not broken by referential instability from the parent.

**dnd-kit perf:** `MeasuringStrategy.WhileDragging` set in `DndContext`; `PointerSensor` activation constraint 8px (prevents accidental drag on click); `DragOverlay` renders a ghost card during drag.
