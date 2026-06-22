import 'server-only';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { config } from '@/shared/config';
import { ErrorMessageConstant } from '@/shared/constants/messages';
import { ValidationException } from '@/shared/lib/exceptions/validation-exception';
import { errorDetail } from '@/shared/utils/error-detail/error-detail';
import type { ApiError } from '@/shared/types/response';

export const app = new Hono().basePath('/api');
// v1 is a bare router. Feature routers mount onto it, and app.route('/v1', v1) is called
// at the app layer (route.ts) AFTER all features register - never here, so shared/ never
// imports features/.
export const v1 = new Hono();

app.use(logger());

app.onError((err, c) => {
  // Validation failures -> 422 with the per-field errors array.
  if (err instanceof ValidationException) {
    const body: ApiError = { message: err.message, errors: err.errors };
    return c.json(body, 422);
  }

  // Any other HTTPException -> forward its status. c.status() takes the full StatusCode union,
  // so this avoids casting err.status to the narrower type c.json's status arg expects.
  if (err instanceof HTTPException) {
    const body: ApiError = { message: err.message, error: err.message };
    c.status(err.status);
    return c.json(body);
  }

  // Unexpected error -> 500. errorDetail suppresses the raw message in production.
  const body: ApiError = {
    message: ErrorMessageConstant.InternalServerError(),
    error: errorDetail(err, config.isProduction),
  };
  return c.json(body, 500);
});

app.notFound((c) => {
  const body: ApiError = { message: ErrorMessageConstant.ResourceNotFound() };
  return c.json(body, 404);
});
