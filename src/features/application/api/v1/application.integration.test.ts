import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { app, v1 } from '@/shared/lib/api/api';
import { applicationRouter } from './application';
import { db } from '@/shared/lib/db/db';
import { applications } from '@/features/application/db/schema';

// Mount at the test layer (mirrors what route.ts does at the app layer).
v1.route('/applications', applicationRouter);
app.route('/v1', v1);

// Hard-deletes a row so created test data never accumulates. The DELETE endpoint only
// soft-deletes, which would leave rows in the table across runs.
function hardDelete(id: string): Promise<unknown> {
  return db.delete(applications).where(eq(applications.id, id));
}

describe('GET /api/v1/applications', () => {
  it('returns 200 with items array and meta', async () => {
    const res = await app.request('/api/v1/applications');
    expect(res.status).toBe(200);
    const body = await res.json() as { message: string; data: { items: unknown[]; meta: unknown } };
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.meta).toBeTruthy();
  });

  it('returns 422 when an invalid status is provided', async () => {
    const res = await app.request('/api/v1/applications?status=ghost');
    expect(res.status).toBe(422);
    const body = await res.json() as { errors: { path: string; messages: string[] }[] };
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it('returns 422 when both status and archived are provided', async () => {
    const res = await app.request('/api/v1/applications?status=applied&archived=true');
    expect(res.status).toBe(422);
  });

  it('returns 422 for a malformed cursor', async () => {
    const res = await app.request('/api/v1/applications?cursor=not-a-valid-cursor');
    expect(res.status).toBe(422);
  });
});

describe('POST /api/v1/applications', () => {
  it('creates an application and returns 201', async () => {
    const res = await app.request('/api/v1/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'TestCo', role: 'Engineer' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { data: { id: string; company: string; status: string } };
    expect(body.data.company).toBe('TestCo');
    expect(body.data.status).toBe('saved');
    expect(typeof body.data.id).toBe('string');

    await hardDelete(body.data.id);
  });

  it('returns 422 when company is missing', async () => {
    const res = await app.request('/api/v1/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'Engineer' }),
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { errors: { path: string; messages: string[] }[] };
    expect(Array.isArray(body.errors)).toBe(true);
  });
});

describe('GET /api/v1/applications/:id', () => {
  it('returns 404 for an unknown id', async () => {
    const res = await app.request('/api/v1/applications/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('returns 422 for a malformed (non-uuid) id', async () => {
    const res = await app.request('/api/v1/applications/not-a-uuid');
    expect(res.status).toBe(422);
    const body = await res.json() as { errors: { path: string; messages: string[] }[] };
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it('returns 200 with the application when found', async () => {
    const createRes = await app.request('/api/v1/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'GetByIdCo', role: 'Dev' }),
    });
    const created = await createRes.json() as { data: { id: string } };
    const id = created.data.id;

    const res = await app.request(`/api/v1/applications/${id}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { id: string } };
    expect(body.data.id).toBe(id);

    await hardDelete(id);
  });
});

describe('PATCH /api/v1/applications/:id', () => {
  it('returns 404 for an unknown id', async () => {
    const res = await app.request('/api/v1/applications/00000000-0000-0000-0000-000000000000', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'applied' }),
    });
    expect(res.status).toBe(404);
  });

  it('updates the status and returns 200', async () => {
    const createRes = await app.request('/api/v1/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'PatchCo', role: 'Dev' }),
    });
    const created = await createRes.json() as { data: { id: string } };
    const id = created.data.id;

    const res = await app.request(`/api/v1/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'applied' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { status: string } };
    expect(body.data.status).toBe('applied');

    await hardDelete(id);
  });

  it('returns 422 when patch body is empty', async () => {
    const createRes = await app.request('/api/v1/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'EmptyPatchCo', role: 'Dev' }),
    });
    const created = await createRes.json() as { data: { id: string } };
    const id = created.data.id;

    const res = await app.request(`/api/v1/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);

    await hardDelete(id);
  });
});

describe('DELETE /api/v1/applications/:id', () => {
  it('returns 404 for an unknown id', async () => {
    const res = await app.request('/api/v1/applications/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });

  it('soft-deletes and returns 200, after which the row is gone', async () => {
    const createRes = await app.request('/api/v1/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'DelCo', role: 'Dev' }),
    });
    const created = await createRes.json() as { data: { id: string } };
    const id = created.data.id;

    const res = await app.request(`/api/v1/applications/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);

    const getRes = await app.request(`/api/v1/applications/${id}`);
    expect(getRes.status).toBe(404);

    await hardDelete(id);
  });
});
