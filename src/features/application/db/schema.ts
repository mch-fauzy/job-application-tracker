// NOT server-only: drizzle-kit imports this directly for migrations, and server-only
// throws outside an RSC bundler. Pure table metadata - no connection or queries here.
import { pgTable, text, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { baseColumns, softDelete } from '@/shared/db/base-columns';
import { APPLICATION_STATUS, type ApplicationStatus } from '@/features/application/constants/status';

export const applications = pgTable('applications', {
  ...baseColumns,
  ...softDelete,
  company: text('company').notNull(),
  role: text('role').notNull(),
  status: text('status').$type<ApplicationStatus>().notNull().default(APPLICATION_STATUS.SAVED),
  jobUrl: text('job_url'),
  notes: text('notes'),
}, (t) => [
  // Board columns + archived group lookups: filter by status, order by recency.
  index('applications_status_updated_at_idx').on(t.status, t.updatedAt.desc()),
  // Keyset pagination hot path - partial index skips soft-deleted rows. id is DESC to match the
  // (updatedAt, id) DESC cursor order, so the tie-break needs no extra sort.
  index('applications_active_updated_at_id_idx')
    .on(t.updatedAt.desc(), t.id.desc())
    .where(sql`${t.deletedAt} IS NULL`),
]);
