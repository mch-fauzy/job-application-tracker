// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { useApplications } from './use-applications';
import type { ApiResponse, PaginatedData } from '@/shared/types/response';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

// Valid UUIDs: applicationResponseSchema.id is z.uuid() and the hook parses responses,
// so non-uuid ids (e.g. 'app-1') would throw at parse and the query would never succeed.
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

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

describe('useApplications', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the first page and exposes items', async () => {
    const page1: ApiResponse<PaginatedData<ApplicationResponse>> = {
      message: 'ok',
      data: { items: [mockApp], meta: { limit: 20, nextCursor: null, hasMore: false } },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ ok: true, json: async () => page1 }),
    );

    const { result } = renderHook(() => useApplications('saved'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data as InfiniteData<PaginatedData<ApplicationResponse>>;
    expect(data.pages[0].items).toHaveLength(1);
    expect(data.pages[0].items[0].company).toBe('Acme');
  });

  it('passes the status and limit on the first request', async () => {
    const page1: ApiResponse<PaginatedData<ApplicationResponse>> = {
      message: 'ok',
      data: { items: [], meta: { limit: 20, nextCursor: null, hasMore: false } },
    };
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => page1 });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApplications('interviewing'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('status=interviewing');
    expect(url).toContain('limit=20');
  });

  it('fetches the second page using nextCursor from the first page', async () => {
    const mockApp2: ApplicationResponse = {
      ...mockApp,
      id: '22222222-2222-4222-8222-222222222222',
      company: 'Beta',
    };
    const page1: ApiResponse<PaginatedData<ApplicationResponse>> = {
      message: 'ok',
      data: { items: [mockApp], meta: { limit: 20, nextCursor: 'cursor-abc', hasMore: true } },
    };
    const page2: ApiResponse<PaginatedData<ApplicationResponse>> = {
      message: 'ok',
      data: { items: [mockApp2], meta: { limit: 20, nextCursor: null, hasMore: false } },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, json: async () => page2 });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApplications('saved'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    result.current.fetchNextPage();
    await waitFor(() => {
      const data = result.current.data as InfiniteData<PaginatedData<ApplicationResponse>>;
      expect(data.pages).toHaveLength(2);
    });

    const data = result.current.data as InfiniteData<PaginatedData<ApplicationResponse>>;
    expect(data.pages[1].items[0].company).toBe('Beta');

    const secondCall = fetchMock.mock.calls[1][0] as string;
    expect(secondCall).toContain('cursor=cursor-abc');
  });
});
