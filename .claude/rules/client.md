# Client & UI — RSC vs Client, TanStack Query, shadcn

> The client half of the unified app. UI is **shadcn/ui + Tailwind**; data is **TanStack Query +
> `fetch` + shared Zod DTOs**. Files here are `'use client'` unless they are Server Components.

## The server/client split — decide per piece of work

Render on the server unless interactivity requires the client.

| Work | Mechanism | Layer used |
|------|-----------|-----------|
| Initial list/detail page load | **Server Component** `page.tsx`: `await` the feature **service directly**, then `prefetchQuery` + `dehydrate` + `HydrationBoundary` | `app/ RSC → features/*/services/` |
| Interactive board (DnD), live filters | **Client Component** (`'use client'`): TanStack Query `useQuery` against the Hono API | `components → hooks → fetch → /api/v1` |
| Mutations (create, status change, delete) | Client: `useMutation` (tag `meta.invalidates`) → `fetch` `POST/PATCH/DELETE` → auto-invalidation / optimistic update | `hooks → fetch → /api/v1` |

- **Do NOT use Next.js Server Actions as a TanStack Query `queryFn`** — they run serially and break
  concurrent fetch/refetch. Client data always goes through the **Hono API**.
- RSC calls the service **in-process** (no HTTP self-hop). The **response DTO is the same** whether
  it came from the service (RSC) or the API (client), so the rendered shape is identical.

## Data fetching (TanStack Query + fetch + shared Zod)

Hooks are the only client data layer. A hook `fetch`es the Hono API and **parses the response with
the shared response DTO schema** (runtime + compile-time safety). We use `fetch` + Zod rather than
Hono RPC `hc` (which has type-inference footguns):

```ts
// features/application/hooks/use-applications.ts ('use client')
import { useQuery } from '@tanstack/react-query';
import { applicationListResponseSchema } from '../dtos/responses/application';
import { queryKeys } from '@/shared/constants/query-keys';

export function useApplications() {
  return useQuery({
    queryKey: queryKeys.applications.list(),
    queryFn: async () => applicationListResponseSchema.parse(
      await fetch('/api/v1/applications').then((r) => r.json()),
    ),
  });
}
```

- **Query keys are entity-first**, from a typed factory in `shared/constants/query-keys.ts`:
  `['applications']` (all), `['applications','list', params]`, `['applications','detail', id]`. The
  entity-first prefix is what makes `matchQuery`-based invalidation work (see below).
- The wire is **camelCase** end-to-end (the server maps from snake_case DB columns), so no case
  conversion on the client.
- For the optimistic drag-and-drop board: cancel queries, optimistic
  `setQueryData` on source+target, defer invalidation until all drags settle, roll back by
  invalidating on error. The DnD mutation **opts out** of auto-invalidation with
  `meta: { invalidates: [] }` (see below) so it can manage its own.

## Query client & automatic invalidation

The `QueryClient` is built by a factory in `shared/lib/query-client/query-client.ts`, wired with a `MutationCache`
that **auto-invalidates after every successful mutation**. It is **broad by default** (an untagged
mutation invalidates everything — you never silently miss a refetch) and **narrowed by tagging** a
mutation with `meta.invalidates` (query-key prefixes matched via `matchQuery`).

```ts
// shared/lib/query-client/query-client.ts
import { QueryClient, MutationCache, matchQuery, isServer, type QueryKey } from '@tanstack/react-query';

declare module '@tanstack/react-query' {
  interface Register { mutationMeta: { invalidates?: QueryKey[] } }
}

function makeQueryClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000 } }, // tempers broad invalidation
    mutationCache: new MutationCache({
      onSuccess: (_data, _vars, _ctx, mutation) => {
        client.invalidateQueries({
          predicate: (query) =>
            mutation.meta?.invalidates?.some((key) => matchQuery({ queryKey: key }, query)) ?? true,
        });
      },
    }),
  });
  return client;
}

let browserClient: QueryClient | undefined;
export function getQueryClient() {        // fresh per request on the server (RSC prefetch),
  if (isServer) return makeQueryClient(); // singleton in the browser
  return (browserClient ??= makeQueryClient());
}
```

`app/providers.tsx` (`'use client'`) wraps the tree with `<QueryClientProvider client={getQueryClient()}>`
inside the `next-themes` `ThemeProvider`; RSC pages call the same `getQueryClient()` for
`prefetchQuery`. **Never** use a module-level `QueryClient` singleton — it leaks state across requests
on the server.

Mutation rules:
- **Default — narrow:** tag the entities a mutation touches via the key factory, e.g.
  `meta: { invalidates: [queryKeys.applications.all] }` (not literals).
- **Opt out:** `meta: { invalidates: [] }` invalidates nothing — used by the DnD board, which does
  its own deferred invalidation.
- **Stay pending until fresh:** if a mutation must remain `pending` until its refetch settles, add a
  *local* `onSuccess` that **returns** `queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false })`
  (`cancelRefetch: false` avoids a duplicate request, since the global callback already invalidated).
- Use `onSuccess` (success only), not `onSettled`. For never-refetch data use `staleTime: 'static'`.

## TanStack stable functions in deps — destructure, never depend on the whole result

`useMutation`/`useQuery`/`useInfiniteQuery` return a **new result object every render** (it carries
`isPending`, `data`, … which change), but the action functions on it — `mutate`, `refetch`,
`fetchNextPage` — keep a **stable identity**. So when a `useMemo`/`useCallback`/context value needs one
of those functions, **destructure the function** and depend on it; never depend on the whole result
object (`vercel-react-best-practices` → `rerender-memo`).

```tsx
const { mutate: move } = useMoveApplication();          // YES - stable, deps stay put
const actions = useMemo(() => ({ move }), [move]);

const move = useMoveApplication();                       // NO - whole object re-identifies each render,
const actions = useMemo(() => ({ ... }), [move]);        //      busting the memo and re-rendering consumers
```

This matters most for a **context value** (`architecture-compound-components`): depending on the whole
result object re-identifies the value every render and re-renders every `use()` consumer, silently
defeating their `React.memo`. Pass the stable functions, keep the context value stable.

## Forms & validation

- **react-hook-form + `@hookform/resolvers/zod`** with the **request DTO** as the resolver schema —
  shadcn's `Form` is built on react-hook-form, so it is the idiomatic pairing, and the *same* Zod
  schema validates the form and the server's `zValidator` (one source of truth for input).
- **Do NOT use Next.js Server Actions** for these forms — client mutations go through TanStack Query
  → `fetch` → the Hono API (see the split above).
- Show server-thrown validation/error messages from the API's error envelope.

## UI (shadcn/ui + Tailwind)

- Primitives generated by the shadcn CLI live in `shared/components/ui/`. App-wide shared UI
  (navbar, page header) in `shared/components/app/`. Feature-specific UI in
  `features/<d>/components/`.
- **dnd-kit** + shadcn compose cleanly (Radix+Tailwind markup + headless DnD): wrap the shadcn
  `Card` in a `div` that receives dnd-kit's `listeners`/`attributes` rather than spreading them onto
  the Radix component.
- The backend is authoritative for domain rules; the UI may disable invalid actions for UX but must
  never assume an operation is legal — the API validates and can reject.

## JSX conditional rendering — ternary, never `&&`

Render a conditional element with an explicit ternary returning `null`, not `&&`
(`vercel-react-best-practices` → `rendering-conditional-render`). One pattern for every conditional
render removes the per-line judgment of "is this operand safe to `&&`?" and prevents a falsy operand
(`0`, `NaN`, `''`) from leaking into the DOM.

```tsx
{isLoading ? <Skeleton /> : null}            // YES
{items.length > 0 ? <List /> : null}         // YES
{isLoading && <Skeleton />}                  // NO  - inconsistent, and `0 && …` would render "0"
```

**Not** conditional rendering, so leave as `&&` (converting them is wrong):
- the `cn(...)` / clsx className idiom — `cn(isOver && 'bg-muted')` (yields a string-or-`false` that
  `cn` filters);
- boolean logic inside an `if`/expression, including the condition that *feeds* a ternary —
  `{!isLoading && items.length === 0 ? <Empty /> : null}`.

## UI/UX feedback & interaction patterns

Industry-standard feedback rules, mapped to what this app already does so future work stays consistent.
Sources: Nielsen Norman Group (response-time limits, skeleton screens, confirmation dialogs), the Vercel
Web Interface Guidelines, and the TanStack Query optimistic-update docs.

**Response time drives the feedback choice** (NN/g — the 0.1s / 1s / 10s limits):
- **< 0.1s** feels instant, so direct manipulation needs no spinner — optimistic mutations land here.
- **0.1–1s** needs no explicit indicator, but the action still acknowledges (button label, hover/active state).
- **> 1s** show a skeleton or spinner; **> 10s** show a percent indicator plus a way to cancel (not reached in this app).

**Loading — skeleton for a full view, spinner for a single module** (NN/g, LogRocket):
- A **full view / route change** uses a **skeleton** mirroring the final layout (`app/loading.tsx`,
  `app/archived/loading.tsx`, the per-column and list skeletons). It signals *what* is coming and beats a
  spinner on perceived speed.
- A **single in-place fetch** (e.g. the next infinite-scroll page) uses one inline skeleton row, not a full-screen spinner.
- Wrap a loading region as a live region: `role="status"` + `aria-busy` (see `loading.tsx`).

**Optimistic vs pessimistic — match the action** (consensus; TanStack Query):
- **Optimistic** (update the cache now, reconcile on settle) for **reversible, high-confidence** mutations
  where instant feedback matters: status **move** (drag + menu), **reopen**, **delete** (with undo).
- **Pessimistic** (await the server, then update) when the response is **needed** or consistency is critical:
  **create** and **edit** keep the form open with a pending button until the server confirms, since create
  returns the server-generated id and both validate server-side.
- **Always pair optimistic with rollback.** On error, restore the pre-mutation snapshot so the card
  "flies back" to its previous column, and surface the server message via a toast. With concurrent optimistic
  mutations, track a pending counter and **defer the resync until the last settles** (both success and error
  paths) so a refetch never clobbers an in-flight drag — see `use-move-application.ts`.

**Keep the UI interactive during a mutation — block only the one action** (consensus):
- Disable **only** the submitting control to stop a double-submit, and show a pending label (`Creating…` /
  `Saving…`); keep its Cancel enabled. Never globally freeze the page.
- Because board mutations are optimistic, the rest of the board stays usable mid-flight: other cards drag,
  other dialogs open.

**Destructive actions — prefer undo over a confirmation dialog** (NN/g):
- For **reversible** destructive actions an **undo window** beats a confirm dialog: it does not interrupt the
  flow, and overused dialogs lose their power (habituation). **Delete** is a soft delete behind a
  deferred-commit **undo toast**; **terminal moves** (reject/withdraw) are reversible via **Archived → Reopen**,
  so neither needs a dialog.
- Reserve a **confirmation dialog** for **truly irreversible, high-consequence** actions only (none in the MVP;
  a hard terminal-lock / reopen-confirm is a documented next step).

**Error & empty states:**
- Surface errors where the user is looking: inline `FormMessage` on form fields, a toast for background
  mutations. Announce async load errors to assistive tech with `role="alert"`.
- Always render an explicit **empty state** (e.g. "No archived applications yet."), never a blank or broken
  UI for an empty array.

**Motion — subtle, accessible, interruptible** (Vercel Web Interface Guidelines):
- Animate **`transform`/`opacity`** only (compositor-friendly); never `transition: all`.
- Honor **`prefers-reduced-motion`** (collapsed globally in `globals.css`).
- Keep animations **interruptible** — a drag responds at once, never locked behind a transition.
