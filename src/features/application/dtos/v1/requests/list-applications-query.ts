import { z } from 'zod';
import { applicationStatusSchema } from '@/features/application/constants/status';
import { decodeCursor } from '@/shared/utils/cursor/cursor';

function isDecodableCursor(value: string): boolean {
  try {
    decodeCursor(value);
    return true;
  } catch {
    return false;
  }
}

// List query for one active column (status) OR the archived group (archived) - mutually
// exclusive. limit defaults to 20 and is clamped to 50. archived uses stringbool so
// `?archived=false` parses to false (z.coerce.boolean would make any non-empty string true).
// A malformed cursor is rejected here at the boundary (422), keeping the repo HTTP-agnostic.
export const listApplicationsQuerySchema = z
  .object({
    status: applicationStatusSchema.optional(),
    archived: z.stringbool().optional(),
    cursor: z
      .string()
      .optional()
      .refine((value) => value === undefined || isDecodableCursor(value), {
        error: 'Invalid cursor',
      }),
    limit: z.coerce.number().int().min(1).default(20).transform((n) => Math.min(n, 50)),
  })
  .superRefine((obj, ctx) => {
    if (obj.status !== undefined && obj.archived !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: '`status` and `archived` are mutually exclusive',
        path: ['archived'],
      });
    }
  });

export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;
