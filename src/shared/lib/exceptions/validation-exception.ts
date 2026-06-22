import { HTTPException } from 'hono/http-exception';
import { ErrorMessageConstant } from '@/shared/constants/messages';

// Thrown by the shared `validate` helper and caught by the root app's onError to render the
// 422 envelope. Lives in its own module so neither the validate helper nor the api app has to
// depend on the other.
export class ValidationException extends HTTPException {
  readonly errors: { path: string; messages: string[] }[];

  constructor(errors: { path: string; messages: string[] }[]) {
    super(422, { message: ErrorMessageConstant.ValidationError() });
    this.errors = errors;
  }
}
