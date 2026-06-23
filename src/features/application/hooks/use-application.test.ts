// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useApplication } from './use-application';

const mockApp = {
  message: 'Application retrieved successfully',
  data: {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    company: 'Acme Corp',
    role: 'Senior Engineer',
    status: 'applied',
    jobUrl: 'https://acme.com/jobs/1',
    notes: 'Good fit',
    createdAt: '2026-06-22T08:00:00.000Z',
    updatedAt: '2026-06-22T10:00:00.000Z',
  },
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return Wrapper;
}

describe('useApplication', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the application by id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockApp,
    }));
    const { result } = renderHook(() => useApplication('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.company).toBe('Acme Corp');
    const callUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(callUrl).toContain('/api/v1/applications/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
  });

  it('exposes an error state when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Application not found', error: null }),
    }));
    const { result } = renderHook(() => useApplication('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
