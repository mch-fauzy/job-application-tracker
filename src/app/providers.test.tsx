// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Providers } from './providers';

// Mock the providers and query-client so the test stays lightweight and asserts
// only the composition (tree shape), not each library's internals.
vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="theme-provider">{children}</div>
  ),
}));
vi.mock('@tanstack/react-query', () => ({
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="query-provider">{children}</div>
  ),
}));
vi.mock('sonner', () => ({
  Toaster: () => <div data-testid="toaster" />,
}));
vi.mock('@/shared/lib/query-client/query-client', () => ({
  getQueryClient: vi.fn(() => ({})),
}));

describe('Providers', () => {
  it('renders children inside ThemeProvider and QueryClientProvider', () => {
    render(
      <Providers>
        <span>hello</span>
      </Providers>,
    );
    expect(screen.getByTestId('theme-provider')).toBeInTheDocument();
    expect(screen.getByTestId('query-provider')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('renders the Toaster', () => {
    render(
      <Providers>
        <span />
      </Providers>,
    );
    expect(screen.getByTestId('toaster')).toBeInTheDocument();
  });
});
