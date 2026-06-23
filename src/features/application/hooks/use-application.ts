'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants/query-keys';
import { apiErrorMessage } from '@/shared/utils/api-message/api-message';
import {
  applicationEnvelopeSchema,
  type ApplicationResponse,
} from '../dtos/v1/responses/application';

// Fetches one application by id, parsing the envelope and returning the bare DTO so the cache
// shape matches the RSC prefetch (applicationService.getById).
async function fetchApplication(id: string): Promise<ApplicationResponse> {
  const res = await fetch(`/api/v1/applications/${id}`);
  const json = await res.json();
  if (!res.ok) throw new Error(apiErrorMessage(json) ?? `Failed to fetch application: ${res.status}`);
  return applicationEnvelopeSchema.parse(json).data;
}

// Single application detail query, keyed by id. Disabled until an id is present.
export function useApplication(id: string) {
  return useQuery({
    queryKey: queryKeys.applications.detail(id),
    queryFn: () => fetchApplication(id),
    enabled: Boolean(id),
  });
}
