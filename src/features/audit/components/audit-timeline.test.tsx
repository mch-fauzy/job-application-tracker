// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuditTimeline } from './audit-timeline';

// Mock useTimeline so we control the returned data.
vi.mock('@/features/audit/hooks/use-timeline', () => ({
  useTimeline: vi.fn(),
}));
import { useTimeline } from '@/features/audit/hooks/use-timeline';

const mockUseTimeline = vi.mocked(useTimeline);

// Capture the IntersectionObserver callback so a test can simulate the sentinel scrolling in.
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

function makeTimeline(events: object[], overrides: Partial<ReturnType<typeof useTimeline>> = {}) {
  return {
    data: { pages: [{ items: events, meta: { limit: 20, nextCursor: null, hasMore: false } }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
    ...overrides,
  } as unknown as ReturnType<typeof useTimeline>;
}

describe('AuditTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ioCallback = null;
  });

  it('renders "Application created" for a created event', () => {
    mockUseTimeline.mockReturnValue(makeTimeline([
      { id: 'evt-1', action: 'created', diff: null, createdAt: '2026-06-22T10:00:00Z', createdBy: null },
    ]));
    render(<AuditTimeline applicationId="app-1" />);
    expect(screen.getByText('Application created')).toBeInTheDocument();
  });

  it('renders "Status: saved → applied" for an updated event with diff.status', () => {
    mockUseTimeline.mockReturnValue(makeTimeline([
      { id: 'evt-2', action: 'updated', diff: { status: { from: 'saved', to: 'applied' } }, createdAt: '2026-06-22T11:00:00Z', createdBy: null },
    ]));
    render(<AuditTimeline applicationId="app-1" />);
    expect(screen.getByText('Status: saved → applied')).toBeInTheDocument();
  });

  it('renders "Application updated" for an updated event without diff.status', () => {
    mockUseTimeline.mockReturnValue(makeTimeline([
      { id: 'evt-3', action: 'updated', diff: { role: { from: 'Dev', to: 'Senior Dev' } }, createdAt: '2026-06-22T12:00:00Z', createdBy: null },
    ]));
    render(<AuditTimeline applicationId="app-1" />);
    expect(screen.getByText('Application updated')).toBeInTheDocument();
  });

  it('renders "Application deleted" for a deleted event', () => {
    mockUseTimeline.mockReturnValue(makeTimeline([
      { id: 'evt-4', action: 'deleted', diff: null, createdAt: '2026-06-22T13:00:00Z', createdBy: null },
    ]));
    render(<AuditTimeline applicationId="app-1" />);
    expect(screen.getByText('Application deleted')).toBeInTheDocument();
  });

  it('renders an empty state when there are no events', () => {
    mockUseTimeline.mockReturnValue(makeTimeline([]));
    render(<AuditTimeline applicationId="app-1" />);
    expect(screen.getByText(/no history yet/i)).toBeInTheDocument();
  });

  it('auto-loads the next page when the sentinel scrolls into view', () => {
    const fetchNextPage = vi.fn();
    mockUseTimeline.mockReturnValue(makeTimeline([], { hasNextPage: true, fetchNextPage }));
    render(<AuditTimeline applicationId="app-1" />);

    act(() => {
      ioCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it('shows a loading skeleton on the first load', () => {
    mockUseTimeline.mockReturnValue(makeTimeline([], { isLoading: true, data: undefined }));
    const { container } = render(<AuditTimeline applicationId="app-1" />);
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('shows an error state', () => {
    mockUseTimeline.mockReturnValue(makeTimeline([], { isError: true, data: undefined }));
    render(<AuditTimeline applicationId="app-1" />);
    expect(screen.getByText(/failed to load timeline/i)).toBeInTheDocument();
  });
});
