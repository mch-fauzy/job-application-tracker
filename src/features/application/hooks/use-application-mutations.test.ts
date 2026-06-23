// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useCreateApplication,
  useUpdateApplication,
  useDeleteApplication,
} from './use-application-mutations';
import { toast } from 'sonner';
import { queryKeys } from '@/shared/constants/query-keys';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { toast };
});

// Pull the options the delete handler passed to its Undo toast, to drive the deferred commit.
function lastToastOptions() {
  const calls = vi.mocked(toast).mock.calls;
  return calls[calls.length - 1][1] as {
    action: { label: string; onClick: () => void };
    onAutoClose: () => void;
  };
}

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

type CachedColumn = { pages: Array<{ items: ApplicationResponse[] }> };

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

describe('useCreateApplication', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('POSTs to /api/v1/applications with the form body', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'created', data: mockApp }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateApplication(), { wrapper });
    act(() => {
      result.current.mutate({ company: 'Acme', role: 'Engineer' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/applications',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.company).toBe('Acme');
    expect(body.role).toBe('Engineer');
  });

  it('tags meta.invalidates with applications.all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'created', data: mockApp }) }),
    );
    const { queryClient, wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateApplication(), { wrapper });
    act(() => {
      result.current.mutate({ company: 'Acme', role: 'Engineer' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const mutation = queryClient.getMutationCache().getAll()[0];
    expect(mutation.options.meta?.invalidates).toEqual([queryKeys.applications.all]);
  });

  it('falls back to a generic message when the server returns no message', async () => {
    const { toast } = await import('sonner');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) }));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateApplication(), { wrapper });
    act(() => {
      result.current.mutate({ company: 'Acme', role: 'Engineer' });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith('Request failed: 500');
  });
});

describe('useUpdateApplication', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('PATCHes to /api/v1/applications/:id and returns the updated resource', async () => {
    const updated = { ...mockApp, company: 'Acme2' };
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'updated', data: updated }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateApplication(), { wrapper });
    act(() => {
      result.current.mutate({ id: mockApp.id, data: { company: 'Acme2' } });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/applications/${mockApp.id}`);
    expect(init.method).toBe('PATCH');
    expect(result.current.data?.company).toBe('Acme2');
  });

  it('surfaces the server message via toast on error', async () => {
    const { toast } = await import('sonner');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'Boom' }) }),
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateApplication(), { wrapper });
    act(() => {
      result.current.mutate({ id: mockApp.id, data: { company: 'x' } });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith('Boom');
  });
});

describe('useDeleteApplication', () => {
  beforeEach(() => vi.restoreAllMocks());

  const savedKey = queryKeys.applications.list({ status: 'saved' });
  function seed(queryClient: QueryClient) {
    queryClient.setQueryData(savedKey, {
      pages: [{ items: [mockApp], meta: { limit: 20, nextCursor: null, hasMore: false } }],
      pageParams: [null],
    });
  }

  it('removes the card optimistically and shows an Undo toast without calling the server', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { queryClient, wrapper } = makeWrapper();
    seed(queryClient);

    const { result } = renderHook(() => useDeleteApplication(), { wrapper });
    act(() => result.current(mockApp.id));

    expect(queryClient.getQueryData<CachedColumn>(savedKey)?.pages[0].items).toHaveLength(0);
    expect(toast).toHaveBeenCalledWith(
      'Application deleted',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('commits the DELETE to the server once the undo window elapses', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const { queryClient, wrapper } = makeWrapper();
    seed(queryClient);

    const { result } = renderHook(() => useDeleteApplication(), { wrapper });
    act(() => result.current(mockApp.id));
    await act(async () => {
      lastToastOptions().onAutoClose();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/applications/${mockApp.id}`);
    expect(init.method).toBe('DELETE');
  });

  it('restores the card on Undo and never calls the server, even after the window', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { queryClient, wrapper } = makeWrapper();
    seed(queryClient);

    const { result } = renderHook(() => useDeleteApplication(), { wrapper });
    act(() => result.current(mockApp.id));

    act(() => lastToastOptions().action.onClick());
    expect(queryClient.getQueryData<CachedColumn>(savedKey)?.pages[0].items).toHaveLength(1);

    // An undone delete never commits, even if the timer also fires.
    act(() => lastToastOptions().onAutoClose());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('restores the card and surfaces the error when the commit fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) }));
    const { queryClient, wrapper } = makeWrapper();
    seed(queryClient);

    const { result } = renderHook(() => useDeleteApplication(), { wrapper });
    act(() => result.current(mockApp.id));
    await act(async () => {
      lastToastOptions().onAutoClose();
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<CachedColumn>(savedKey)?.pages[0].items).toHaveLength(1),
    );
    expect(toast.error).toHaveBeenCalledWith('Delete failed: 404');
  });

  it('reports a status fallback when the error body is unparseable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('invalid json');
      },
    }));
    const { queryClient, wrapper } = makeWrapper();
    seed(queryClient);

    const { result } = renderHook(() => useDeleteApplication(), { wrapper });
    act(() => result.current(mockApp.id));
    await act(async () => {
      lastToastOptions().onAutoClose();
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Delete failed: 500'));
  });

  it('reports a generic message when the delete request rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce('network down'));
    const { queryClient, wrapper } = makeWrapper();
    seed(queryClient);

    const { result } = renderHook(() => useDeleteApplication(), { wrapper });
    act(() => result.current(mockApp.id));
    await act(async () => {
      lastToastOptions().onAutoClose();
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Delete failed'));
  });
});
