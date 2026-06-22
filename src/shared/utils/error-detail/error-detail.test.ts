import { describe, it, expect } from 'vitest';
import { errorDetail } from './error-detail';

describe('errorDetail', () => {
  it('returns null in production (no internal leak)', () => {
    expect(errorDetail(new Error('boom'), true)).toBeNull();
  });

  it('returns the message for an Error outside production', () => {
    expect(errorDetail(new Error('boom'), false)).toBe('boom');
  });

  it('stringifies a non-Error outside production', () => {
    expect(errorDetail('weird failure', false)).toBe('weird failure');
  });
});
