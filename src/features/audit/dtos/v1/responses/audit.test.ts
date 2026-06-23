import { describe, it, expect } from 'vitest';
import { auditEventResponseSchema, mapAuditEvent } from './audit';

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  entityType: 'application',
  entityId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  action: 'updated' as const,
  createdBy: null,
  createdAt: new Date('2024-01-15T10:00:00.000Z'),
  oldData: { status: 'saved' },
  newData: { status: 'applied' },
  diff: { status: { from: 'saved', to: 'applied' } },
  ipAddress: null,
  userAgent: null,
  requestId: null,
  source: null,
  ...overrides,
});

describe('auditEventResponseSchema', () => {
  it('validates a well-formed audit event', () => {
    const result = auditEventResponseSchema.parse({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'updated',
      diff: { status: { from: 'saved', to: 'applied' } },
      createdAt: '2024-01-15T10:00:00.000Z',
      createdBy: null,
    });
    expect(result.id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(result.action).toBe('updated');
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z');
    expect(result.createdBy).toBeNull();
    expect(result.diff).toEqual({ status: { from: 'saved', to: 'applied' } });
  });

  it('rejects missing id', () => {
    expect(() =>
      auditEventResponseSchema.parse({ action: 'created', diff: null, createdAt: '2024-01-15T10:00:00.000Z', createdBy: null }),
    ).toThrow();
  });

  it('rejects an unknown action', () => {
    expect(() =>
      auditEventResponseSchema.parse({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        action: 'status_changed',
        diff: null,
        createdAt: '2024-01-15T10:00:00.000Z',
        createdBy: null,
      }),
    ).toThrow();
  });
});

describe('mapAuditEvent', () => {
  it('maps a drizzle row to AuditEventResponse with ISO createdAt', () => {
    const mapped = mapAuditEvent(makeRow());
    expect(mapped.id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(mapped.action).toBe('updated');
    expect(mapped.createdAt).toBe('2024-01-15T10:00:00.000Z');
    expect(mapped.createdBy).toBeNull();
    expect(mapped.diff).toEqual({ status: { from: 'saved', to: 'applied' } });
  });

  it('exposes only the timeline fields and drops every sensitive column', () => {
    const mapped = mapAuditEvent(makeRow()) as Record<string, unknown>;
    expect(Object.keys(mapped).sort()).toEqual(['action', 'createdAt', 'createdBy', 'diff', 'id']);
    // Spell out the dropped columns so an accidental future addition fails loudly.
    for (const sensitive of ['oldData', 'newData', 'ipAddress', 'userAgent', 'requestId', 'source', 'entityType', 'entityId']) {
      expect(sensitive in mapped).toBe(false);
    }
  });

  it('passes through a status-change diff shape { status: { from, to } }', () => {
    const mapped = mapAuditEvent(makeRow({ diff: { status: { from: 'saved', to: 'applied' } } }));
    expect(mapped.diff).toEqual({ status: { from: 'saved', to: 'applied' } });
  });

  it('maps a created event with null diff', () => {
    const mapped = mapAuditEvent(makeRow({ action: 'created', diff: null, oldData: null }));
    expect(mapped.action).toBe('created');
    expect(mapped.diff).toBeNull();
  });

  it('maps a createdBy actor when present', () => {
    const mapped = mapAuditEvent(makeRow({ createdBy: 'user-abc' }));
    expect(mapped.createdBy).toBe('user-abc');
  });
});
