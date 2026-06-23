import { z } from 'zod';
import { auditActionSchema, type AuditAction } from '@/shared/constants/audit-action';

// No server-only: the schema is plain Zod and the mapper only uses Date.toISOString(), so
// both are client-safe (e.g. a client hook parsing the JSON timeline response).

// One audit timeline event. Exposes only the fields the timeline renders - never the full
// snapshots (oldData/newData) or request metadata (ipAddress/userAgent/requestId/source).
export const auditEventResponseSchema = z.object({
  id: z.uuid(),
  action: auditActionSchema,
  diff: z.unknown().nullable(),
  createdAt: z.iso.datetime(), // ISO 8601 string - encoded at the mapper via .toISOString()
  createdBy: z.string().nullable(),
});

export type AuditEventResponse = z.infer<typeof auditEventResponseSchema>;

// Structural row shape (only the mapped columns), so this client-safe file never imports the
// server-only auditLog table. A real auditLog row is assignable to it.
interface AuditRow {
  id: string;
  action: AuditAction;
  diff: unknown;
  createdAt: Date;
  createdBy: string | null;
}

// Maps a Drizzle auditLog row to the response shape: createdAt to an ISO string, sensitive
// columns dropped.
export function mapAuditEvent(row: AuditRow): AuditEventResponse {
  return {
    id: row.id,
    action: row.action,
    diff: row.diff ?? null,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}
