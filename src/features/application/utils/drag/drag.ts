import type { Active, DragEndEvent } from '@dnd-kit/core';
import type { ApplicationResponse } from '../../dtos/v1/responses/application';
import type { ApplicationStatus } from '../../constants/status';

export interface DragMove {
  app: ApplicationResponse;
  toStatus: ApplicationStatus;
}

// dnd-kit types draggable data loosely, so read our card from the active item here.
export function dragApp(active: Active): ApplicationResponse | undefined {
  return active.data.current?.app as ApplicationResponse | undefined;
}

// Interpret a drag-end event into a status move, or null when not actionable: dropped
// outside a column, missing card data, or dropped in its own column. Each column is a
// droppable whose id is its status, so over.id is the target status.
export function resolveDragMove(event: DragEndEvent): DragMove | null {
  const { active, over } = event;
  if (!over) return null;
  const app = dragApp(active);
  if (!app) return null;
  const toStatus = over.id as ApplicationStatus;
  if (app.status === toStatus) return null;
  return { app, toStatus };
}
