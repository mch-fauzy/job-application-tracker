'use client';

import { useRef } from 'react';
import { z } from 'zod';
import { FormattedDate } from '@/shared/components/app/formatted-date';
import { useInfiniteScroll } from '@/shared/hooks/use-infinite-scroll';
import { useTimeline } from '@/features/audit/hooks/use-timeline';
import type { AuditEventResponse } from '@/features/audit/dtos/v1/responses/audit';

// The diff shape a status change writes: { status: { from, to } }. Parsed (not cast) so an
// updated event with any other diff falls through to the generic label.
const statusDiffSchema = z.object({
  status: z.object({ from: z.string(), to: z.string() }),
});

// Turns one audit event into its human-readable timeline label.
function formatEvent(event: AuditEventResponse): string {
  if (event.action === 'created') return 'Application created';
  if (event.action === 'deleted') return 'Application deleted';
  const statusDiff = statusDiffSchema.safeParse(event.diff);
  if (statusDiff.success) {
    return `Status: ${statusDiff.data.status.from} → ${statusDiff.data.status.to}`;
  }
  return 'Application updated';
}

interface AuditTimelineProps {
  applicationId: string;
}

export function AuditTimeline({ applicationId }: AuditTimelineProps) {
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useTimeline(applicationId);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // The panel scrolls internally, so the observer roots to that container.
  useInfiniteScroll({ scrollRef, sentinelRef, hasNextPage, isFetchingNextPage, fetchNextPage });

  const events = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">History</h2>
      <div
        ref={scrollRef}
        role="log"
        aria-busy={isLoading}
        className="max-h-96 space-y-3 overflow-y-auto pr-1"
      >
        {isLoading
          ? [0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />)
          : null}

        {isError ? (
          <p role="alert" className="text-sm text-destructive">
            Failed to load timeline.
          </p>
        ) : null}

        {!isLoading && !isError && events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history yet.</p>
        ) : null}

        <ol className="space-y-3">
          {events.map((event) => (
            <li key={event.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
              <span className="text-sm font-medium">{formatEvent(event)}</span>
              <FormattedDate className="text-xs text-muted-foreground" value={event.createdAt} />
            </li>
          ))}
        </ol>

        <div ref={sentinelRef} className="h-1" aria-hidden="true" />

        {isFetchingNextPage ? (
          <div className="h-10 animate-pulse rounded-md bg-muted" />
        ) : null}
      </div>
    </div>
  );
}
