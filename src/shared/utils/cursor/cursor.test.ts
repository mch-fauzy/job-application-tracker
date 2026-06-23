import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor, isDecodableCursor } from './cursor';

describe('cursor codec', () => {
  const ts = new Date('2026-03-15T09:30:00.000Z');
  const id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  it('encodes to a non-empty string', () => {
    const encoded = encodeCursor({ ts, id });
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
  });

  it('decodes to the original values (round-trip)', () => {
    const encoded = encodeCursor({ ts, id });
    const decoded = decodeCursor(encoded);
    expect(decoded.ts.toISOString()).toBe(ts.toISOString());
    expect(decoded.id).toBe(id);
  });

  it('decoded ts is a Date object', () => {
    const encoded = encodeCursor({ ts, id });
    const decoded = decodeCursor(encoded);
    expect(decoded.ts).toBeInstanceOf(Date);
  });

  it('throws on a malformed cursor', () => {
    expect(() => decodeCursor('not-base64!!!')).toThrow('Invalid cursor');
  });

  it('throws when the decoded payload lacks the pipe separator', () => {
    const bad = Buffer.from('nopipe').toString('base64url');
    expect(() => decodeCursor(bad)).toThrow('Invalid cursor');
  });

  it('throws when the date part is not a valid ISO string', () => {
    const bad = Buffer.from('NOTADATE|some-uuid').toString('base64url');
    expect(() => decodeCursor(bad)).toThrow('Invalid cursor');
  });

  it('throws when the id part is empty', () => {
    const bad = Buffer.from('2026-01-01T00:00:00.000Z|').toString('base64url');
    expect(() => decodeCursor(bad)).toThrow('Invalid cursor');
  });

  it('isDecodableCursor returns true for a valid cursor and false for a malformed one', () => {
    expect(isDecodableCursor(encodeCursor({ ts, id }))).toBe(true);
    expect(isDecodableCursor('not-a-valid-cursor')).toBe(false);
  });
});
