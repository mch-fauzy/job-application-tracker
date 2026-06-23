// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { useArchivedApplications } from './use-archived-applications';
import type { ApiResponse, PaginatedData } from '@/shared/types/response';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

const mockApp: ApplicationResponse = {
  id: '33333333-3333-4333-8333-333333333333',
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
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

describe('useArchivedApplications', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('fetches archived apps with the archived=true param and no status param', async () => {
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

  it('walks to the next page using meta.nextCursor', async () => {
    const page1: ApiResponse<PaginatedData<ApplicationResponse>> = {
      message: 'ok',
      data: { items: [mockApp], meta: { limit: 20, nextCursor: 'c-xyz', hasMore: true } },
    };
    const page2: ApiResponse<PaginatedData<ApplicationResponse>> = {
      message: 'ok',
      data: { items: [], meta: { limit: 20, nextCursor: null, hasMore: false } },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, json: async () => page2 });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useArchivedApplications(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    result.current.fetchNextPage();
    await waitFor(() => {
      const data = result.current.data as InfiniteData<PaginatedData<ApplicationResponse>>;
      expect(data.pages).toHaveLength(2);
    });

    expect(fetchMock.mock.calls[1][0] as string).toContain('cursor=c-xyz');
  });
});
