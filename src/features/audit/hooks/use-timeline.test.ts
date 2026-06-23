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
      { id: '11111111-1111-4111-8111-111111111111', action: 'created', diff: null, createdAt: '2026-06-22T10:00:00Z', createdBy: null },
    ],
    meta: { limit: 20, nextCursor: 'cursor-abc', hasMore: true },
  },
};
const mockPage2 = {
  message: 'Audit events retrieved successfully',
  data: {
    items: [
      { id: '22222222-2222-4222-8222-222222222222', action: 'updated', diff: { status: { from: 'saved', to: 'applied' } }, createdAt: '2026-06-22T09:00:00Z', createdBy: null },
    ],
    meta: { limit: 20, nextCursor: null, hasMore: false },
  },
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return Wrapper;
}

describe('useTimeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the first page and exposes items', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockPage1,
    }));

    const { result } = renderHook(() => useTimeline('app-id-1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.pages[0].items).toHaveLength(1);
    expect(result.current.data?.pages[0].items[0].action).toBe('created');
    expect(result.current.hasNextPage).toBe(true);
    const firstCallUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('/api/v1/audit?');
    expect(firstCallUrl).toContain('entityType=application');
    expect(firstCallUrl).toContain('entityId=app-id-1');
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

    expect(result.current.data?.pages[1].items[0].action).toBe('updated');
    expect(result.current.hasNextPage).toBe(false);
    const secondCallUrl = mockFetch.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain('cursor=cursor-abc');
  });
});
