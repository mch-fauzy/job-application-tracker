import 'server-only';
import { and, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/shared/lib/db/db';
import type { DbTransaction } from '@/shared/lib/db/db';
import { applications } from '@/features/application/db/schema';
import { TERMINAL_STATUSES, type ApplicationStatus } from '@/features/application/constants/status';
import { encodeCursor, decodeCursor } from '@/shared/utils/cursor/cursor';

type AppRow = typeof applications.$inferSelect;
type Conn = DbTransaction | typeof db;

// Run against the passed transaction, or the pool when none is given.
function conn(tx?: DbTransaction): Conn {
  return tx ?? db;
}

export const applicationRepo = {
  async findById(id: string, tx?: DbTransaction): Promise<AppRow | undefined> {
    const rows = await conn(tx)
      .select()
      .from(applications)
      .where(and(eq(applications.id, id), isNull(applications.deletedAt)));
    return rows[0];
  },

  async findMany(
    opts: { status?: ApplicationStatus; archived?: boolean; cursor?: string; limit: number },
    tx?: DbTransaction,
  ): Promise<{ rows: AppRow[]; nextCursor: string | null; hasMore: boolean }> {
    const { status, archived, cursor, limit } = opts;
    // Fetch one extra row to detect whether a further page exists.
    const fetchLimit = limit + 1;

    const conditions = [isNull(applications.deletedAt)];

    if (archived) {
      conditions.push(inArray(applications.status, [...TERMINAL_STATUSES]));
    } else if (status !== undefined) {
      conditions.push(eq(applications.status, status));
    }

    if (cursor) {
      // Keyset seek: rows strictly after (updatedAt, id) under DESC ordering. The cursor is
      // validated as decodable at the DTO boundary, so decoding here cannot fail on API input.
      const { ts, id } = decodeCursor(cursor);
      conditions.push(
        or(
          lt(applications.updatedAt, ts),
          and(eq(applications.updatedAt, ts), lt(applications.id, id)),
        )!,
      );
    }

    const rawRows = await conn(tx)
      .select()
      .from(applications)
      .where(and(...conditions))
      .orderBy(desc(applications.updatedAt), desc(applications.id))
      .limit(fetchLimit);

    const hasMore = rawRows.length > limit;
    const rows = hasMore ? rawRows.slice(0, limit) : rawRows;
    const lastRow = rows[rows.length - 1];
    const nextCursor =
      hasMore && lastRow ? encodeCursor({ ts: lastRow.updatedAt, id: lastRow.id }) : null;

    return { rows, nextCursor, hasMore };
  },

  async create(
    values: {
      company: string;
      role: string;
      status: ApplicationStatus;
      jobUrl?: string | null;
      notes?: string | null;
    },
    tx?: DbTransaction,
  ): Promise<AppRow> {
    const [row] = await conn(tx)
      .insert(applications)
      .values({
        company: values.company,
        role: values.role,
        status: values.status,
        jobUrl: values.jobUrl ?? null,
        notes: values.notes ?? null,
      })
      .returning();
    return row;
  },

  async update(
    id: string,
    patch: {
      company?: string;
      role?: string;
      status?: ApplicationStatus;
      jobUrl?: string | null;
      notes?: string | null;
    },
    tx?: DbTransaction,
  ): Promise<AppRow> {
    // Only set keys the caller provided. `in` checks let an explicit null clear jobUrl/notes.
    const [row] = await conn(tx)
      .update(applications)
      .set({
        ...(patch.company !== undefined ? { company: patch.company } : {}),
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...('jobUrl' in patch ? { jobUrl: patch.jobUrl } : {}),
        ...('notes' in patch ? { notes: patch.notes } : {}),
      })
      .where(and(eq(applications.id, id), isNull(applications.deletedAt)))
      .returning();
    return row;
  },

  async softDelete(id: string, actor?: string | null, tx?: DbTransaction): Promise<AppRow> {
    const [row] = await conn(tx)
      .update(applications)
      .set({ deletedAt: new Date(), deletedBy: actor ?? null })
      .where(and(eq(applications.id, id), isNull(applications.deletedAt)))
      .returning();
    return row;
  },
};
