import 'server-only';
import { auditLog } from '@/shared/db/audit-log';
import type { DbTransaction } from '@/shared/lib/db/db';
import type { AuditAction } from '@/shared/constants/audit-action';
import type { EntityType } from '@/shared/constants/entity-type';

// Cross-cutting audit writer. Every feature service calls this inside its own
// transaction so the entity mutation and its audit row commit together.
interface RecordAuditParams {
  entityType: EntityType;
  entityId: string;
  action: AuditAction;
  oldData?: unknown;
  newData?: unknown;
  diff?: unknown;
  createdBy?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  source?: string | null;
}

export async function recordAudit(tx: DbTransaction, params: RecordAuditParams): Promise<void> {
  // Optional fields left undefined are omitted from the SQL - nullable columns then default to NULL.
  await tx.insert(auditLog).values(params);
}
