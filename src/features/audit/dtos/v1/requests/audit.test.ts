import { describe, it, expect } from 'vitest';
import { encodeCursor } from '@/shared/utils/cursor/cursor';
import { listAuditQuerySchema } from './audit';

const ENTITY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('listAuditQuerySchema', () => {
  it('accepts valid required params and applies the default limit', () => {
    const result = listAuditQuerySchema.parse({ entityType: 'application', entityId: ENTITY_ID });
    expect(result.entityType).toBe('application');
    expect(result.entityId).toBe(ENTITY_ID);
    expect(result.limit).toBe(20);
    expect(result.cursor).toBeUndefined();
  });

  it('rejects missing entityId', () => {
    expect(() => listAuditQuerySchema.parse({ entityType: 'application' })).toThrow();
  });

  it('rejects missing entityType', () => {
    expect(() => listAuditQuerySchema.parse({ entityId: ENTITY_ID })).toThrow();
  });

  it('rejects an entityType outside the allowlist', () => {
    expect(() => listAuditQuerySchema.parse({ entityType: 'user', entityId: ENTITY_ID })).toThrow();
  });

  it('rejects a non-uuid entityId', () => {
    expect(() =>
      listAuditQuerySchema.parse({ entityType: 'application', entityId: 'not-a-uuid' }),
    ).toThrow();
  });

  it('coerces a string limit to a number', () => {
    const result = listAuditQuerySchema.parse({ entityType: 'application', entityId: ENTITY_ID, limit: '10' });
    expect(result.limit).toBe(10);
  });

  it('clamps limit at 50', () => {
    const result = listAuditQuerySchema.parse({ entityType: 'application', entityId: ENTITY_ID, limit: '200' });
    expect(result.limit).toBe(50);
  });

  it('rejects limit below 1', () => {
    expect(() =>
      listAuditQuerySchema.parse({ entityType: 'application', entityId: ENTITY_ID, limit: '0' }),
    ).toThrow();
  });

  it('passes through a valid cursor string', () => {
    const cursor = encodeCursor({ ts: new Date('2024-01-15T10:00:00.000Z'), id: ENTITY_ID });
    const result = listAuditQuerySchema.parse({ entityType: 'application', entityId: ENTITY_ID, cursor });
    expect(result.cursor).toBe(cursor);
  });

  it('rejects a malformed cursor at the boundary', () => {
    expect(() =>
      listAuditQuerySchema.parse({ entityType: 'application', entityId: ENTITY_ID, cursor: 'not-a-valid-cursor' }),
    ).toThrow();
  });
});
