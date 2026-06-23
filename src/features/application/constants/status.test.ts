import { describe, it, expect } from 'vitest';
import {
  APPLICATION_STATUS,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  applicationStatusSchema,
  isTerminalStatus,
} from './status';

describe('status constants', () => {
  it('APPLICATION_STATUS maps names to the 7 pipeline values in order', () => {
    expect(Object.values(APPLICATION_STATUS)).toEqual([
      'saved', 'applied', 'interviewing', 'offer',
      'accepted', 'rejected', 'withdrawn',
    ]);
  });

  it('ACTIVE_STATUSES contains the 4 board columns', () => {
    expect(ACTIVE_STATUSES).toEqual(['saved', 'applied', 'interviewing', 'offer']);
  });

  it('TERMINAL_STATUSES contains the 3 terminal outcomes', () => {
    expect(TERMINAL_STATUSES).toEqual(['accepted', 'rejected', 'withdrawn']);
  });

  it('applicationStatusSchema accepts valid statuses', () => {
    expect(applicationStatusSchema.parse('saved')).toBe('saved');
    expect(applicationStatusSchema.parse('rejected')).toBe('rejected');
  });

  it('applicationStatusSchema rejects unknown statuses', () => {
    expect(() => applicationStatusSchema.parse('pending')).toThrow();
    expect(() => applicationStatusSchema.parse('')).toThrow();
  });

  it('the create default (APPLICATION_STATUS.SAVED) is an active status', () => {
    expect(ACTIVE_STATUSES).toContain(APPLICATION_STATUS.SAVED);
  });

  it('isTerminalStatus is true for terminal statuses and false for active ones', () => {
    for (const status of TERMINAL_STATUSES) expect(isTerminalStatus(status)).toBe(true);
    for (const status of ACTIVE_STATUSES) expect(isTerminalStatus(status)).toBe(false);
  });

  it('ACTIVE + TERMINAL cover all statuses', () => {
    const all = new Set(Object.values(APPLICATION_STATUS));
    const covered = new Set([...ACTIVE_STATUSES, ...TERMINAL_STATUSES]);
    expect(covered).toEqual(all);
  });
});
