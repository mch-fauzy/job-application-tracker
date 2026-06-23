// No server-only here: pure column metadata imported by drizzle-kit. The
// connection + queries live in server-only files (shared/lib/db.ts, etc.).
import { uuid, timestamp, text } from 'drizzle-orm/pg-core';

// Composable column groups spread into tables (Drizzle has no table inheritance).
// *By columns are actor attribution, nullable until auth lands.

// uuid primary key, shared by every table including the append-only audit log.
export const idColumn = {
  id: uuid('id').defaultRandom().primaryKey(),
};

// Timestamps are pinned to millisecond precision (timestamptz(3)).
const TIMESTAMP_MS = { withTimezone: true, mode: 'date', precision: 3 } as const;

// Creation tracking, shared by mutable entities AND the immutable audit log.
export const createdColumns = {
  createdAt: timestamp('created_at', TIMESTAMP_MS).defaultNow().notNull(),
  createdBy: text('created_by'), // actor, null until auth
};

// Update tracking, only for MUTABLE entities (never the append-only audit log,
// whose rows are immutable - an updatedAt there would contradict the trigger).
// Internal: only composed into baseColumns below.
const updatedColumns = {
  updatedAt: timestamp('updated_at', TIMESTAMP_MS)
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  updatedBy: text('updated_by'), // actor, null until auth
};

// Full base set spread into each entity table.
export const baseColumns = { ...idColumn, ...createdColumns, ...updatedColumns };

// Columns spread only into tables that soft-delete.
export const softDelete = {
  deletedAt: timestamp('deleted_at', TIMESTAMP_MS),
  deletedBy: text('deleted_by'), // actor, null until auth
};
