import { describe, it, expect } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { auditLog } from './audit-log';
import { withRollback } from '@/shared/test/db';

describe('audit_log immutability', () => {
  it('rejects UPDATE on an audit row', async () => {
    await withRollback(async (tx) => {
      const [row] = await tx
        .insert(auditLog)
        .values({ entityType: 'application', entityId: crypto.randomUUID(), action: 'created' })
        .returning();
      await expect(
        tx.update(auditLog).set({ action: 'updated' }).where(eq(auditLog.id, row.id)),
      ).rejects.toThrow();
    });
  });

  it('rejects DELETE on an audit row', async () => {
    await withRollback(async (tx) => {
      const [row] = await tx
        .insert(auditLog)
        .values({ entityType: 'application', entityId: crypto.randomUUID(), action: 'created' })
        .returning();
      await expect(
        tx.delete(auditLog).where(eq(auditLog.id, row.id)),
      ).rejects.toThrow();
    });
  });

  it('rejects TRUNCATE on the audit table', async () => {
    await withRollback(async (tx) => {
      await expect(tx.execute(sql`TRUNCATE ${auditLog}`)).rejects.toThrow();
    });
  });
});
