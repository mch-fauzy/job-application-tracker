import { describe, it, expect } from 'vitest';
import { auditLog } from '@/shared/db/audit-log';
import { withRollback } from '@/shared/test/db';
import { auditRepo } from './audit';

describe('auditRepo.findByEntity', () => {
  it('returns rows in createdAt DESC order', async () => {
    await withRollback(async (tx) => {
      const entityId = crypto.randomUUID();
      await tx.insert(auditLog).values([
        { entityType: 'application', entityId, action: 'created', createdAt: new Date('2024-01-01T08:00:00Z') },
        { entityType: 'application', entityId, action: 'updated', createdAt: new Date('2024-01-01T09:00:00Z') },
        { entityType: 'application', entityId, action: 'updated', createdAt: new Date('2024-01-01T10:00:00Z') },
      ]);

      const result = await auditRepo.findByEntity({ entityType: 'application', entityId, limit: 20 }, tx);

      expect(result.rows).toHaveLength(3);
      // Most recent first.
      expect(result.rows[0].createdAt.getTime()).toBeGreaterThan(result.rows[1].createdAt.getTime());
      expect(result.rows[1].createdAt.getTime()).toBeGreaterThan(result.rows[2].createdAt.getTime());
    });
  });

  it('returns only rows for the specified entityId', async () => {
    await withRollback(async (tx) => {
      const entityIdA = crypto.randomUUID();
      const entityIdB = crypto.randomUUID();
      await tx.insert(auditLog).values([
        { entityType: 'application', entityId: entityIdA, action: 'created' },
        { entityType: 'application', entityId: entityIdB, action: 'created' },
      ]);

      const result = await auditRepo.findByEntity({ entityType: 'application', entityId: entityIdA, limit: 20 }, tx);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].entityId).toBe(entityIdA);
    });
  });

  it('sets hasMore false and nextCursor null when total rows <= limit', async () => {
    await withRollback(async (tx) => {
      const entityId = crypto.randomUUID();
      await tx.insert(auditLog).values({ entityType: 'application', entityId, action: 'created' });

      const result = await auditRepo.findByEntity({ entityType: 'application', entityId, limit: 20 }, tx);

      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });
  });

  it('sets hasMore true and returns a nextCursor when there is a next page', async () => {
    await withRollback(async (tx) => {
      const entityId = crypto.randomUUID();
      await tx.insert(auditLog).values([
        { entityType: 'application', entityId, action: 'created', createdAt: new Date('2024-01-01T08:00:00Z') },
        { entityType: 'application', entityId, action: 'updated', createdAt: new Date('2024-01-01T09:00:00Z') },
        { entityType: 'application', entityId, action: 'updated', createdAt: new Date('2024-01-01T10:00:00Z') },
      ]);

      const page1 = await auditRepo.findByEntity({ entityType: 'application', entityId, limit: 2 }, tx);

      expect(page1.rows).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();
    });
  });

  it('paginates correctly across a cursor boundary with no duplicates', async () => {
    await withRollback(async (tx) => {
      const entityId = crypto.randomUUID();
      await tx.insert(auditLog).values([
        { entityType: 'application', entityId, action: 'created', createdAt: new Date('2024-01-01T08:00:00Z') },
        { entityType: 'application', entityId, action: 'updated', createdAt: new Date('2024-01-01T09:00:00Z') },
        { entityType: 'application', entityId, action: 'updated', createdAt: new Date('2024-01-01T10:00:00Z') },
      ]);

      const page1 = await auditRepo.findByEntity({ entityType: 'application', entityId, limit: 2 }, tx);
      expect(page1.rows).toHaveLength(2);
      expect(page1.hasMore).toBe(true);

      const page2 = await auditRepo.findByEntity(
        { entityType: 'application', entityId, limit: 2, cursor: page1.nextCursor! },
        tx,
      );
      expect(page2.rows).toHaveLength(1);
      expect(page2.hasMore).toBe(false);
      expect(page2.nextCursor).toBeNull();

      // The two pages together cover all 3 rows with no duplicates.
      const allIds = [...page1.rows.map((r) => r.id), ...page2.rows.map((r) => r.id)];
      expect(new Set(allIds).size).toBe(3);
    });
  });

  it('paginates across rows sharing an identical createdAt via the id tie-break', async () => {
    await withRollback(async (tx) => {
      const entityId = crypto.randomUUID();
      // All three rows share the exact same createdAt, so paging cannot rely on the timestamp
      // and must fall through to the (createdAt = ts AND id < cursorId) tie-break branch.
      const sameTime = new Date('2024-02-02T12:00:00Z');
      await tx.insert(auditLog).values([
        { entityType: 'application', entityId, action: 'created', createdAt: sameTime },
        { entityType: 'application', entityId, action: 'updated', createdAt: sameTime },
        { entityType: 'application', entityId, action: 'deleted', createdAt: sameTime },
      ]);

      const page1 = await auditRepo.findByEntity({ entityType: 'application', entityId, limit: 2 }, tx);
      expect(page1.rows).toHaveLength(2);
      expect(page1.hasMore).toBe(true);

      const page2 = await auditRepo.findByEntity(
        { entityType: 'application', entityId, limit: 2, cursor: page1.nextCursor! },
        tx,
      );
      expect(page2.rows).toHaveLength(1);
      expect(page2.hasMore).toBe(false);

      // No skip or duplicate across the tie-break boundary, and within one timestamp the rows come
      // back in id DESC order (uuid canonical string order matches Postgres uuid byte order).
      const ordered = [...page1.rows, ...page2.rows].map((r) => r.id);
      expect(new Set(ordered).size).toBe(3);
      expect(ordered).toEqual([...ordered].sort().reverse());
    });
  });

  it('returns an empty result for an unknown entityId', async () => {
    await withRollback(async (tx) => {
      const result = await auditRepo.findByEntity(
        { entityType: 'application', entityId: crypto.randomUUID(), limit: 20 },
        tx,
      );
      expect(result.rows).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });
  });
});
