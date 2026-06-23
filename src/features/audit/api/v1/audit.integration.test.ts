import { describe, it, expect } from 'vitest';
import { app, v1 } from '@/shared/lib/api/api';
import { auditLog } from '@/shared/db/audit-log';
import { db } from '@/shared/lib/db/db';
import { auditRouter } from './audit';

// Mount at the test layer (mirrors what route.ts does at the app layer).
v1.route('/audit', auditRouter);
app.route('/v1', v1);

// Seeded audit rows are append-only and intentionally not deleted - random entityIds never
// collide and the volume is negligible (same reality as the application service tests).

describe('GET /api/v1/audit', () => {
  it('returns 422 when entityId is missing', async () => {
    const res = await app.request('/api/v1/audit?entityType=application');
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toHaveProperty('message');
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors[0]).toHaveProperty('path');
    expect(Array.isArray(body.errors[0].messages)).toBe(true);
  });

  it('returns 422 when entityId is not a uuid', async () => {
    const res = await app.request('/api/v1/audit?entityType=application&entityId=not-a-uuid');
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it('returns 422 when entityType is missing', async () => {
    const res = await app.request('/api/v1/audit?entityId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it('returns 422 for an entityType outside the allowlist', async () => {
    const res = await app.request('/api/v1/audit?entityType=user&entityId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it('returns 422 for a malformed cursor', async () => {
    const res = await app.request(
      '/api/v1/audit?entityType=application&entityId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&cursor=not-a-valid-cursor',
    );
    expect(res.status).toBe(422);
  });

  it('returns 200 with the paginated envelope for an entityId with no rows', async () => {
    const entityId = crypto.randomUUID();
    const res = await app.request(`/api/v1/audit?entityType=application&entityId=${entityId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('message');
    expect(body.data).toHaveProperty('items');
    expect(body.data).toHaveProperty('meta');
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.items).toHaveLength(0);
    expect(body.data.meta.hasMore).toBe(false);
    expect(body.data.meta.nextCursor).toBeNull();
  });

  it('returns the audit events for a seeded entityId without sensitive fields', async () => {
    const entityId = crypto.randomUUID();
    await db.insert(auditLog).values({ entityType: 'application', entityId, action: 'created', diff: null });

    const res = await app.request(`/api/v1/audit?entityType=application&entityId=${entityId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].action).toBe('created');
    expect(body.data.items[0]).toHaveProperty('id');
    expect(body.data.items[0]).toHaveProperty('createdAt');
    expect('oldData' in body.data.items[0]).toBe(false);
    expect('newData' in body.data.items[0]).toBe(false);
    expect('ipAddress' in body.data.items[0]).toBe(false);
  });

  it('respects the limit query param', async () => {
    const entityId = crypto.randomUUID();
    await db.insert(auditLog).values([
      { entityType: 'application', entityId, action: 'created', createdAt: new Date('2024-01-01T08:00:00Z') },
      { entityType: 'application', entityId, action: 'updated', createdAt: new Date('2024-01-01T09:00:00Z') },
      { entityType: 'application', entityId, action: 'updated', createdAt: new Date('2024-01-01T10:00:00Z') },
    ]);

    const res = await app.request(`/api/v1/audit?entityType=application&entityId=${entityId}&limit=2`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(2);
    expect(body.data.meta.hasMore).toBe(true);
    expect(body.data.meta.nextCursor).not.toBeNull();
    expect(body.data.meta.limit).toBe(2);
  });

  it('walks to page 2 via the returned cursor with no duplicate or skipped rows', async () => {
    const entityId = crypto.randomUUID();
    await db.insert(auditLog).values([
      { entityType: 'application', entityId, action: 'created', createdAt: new Date('2024-01-01T08:00:00Z') },
      { entityType: 'application', entityId, action: 'updated', createdAt: new Date('2024-01-01T09:00:00Z') },
      { entityType: 'application', entityId, action: 'updated', createdAt: new Date('2024-01-01T10:00:00Z') },
    ]);

    const res1 = await app.request(`/api/v1/audit?entityType=application&entityId=${entityId}&limit=2`);
    const page1 = (await res1.json()).data;

    const res2 = await app.request(
      `/api/v1/audit?entityType=application&entityId=${entityId}&limit=2&cursor=${encodeURIComponent(page1.meta.nextCursor)}`,
    );
    expect(res2.status).toBe(200);
    const page2 = (await res2.json()).data;

    expect(page2.items).toHaveLength(1);
    expect(page2.meta.hasMore).toBe(false);
    expect(page2.meta.nextCursor).toBeNull();

    // The two pages cover all 3 rows with no overlap.
    const ids = [...page1.items, ...page2.items].map((item: { id: string }) => item.id);
    expect(new Set(ids).size).toBe(3);
  });
});
