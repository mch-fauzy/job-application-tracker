// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApplicationColumn } from './application-column';
import {
  ApplicationActionsProvider,
  type ApplicationActions,
} from '../contexts/application-actions';
import { queryKeys } from '@/shared/constants/query-keys';
import type { PaginatedData } from '@/shared/types/response';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

const noopActions: ApplicationActions = {
  move: vi.fn(),
  markTerminal: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
};

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

function savedPage(): PaginatedData<ApplicationResponse> {
  return { items: [mockApp], meta: { limit: 20, nextCursor: null, hasMore: false } };
}

const observe = vi.fn();
const disconnect = vi.fn();
let ioCallback: IntersectionObserverCallback | null = null;
class MockIntersectionObserver {
  constructor(cb: IntersectionObserverCallback) {
    ioCallback = cb;
  }
  observe = observe;
  disconnect = disconnect;
  unobserve = vi.fn();
  takeRecords = vi.fn();
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

function renderColumn(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ApplicationActionsProvider actions={noopActions}>
        <DndContext>
          <ApplicationColumn status="saved" />
        </DndContext>
      </ApplicationActionsProvider>
    </QueryClientProvider>,
  );
}

function seededClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(queryKeys.applications.list({ status: 'saved' }), {
    pages: [savedPage()],
    pageParams: [null],
  });
  return queryClient;
}

describe('ApplicationColumn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the column heading and the cards from the query cache', async () => {
    renderColumn(seededClient());
    expect(screen.getByRole('heading', { name: /saved/i })).toBeInTheDocument();
    expect(await screen.findByText('Acme')).toBeInTheDocument();
  });

  it('shows the card count for the column', async () => {
    renderColumn(seededClient());
    await screen.findByText('Acme');
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('observes the infinite-scroll sentinel', async () => {
    renderColumn(seededClient());
    await screen.findByText('Acme');
    expect(observe).toHaveBeenCalled();
  });

  it('renders loading skeletons while the first page is loading', () => {
    // No seeded data + a never-resolving fetch keeps the query in the loading state.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = renderColumn(queryClient);
    expect(screen.getByRole('heading', { name: /saved/i })).toBeInTheDocument();
    expect(screen.queryByText('Acme')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders an error state when the query fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderColumn(queryClient);
    expect(await screen.findByText(/failed to load/i)).toBeInTheDocument();
  });

  it('fetches the next page when the sentinel intersects', async () => {
    const { act } = await import('@testing-library/react');
    const page2 = {
      message: 'ok',
      data: {
        items: [{ ...mockApp, id: '99999999-9999-4999-8999-999999999999', company: 'NextCo' }],
        meta: { limit: 20, nextCursor: null, hasMore: false },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => page2 });
    vi.stubGlobal('fetch', fetchMock);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    queryClient.setQueryData(queryKeys.applications.list({ status: 'saved' }), {
      pages: [{ items: [mockApp], meta: { limit: 20, nextCursor: 'cursor-1', hasMore: true } }],
      pageParams: [null],
    });
    renderColumn(queryClient);
    await screen.findByText('Acme');

    // Simulate the sentinel scrolling into view to trigger fetchNextPage.
    act(() => {
      ioCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    await screen.findByText('NextCo');
    expect(fetchMock.mock.calls[0][0] as string).toContain('cursor=cursor-1');
  });

  it('shows a loading row while the next page is in flight', async () => {
    const { act } = await import('@testing-library/react');
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); // never resolves
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    queryClient.setQueryData(queryKeys.applications.list({ status: 'saved' }), {
      pages: [{ items: [mockApp], meta: { limit: 20, nextCursor: 'cursor-1', hasMore: true } }],
      pageParams: [null],
    });
    const { container } = renderColumn(queryClient);
    await screen.findByText('Acme');

    act(() => {
      ioCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    await waitFor(() => expect(container.querySelector('.animate-pulse')).not.toBeNull());
  });
});
