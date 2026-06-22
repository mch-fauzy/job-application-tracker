// No server-only here: this is pure table metadata (no secrets/queries) and
// drizzle-kit must import it. The connection + queries live in server-only files.
import { pgTable, uuid, text, jsonb, inet, index } from 'drizzle-orm/pg-core';
import { idColumn, createdColumns } from '@/shared/db/base-columns';

// Generic, append-only audit table. One row per mutation, written in the same
// transaction as the mutation. Immutable at the DB level (trigger + REVOKE).
// Reuses identity + creation columns - deliberately omits update/delete tracking.
export const auditLog = pgTable(
  'audit_log',
  {
    ...idColumn,
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    action: text('action').notNull(), // created | updated | deleted
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
    index('audit_entity_idx').on(t.entityType, t.entityId, t.createdAt.desc()),
    index('audit_created_at_idx').on(t.createdAt),
    index('audit_created_by_idx').on(t.createdBy),
  ],
);
