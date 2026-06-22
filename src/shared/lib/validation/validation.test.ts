import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from './validation';
import { app, v1 } from '@/shared/lib/api/api';
import { ValidationException } from '@/shared/lib/exceptions/validation-exception';

// Register a tiny router on v1 that uses the validate helper, then attach v1.
const valTestRouter = new Hono();
valTestRouter.post(
  '/val',
  validate('json', z.object({ name: z.string().min(1), age: z.number().int().positive() })),
  (c) => c.json({ message: 'OK', data: c.req.valid('json') }),
);
v1.route('/valtest', valTestRouter);
app.route('/v1', v1);

describe('validate helper', () => {
  it('passes through on valid input', async () => {
    const res = await app.request('/api/v1/valtest/val', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', age: 30 }),
    });
    expect(res.status).toBe(200);
  });

  it('throws ValidationException (422) on invalid input', async () => {
    const res = await app.request('/api/v1/valtest/val', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', age: -1 }),
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { message: string; errors: { path: string; messages: string[] }[] };
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThanOrEqual(1);
    expect(typeof body.errors[0].path).toBe('string');
    expect(Array.isArray(body.errors[0].messages)).toBe(true);
  });

  it('formats each Zod issue as { path: dotted string, messages: string[] }', async () => {
    const res = await app.request('/api/v1/valtest/val', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),  // missing age too
    });
    const body = await res.json() as { errors: { path: string; messages: string[] }[] };
    const paths = body.errors.map((e) => e.path);
    expect(paths).toContain('name');
  });

  it('exported ValidationException is the same class caught by onError', () => {
    const ex = new ValidationException([{ path: 'x', messages: ['bad'] }]);
    expect(ex.status).toBe(422);
    expect(ex.errors[0].path).toBe('x');
  });
});
