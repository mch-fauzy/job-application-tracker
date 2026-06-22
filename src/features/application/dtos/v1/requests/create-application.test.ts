import { describe, it, expect } from 'vitest';
import { createApplicationSchema } from './create-application';

describe('createApplicationSchema', () => {
  it('accepts a valid create payload', () => {
    const result = createApplicationSchema.parse({ company: 'Acme', role: 'Engineer' });
    expect(result.company).toBe('Acme');
    expect(result.status).toBe('saved'); // default applied
  });

  it('rejects empty company', () => {
    expect(() => createApplicationSchema.parse({ company: '', role: 'Engineer' })).toThrow();
  });

  it('rejects missing role', () => {
    expect(() => createApplicationSchema.parse({ company: 'Acme' })).toThrow();
  });

  it('rejects company longer than 200 chars', () => {
    expect(() => createApplicationSchema.parse({ company: 'a'.repeat(201), role: 'Eng' })).toThrow();
  });

  it('rejects role longer than 200 chars', () => {
    expect(() => createApplicationSchema.parse({ company: 'Acme', role: 'a'.repeat(201) })).toThrow();
  });

  it('rejects notes longer than 2000 chars', () => {
    expect(() =>
      createApplicationSchema.parse({ company: 'Acme', role: 'Eng', notes: 'n'.repeat(2001) })
    ).toThrow();
  });

  it('rejects an invalid jobUrl', () => {
    expect(() =>
      createApplicationSchema.parse({ company: 'Acme', role: 'Eng', jobUrl: 'not-a-url' })
    ).toThrow();
  });

  it('accepts a valid jobUrl', () => {
    const result = createApplicationSchema.parse({ company: 'Acme', role: 'Eng', jobUrl: 'https://acme.com/jobs' });
    expect(result.jobUrl).toBe('https://acme.com/jobs');
  });

  it('rejects an unknown status', () => {
    expect(() =>
      createApplicationSchema.parse({ company: 'Acme', role: 'Eng', status: 'pending' })
    ).toThrow();
  });
});
