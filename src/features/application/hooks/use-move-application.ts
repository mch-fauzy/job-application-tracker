'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';
import { queryKeys } from '@/shared/constants/query-keys';
import { apiErrorMessage } from '@/shared/utils/api-message/api-message';
import { withoutItem } from '@/shared/lib/infinite-cache/infinite-cache';
import {
  applicationEnvelopeSchema,
  type ApplicationResponse,
} from '../dtos/v1/responses/application';
import type { ApplicationStatus } from '../constants/status';
import type { ApplicationListCache } from '../types/cache';

interface MoveVariables {
  // The card being moved. fromStatus derives from app.status - the single source of truth,
  // so a move to the card's own status is detected as a no-op without extra bookkeeping.
  app: ApplicationResponse;
  toStatus: ApplicationStatus;
}

interface MoveContext {
  fromSnapshot: ApplicationListCache;
  toSnapshot: ApplicationListCache;
  fromKey: readonly unknown[];
  toKey: readonly unknown[];
}

// Prepends a card to the first page of a column, creating the column if absent.
function withCardPrepended(
  cache: ApplicationListCache,
  card: ApplicationResponse,
): ApplicationListCache {
  if (!cache) {
    return {
      pages: [{ items: [card], meta: { limit: 20, nextCursor: null, hasMore: false } }],
      pageParams: [null],
    };
  }
  return {
    ...cache,
    pages: cache.pages.map((page, index) =>
      index === 0 ? { ...page, items: [card, ...page.items] } : page,
    ),
  };
}

// Optimistic status move: the card jumps columns instantly, the PATCH runs in the
// background, and a failure rolls both columns back. Concurrent drags share one pending
// counter so the resync fires once, after the last drag settles.
export function useMoveApplication() {
  const queryClient = useQueryClient();
  const pendingDragCountRef = useRef(0);

  return useMutation<ApplicationResponse, Error, MoveVariables, MoveContext>({
    mutationFn: async ({ app, toStatus }) => {
      // No-op: dropping a card in its own column. Resolve without touching the network.
      if (app.status === toStatus) return app;
      const res = await fetch(`/api/v1/applications/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: toStatus }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(apiErrorMessage(json) ?? `Move failed: ${res.status}`);
      }
      return applicationEnvelopeSchema.parse(json).data;
    },
    onMutate: async ({ app, toStatus }) => {
      const fromKey = queryKeys.applications.list({ status: app.status });
      const toKey = queryKeys.applications.list({ status: toStatus });
      if (app.status === toStatus) {
        return { fromSnapshot: undefined, toSnapshot: undefined, fromKey, toKey };
      }

      // Cancel in-flight column fetches so they cannot overwrite the optimistic state.
      await queryClient.cancelQueries({ queryKey: fromKey });
      await queryClient.cancelQueries({ queryKey: toKey });

      const fromSnapshot = queryClient.getQueryData<ApplicationListCache>(fromKey);
      const toSnapshot = queryClient.getQueryData<ApplicationListCache>(toKey);

      pendingDragCountRef.current += 1;

      queryClient.setQueryData<ApplicationListCache>(fromKey, (old) => withoutItem(old, app.id));
      queryClient.setQueryData<ApplicationListCache>(toKey, (old) =>
        withCardPrepended(old, { ...app, status: toStatus }),
      );

      return { fromSnapshot, toSnapshot, fromKey, toKey };
    },
    onSuccess: (_data, { app, toStatus }) => {
      if (app.status === toStatus) return;
      pendingDragCountRef.current -= 1;
      if (pendingDragCountRef.current === 0) {
        queryClient.invalidateQueries({ queryKey: queryKeys.applications.all });
      }
    },
    onError: (err, _vars, context) => {
      // A no-op move never reaches onError (its mutationFn resolves), so no guard here.
      if (context) {
        queryClient.setQueryData(context.fromKey, context.fromSnapshot);
        queryClient.setQueryData(context.toKey, context.toSnapshot);
      }
      pendingDragCountRef.current = Math.max(0, pendingDragCountRef.current - 1);
      // Resync only once no drag is in flight, matching onSuccess, so a failure here does not
      // refetch over a concurrent drag's still-optimistic columns.
      if (pendingDragCountRef.current === 0) {
        queryClient.invalidateQueries({ queryKey: queryKeys.applications.all });
      }
      toast.error(err.message);
    },
    // Opt out of the global MutationCache auto-invalidation: this hook manages its own
    // deferred resync so concurrent optimistic drags are not clobbered mid-flight.
    meta: { invalidates: [] },
  });
}
