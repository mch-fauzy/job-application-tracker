import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '@/shared/lib/db/db';
import { applications } from '../db/schema';
import { applicationRepo } from './application';

// Regression for the keyset precision bug: a single bulk insert gives every row the SAME
// `now()` timestamp. With microsecond columns + a millisecond cursor, the rows tied with the
// page-boundary timestamp were silently dropped. timestamptz(3) makes the cursor tie-break exact.
const MARK = `keyset-test-${randomUUID()}`;
const TOTAL = 25; // > the page limit, so the tie spans a page boundary

describe('applicationRepo.findMany keyset pagination', () => {
  afterAll(async () => {
    await db.delete(applications).where(sql`company = ${MARK}`);
  });

  it('returns every row when many share the same updatedAt (no boundary drop)', async () => {
    // One statement -> all rows share a single now() timestamp: the exact bug trigger.
    await db.insert(applications).values(
      Array.from({ length: TOTAL }, () => ({ company: MARK, role: 'Engineer', status: 'saved' as const })),
    );

    const seen = new Set<string>();
    let cursor: string | undefined;
    // Walk every keyset page; collect only our marked rows (other 'saved' rows are irrelevant).
    for (let guard = 0; guard < 100; guard++) {
      const page = await applicationRepo.findMany({ status: 'saved', cursor, limit: 20 });
      for (const row of page.rows) if (row.company === MARK) seen.add(row.id);
      if (!page.hasMore || !page.nextCursor) break;
      cursor = page.nextCursor;
    }

    expect(seen.size).toBe(TOTAL);
  });
});
