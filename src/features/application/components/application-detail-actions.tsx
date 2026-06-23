'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Loader2Icon } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { ACTIVE_STATUSES, isTerminalStatus } from '../constants/status';
import type { ApplicationStatus } from '../constants/status';
import { STATUS_LABELS, TERMINAL_ACTIONS } from '../constants/labels';
import { useUpdateApplication, useDeleteApplication } from '../hooks/use-application-mutations';
import { EditApplicationDialog } from './edit-application-dialog';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

interface StatusItemsProps {
  onSelect: (status: ApplicationStatus) => void;
}

// Terminal-app variant: reopen the application to one of the active statuses.
function ReopenStatusItems({ onSelect }: StatusItemsProps) {
  return (
    <>
      <DropdownMenuLabel>Reopen to</DropdownMenuLabel>
      {ACTIVE_STATUSES.map((status) => (
        <DropdownMenuItem key={status} onSelect={() => onSelect(status)}>
          {STATUS_LABELS[status]}
        </DropdownMenuItem>
      ))}
    </>
  );
}

interface MoveStatusItemsProps extends StatusItemsProps {
  currentStatus: ApplicationStatus;
}

// Active-app variant: move to another active status, or mark the application terminal.
function MoveStatusItems({ currentStatus, onSelect }: MoveStatusItemsProps) {
  const moveTargets = ACTIVE_STATUSES.filter((status) => status !== currentStatus);
  return (
    <>
      <DropdownMenuLabel>Move to</DropdownMenuLabel>
      {moveTargets.map((status) => (
        <DropdownMenuItem key={status} onSelect={() => onSelect(status)}>
          {STATUS_LABELS[status]}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      {TERMINAL_ACTIONS.map(({ status, label }) => (
        <DropdownMenuItem key={status} onSelect={() => onSelect(status)}>
          {label}
        </DropdownMenuItem>
      ))}
    </>
  );
}

interface ApplicationDetailActionsProps {
  application: ApplicationResponse;
}

// Detail-page actions. Status changes and edits reuse useUpdateApplication (the generic PATCH),
// which invalidates every applications query - including this detail - so the view refetches the
// confirmed state. Pessimistic by design: a detail view is a deliberate context, not a drag.
export function ApplicationDetailActions({ application }: ApplicationDetailActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const { mutate: update, isPending } = useUpdateApplication();
  const deleteApplication = useDeleteApplication();

  const isTerminal = isTerminalStatus(application.status);

  function changeStatus(status: ApplicationStatus) {
    update({ id: application.id, data: { status } });
  }

  // Delete reuses the board's undo-and-defer handler, then returns to the board where the Undo
  // toast lives. A single delete code path keeps behavior consistent across surfaces.
  function handleDelete() {
    deleteApplication(application.id);
    router.push('/');
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        Edit
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2Icon className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              <>
                Change status
                <ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        {/* Explicit variant per pipeline phase: a terminal app reopens, an active app moves on. */}
        <DropdownMenuContent align="start">
          {isTerminal ? (
            <ReopenStatusItems onSelect={changeStatus} />
          ) : (
            <MoveStatusItems currentStatus={application.status} onSelect={changeStatus} />
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleDelete}
        className="text-destructive hover:text-destructive"
      >
        Delete
      </Button>

      <EditApplicationDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        application={application}
      />
    </div>
  );
}
