import { z } from 'zod';
import { isDecodableCursor } from '@/shared/utils/cursor/cursor';
import { entityTypeSchema } from '@/shared/constants/entity-type';

// No server-only: shared between the Hono validate() helper and (optionally) client hooks.

// Query for one entity's audit timeline. entityType is restricted to the known allowlist
// (entityTypeSchema), so an unwired entity type is rejected at the boundary (422) instead of
// silently returning an empty page - fail-closed. limit defaults to 20 and is clamped to 50. A
// malformed cursor is also rejected here, keeping the repository HTTP-agnostic.
export const listAuditQuerySchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.uuid(),
  cursor: z
    .string()
    .optional()
    .refine((value) => value === undefined || isDecodableCursor(value), {
      error: 'Invalid cursor',
    }),
  limit: z.coerce.number().int().min(1).default(20).transform((n) => Math.min(n, 50)),
});

export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;
