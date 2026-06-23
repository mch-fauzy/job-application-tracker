import { describe, it, expect } from 'vitest';
import type { DragEndEvent } from '@dnd-kit/core';
import { resolveDragMove } from './drag';
import type { ApplicationResponse } from '../../dtos/v1/responses/application';

const app: ApplicationResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  company: 'Acme',
  role: 'Engineer',
  status: 'saved',
  jobUrl: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// Minimal stand-in for a dnd-kit drag-end event: resolveDragMove only reads
// active.data.current.app and over.id.
function dragEnd(overId: string | null, current?: { app: ApplicationResponse }): DragEndEvent {
  return {
    active: { id: app.id, data: { current } },
    over: overId ? { id: overId } : null,
  } as unknown as DragEndEvent;
}

describe('resolveDragMove', () => {
  it('returns the move when a card is dropped on a different column', () => {
    expect(resolveDragMove(dragEnd('applied', { app }))).toEqual({ app, toStatus: 'applied' });
  });

  it('returns null when dropped outside any column (no over target)', () => {
    expect(resolveDragMove(dragEnd(null, { app }))).toBeNull();
  });

  it('returns null when the drag carries no app data', () => {
    expect(resolveDragMove(dragEnd('applied', undefined))).toBeNull();
  });

  it('returns null when dropped in the card own column (no-op)', () => {
    expect(resolveDragMove(dragEnd('saved', { app }))).toBeNull();
  });
});
