import { describe, it, expect } from 'vitest';
import { auditLog } from '@/shared/db/audit-log';
import { db } from '@/shared/lib/db/db';
import { auditService } from './audit';

// Real-DB tests. listTimeline reads through the pool (no injected tx), so rows are seeded as
// committed inserts under a random entityId. They are append-only and intentionally not
// deleted - the random entityId never collides and the volume is negligible.

describe('auditService.listTimeline', () => {
  it('returns a PaginatedData envelope with mapped AuditEventResponse items', async () => {
    const entityId = crypto.randomUUID();
    await db.insert(auditLog).values({
      entityType: 'application',
      entityId,
      action: 'created',
      diff: null,
      oldData: null,
      newData: { company: 'Acme', role: 'Engineer', status: 'saved' },
    });

    const result = await auditService.listTimeline({ entityType: 'application', entityId, limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].action).toBe('created');
    expect(result.items[0].diff).toBeNull();
    expect(typeof result.items[0].createdAt).toBe('string'); // ISO string
    // Sensitive fields must not be present.
    expect('oldData' in result.items[0]).toBe(false);
    expect('newData' in result.items[0]).toBe(false);
  });

  it('builds meta with limit, nextCursor, and hasMore', async () => {
    const entityId = crypto.randomUUID();
    await db.insert(auditLog).values([
      { entityType: 'application', entityId, action: 'created', createdAt: new Date('2024-01-01T08:00:00Z') },
      { entityType: 'application', entityId, action: 'updated', createdAt: new Date('2024-01-01T09:00:00Z') },
      { entityType: 'application', entityId, action: 'updated', createdAt: new Date('2024-01-01T10:00:00Z') },
    ]);

    const result = await auditService.listTimeline({ entityType: 'application', entityId, limit: 2 });

    expect(result.meta.limit).toBe(2);
    expect(result.meta.hasMore).toBe(true);
    expect(result.meta.nextCursor).not.toBeNull();
  });

  it('maps a status-change diff { status: { from, to } } through to the response item', async () => {
    const entityId = crypto.randomUUID();
    await db.insert(auditLog).values({
      entityType: 'application',
      entityId,
      action: 'updated',
      diff: { status: { from: 'saved', to: 'applied' } },
      oldData: { status: 'saved' },
      newData: { status: 'applied' },
    });

    const result = await auditService.listTimeline({ entityType: 'application', entityId, limit: 20 });

    expect(result.items[0].diff).toEqual({ status: { from: 'saved', to: 'applied' } });
  });

  it('returns empty items and hasMore false when no rows exist', async () => {
    const result = await auditService.listTimeline({
      entityType: 'application',
      entityId: crypto.randomUUID(),
      limit: 20,
    });

    expect(result.items).toHaveLength(0);
    expect(result.meta.hasMore).toBe(false);
    expect(result.meta.nextCursor).toBeNull();
  });
});
