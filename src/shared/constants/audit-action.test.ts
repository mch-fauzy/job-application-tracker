import { describe, it, expect } from 'vitest';
import { AUDIT_ACTION, auditActionSchema } from './audit-action';

describe('audit action constants', () => {
  it('AUDIT_ACTION maps names to the 3 generic CRUD actions', () => {
    expect(Object.values(AUDIT_ACTION)).toEqual(['created', 'updated', 'deleted']);
  });

  it('auditActionSchema accepts valid actions', () => {
    expect(auditActionSchema.parse('created')).toBe('created');
    expect(auditActionSchema.parse('deleted')).toBe('deleted');
  });

  it('auditActionSchema rejects unknown actions', () => {
    expect(() => auditActionSchema.parse('status_changed')).toThrow();
    expect(() => auditActionSchema.parse('')).toThrow();
  });
});
