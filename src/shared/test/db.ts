import { db } from '@/shared/lib/db/db';
import type { DbTransaction } from '@/shared/lib/db/db';

// Sentinel error used to force a transaction rollback once the test body is done.
class Rollback extends Error {}

// Runs fn inside a transaction that ALWAYS rolls back, so DB-backed tests leave no
// residue and never need to DELETE from the append-only audit_log.
export async function withRollback(fn: (tx: DbTransaction) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}
