import { handle } from 'hono/vercel';
import { app, v1 } from '@/shared/lib/api/api';
import { applicationRouter } from '@/features/application/api/v1/application';

// Assembly point (app layer - allowed to import features/). Mount feature routers onto v1,
// then attach v1 onto app. Future feature routers add their v1.route(...) above app.route.
v1.route('/applications', applicationRouter);
app.route('/v1', v1);

// Node runtime: the neon-serverless WebSocket driver is incompatible with the edge runtime.
export const runtime = 'nodejs';

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
