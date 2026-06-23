import { describe, it, expect } from 'vitest';
import { ENTITY_TYPE, entityTypeSchema } from './entity-type';

describe('entity type constants', () => {
  it('ENTITY_TYPE maps names to the auditable entity values', () => {
    expect(Object.values(ENTITY_TYPE)).toEqual(['application']);
  });

  it('entityTypeSchema accepts a known entity type', () => {
    expect(entityTypeSchema.parse('application')).toBe('application');
  });

  it('entityTypeSchema rejects an unknown entity type', () => {
    expect(() => entityTypeSchema.parse('user')).toThrow();
    expect(() => entityTypeSchema.parse('')).toThrow();
  });
});
