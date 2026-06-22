import 'server-only';
import { Hono } from 'hono';
import { applicationService } from '@/features/application/services/application';
import { createApplicationSchema } from '@/features/application/dtos/v1/requests/create-application';
import { updateApplicationSchema } from '@/features/application/dtos/v1/requests/update-application';
import { listApplicationsQuerySchema } from '@/features/application/dtos/v1/requests/list-applications-query';
import { applicationIdParamSchema } from '@/features/application/dtos/v1/requests/application-id-param';
import { ok, paginated } from '@/shared/utils/response/response';
import { SuccessMessageConstant } from '@/shared/constants/messages';
import { validate } from '@/shared/lib/validation/validation';

// Standalone router - mounting onto v1 happens at the app layer (route.ts). This file
// never calls v1.route(...) or app.route(...).
export const applicationRouter = new Hono();

applicationRouter.get(
  '/',
  validate('query', listApplicationsQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const result = await applicationService.list(query);
    return c.json(
      paginated(result.items, result.meta, SuccessMessageConstant.EntityRetrieved('Applications')),
    );
  },
);

applicationRouter.post(
  '/',
  validate('json', createApplicationSchema),
  async (c) => {
    const data = c.req.valid('json');
    const application = await applicationService.create(data);
    return c.json(ok(application, SuccessMessageConstant.EntityCreated('Application')), 201);
  },
);

applicationRouter.get(
  '/:id',
  validate('param', applicationIdParamSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const application = await applicationService.getById(id);
    return c.json(ok(application, SuccessMessageConstant.EntityRetrieved('Application')));
  },
);

applicationRouter.patch(
  '/:id',
  validate('param', applicationIdParamSchema),
  validate('json', updateApplicationSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const patch = c.req.valid('json');
    const application = await applicationService.update(id, patch);
    return c.json(ok(application, SuccessMessageConstant.EntityUpdated('Application')));
  },
);

applicationRouter.delete(
  '/:id',
  validate('param', applicationIdParamSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const application = await applicationService.remove(id);
    return c.json(ok(application, SuccessMessageConstant.EntityDeleted('Application')));
  },
);
