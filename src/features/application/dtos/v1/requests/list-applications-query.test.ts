import { describe, it, expect } from 'vitest';
import { listApplicationsQuerySchema } from './list-applications-query';
import { encodeCursor } from '@/shared/utils/cursor/cursor';

describe('listApplicationsQuerySchema', () => {
  it('defaults limit to 20', () => {
    const result = listApplicationsQuerySchema.parse({});
    expect(result.limit).toBe(20);
  });

  it('caps limit at 50', () => {
    const result = listApplicationsQuerySchema.parse({ limit: '100' });
    expect(result.limit).toBe(50);
  });

  it('coerces limit from string', () => {
    const result = listApplicationsQuerySchema.parse({ limit: '30' });
    expect(result.limit).toBe(30);
  });

  it('accepts a valid status filter', () => {
    const result = listApplicationsQuerySchema.parse({ status: 'applied' });
    expect(result.status).toBe('applied');
  });

  it('rejects an invalid status', () => {
    expect(() => listApplicationsQuerySchema.parse({ status: 'ghost' })).toThrow();
  });

  it('coerces archived=true from string', () => {
    const result = listApplicationsQuerySchema.parse({ archived: 'true' });
    expect(result.archived).toBe(true);
  });

  it('coerces archived=false from string (stringbool, not truthy-coerce)', () => {
    const result = listApplicationsQuerySchema.parse({ archived: 'false' });
    expect(result.archived).toBe(false);
  });

  it('rejects providing both status and archived', () => {
    expect(() =>
      listApplicationsQuerySchema.parse({ status: 'applied', archived: 'true' })
    ).toThrow();
  });

  it('accepts a decodable cursor', () => {
    const cursor = encodeCursor({
      ts: new Date('2026-01-01T00:00:00.000Z'),
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    });
    const result = listApplicationsQuerySchema.parse({ cursor });
    expect(result.cursor).toBe(cursor);
  });

  it('rejects a malformed cursor', () => {
    expect(() => listApplicationsQuerySchema.parse({ cursor: 'not-a-valid-cursor!!!' })).toThrow();
  });
});
