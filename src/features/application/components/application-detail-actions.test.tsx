// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplicationDetailActions } from './application-detail-actions';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const update = vi.fn();
const deleteApplication = vi.fn();
let updatePending = false;
vi.mock('../hooks/use-application-mutations', () => ({
  useUpdateApplication: () => ({ mutate: update, isPending: updatePending }),
  useDeleteApplication: () => deleteApplication,
}));

// Stub the edit dialog so this test stays about the actions wiring, not the form.
vi.mock('./edit-application-dialog', () => ({
  EditApplicationDialog: ({ open }: { open: boolean }) =>
    open ? <div>edit dialog open</div> : null,
}));

const activeApp: ApplicationResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  company: 'Acme Corp',
  role: 'Senior Engineer',
  status: 'applied',
  jobUrl: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const terminalApp: ApplicationResponse = { ...activeApp, status: 'rejected' };

describe('ApplicationDetailActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updatePending = false;
  });

  it('shows a saving indicator while a status update is in progress', () => {
    updatePending = true;
    render(<ApplicationDetailActions application={activeApp} />);
    expect(screen.getByText(/saving/i)).toBeInTheDocument();
  });

  it('opens the edit dialog when Edit is clicked', async () => {
    const user = userEvent.setup();
    render(<ApplicationDetailActions application={activeApp} />);
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByText('edit dialog open')).toBeInTheDocument();
  });

  it('changes status to a terminal status via update', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ApplicationDetailActions application={activeApp} />);
    await user.click(screen.getByRole('button', { name: /change status/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /mark accepted/i }));
    expect(update).toHaveBeenCalledWith({ id: activeApp.id, data: { status: 'accepted' } });
  });

  it('moves to another active status via update', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ApplicationDetailActions application={activeApp} />);
    await user.click(screen.getByRole('button', { name: /change status/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /^interviewing$/i }));
    expect(update).toHaveBeenCalledWith({ id: activeApp.id, data: { status: 'interviewing' } });
  });

  it('offers Reopen targets for a terminal application', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ApplicationDetailActions application={terminalApp} />);
    await user.click(screen.getByRole('button', { name: /change status/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /^saved$/i }));
    expect(update).toHaveBeenCalledWith({ id: terminalApp.id, data: { status: 'saved' } });
  });

  it('deletes and navigates back to the board', async () => {
    const user = userEvent.setup();
    render(<ApplicationDetailActions application={activeApp} />);
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(deleteApplication).toHaveBeenCalledWith(activeApp.id);
    expect(push).toHaveBeenCalledWith('/');
  });
});
