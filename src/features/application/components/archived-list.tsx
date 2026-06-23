'use client';

import { useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { useInfiniteScroll } from '@/shared/hooks/use-infinite-scroll';
import { ACTIVE_STATUSES } from '../constants/status';
import { STATUS_LABELS } from '../constants/labels';
import { useArchivedApplications } from '../hooks/use-archived-applications';
import { useDeleteApplication } from '../hooks/use-application-mutations';
import { useReopenApplication } from '../hooks/use-reopen-application';

// The Archived view: every terminal-status card, with a Reopen submenu (back to an active
// status) and Delete. Infinite keyset scroll via the same sentinel pattern as the columns.
export function ArchivedList() {
  const { data, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useArchivedApplications();
  const { mutate: reopenApplication } = useReopenApplication();
  const deleteApplication = useDeleteApplication();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // The list scrolls internally (not the page), so the observer roots to that container.
  useInfiniteScroll({ scrollRef, sentinelRef, hasNextPage, isFetchingNextPage, fetchNextPage });

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div ref={scrollRef} className="h-full max-w-2xl space-y-3 overflow-y-auto pr-1">
      {isLoading
        ? [0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)
        : null}

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          Failed to load archived applications. Please refresh.
        </p>
      ) : null}

      {!isLoading && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No archived applications yet.</p>
      ) : null}

      {items.map((app) => (
        <Card key={app.id}>
          <CardHeader className="pb-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{app.company}</p>
                <p className="truncate text-xs text-muted-foreground">{app.role}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label="open menu">
                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Reopen</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {ACTIVE_STATUSES.map((activeStatus) => (
                        <DropdownMenuItem
                          key={activeStatus}
                          onSelect={() => reopenApplication({ id: app.id, toStatus: activeStatus })}
                        >
                          {STATUS_LABELS[activeStatus]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => deleteApplication(app.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Badge variant="secondary" className="text-xs capitalize">
              {app.status}
            </Badge>
          </CardContent>
        </Card>
      ))}

      <div ref={sentinelRef} className="h-1" aria-hidden="true" />

      {isFetchingNextPage ? <div className="h-20 animate-pulse rounded-lg bg-muted" /> : null}
    </div>
  );
}
