'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
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

interface ReopenVariables {
  id: string;
  toStatus: ApplicationStatus;
}

interface ReopenContext {
  snapshot: ApplicationListCache;
  key: readonly unknown[];
}

// Optimistic reopen (archived -> active): the card leaves the Archived list at once, the PATCH
// runs in the background, and a failure restores the list. The reopened card lands in its active
// board column after the post-mutation refetch.
export function useReopenApplication() {
  const queryClient = useQueryClient();

  return useMutation<ApplicationResponse, Error, ReopenVariables, ReopenContext>({
    mutationFn: async ({ id, toStatus }) => {
      const res = await fetch(`/api/v1/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: toStatus }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(apiErrorMessage(json) ?? `Reopen failed: ${res.status}`);
      }
      return applicationEnvelopeSchema.parse(json).data;
    },
    onMutate: async ({ id }) => {
      const key = queryKeys.applications.list({ archived: true });
      // Cancel in-flight archived fetches so they cannot overwrite the optimistic removal.
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<ApplicationListCache>(key);
      queryClient.setQueryData<ApplicationListCache>(key, (old) => withoutItem(old, id));
      return { snapshot, key };
    },
    onError: (err, _vars, context) => {
      if (context) queryClient.setQueryData(context.key, context.snapshot);
      toast.error(err.message);
    },
    // Refetch active columns so the reopened card appears there, and the archived list to confirm.
    meta: { invalidates: [queryKeys.applications.all] },
  });
}
