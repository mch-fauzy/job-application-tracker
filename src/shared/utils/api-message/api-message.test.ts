import { describe, it, expect } from 'vitest';
import { apiErrorMessage } from './api-message';

describe('apiErrorMessage', () => {
  it('returns the message from a well-formed error body', () => {
    expect(apiErrorMessage({ message: 'Boom' })).toBe('Boom');
  });

  it('returns undefined when message is not a string', () => {
    expect(apiErrorMessage({ message: 42 })).toBeUndefined();
  });

  it('returns undefined when the body has no message field', () => {
    expect(apiErrorMessage({ error: 'x' })).toBeUndefined();
  });

  it('returns undefined for null, non-objects, and undefined', () => {
    expect(apiErrorMessage(null)).toBeUndefined();
    expect(apiErrorMessage('Boom')).toBeUndefined();
    expect(apiErrorMessage(undefined)).toBeUndefined();
  });
});
