// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateApplicationDialog } from './create-application-dialog';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

const created: ApplicationResponse = {
  id: '22222222-2222-4222-8222-222222222222',
  company: 'Acme',
  role: 'Engineer',
  status: 'saved',
  jobUrl: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const okResponse = (data: ApplicationResponse) => ({ ok: true, json: async () => ({ message: 'ok', data }) });

describe('CreateApplicationDialog', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders the company and role fields when open', () => {
    render(<CreateApplicationDialog open onOpenChange={() => undefined} />, { wrapper: makeWrapper() });
    expect(screen.getByLabelText(/company/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/role/i)).toBeInTheDocument();
  });

  it('clears unsaved input when reopened after a cancel', () => {
    const { rerender } = render(
      <CreateApplicationDialog open onOpenChange={() => undefined} />,
      { wrapper: makeWrapper() },
    );
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: 'Typed but not saved' } });
    expect(screen.getByLabelText(/company/i)).toHaveValue('Typed but not saved');

    // The dialog is kept mounted by the board: close, then reopen - it must start blank.
    rerender(<CreateApplicationDialog open={false} onOpenChange={() => undefined} />);
    rerender(<CreateApplicationDialog open onOpenChange={() => undefined} />);

    expect(screen.getByLabelText(/company/i)).toHaveValue('');
  });

  it('blocks submission and does not POST when required fields are empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onOpenChange = vi.fn();

    render(<CreateApplicationDialog open onOpenChange={onOpenChange} />, { wrapper: makeWrapper() });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/company/i)).toHaveAttribute('aria-invalid', 'true');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('submits a create via POST and closes on success', async () => {
    const onOpenChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse(created));
    vi.stubGlobal('fetch', fetchMock);

    render(<CreateApplicationDialog open onOpenChange={onOpenChange} />, { wrapper: makeWrapper() });
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: 'Engineer' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/applications');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.company).toBe('Acme');
    expect(body.role).toBe('Engineer');

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('keeps a typed optional URL but drops one that is cleared', async () => {
    const onOpenChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse(created));
    vi.stubGlobal('fetch', fetchMock);

    render(<CreateApplicationDialog open onOpenChange={onOpenChange} />, { wrapper: makeWrapper() });
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: 'Engineer' } });
    const jobUrl = screen.getByLabelText(/job url/i);
    fireEvent.change(jobUrl, { target: { value: 'https://example.com' } });
    fireEvent.change(jobUrl, { target: { value: '' } });
    const notes = screen.getByLabelText(/notes/i);
    fireEvent.change(notes, { target: { value: 'a note' } });
    fireEvent.change(notes, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.jobUrl).toBeUndefined();
    expect(body.notes).toBeUndefined();
  });

  it('closes without submitting when Cancel is clicked', () => {
    const onOpenChange = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<CreateApplicationDialog open onOpenChange={onOpenChange} />, { wrapper: makeWrapper() });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a pending label while the create request is in flight', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); // never resolves
    render(<CreateApplicationDialog open onOpenChange={() => undefined} />, { wrapper: makeWrapper() });
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: 'Engineer' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(await screen.findByRole('button', { name: /creating/i })).toBeInTheDocument();
    // Cancel stays enabled during the request so the user can always escape (NN/g user control).
    expect(screen.getByRole('button', { name: /cancel/i })).toBeEnabled();
  });
});
