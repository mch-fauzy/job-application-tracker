// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { useMoveApplication } from './use-move-application';
import { queryKeys } from '@/shared/constants/query-keys';
import type { PaginatedData } from '@/shared/types/response';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const mockApp: ApplicationResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  company: 'Acme',
  role: 'Engineer',
  status: 'saved',
  jobUrl: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

type Column = InfiniteData<PaginatedData<ApplicationResponse>>;

function makeInfiniteData(items: ApplicationResponse[]): Column {
  return { pages: [{ items, meta: { limit: 20, nextCursor: null, hasMore: false } }], pageParams: [null] };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

describe('useMoveApplication', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('optimistically removes the card from the source column and prepends it to the target', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'updated', data: { ...mockApp, status: 'applied' } }),
      }),
    );

    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(queryKeys.applications.list({ status: 'saved' }), makeInfiniteData([mockApp]));
    queryClient.setQueryData(queryKeys.applications.list({ status: 'applied' }), makeInfiniteData([]));

    const { result } = renderHook(() => useMoveApplication(), { wrapper });

    act(() => {
      result.current.mutate({ app: mockApp, toStatus: 'applied' });
    });

    // onMutate applies the optimistic move after awaiting cancelQueries (a microtask).
    await waitFor(() => {
      const saved = queryClient.getQueryData<Column>(queryKeys.applications.list({ status: 'saved' }));
      expect(saved?.pages[0].items).toHaveLength(0);
    });
    const applied = queryClient.getQueryData<Column>(queryKeys.applications.list({ status: 'applied' }));
    expect(applied?.pages[0].items).toHaveLength(1);
    expect(applied?.pages[0].items[0].status).toBe('applied');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('is a clean no-op when the card is already in the target status (no fetch)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(queryKeys.applications.list({ status: 'saved' }), makeInfiniteData([mockApp]));

    const { result } = renderHook(() => useMoveApplication(), { wrapper });

    act(() => {
      result.current.mutate({ app: mockApp, toStatus: 'saved' });
    });

    expect(fetchMock).not.toHaveBeenCalled();
    // Source column is untouched by a no-op.
    const saved = queryClient.getQueryData<Column>(queryKeys.applications.list({ status: 'saved' }));
    expect(saved?.pages[0].items).toHaveLength(1);
  });

  it('creates the target column optimistically when it has no cached data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'updated', data: { ...mockApp, status: 'applied' } }),
      }),
    );

    const { queryClient, wrapper } = makeWrapper();
    // Only the source column is cached - the target column starts undefined.
    queryClient.setQueryData(queryKeys.applications.list({ status: 'saved' }), makeInfiniteData([mockApp]));

    const { result } = renderHook(() => useMoveApplication(), { wrapper });
    act(() => {
      result.current.mutate({ app: mockApp, toStatus: 'applied' });
    });

    await waitFor(() => {
      const applied = queryClient.getQueryData<Column>(queryKeys.applications.list({ status: 'applied' }));
      expect(applied?.pages[0].items).toHaveLength(1);
    });
    const applied = queryClient.getQueryData<Column>(queryKeys.applications.list({ status: 'applied' }));
    expect(applied?.pages[0].items[0].status).toBe('applied');
  });

  it('handles an uncached source column without error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'updated', data: { ...mockApp, status: 'applied' } }),
      }),
    );
    const { queryClient, wrapper } = makeWrapper();
    // Source column 'saved' is NOT cached; only the target is.
    queryClient.setQueryData(queryKeys.applications.list({ status: 'applied' }), makeInfiniteData([]));

    const { result } = renderHook(() => useMoveApplication(), { wrapper });
    act(() => {
      result.current.mutate({ app: mockApp, toStatus: 'applied' });
    });

    await waitFor(() => {
      const applied = queryClient.getQueryData<Column>(queryKeys.applications.list({ status: 'applied' }));
      expect(applied?.pages[0].items).toHaveLength(1);
    });
  });

  it('prepends into the first page of a multi-page target column', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'updated', data: { ...mockApp, status: 'applied' } }),
      }),
    );
    const other: ApplicationResponse = { ...mockApp, id: '88888888-8888-4888-8888-888888888888' };
    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(queryKeys.applications.list({ status: 'saved' }), makeInfiniteData([mockApp]));
    queryClient.setQueryData(queryKeys.applications.list({ status: 'applied' }), {
      pages: [
        { items: [], meta: { limit: 20, nextCursor: 'p2', hasMore: true } },
        { items: [other], meta: { limit: 20, nextCursor: null, hasMore: false } },
      ],
      pageParams: [null, 'p2'],
    });

    const { result } = renderHook(() => useMoveApplication(), { wrapper });
    act(() => {
      result.current.mutate({ app: mockApp, toStatus: 'applied' });
    });

    await waitFor(() => {
      const applied = queryClient.getQueryData<Column>(queryKeys.applications.list({ status: 'applied' }));
      expect(applied?.pages[0].items[0].id).toBe(mockApp.id);
    });
    const applied = queryClient.getQueryData<Column>(queryKeys.applications.list({ status: 'applied' }));
    // The second page is left untouched.
    expect(applied?.pages[1].items[0].id).toBe(other.id);
  });

  it('falls back to a generic message when the move fails without a server message', async () => {
    const { toast } = await import('sonner');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) }));
    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(queryKeys.applications.list({ status: 'saved' }), makeInfiniteData([mockApp]));
    queryClient.setQueryData(queryKeys.applications.list({ status: 'applied' }), makeInfiniteData([]));

    const { result } = renderHook(() => useMoveApplication(), { wrapper });
    act(() => {
      result.current.mutate({ app: mockApp, toStatus: 'applied' });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith('Move failed: 500');
  });

  it('rolls the optimistic update back on error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'Server error' }) }),
    );

    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(queryKeys.applications.list({ status: 'saved' }), makeInfiniteData([mockApp]));
    queryClient.setQueryData(queryKeys.applications.list({ status: 'applied' }), makeInfiniteData([]));

    const { result } = renderHook(() => useMoveApplication(), { wrapper });

    act(() => {
      result.current.mutate({ app: mockApp, toStatus: 'applied' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const rolledBack = queryClient.getQueryData<Column>(queryKeys.applications.list({ status: 'saved' }));
    expect(rolledBack?.pages[0].items).toHaveLength(1);
    expect(rolledBack?.pages[0].items[0].id).toBe(mockApp.id);
  });

  it('defers the resync until the last concurrent drag settles, even when one fails first', async () => {
    const { toast } = await import('sonner');
    const appB: ApplicationResponse = {
      ...mockApp,
      id: '22222222-2222-4222-8222-222222222222',
      status: 'interviewing',
    };

    // Route each drag's fetch to its own pending promise by id, independent of call order.
    let resolveA: (value: unknown) => void = () => {};
    let resolveB: (value: unknown) => void = () => {};
    const fetchMock = vi.fn((url: string) =>
      url.includes(mockApp.id)
        ? new Promise((resolve) => {
            resolveA = resolve;
          })
        : new Promise((resolve) => {
            resolveB = resolve;
          }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(queryKeys.applications.list({ status: 'saved' }), makeInfiniteData([mockApp]));
    queryClient.setQueryData(queryKeys.applications.list({ status: 'applied' }), makeInfiniteData([]));
    queryClient.setQueryData(queryKeys.applications.list({ status: 'interviewing' }), makeInfiniteData([appB]));
    queryClient.setQueryData(queryKeys.applications.list({ status: 'offer' }), makeInfiniteData([]));
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useMoveApplication(), { wrapper });

    // Two drags in flight at once, touching different columns.
    act(() => {
      result.current.mutate({ app: mockApp, toStatus: 'applied' });
      result.current.mutate({ app: appB, toStatus: 'offer' });
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(invalidateSpy).not.toHaveBeenCalled();

    // B fails while A is still pending: the failure must NOT resync over A's optimistic columns.
    await act(async () => {
      resolveB({ ok: false, json: async () => ({ message: 'Server error' }) });
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(invalidateSpy).not.toHaveBeenCalled();

    // A succeeds last: now the single deferred resync fires.
    await act(async () => {
      resolveA({ ok: true, json: async () => ({ message: 'updated', data: { ...mockApp, status: 'applied' } }) });
    });
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(1));
  });
});
