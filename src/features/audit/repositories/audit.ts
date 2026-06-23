import 'server-only';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { conn } from '@/shared/lib/db/db';
import type { DbTransaction } from '@/shared/lib/db/db';
import { auditLog } from '@/shared/db/audit-log';
import { encodeCursor, decodeCursor } from '@/shared/utils/cursor/cursor';

type AuditRow = typeof auditLog.$inferSelect;

// Keyset seek predicate: rows strictly past the cursor under (createdAt, id) DESC ordering -
// earlier timestamp, or the same timestamp with a smaller id (uuid lexicographic tie-break).
function seekPastCursor(cursor: { ts: Date; id: string }) {
  return or(
    lt(auditLog.createdAt, cursor.ts),
    and(eq(auditLog.createdAt, cursor.ts), lt(auditLog.id, cursor.id)),
  );
}

export const auditRepo = {
  // One entity's timeline, keyset-ordered by (createdAt, id) DESC. The audit log is append-only,
  // so it orders on createdAt (it has no updatedAt). Fetches limit + 1 rows to detect a next page.
  async findByEntity(
    opts: { entityType: string; entityId: string; cursor?: string; limit: number },
    tx?: DbTransaction,
  ): Promise<{ rows: AuditRow[]; nextCursor: string | null; hasMore: boolean }> {
    const { entityType, entityId, cursor, limit } = opts;
    const fetchLimit = limit + 1;

    // The cursor is validated as decodable at the DTO boundary, so decoding cannot fail on API
    // input. and() ignores an undefined condition, so the no-cursor case needs no special branch.
    const conditions = [
      eq(auditLog.entityType, entityType),
      eq(auditLog.entityId, entityId),
      cursor ? seekPastCursor(decodeCursor(cursor)) : undefined,
    ];

    const rawRows = await conn(tx)
      .select()
      .from(auditLog)
      .where(and(...conditions))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(fetchLimit);

    const hasMore = rawRows.length > limit;
    const rows = hasMore ? rawRows.slice(0, limit) : rawRows;
    const lastRow = rows[rows.length - 1];
    const nextCursor =
      hasMore && lastRow ? encodeCursor({ ts: lastRow.createdAt, id: lastRow.id }) : null;

    return { rows, nextCursor, hasMore };
  },
};
