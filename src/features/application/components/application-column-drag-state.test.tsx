// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApplicationColumn } from './application-column';
import {
  ApplicationActionsProvider,
  type ApplicationActions,
} from '../contexts/application-actions';
import { queryKeys } from '@/shared/constants/query-keys';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

const noopActions: ApplicationActions = {
  move: vi.fn(),
  markTerminal: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
};

// Force the dnd-kit drag/drop state so the isDragging (card dimmed) and isOver (column
// highlighted) class branches are exercised - states a real pointer drag would produce.
vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), isDragging: true }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: true }),
}));

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

describe('ApplicationColumn drag state', () => {
  it('dims the dragged card and highlights the column while dragging over it', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    queryClient.setQueryData(queryKeys.applications.list({ status: 'saved' }), {
      pages: [{ items: [mockApp], meta: { limit: 20, nextCursor: null, hasMore: false } }],
      pageParams: [null],
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <ApplicationActionsProvider actions={noopActions}>
          <ApplicationColumn status="saved" />
        </ApplicationActionsProvider>
      </QueryClientProvider>,
    );

    await screen.findByText('Acme');
    // The dragged card wrapper is dimmed (isDragging).
    expect(container.querySelector('.opacity-40')).not.toBeNull();
    // The column root (w-72) is highlighted as a drop target (isOver).
    expect(container.querySelector('.w-72')?.className).toContain('bg-muted');
  });
});
