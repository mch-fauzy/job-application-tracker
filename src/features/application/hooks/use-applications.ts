'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants/query-keys';
import type { PaginatedData } from '@/shared/types/response';
import {
  applicationPageEnvelopeSchema,
  type ApplicationResponse,
} from '../dtos/v1/responses/application';
import type { ApplicationStatus } from '../constants/status';

// Fetches one keyset page of a single active column, parsing the envelope and
// returning the bare PaginatedData so the cache shape matches the RSC prefetch.
async function fetchApplicationPage(
  status: ApplicationStatus,
  cursor: string | null,
): Promise<PaginatedData<ApplicationResponse>> {
  const params = new URLSearchParams({ status, limit: '20' });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`/api/v1/applications?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch applications: ${res.status}`);
  return applicationPageEnvelopeSchema.parse(await res.json()).data;
}

// One active column as an infinite keyset query, ordered updatedAt DESC server-side.
export function useApplications(status: ApplicationStatus) {
  return useInfiniteQuery({
    queryKey: queryKeys.applications.list({ status }),
    queryFn: ({ pageParam }) => fetchApplicationPage(status, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.meta.hasMore ? lastPage.meta.nextCursor : undefined),
  });
}
