import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/shared/lib/query-client/query-client';
import { queryKeys } from '@/shared/constants/query-keys';
import { applicationService } from '@/features/application/services/application';
import { ArchivedList } from '@/features/application/components/archived-list';

// Render per request: reads live application data (see the board page).
export const dynamic = 'force-dynamic';

// RSC: prefetch the first keyset page of terminal applications, then hydrate.
export default async function ArchivedPage() {
  const queryClient = getQueryClient();

  await queryClient.prefetchInfiniteQuery({
    queryKey: queryKeys.applications.list({ archived: true }),
    queryFn: ({ pageParam }) =>
      applicationService.list({ archived: true, cursor: pageParam ?? undefined, limit: 20 }),
    initialPageParam: null as string | null,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="flex h-full flex-col gap-4">
        <h1 className="shrink-0 text-xl font-bold">Archived</h1>
        <div className="min-h-0 flex-1">
          <ArchivedList />
        </div>
      </div>
    </HydrationBoundary>
  );
}
