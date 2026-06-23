// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditApplicationDialog } from './edit-application-dialog';
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

const existingApp: ApplicationResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  company: 'OldCo',
  role: 'Dev',
  status: 'saved',
  jobUrl: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const okResponse = (data: ApplicationResponse) => ({ ok: true, json: async () => ({ message: 'ok', data }) });

describe('EditApplicationDialog', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('prefills the dialog with the application values', () => {
    render(<EditApplicationDialog open onOpenChange={() => undefined} application={existingApp} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByText('Edit Application')).toBeInTheDocument();
    expect(screen.getByDisplayValue('OldCo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('shows a pending label while an edit request is in flight', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<EditApplicationDialog open onOpenChange={() => undefined} application={existingApp} />, {
      wrapper: makeWrapper(),
    });
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: 'NewCo' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(await screen.findByRole('button', { name: /saving/i })).toBeInTheDocument();
  });

  it('submits an edit via PATCH with the prefilled values', async () => {
    const onOpenChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse({ ...existingApp, company: 'NewCo' }));
    vi.stubGlobal('fetch', fetchMock);

    render(<EditApplicationDialog open onOpenChange={onOpenChange} application={existingApp} />, {
      wrapper: makeWrapper(),
    });

    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: 'NewCo' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/applications/${existingApp.id}`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string).company).toBe('NewCo');

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('clears an optional field to null on save', async () => {
    const onOpenChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse(existingApp));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <EditApplicationDialog
        open
        onOpenChange={onOpenChange}
        application={{ ...existingApp, jobUrl: 'https://old.com', notes: 'old note' }}
      />,
      { wrapper: makeWrapper() },
    );

    const jobUrl = screen.getByLabelText(/job url/i);
    expect(jobUrl).toHaveValue('https://old.com');
    fireEvent.change(jobUrl, { target: { value: '' } });
    const notes = screen.getByLabelText(/notes/i);
    fireEvent.change(notes, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.jobUrl).toBeNull();
    expect(body.notes).toBeNull();
  });

  it('closes without submitting when Cancel is clicked', () => {
    const onOpenChange = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<EditApplicationDialog open onOpenChange={onOpenChange} application={existingApp} />, {
      wrapper: makeWrapper(),
    });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
