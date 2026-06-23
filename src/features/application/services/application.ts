import 'server-only';
import { HTTPException } from 'hono/http-exception';
import { db } from '@/shared/lib/db/db';
import { recordAudit } from '@/shared/lib/audit/audit';
import { ErrorMessageConstant } from '@/shared/constants/messages';
import type { PaginatedData } from '@/shared/types/response';
import { applicationRepo } from '@/features/application/repositories/application';
import { mapApplication } from '@/features/application/dtos/v1/responses/application';
import type { ApplicationResponse } from '@/features/application/dtos/v1/responses/application';
import type { CreateApplicationRequest } from '@/features/application/dtos/v1/requests/create-application';
import type { UpdateApplicationRequest } from '@/features/application/dtos/v1/requests/update-application';
import type { ListApplicationsQuery } from '@/features/application/dtos/v1/requests/list-applications-query';
import { diffOf } from '@/features/application/utils/diff/diff';
import { APPLICATION_STATUS } from '@/features/application/constants/status';
import { ENTITY_TYPE } from '@/shared/constants/entity-type';
import { AUDIT_ACTION } from '@/shared/constants/audit-action';

function notFound(): never {
  throw new HTTPException(404, {
    message: ErrorMessageConstant.DataEntityNotFound('Application'),
  });
}

export const applicationService = {
  async create(data: CreateApplicationRequest): Promise<ApplicationResponse> {
    // Insert + its `created` audit row commit together.
    const row = await db.transaction(async (tx) => {
      const created = await applicationRepo.create(
        {
          company: data.company,
          role: data.role,
          status: data.status ?? APPLICATION_STATUS.SAVED,
          jobUrl: data.jobUrl ?? null,
          notes: data.notes ?? null,
        },
        tx,
      );
      await recordAudit(tx, {
        entityType: ENTITY_TYPE.APPLICATION,
        entityId: created.id,
        action: AUDIT_ACTION.CREATED,
        newData: created,
      });
      return created;
    });
    return mapApplication(row);
  },

  async getById(id: string): Promise<ApplicationResponse> {
    const row = await applicationRepo.findById(id);
    if (!row) notFound();
    return mapApplication(row);
  },

  async list(query: ListApplicationsQuery): Promise<PaginatedData<ApplicationResponse>> {
    const { rows, nextCursor, hasMore } = await applicationRepo.findMany({
      status: query.status,
      archived: query.archived,
      cursor: query.cursor,
      limit: query.limit,
    });
    return {
      items: rows.map(mapApplication),
      meta: { limit: query.limit, nextCursor, hasMore },
    };
  },

  async update(id: string, patch: UpdateApplicationRequest): Promise<ApplicationResponse> {
    return db.transaction(async (tx) => {
      const before = await applicationRepo.findById(id, tx);
      if (!before) notFound();

      // diffOf compares only keys present in both, so passing the sparse patch directly
      // yields exactly the changed provided fields - no need to re-list the patchable keys.
      const changed = diffOf(before, patch);

      // Idempotent no-op: every provided field already matches - no mutation, no audit row.
      if (Object.keys(changed).length === 0) {
        return mapApplication(before);
      }

      const after = await applicationRepo.update(id, patch, tx);
      await recordAudit(tx, {
        entityType: ENTITY_TYPE.APPLICATION,
        entityId: id,
        action: AUDIT_ACTION.UPDATED,
        oldData: before,
        newData: after,
        diff: changed,
      });
      return mapApplication(after);
    });
  },

  async remove(id: string, actor?: string | null): Promise<ApplicationResponse> {
    return db.transaction(async (tx) => {
      const before = await applicationRepo.findById(id, tx);
      if (!before) notFound();
      const deleted = await applicationRepo.softDelete(id, actor, tx);
      await recordAudit(tx, {
        entityType: ENTITY_TYPE.APPLICATION,
        entityId: id,
        action: AUDIT_ACTION.DELETED,
        oldData: before,
        newData: null,
      });
      return mapApplication(deleted);
    });
  },
};
