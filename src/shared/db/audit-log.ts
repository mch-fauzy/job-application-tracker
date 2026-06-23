// No server-only here: this is pure table metadata (no secrets/queries) and
// drizzle-kit must import it. The connection + queries live in server-only files.
import { pgTable, uuid, text, jsonb, inet, index } from 'drizzle-orm/pg-core';
import { idColumn, createdColumns } from '@/shared/db/base-columns';
import type { AuditAction } from '@/shared/constants/audit-action';

// Generic, append-only audit table. One row per mutation, written in the same
// transaction as the mutation. Immutable at the DB level (trigger + REVOKE).
// Reuses identity + creation columns - deliberately omits update/delete tracking.
export const auditLog = pgTable(
  'audit_log',
  {
    ...idColumn,
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    // Branded with the AuditAction union so $inferSelect/$inferInsert carry the narrow type
    // end-to-end. $type is compile-time only - the column stays `text`, no migration.
    action: text('action').$type<AuditAction>().notNull(), // created | updated | deleted
    ...createdColumns, // createdAt + createdBy (shared, append-only - no update tracking)
    oldData: jsonb('old_data'),
    newData: jsonb('new_data'),
    diff: jsonb('diff'),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
    source: text('source'),
  },
  (t) => [
    // id is DESC to complete the (createdAt, id) DESC keyset sort key, so the cursor tie-break
    // is fully index-covered and needs no extra sort.
    index('audit_entity_idx').on(t.entityType, t.entityId, t.createdAt.desc(), t.id.desc()),
    index('audit_created_at_idx').on(t.createdAt),
    index('audit_created_by_idx').on(t.createdBy),
  ],
);
