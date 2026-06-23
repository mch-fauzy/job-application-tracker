'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants/query-keys';
import { ENTITY_TYPE } from '@/shared/constants/entity-type';
import { apiErrorMessage } from '@/shared/utils/api-message/api-message';
import type { PaginatedData } from '@/shared/types/response';
import {
  auditPageEnvelopeSchema,
  type AuditEventResponse,
} from '../dtos/v1/responses/audit';

// Fetches one keyset page of an application's timeline, parsing the envelope and returning the
// bare PaginatedData so the cache shape matches the RSC prefetch (auditService.listTimeline).
async function fetchTimelinePage(
  applicationId: string,
  cursor: string | null,
): Promise<PaginatedData<AuditEventResponse>> {
  const params = new URLSearchParams({
    entityType: ENTITY_TYPE.APPLICATION,
    entityId: applicationId,
    limit: '20',
  });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`/api/v1/audit?${params.toString()}`);
  const json = await res.json();
  if (!res.ok) throw new Error(apiErrorMessage(json) ?? `Failed to fetch timeline: ${res.status}`);
  return auditPageEnvelopeSchema.parse(json).data;
}

// One application's audit timeline as an infinite keyset query, ordered createdAt DESC server-side.
export function useTimeline(applicationId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.timeline.detail(applicationId),
    queryFn: ({ pageParam }) => fetchTimelinePage(applicationId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.meta.hasMore ? lastPage.meta.nextCursor : undefined),
  });
}
