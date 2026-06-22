import { describe, it, expect } from 'vitest';
import { diffOf } from './diff';

describe('diffOf', () => {
  it('returns an empty object when nothing changed', () => {
    expect(diffOf({ status: 'saved', company: 'Acme' }, { status: 'saved', company: 'Acme' })).toEqual({});
  });

  it('returns changed fields with from/to', () => {
    const result = diffOf({ status: 'saved', company: 'Acme' }, { status: 'applied', company: 'Acme' });
    expect(result).toEqual({ status: { from: 'saved', to: 'applied' } });
  });

  it('captures multiple changed fields', () => {
    const result = diffOf(
      { status: 'saved', company: 'Acme', role: 'Engineer' },
      { status: 'applied', company: 'NewCo', role: 'Engineer' },
    );
    expect(result).toEqual({
      status: { from: 'saved', to: 'applied' },
      company: { from: 'Acme', to: 'NewCo' },
    });
  });

  it('captures null -> value transitions', () => {
    const result = diffOf({ notes: null }, { notes: 'Great company' });
    expect(result).toEqual({ notes: { from: null, to: 'Great company' } });
  });

  it('captures value -> null transitions', () => {
    const result = diffOf({ notes: 'Old notes' }, { notes: null });
    expect(result).toEqual({ notes: { from: 'Old notes', to: null } });
  });

  it('compares Date values by ISO string', () => {
    const d1 = new Date('2026-01-01T00:00:00.000Z');
    const d2 = new Date('2026-01-02T00:00:00.000Z');
    const same = new Date('2026-01-01T00:00:00.000Z');
    expect(diffOf({ updatedAt: d1 }, { updatedAt: same })).toEqual({});
    expect(diffOf({ updatedAt: d1 }, { updatedAt: d2 })).toEqual({
      updatedAt: { from: d1, to: d2 },
    });
  });

  it('ignores keys present only in before or only in after', () => {
    const result = diffOf({ a: 1, b: 2 }, { b: 2, c: 3 } as Record<string, unknown>);
    expect(result).toEqual({});
  });
});
