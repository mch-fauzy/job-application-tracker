import 'server-only';
import { Hono } from 'hono';
import { auditService } from '@/features/audit/services/audit';
import { listAuditQuerySchema } from '@/features/audit/dtos/v1/requests/audit';
import { paginated } from '@/shared/utils/response/response';
import { SuccessMessageConstant } from '@/shared/constants/messages';
import { validate } from '@/shared/lib/validation/validation';

// Standalone router - mounting onto v1 happens at the app layer (route.ts). This file never
// calls v1.route(...) or app.route(...), so shared/ never imports features/.
export const auditRouter = new Hono();

auditRouter.get(
  '/',
  validate('query', listAuditQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const result = await auditService.listTimeline(query);
    return c.json(
      paginated(result.items, result.meta, SuccessMessageConstant.EntityRetrieved('Audit events')),
    );
  },
);
