import 'server-only';
import { zValidator } from '@hono/zod-validator';
import type { ZodType } from 'zod';
import { ValidationException } from '@/shared/lib/exceptions/validation-exception';

type ValidateTarget = 'json' | 'query' | 'param';

/**
 * Drop-in replacement for zValidator that throws a ValidationException (422) on failure,
 * so every feature router produces an identical error envelope. Generic over the schema
 * so c.req.valid(target) stays fully typed.
 * Usage: validate('json', createApplicationSchema)
 */
export function validate<Target extends ValidateTarget, T extends ZodType>(target: Target, schema: T) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        messages: [issue.message],
      }));
      throw new ValidationException(errors);
    }
  });
}
