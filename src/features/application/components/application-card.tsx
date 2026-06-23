'use client';

import React from 'react';
import { MoreHorizontal, GripVertical } from 'lucide-react';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
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
import { ACTIVE_STATUSES } from '../constants/status';
import { STATUS_LABELS, TERMINAL_ACTIONS } from '../constants/labels';
import { useApplicationActions } from '../contexts/application-actions';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

interface ApplicationCardProps {
  app: ApplicationResponse;
  // dnd-kit drag-handle wiring. Spread onto the grip div, never onto the Radix Card.
  dragListeners?: DraggableSyntheticListeners;
  dragAttributes?: DraggableAttributes;
}

// Memoized card. Card actions come from the board through context, so columns never forward them
// and memo holds on the small prop set (app + drag wiring). The card carries its app to each action.
function ApplicationCardInner({ app, dragListeners, dragAttributes }: ApplicationCardProps) {
  const { move, markTerminal, edit, remove } = useApplicationActions();
  const moveTargets = ACTIVE_STATUSES.filter((status) => status !== app.status);

  return (
    <Card className="relative cursor-default select-none">
      <div
        className="absolute left-1 top-3 cursor-grab touch-none rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="drag handle"
        {...dragListeners}
        {...dragAttributes}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </div>
      <CardHeader className="pb-1 pl-7">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-snug">{app.company}</p>
            <p className="truncate text-xs text-muted-foreground">{app.role}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label="open menu">
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {moveTargets.length > 0 ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {moveTargets.map((status) => (
                      <DropdownMenuItem key={status} onSelect={() => move(app, status)}>
                        {STATUS_LABELS[status]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}
              <DropdownMenuSeparator />
              {TERMINAL_ACTIONS.map(({ status, label }) => (
                <DropdownMenuItem key={status} onSelect={() => markTerminal(app, status)}>
                  {label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => edit(app)}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => remove(app.id)}
                className="text-destructive focus:text-destructive"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pl-7 pt-0">
        <Badge variant="secondary" className="text-xs capitalize">
          {app.status}
        </Badge>
      </CardContent>
    </Card>
  );
}

export const ApplicationCard = React.memo(ApplicationCardInner);
ApplicationCard.displayName = 'ApplicationCard';
