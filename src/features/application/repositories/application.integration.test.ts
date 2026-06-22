import { describe, it, expect } from 'vitest';
import { applicationRepo } from './application';
import { withRollback } from '@/shared/test/db';
import { TERMINAL_STATUSES } from '@/features/application/constants/status';

// Real-DB tests. Each runs inside a transaction that always rolls back (withRollback),
// so they leave no residue and never need to touch the append-only audit_log.

describe('applicationRepo', () => {
  describe('create', () => {
    it('inserts a row and returns it with all base columns', async () => {
      await withRollback(async (tx) => {
        const row = await applicationRepo.create(
          { company: 'Acme', role: 'Software Engineer', status: 'saved' },
          tx,
        );
        expect(row.id).toBeTruthy();
        expect(row.company).toBe('Acme');
        expect(row.role).toBe('Software Engineer');
        expect(row.status).toBe('saved');
        expect(row.deletedAt).toBeNull();
        expect(row.createdAt).toBeInstanceOf(Date);
      });
    });

    it('stores jobUrl and notes when provided', async () => {
      await withRollback(async (tx) => {
        const row = await applicationRepo.create(
          { company: 'Acme', role: 'Engineer', status: 'saved', jobUrl: 'https://acme.com', notes: 'via referral' },
          tx,
        );
        expect(row.jobUrl).toBe('https://acme.com');
        expect(row.notes).toBe('via referral');
      });
    });
  });

  describe('findById', () => {
    it('returns the row when it exists', async () => {
      await withRollback(async (tx) => {
        const created = await applicationRepo.create(
          { company: 'Acme', role: 'Engineer', status: 'saved' },
          tx,
        );
        const found = await applicationRepo.findById(created.id, tx);
        expect(found?.id).toBe(created.id);
      });
    });

    it('returns undefined for an unknown id', async () => {
      await withRollback(async (tx) => {
        const found = await applicationRepo.findById('00000000-0000-0000-0000-000000000000', tx);
        expect(found).toBeUndefined();
      });
    });

    it('returns undefined for a soft-deleted row', async () => {
      await withRollback(async (tx) => {
        const created = await applicationRepo.create(
          { company: 'Acme', role: 'Engineer', status: 'saved' },
          tx,
        );
        await applicationRepo.softDelete(created.id, null, tx);
        const found = await applicationRepo.findById(created.id, tx);
        expect(found).toBeUndefined();
      });
    });
  });

  describe('findMany', () => {
    it('returns rows matching a status filter', async () => {
      await withRollback(async (tx) => {
        await applicationRepo.create({ company: 'A', role: 'Eng', status: 'applied' }, tx);
        await applicationRepo.create({ company: 'B', role: 'Eng', status: 'saved' }, tx);
        const result = await applicationRepo.findMany({ status: 'applied', limit: 20 }, tx);
        expect(result.rows.every((r) => r.status === 'applied')).toBe(true);
        expect(result.rows.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('returns archived (terminal) rows when archived=true', async () => {
      await withRollback(async (tx) => {
        await applicationRepo.create({ company: 'A', role: 'Eng', status: 'rejected' }, tx);
        await applicationRepo.create({ company: 'B', role: 'Eng', status: 'saved' }, tx);
        const result = await applicationRepo.findMany({ archived: true, limit: 20 }, tx);
        const statuses = new Set(result.rows.map((r) => r.status));
        expect(TERMINAL_STATUSES.some((s) => statuses.has(s))).toBe(true);
        expect(statuses.has('saved')).toBe(false);
      });
    });

    it('excludes soft-deleted rows', async () => {
      await withRollback(async (tx) => {
        const row = await applicationRepo.create({ company: 'Del', role: 'Eng', status: 'saved' }, tx);
        await applicationRepo.softDelete(row.id, null, tx);
        const result = await applicationRepo.findMany({ status: 'saved', limit: 20 }, tx);
        expect(result.rows.find((r) => r.id === row.id)).toBeUndefined();
      });
    });

    it('paginates by keyset: hasMore + nextCursor advance to the next page', async () => {
      await withRollback(async (tx) => {
        // Seed 3 rows with the same status so this page has >limit rows of our own data.
        const created = [];
        for (let i = 0; i < 3; i++) {
          created.push(await applicationRepo.create({ company: `Co${i}`, role: 'Eng', status: 'withdrawn' }, tx));
        }
        const page1 = await applicationRepo.findMany({ status: 'withdrawn', limit: 2 }, tx);
        expect(page1.rows.length).toBe(2);
        expect(page1.hasMore).toBe(true);
        expect(typeof page1.nextCursor).toBe('string');

        const page2 = await applicationRepo.findMany(
          { status: 'withdrawn', limit: 2, cursor: page1.nextCursor! },
          tx,
        );
        // The cursor must not repeat any page-1 row.
        const page1Ids = new Set(page1.rows.map((r) => r.id));
        expect(page2.rows.every((r) => !page1Ids.has(r.id))).toBe(true);
      });
    });
  });

  describe('update', () => {
    it('updates fields and returns the new row', async () => {
      await withRollback(async (tx) => {
        const created = await applicationRepo.create({ company: 'Acme', role: 'Eng', status: 'saved' }, tx);
        const updated = await applicationRepo.update(created.id, { status: 'applied', company: 'NewCo' }, tx);
        expect(updated.status).toBe('applied');
        expect(updated.company).toBe('NewCo');
      });
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt and deletedBy', async () => {
      await withRollback(async (tx) => {
        const created = await applicationRepo.create({ company: 'Acme', role: 'Eng', status: 'saved' }, tx);
        const deleted = await applicationRepo.softDelete(created.id, 'test-actor', tx);
        expect(deleted.deletedAt).toBeInstanceOf(Date);
        expect(deleted.deletedBy).toBe('test-actor');
      });
    });
  });
});
