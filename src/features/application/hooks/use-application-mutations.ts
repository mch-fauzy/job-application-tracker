'use client';

import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/shared/constants/query-keys';
import { apiErrorMessage } from '@/shared/utils/api-message/api-message';
import { withoutItem } from '@/shared/lib/infinite-cache/infinite-cache';
import {
  applicationEnvelopeSchema,
  type ApplicationResponse,
} from '../dtos/v1/responses/application';
import type { CreateApplicationRequest } from '../dtos/v1/requests/create-application';
import type { UpdateApplicationRequest } from '../dtos/v1/requests/update-application';
import type { ApplicationListCache } from '../types/cache';

// Sends a write to the applications API and parses the envelope back to the response DTO.
// Throws the server-provided message on a non-2xx so onError can surface it.
async function sendApplication(
  url: string,
  method: 'POST' | 'PATCH',
  body: CreateApplicationRequest | UpdateApplicationRequest,
): Promise<ApplicationResponse> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(apiErrorMessage(json) ?? `Request failed: ${res.status}`);
  }
  return applicationEnvelopeSchema.parse(json).data;
}

// Tagging meta.invalidates lets the global MutationCache refetch the matching queries after the
// write: every applications query (all columns + archived) AND the audit timeline, since each
// mutation appends an audit row - without timeline.all the open history would go stale.
export function useCreateApplication() {
  return useMutation<ApplicationResponse, Error, CreateApplicationRequest>({
    mutationFn: (data) => sendApplication('/api/v1/applications', 'POST', data),
    onError: (err) => toast.error(err.message),
    meta: { invalidates: [queryKeys.applications.all, queryKeys.timeline.all] },
  });
}

export function useUpdateApplication() {
  return useMutation<ApplicationResponse, Error, { id: string; data: UpdateApplicationRequest }>({
    mutationFn: ({ id, data }) => sendApplication(`/api/v1/applications/${id}`, 'PATCH', data),
    onError: (err) => toast.error(err.message),
    meta: { invalidates: [queryKeys.applications.all, queryKeys.timeline.all] },
  });
}

// How long the Undo toast stays before the delete is committed to the server.
const UNDO_WINDOW_MS = 5000;

// Returns a delete handler with an undo window. The card is removed from every cached list at
// once (it lives in exactly one, so removing elsewhere is a no-op), and the server DELETE is
// deferred until the toast times out - so Undo cancels it with no server call and no audit row.
// A failed commit restores the card and surfaces the error.
export function useDeleteApplication() {
  const queryClient = useQueryClient();

  return useCallback(
    (id: string) => {
      const filter = { queryKey: queryKeys.applications.lists() };
      const snapshots = queryClient.getQueriesData<ApplicationListCache>(filter);
      queryClient.setQueriesData<ApplicationListCache>(filter, (old) => withoutItem(old, id));

      let undone = false;
      const restore = () => {
        undone = true;
        snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      };

      const commit = async () => {
        try {
          const res = await fetch(`/api/v1/applications/${id}`, { method: 'DELETE' });
          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            throw new Error(apiErrorMessage(json) ?? `Delete failed: ${res.status}`);
          }
          await queryClient.invalidateQueries({ queryKey: queryKeys.applications.all });
        } catch (err) {
          restore();
          toast.error(err instanceof Error ? err.message : 'Delete failed');
        }
      };

      toast('Application deleted', {
        duration: UNDO_WINDOW_MS,
        action: { label: 'Undo', onClick: restore },
        onAutoClose: () => {
          if (!undone) void commit();
        },
      });
    },
    [queryClient],
  );
}
