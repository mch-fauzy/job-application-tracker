'use client';

import React from 'react';
import { ThemeProvider } from 'next-themes';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { getQueryClient } from '@/shared/lib/query-client/query-client';

interface ProvidersProps {
  children: React.ReactNode;
}

// Client provider tree: theme (class-based) wraps the TanStack Query client,
// with the sonner Toaster mounted once for app-wide notifications. RSC pages call
// the same getQueryClient() for prefetch, so server and client share one contract.
export function Providers({ children }: ProvidersProps) {
  const queryClient = getQueryClient();
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster richColors position="bottom-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
