import { describe, it, expect } from 'vitest';
import { applicationIdParamSchema } from './application-id-param';

describe('applicationIdParamSchema', () => {
  it('accepts a valid uuid', () => {
    const result = applicationIdParamSchema.parse({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });
    expect(result.id).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
  });

  it('rejects a malformed id', () => {
    expect(() => applicationIdParamSchema.parse({ id: 'not-a-uuid' })).toThrow();
  });

  it('accepts the nil uuid (valid format, resolves to 404 downstream)', () => {
    expect(() =>
      applicationIdParamSchema.parse({ id: '00000000-0000-0000-0000-000000000000' }),
    ).not.toThrow();
  });
});
