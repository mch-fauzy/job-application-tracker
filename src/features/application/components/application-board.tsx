'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { ACTIVE_STATUSES } from '../constants/status';
import type { ApplicationResponse } from '../dtos/v1/responses/application';
import { dragApp, resolveDragMove } from '../utils/drag/drag';
import { useDeleteApplication } from '../hooks/use-application-mutations';
import { useMoveApplication } from '../hooks/use-move-application';
import {
  ApplicationActionsProvider,
  type ApplicationActions,
} from '../contexts/application-actions';
import { ApplicationColumn } from './application-column';
import { ApplicationCard } from './application-card';
import { CreateApplicationDialog } from './create-application-dialog';
import { EditApplicationDialog } from './edit-application-dialog';

// Pointer-based collision: the column under the cursor is the drop target, so a drop registers as
// soon as the pointer enters a column (symmetric in every direction), instead of dnd-kit's default
// rect-overlap which needs the card dragged past a column's midpoint. Falls back to rect
// intersection for keyboard dragging, which has no pointer coordinates.
const boardCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
};

export function ApplicationBoard() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editApp, setEditApp] = useState<ApplicationResponse | null>(null);
  const [activeApp, setActiveApp] = useState<ApplicationResponse | null>(null);

  const deleteApplication = useDeleteApplication();
  // Pull the stable mutate function, not the whole mutation object: useMutation returns a fresh
  // result object each render, so depending on it would rebuild the actions context value every
  // render and re-render every card. mutate keeps a stable identity, so the context value stays put.
  const { mutate: moveApplication } = useMoveApplication();

  // 8px activation distance so a click on a card menu is not read as a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveApp(dragApp(event.active) ?? null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveApp(null);
      const move = resolveDragMove(event);
      if (move) moveApplication(move);
    },
    [moveApplication],
  );

  // Card actions, provided once via context so columns never forward handlers. Mark terminal is an
  // optimistic status move: the card leaves its active column at once (the move hook removes it from
  // the source column and rolls back on error), then surfaces in Archived after the refetch.
  const actions = useMemo<ApplicationActions>(
    () => ({
      move: (app, toStatus) => moveApplication({ app, toStatus }),
      markTerminal: (app, terminalStatus) => moveApplication({ app, toStatus: terminalStatus }),
      edit: (app) => setEditApp(app),
      remove: (id) => deleteApplication(id),
    }),
    [moveApplication, deleteApplication],
  );

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-xl font-bold">Applications</h1>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          New Application
        </Button>
      </div>

      <ApplicationActionsProvider actions={actions}>
        <DndContext
          // Stable id so dnd-kit's aria-describedby is deterministic across server and client.
          // Without it dnd-kit falls back to a module counter that drifts on the long-lived
          // server, causing a hydration mismatch on the drag handle.
          id="application-board"
          sensors={sensors}
          collisionDetection={boardCollisionDetection}
          measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-2">
            {ACTIVE_STATUSES.map((status) => (
              <ApplicationColumn key={status} status={status} />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeApp ? <ApplicationCard app={activeApp} /> : null}
          </DragOverlay>
        </DndContext>
      </ApplicationActionsProvider>

      <CreateApplicationDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editApp !== null ? (
        <EditApplicationDialog
          open
          onOpenChange={(open) => {
            if (!open) setEditApp(null);
          }}
          application={editApp}
        />
      ) : null}
    </div>
  );
}
