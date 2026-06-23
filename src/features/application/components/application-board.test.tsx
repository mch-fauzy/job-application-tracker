// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApplicationBoard } from './application-board';
import { queryKeys } from '@/shared/constants/query-keys';
import { ACTIVE_STATUSES } from '../constants/status';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { toast };
});

// dnd-kit relies on pointer events jsdom does not implement, so stub the context and the
// drag/drop hooks the board and its columns use. The real drag-decision logic is covered
// by resolveDragMove's own unit test.
// Captured drag handlers so a test can drive the board's onDragStart/onDragEnd directly
// (jsdom cannot simulate a real pointer drag).
const dnd: { onDragStart?: (e: unknown) => void; onDragEnd?: (e: unknown) => void } = {};
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: ({ children, onDragStart, onDragEnd }: {
      children: React.ReactNode;
      onDragStart?: (e: unknown) => void;
      onDragEnd?: (e: unknown) => void;
    }) => {
      dnd.onDragStart = onDragStart;
      dnd.onDragEnd = onDragEnd;
      return <div data-testid="dnd-context">{children}</div>;
    },
    DragOverlay: ({ children }: { children: React.ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
    useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), isDragging: false }),
    useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
    useSensor: () => ({}),
    useSensors: () => [],
    PointerSensor: class {},
    KeyboardSensor: class {},
    MeasuringStrategy: { WhileDragging: 'whileDragging' },
  };
});

class MockIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn();
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

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
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  ACTIVE_STATUSES.forEach((status) => {
    queryClient.setQueryData(queryKeys.applications.list({ status }), {
      pages: [
        {
          items: status === 'saved' ? [mockApp] : [],
          meta: { limit: 20, nextCursor: null, hasMore: false },
        },
      ],
      pageParams: [null],
    });
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

describe('ApplicationBoard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the four active column headings', () => {
    render(<ApplicationBoard />, { wrapper: makeWrapper() });
    expect(screen.getByRole('heading', { name: /^saved$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^applied$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^interviewing$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^offer$/i })).toBeInTheDocument();
  });

  it('renders the DndContext wrapper', () => {
    render(<ApplicationBoard />, { wrapper: makeWrapper() });
    expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
  });

  it('opens the create dialog when New Application is clicked', async () => {
    render(<ApplicationBoard />, { wrapper: makeWrapper() });
    fireEvent.click(screen.getByRole('button', { name: /new application/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('opens the edit dialog from a card Edit action', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ApplicationBoard />, { wrapper: makeWrapper() });
    await user.click(await screen.findByRole('button', { name: /open menu/i }));
    fireEvent.click(await screen.findByText('Edit'));
    expect(await screen.findByText('Edit Application')).toBeInTheDocument();

    // Closing the dialog clears the edit target (onOpenChange -> setEditApp(null)).
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Edit Application')).not.toBeInTheDocument());
  });

  it('removes the card optimistically and shows an Undo toast on Delete', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ApplicationBoard />, { wrapper: makeWrapper() });
    expect(screen.getByText('Acme')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /open menu/i }));
    fireEvent.click(await screen.findByText('Delete'));

    // The card goes at once; the server DELETE is deferred behind the Undo window.
    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());
    expect(toast).toHaveBeenCalledWith(
      'Application deleted',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
    );
  });

  it('marks a card terminal via the card menu', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'ok', data: { ...mockApp, status: 'rejected' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ApplicationBoard />, { wrapper: makeWrapper() });
    await user.click(await screen.findByRole('button', { name: /open menu/i }));
    fireEvent.click(await screen.findByText('Reject'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/applications/${mockApp.id}`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string).status).toBe('rejected');
  });

  it('moves a card via the Move to submenu', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'ok', data: { ...mockApp, status: 'applied' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ApplicationBoard />, { wrapper: makeWrapper() });
    await user.click(await screen.findByRole('button', { name: /open menu/i }));
    await user.hover(await screen.findByText('Move to'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /^applied$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/applications/${mockApp.id}`);
    expect(JSON.parse(init.body as string).status).toBe('applied');
  });

  it('drives a drag from start to drop, moving the card and showing the overlay ghost', async () => {
    const { act } = await import('@testing-library/react');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'ok', data: { ...mockApp, status: 'applied' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ApplicationBoard />, { wrapper: makeWrapper() });

    // Drag start with a card surfaces the ghost in the overlay.
    act(() => dnd.onDragStart?.({ active: { data: { current: { app: mockApp } } } }));
    expect(within(screen.getByTestId('drag-overlay')).getByText('Acme')).toBeInTheDocument();

    // Drop on a different column issues the status move.
    act(() =>
      dnd.onDragEnd?.({ active: { data: { current: { app: mockApp } } }, over: { id: 'applied' } }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).status).toBe('applied');
  });

  it('ignores a drag with no card data and a drop in the same column', async () => {
    const { act } = await import('@testing-library/react');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<ApplicationBoard />, { wrapper: makeWrapper() });

    // Drag start without app data clears the active card (no ghost).
    act(() => dnd.onDragStart?.({ active: { data: { current: {} } } }));
    expect(screen.getByTestId('drag-overlay')).toBeEmptyDOMElement();

    // Drop back in the same column is a no-op - no request.
    act(() =>
      dnd.onDragEnd?.({ active: { data: { current: { app: mockApp } } }, over: { id: 'saved' } }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
