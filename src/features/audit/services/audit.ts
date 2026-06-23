import 'server-only';
import { auditRepo } from '@/features/audit/repositories/audit';
import { mapAuditEvent, type AuditEventResponse } from '@/features/audit/dtos/v1/responses/audit';
import type { ListAuditQuery } from '@/features/audit/dtos/v1/requests/audit';
import type { PaginatedData } from '@/shared/types/response';

// Read-only timeline query. Pure read (no transaction needed): fetch one entity's page from the
// repository, map each row to the response shape, and assemble the keyset paginated envelope.
async function listTimeline(query: ListAuditQuery): Promise<PaginatedData<AuditEventResponse>> {
  const { rows, nextCursor, hasMore } = await auditRepo.findByEntity({
    entityType: query.entityType,
    entityId: query.entityId,
    cursor: query.cursor,
    limit: query.limit,
  });

  return {
    items: rows.map(mapAuditEvent),
    meta: { limit: query.limit, nextCursor, hasMore },
  };
}

export const auditService = { listTimeline };
