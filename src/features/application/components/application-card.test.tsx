// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplicationCard } from './application-card';
import {
  ApplicationActionsProvider,
  type ApplicationActions,
} from '../contexts/application-actions';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

const mockApp: ApplicationResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  company: 'Acme Corp',
  role: 'Senior Engineer',
  status: 'saved',
  jobUrl: 'https://example.com',
  notes: 'Good vibes',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderCard() {
  const actions: ApplicationActions = {
    move: vi.fn(),
    markTerminal: vi.fn(),
    edit: vi.fn(),
    remove: vi.fn(),
  };
  render(
    <ApplicationActionsProvider actions={actions}>
      <ApplicationCard app={mockApp} />
    </ApplicationActionsProvider>,
  );
  return actions;
}

describe('ApplicationCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the company and role', () => {
    renderCard();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Senior Engineer')).toBeInTheDocument();
  });

  it('renders the status badge', () => {
    renderCard();
    expect(screen.getByText('saved')).toBeInTheDocument();
  });

  it('links the card to its detail + timeline page', () => {
    renderCard();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      `/applications/${mockApp.id}`,
    );
  });

  it('calls edit with the application when Edit is selected', async () => {
    const user = userEvent.setup();
    const { edit } = renderCard();
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    await user.click(await screen.findByText('Edit'));
    expect(edit).toHaveBeenCalledWith(mockApp);
  });

  it('calls remove with the application id when Delete is selected', async () => {
    const user = userEvent.setup();
    const { remove } = renderCard();
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    await user.click(await screen.findByText('Delete'));
    expect(remove).toHaveBeenCalledWith(mockApp.id);
  });

  it('calls markTerminal with the application and target status when Reject is selected', async () => {
    const user = userEvent.setup();
    const { markTerminal } = renderCard();
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    await user.click(await screen.findByText('Reject'));
    expect(markTerminal).toHaveBeenCalledWith(mockApp, 'rejected');
  });

  it('calls move with the application and target status from the Move to submenu', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { move } = renderCard();
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    await user.hover(await screen.findByText('Move to'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /^applied$/i }));
    expect(move).toHaveBeenCalledWith(mockApp, 'applied');
  });
});
