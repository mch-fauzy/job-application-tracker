import { describe, it, expect } from 'vitest';
import { updateApplicationSchema } from './update-application';

describe('updateApplicationSchema', () => {
  it('accepts a valid status-only patch', () => {
    const result = updateApplicationSchema.parse({ status: 'applied' });
    expect(result.status).toBe('applied');
  });

  it('accepts a multi-field patch', () => {
    const result = updateApplicationSchema.parse({ company: 'NewCo', status: 'offer' });
    expect(result.company).toBe('NewCo');
  });

  it('rejects an empty patch (no fields)', () => {
    expect(() => updateApplicationSchema.parse({})).toThrow();
  });

  it('rejects company empty string', () => {
    expect(() => updateApplicationSchema.parse({ company: '' })).toThrow();
  });

  it('rejects notes longer than 2000 chars', () => {
    expect(() => updateApplicationSchema.parse({ notes: 'n'.repeat(2001) })).toThrow();
  });

  it('rejects an invalid jobUrl', () => {
    expect(() => updateApplicationSchema.parse({ jobUrl: 'bad' })).toThrow();
  });

  it('rejects a non-http(s) jobUrl scheme (XSS guard)', () => {
    expect(() => updateApplicationSchema.parse({ jobUrl: 'javascript:alert(1)' })).toThrow();
  });

  it('rejects an unknown status', () => {
    expect(() => updateApplicationSchema.parse({ status: 'ghost' })).toThrow();
  });
});
