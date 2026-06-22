import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { app, v1 } from './api';
import { ValidationException } from '@/shared/lib/exceptions/validation-exception';

// Register tiny routes DIRECTLY on app (not via a feature router) so this test has
// NO dependency on any feature - pure shared/ testing. Paths are relative to the
// app's '/api' basePath, so they are requested at '/api/...'.
app.get('/__boom-404', () => {
  throw new HTTPException(404, { message: 'Thing not found' });
});
app.get('/__boom-500', () => {
  throw new Error('unexpected');
});
app.get('/__boom-validation', () => {
  throw new ValidationException([{ path: 'name', messages: ['Required'] }]);
});
app.get('/__ok', (c) => c.json({ message: 'OK', data: { hello: 'world' } }));

// Wire a test sub-router via v1 to confirm the v1 export is usable, then attach v1.
const testRouter = new Hono();
testRouter.get('/ping', (c) => c.json({ message: 'pong', data: null }));
v1.route('/test', testRouter);
app.route('/v1', v1);

describe('root Hono app', () => {
  it('responds 200 on a happy-path route', async () => {
    const res = await app.request('/api/__ok');
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { hello: string } };
    expect(body.data.hello).toBe('world');
  });

  it('v1 sub-router is reachable after attaching', async () => {
    const res = await app.request('/api/v1/test/ping');
    expect(res.status).toBe(200);
  });

  it('formats a 404 HTTPException as { message }', async () => {
    const res = await app.request('/api/__boom-404');
    expect(res.status).toBe(404);
    const body = await res.json() as { message: string };
    expect(body.message).toBe('Thing not found');
  });

  it('maps an unexpected Error to 500', async () => {
    const res = await app.request('/api/__boom-500');
    expect(res.status).toBe(500);
    const body = await res.json() as { message: string };
    expect(typeof body.message).toBe('string');
  });

  it('returns 404 on an unknown route via notFound', async () => {
    const res = await app.request('/api/does-not-exist-at-all');
    expect(res.status).toBe(404);
  });

  it('formats a ValidationException as 422 with errors array', async () => {
    const res = await app.request('/api/__boom-validation');
    expect(res.status).toBe(422);
    const body = await res.json() as { message: string; errors: { path: string; messages: string[] }[] };
    expect(body.message).toBeTruthy();
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors[0].path).toBe('name');
    expect(body.errors[0].messages).toEqual(['Required']);
  });
});
