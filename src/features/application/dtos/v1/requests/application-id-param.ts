import { z } from 'zod';

// Guards the :id route param so a malformed id returns 422 at the boundary instead of
// reaching Postgres and surfacing as a 500.
export const applicationIdParamSchema = z.object({
  id: z.uuid(),
});
