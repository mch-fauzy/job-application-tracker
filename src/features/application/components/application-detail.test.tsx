// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApplicationDetail } from './application-detail';

vi.mock('@/features/application/hooks/use-application', () => ({
  useApplication: vi.fn(),
}));
// The actions row is unit-tested in application-detail-actions.test.tsx; stub it here so this
// test stays about the read-only detail rendering.
vi.mock('./application-detail-actions', () => ({
  ApplicationDetailActions: () => <div>actions</div>,
}));
import { useApplication } from '@/features/application/hooks/use-application';

const mockUseApplication = vi.mocked(useApplication);

describe('ApplicationDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state', () => {
    mockUseApplication.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useApplication>);
    render(<ApplicationDetail id="app-1" />);
    expect(screen.getByText(/loading application/i)).toBeInTheDocument();
  });

  it('renders application fields when loaded', () => {
    mockUseApplication.mockReturnValue({
      data: {
        id: 'app-1',
        company: 'Acme Corp',
        role: 'Senior Engineer',
        status: 'applied',
        jobUrl: 'https://acme.com/jobs/1',
        notes: 'Great benefits',
        createdAt: '2026-06-22T08:00:00.000Z',
        updatedAt: '2026-06-22T10:00:00.000Z',
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useApplication>);
    render(<ApplicationDetail id="app-1" />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Senior Engineer')).toBeInTheDocument();
    expect(screen.getByText('applied')).toBeInTheDocument();
    expect(screen.getByText('Great benefits')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /acme\.com/i })).toHaveAttribute(
      'href',
      'https://acme.com/jobs/1',
    );
  });

  it('does not render a link for a non-http(s) jobUrl scheme (XSS guard)', () => {
    mockUseApplication.mockReturnValue({
      data: {
        id: 'app-1',
        company: 'Acme Corp',
        role: 'Senior Engineer',
        status: 'applied',
        jobUrl: 'javascript:alert(1)',
        notes: null,
        createdAt: '2026-06-22T08:00:00.000Z',
        updatedAt: '2026-06-22T10:00:00.000Z',
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useApplication>);
    render(<ApplicationDetail id="app-1" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows an error state', () => {
    mockUseApplication.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useApplication>);
    render(<ApplicationDetail id="app-1" />);
    expect(screen.getByText(/failed to load application/i)).toBeInTheDocument();
  });
});
