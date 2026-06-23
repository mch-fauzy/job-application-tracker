// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { useReopenApplication } from './use-reopen-application';
import { queryKeys } from '@/shared/constants/query-keys';
import type { PaginatedData } from '@/shared/types/response';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const mockRejected: ApplicationResponse = {
  id: '44444444-4444-4444-8444-444444444444',
  company: 'WidgetCo',
  role: 'Designer',
  status: 'rejected',
  jobUrl: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

type Column = InfiniteData<PaginatedData<ApplicationResponse>>;
const archivedKey = queryKeys.applications.list({ archived: true });

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

describe('useReopenApplication', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('optimistically removes the card from the archived list and PATCHes the new status', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'updated', data: { ...mockRejected, status: 'saved' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(archivedKey, makeInfiniteData([mockRejected]));

    const { result } = renderHook(() => useReopenApplication(), { wrapper });

    act(() => {
      result.current.mutate({ id: mockRejected.id, toStatus: 'saved' });
    });

    // onMutate removes the card after awaiting cancelQueries (a microtask).
    await waitFor(() => {
      const archived = queryClient.getQueryData<Column>(archivedKey);
      expect(archived?.pages[0].items).toHaveLength(0);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/applications/${mockRejected.id}`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string).status).toBe('saved');
  });

  it('rolls the archived list back on error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'Server error' }) }),
    );

    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(archivedKey, makeInfiniteData([mockRejected]));

    const { result } = renderHook(() => useReopenApplication(), { wrapper });

    act(() => {
      result.current.mutate({ id: mockRejected.id, toStatus: 'saved' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const rolledBack = queryClient.getQueryData<Column>(archivedKey);
    expect(rolledBack?.pages[0].items).toHaveLength(1);
    expect(rolledBack?.pages[0].items[0].id).toBe(mockRejected.id);
  });

  it('falls back to a generic message when reopen fails without a server message', async () => {
    const { toast } = await import('sonner');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) }));

    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(archivedKey, makeInfiniteData([mockRejected]));

    const { result } = renderHook(() => useReopenApplication(), { wrapper });
    act(() => {
      result.current.mutate({ id: mockRejected.id, toStatus: 'saved' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith('Reopen failed: 500');
  });
});
