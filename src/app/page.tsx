import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/shared/lib/query-client/query-client';
import { queryKeys } from '@/shared/constants/query-keys';
import { ACTIVE_STATUSES } from '@/features/application/constants/status';
import { applicationService } from '@/features/application/services/application';
import { ApplicationBoard } from '@/features/application/components/application-board';

// Render per request: the board reads live application data, so it must not be baked into
// static HTML at build time.
export const dynamic = 'force-dynamic';

// RSC: prefetch each active column's first keyset page by calling the service directly
// (in-process, no HTTP self-hop), then hydrate so the client board renders without a flash.
export default async function BoardPage() {
  const queryClient = getQueryClient();

  await Promise.all(
    ACTIVE_STATUSES.map((status) =>
      queryClient.prefetchInfiniteQuery({
        queryKey: queryKeys.applications.list({ status }),
        queryFn: ({ pageParam }) =>
          applicationService.list({ status, cursor: pageParam ?? undefined, limit: 20 }),
        initialPageParam: null as string | null,
      }),
    ),
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ApplicationBoard />
    </HydrationBoundary>
  );
}
