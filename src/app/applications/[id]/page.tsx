import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HTTPException } from 'hono/http-exception';
import { ArrowLeft } from 'lucide-react';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/shared/lib/query-client/query-client';
import { queryKeys } from '@/shared/constants/query-keys';
import { ENTITY_TYPE } from '@/shared/constants/entity-type';
import { applicationService } from '@/features/application/services/application';
import { auditService } from '@/features/audit/services/audit';
import { ApplicationDetail } from '@/features/application/components/application-detail';
import { AuditTimeline } from '@/features/audit/components/audit-timeline';
import { resolveBackTarget } from '@/features/application/utils/back-target/back-target';

// Render per request: detail and timeline are live data, never baked into static HTML.
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

// RSC: prefetch the application detail and its first timeline page in parallel by calling the
// services directly (in-process, no HTTP self-hop), then hydrate so the client renders without a
// flash. fetchQuery (not prefetchQuery) is used for the detail because prefetchQuery swallows
// errors - we need the 404 to surface so notFound() can run.
export default async function ApplicationDetailPage({ params }: PageProps) {
  const { id } = await params;
  const queryClient = getQueryClient();

  const [application] = await Promise.all([
    queryClient.fetchQuery({
      queryKey: queryKeys.applications.detail(id),
      queryFn: () => applicationService.getById(id),
    }),
    queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.timeline.detail(id),
      queryFn: () =>
        auditService.listTimeline({ entityType: ENTITY_TYPE.APPLICATION, entityId: id, limit: 20 }),
      initialPageParam: null as string | null,
    }),
  ]).catch((err: unknown) => {
    // prefetchQuery swallows errors, so fetchQuery is what surfaces the 404 for notFound().
    if (err instanceof HTTPException && err.status === 404) notFound();
    throw err;
  });

  // Back link points to the list this application lives in (active -> board, terminal -> archived).
  const back = resolveBackTarget(application.status);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {/* The page scrolls as one document (main is overflow-hidden). pb-2 keeps the last timeline
          row off the scroll edge, on top of main's own bottom padding. */}
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-8 pb-2">
          <Link
            href={back.href}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {back.label}
          </Link>
          <ApplicationDetail id={id} />
          <hr className="border-border" />
          <AuditTimeline applicationId={id} />
        </div>
      </div>
    </HydrationBoundary>
  );
}
