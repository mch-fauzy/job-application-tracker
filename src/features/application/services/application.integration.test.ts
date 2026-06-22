import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { applicationService } from './application';
import { applicationRepo } from '@/features/application/repositories/application';
import { db } from '@/shared/lib/db/db';
import { auditLog } from '@/shared/db/audit-log';
import { applications } from '@/features/application/db/schema';
import type { ApplicationStatus } from '@/features/application/constants/status';

// Real-DB tests. The service owns its own db.transaction, so these cannot run inside an
// outer rollback - each seeds a real row and hard-deletes it in `finally`. The audit_log
// rows are append-only and intentionally cannot be deleted.

type AppRow = Awaited<ReturnType<typeof applicationRepo.create>>;

// Seeds a row, runs the body with it, then hard-deletes the row - the create+cleanup
// skeleton lives in one place so a test can never forget cleanup.
async function withApplication(
  values: { company: string; role: string; status: ApplicationStatus },
  fn: (created: AppRow) => Promise<void>,
): Promise<void> {
  const created = await applicationRepo.create(values);
  try {
    await fn(created);
  } finally {
    await db.delete(applications).where(eq(applications.id, created.id));
  }
}

// Reads the audit rows for one entity (keeps the assertions terse).
function auditRowsFor(entityId: string) {
  return db.select().from(auditLog).where(eq(auditLog.entityId, entityId));
}

describe('applicationService.getById', () => {
  it('throws 404 for an unknown id', async () => {
    await expect(
      applicationService.getById('00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('applicationService.list', () => {
  it('returns PaginatedData with items array and meta', async () => {
    const result = await applicationService.list({ limit: 5 });
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.meta.limit).toBe('number');
    expect(typeof result.meta.hasMore).toBe('boolean');
  });
});

describe('applicationService.create - end-to-end through service', () => {
  it('defaults status to saved and writes a created audit row', async () => {
    const result = await applicationService.create({ company: 'Acme', role: 'Engineer' });
    try {
      expect(result.status).toBe('saved');

      const auditRows = await auditRowsFor(result.id);
      expect(auditRows.length).toBe(1);
      expect(auditRows[0].action).toBe('created');
      expect(auditRows[0].entityType).toBe('application');
    } finally {
      await db.delete(applications).where(eq(applications.id, result.id));
    }
  });
});

describe('applicationService.update - idempotent no-op', () => {
  it('writes NO mutation and NO audit row when patch equals current values', async () => {
    await withApplication({ company: 'Acme', role: 'Engineer', status: 'saved' }, async (created) => {
      const beforeAudit = await auditRowsFor(created.id);
      const result = await applicationService.update(created.id, { status: 'saved' });
      const afterAudit = await auditRowsFor(created.id);

      expect(result.status).toBe('saved');
      expect(afterAudit.length).toBe(beforeAudit.length); // no new row written
    });
  });

  it('writes mutation + audit row when status actually changes', async () => {
    await withApplication({ company: 'Acme', role: 'Engineer', status: 'saved' }, async (created) => {
      const beforeAudit = await auditRowsFor(created.id);
      const result = await applicationService.update(created.id, { status: 'applied' });
      const afterAudit = await auditRowsFor(created.id);

      expect(result.status).toBe('applied');
      expect(afterAudit.length).toBe(beforeAudit.length + 1);
      const auditRow = afterAudit[afterAudit.length - 1];
      expect(auditRow.action).toBe('updated');
      expect((auditRow.diff as Record<string, unknown>)?.status).toMatchObject({
        from: 'saved',
        to: 'applied',
      });
    });
  });

  it('produces a multi-field diff when company and status change together', async () => {
    await withApplication({ company: 'Acme', role: 'Engineer', status: 'saved' }, async (created) => {
      const result = await applicationService.update(created.id, {
        company: 'NewCo',
        status: 'applied',
      });
      expect(result.company).toBe('NewCo');
      expect(result.status).toBe('applied');

      const auditRows = await auditRowsFor(created.id);
      const updatedRow = auditRows.find((r) => r.action === 'updated');
      expect(updatedRow).toBeDefined();

      const diff = updatedRow!.diff as Record<string, { from: unknown; to: unknown }>;
      expect(diff.company).toMatchObject({ from: 'Acme', to: 'NewCo' });
      expect(diff.status).toMatchObject({ from: 'saved', to: 'applied' });
    });
  });

  it('throws 404 when id does not exist', async () => {
    await expect(
      applicationService.update('00000000-0000-0000-0000-000000000000', { status: 'applied' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('applicationService.remove', () => {
  it('soft-deletes the row and writes a deleted audit row', async () => {
    await withApplication({ company: 'DeleteMe', role: 'Eng', status: 'saved' }, async (created) => {
      const result = await applicationService.remove(created.id);
      expect(result.id).toBe(created.id);

      const gone = await applicationRepo.findById(created.id);
      expect(gone).toBeUndefined();

      const auditRows = await auditRowsFor(created.id);
      expect(auditRows.some((r) => r.action === 'deleted')).toBe(true);
    });
  });

  it('throws 404 when id does not exist', async () => {
    await expect(
      applicationService.remove('00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ status: 404 });
  });
});
