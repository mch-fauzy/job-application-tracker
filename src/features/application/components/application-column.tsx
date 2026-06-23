'use client';

import React, { useRef } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { cn } from '@/shared/utils/cn/cn';
import { useInfiniteScroll } from '@/shared/hooks/use-infinite-scroll';
import { useApplications } from '../hooks/use-applications';
import { ApplicationCard } from './application-card';
import { STATUS_LABELS } from '../constants/labels';
import type { ApplicationResponse } from '../dtos/v1/responses/application';
import type { ApplicationStatus } from '../constants/status';

interface ApplicationColumnProps {
  status: ApplicationStatus;
}

// One draggable card. Kept at module scope (not nested in the column) so it is a stable
// component type, and it wires dnd-kit's useDraggable, exposing the card to drag events via
// data.app. The handle listeners go on the card's grip, the node ref on the wrapper. Card
// actions come from board context, so the column passes no handlers through.
function DraggableCard({ app }: { app: ApplicationResponse }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: app.id,
    data: { app },
  });
  return (
    <div ref={setNodeRef} className={cn(isDragging && 'opacity-40')}>
      <ApplicationCard app={app} dragListeners={listeners} dragAttributes={attributes} />
    </div>
  );
}

// A board column: a droppable region (its id IS the status, so a drop reports the target
// status as over.id) holding an infinite keyset list of cards with a scroll sentinel.
function ApplicationColumnInner({ status }: ApplicationColumnProps) {
  const { data, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useApplications(status);
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // The column scrolls internally (not the page), so the observer roots to that container.
  useInfiniteScroll({ scrollRef, sentinelRef, hasNextPage, isFetchingNextPage, fetchNextPage });

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div
      ref={setNodeRef}
      // Full-height droppable: the whole column (the pinned header and the scroll area below it) is
      // a drop target, including the empty space under the cards.
      className={cn(
        'flex h-full w-72 shrink-0 flex-col rounded-lg p-2 transition-colors',
        isOver && 'bg-muted',
      )}
    >
      <div className="flex shrink-0 items-center justify-between px-1 pb-3">
        <h2 className="text-sm font-semibold">{STATUS_LABELS[status]}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {items.length}
        </span>
      </div>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {isLoading
          ? [0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)
          : null}

        {isError ? (
          <p role="alert" className="px-1 text-sm text-destructive">
            Failed to load. Please refresh.
          </p>
        ) : null}

        {items.map((app) => (
          <DraggableCard key={app.id} app={app} />
        ))}

        <div ref={sentinelRef} className="h-1" aria-hidden="true" />

        {isFetchingNextPage ? <div className="h-20 animate-pulse rounded-lg bg-muted" /> : null}
      </div>
    </div>
  );
}

// Memoized: the board re-renders on every dialog-open and drag start/end, none of which change
// this column's props (stable status + handlers), so a column re-renders only when its own data does.
export const ApplicationColumn = React.memo(ApplicationColumnInner);
ApplicationColumn.displayName = 'ApplicationColumn';
