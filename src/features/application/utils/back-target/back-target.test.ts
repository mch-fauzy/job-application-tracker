import { describe, it, expect } from 'vitest';
import { resolveBackTarget } from './back-target';

describe('resolveBackTarget', () => {
  it('points a terminal (archived) application back to the archived view', () => {
    for (const status of ['accepted', 'rejected', 'withdrawn'] as const) {
      expect(resolveBackTarget(status)).toEqual({ href: '/archived', label: 'Back to archived' });
    }
  });

  it('points an active application back to the board', () => {
    for (const status of ['saved', 'applied', 'interviewing', 'offer'] as const) {
      expect(resolveBackTarget(status)).toEqual({ href: '/', label: 'Back to board' });
    }
  });
});
