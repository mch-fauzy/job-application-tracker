import { describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { auditLog } from '@/shared/db/audit-log';
import { recordAudit } from './audit';
import { withRollback } from '@/shared/test/db';

describe('recordAudit', () => {
  it('writes an audit row inside the transaction', async () => {
    const entityId = crypto.randomUUID();
    await withRollback(async (tx) => {
      await recordAudit(tx, {
        entityType: 'application',
        entityId,
        action: 'updated',
        oldData: { status: 'saved' },
        newData: { status: 'applied' },
        diff: { status: { from: 'saved', to: 'applied' } },
      });
      const rows = await tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.entityType, 'application'), eq(auditLog.entityId, entityId)));
      expect(rows).toHaveLength(1);
      expect(rows[0].action).toBe('updated');
      expect(rows[0].diff).toEqual({ status: { from: 'saved', to: 'applied' } });
      expect(rows[0].createdBy).toBeNull();
    });
  });
});
