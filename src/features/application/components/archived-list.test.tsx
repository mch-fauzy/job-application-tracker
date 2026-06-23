// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArchivedList } from './archived-list';
import { queryKeys } from '@/shared/constants/query-keys';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { toast };
});

let ioCallback: IntersectionObserverCallback | null = null;
class MockIntersectionObserver {
  constructor(cb: IntersectionObserverCallback) {
    ioCallback = cb;
  }
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn();
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

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

function renderWith(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ArchivedList />
    </QueryClientProvider>,
  );
}

function seededClient(items = [mockRejected]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  queryClient.setQueryData(queryKeys.applications.list({ archived: true }), {
    pages: [{ items, meta: { limit: 20, nextCursor: null, hasMore: false } }],
    pageParams: [null],
  });
  return queryClient;
}

function renderList() {
  return renderWith(seededClient());
}

describe('ArchivedList', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the archived cards', async () => {
    renderList();
    expect(await screen.findByText('WidgetCo')).toBeInTheDocument();
    expect(screen.getByText('Designer')).toBeInTheDocument();
  });

  it('offers a Reopen submenu', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderList();
    await screen.findByText('WidgetCo');
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    expect(await screen.findByText(/reopen/i)).toBeInTheDocument();
  });

  it('reopens to an active status via a PATCH', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'updated', data: { ...mockRejected, status: 'saved' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderList();
    await screen.findByText('WidgetCo');
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    // Radix submenus open on hover, not click. fireEvent.click reliably fires the item's
    // onSelect (userEvent's pointer sequence does not, for a nested Radix submenu in jsdom).
    await user.hover(await screen.findByText(/reopen/i));
    fireEvent.click(await screen.findByRole('menuitem', { name: /^saved$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/applications/${mockRejected.id}`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string).status).toBe('saved');
  });

  it('removes the card optimistically and shows an Undo toast on Delete', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderList();
    await screen.findByText('WidgetCo');
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    fireEvent.click(await screen.findByText('Delete'));

    // The card goes at once; the server DELETE is deferred behind the Undo window.
    await waitFor(() => expect(screen.queryByText('WidgetCo')).not.toBeInTheDocument());
    expect(toast).toHaveBeenCalledWith(
      'Application deleted',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
    );
  });

  it('shows an empty state when there are no archived applications', () => {
    renderWith(seededClient([]));
    expect(screen.getByText(/no archived applications yet/i)).toBeInTheDocument();
  });

  it('shows an error state when loading fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWith(queryClient);
    expect(await screen.findByText(/failed to load archived applications/i)).toBeInTheDocument();
  });

  it('fetches the next page when the sentinel intersects', async () => {
    const { act } = await import('@testing-library/react');
    const page2 = {
      message: 'ok',
      data: {
        items: [{ ...mockRejected, id: '55555555-5555-4555-8555-555555555555', company: 'NextArchived' }],
        meta: { limit: 20, nextCursor: null, hasMore: false },
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => page2 }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    queryClient.setQueryData(queryKeys.applications.list({ archived: true }), {
      pages: [{ items: [mockRejected], meta: { limit: 20, nextCursor: 'a-cursor', hasMore: true } }],
      pageParams: [null],
    });
    renderWith(queryClient);
    await screen.findByText('WidgetCo');

    act(() => {
      ioCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    await screen.findByText('NextArchived');
  });

  it('shows a loading row while the next page is in flight', async () => {
    const { act } = await import('@testing-library/react');
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    queryClient.setQueryData(queryKeys.applications.list({ archived: true }), {
      pages: [{ items: [mockRejected], meta: { limit: 20, nextCursor: 'a-cursor', hasMore: true } }],
      pageParams: [null],
    });
    const { container } = renderWith(queryClient);
    await screen.findByText('WidgetCo');

    act(() => {
      ioCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    await waitFor(() => expect(container.querySelector('.animate-pulse')).not.toBeNull());
  });
});
