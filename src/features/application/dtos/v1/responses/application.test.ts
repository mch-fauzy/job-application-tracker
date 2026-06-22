import { describe, it, expect } from 'vitest';
import { applicationResponseSchema, mapApplication } from './application';
import { APPLICATION_STATUS } from '@/features/application/constants/status';

const fakeRow = {
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  company: 'Acme Corp',
  role: 'Software Engineer',
  status: APPLICATION_STATUS.APPLIED,
  jobUrl: 'https://acme.com/jobs/1',
  notes: 'Referral from Alice',
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-02T12:00:00.000Z'),
  // fields that must NOT appear in the output:
  createdBy: null,
  updatedBy: null,
  deletedAt: null,
  deletedBy: null,
};

describe('mapApplication', () => {
  it('maps Drizzle row to camelCase response shape', () => {
    const result = mapApplication(fakeRow);
    expect(result.id).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    expect(result.company).toBe('Acme Corp');
    expect(result.role).toBe('Software Engineer');
    expect(result.status).toBe('applied');
    expect(result.jobUrl).toBe('https://acme.com/jobs/1');
    expect(result.notes).toBe('Referral from Alice');
    expect(result.createdAt).toBe('2026-01-01T10:00:00.000Z');
    expect(result.updatedAt).toBe('2026-01-02T12:00:00.000Z');
  });

  it('does NOT expose deletedAt, createdBy, updatedBy, deletedBy', () => {
    const result = mapApplication(fakeRow) as Record<string, unknown>;
    expect('deletedAt' in result).toBe(false);
    expect('createdBy' in result).toBe(false);
    expect('updatedBy' in result).toBe(false);
    expect('deletedBy' in result).toBe(false);
  });

  it('maps null jobUrl and notes correctly', () => {
    const result = mapApplication({ ...fakeRow, jobUrl: null, notes: null });
    expect(result.jobUrl).toBeNull();
    expect(result.notes).toBeNull();
  });
});

describe('applicationResponseSchema', () => {
  it('validates a well-formed response', () => {
    const data = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      company: 'Acme',
      role: 'Engineer',
      status: 'saved',
      jobUrl: null,
      notes: null,
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    };
    expect(() => applicationResponseSchema.parse(data)).not.toThrow();
  });

  it('rejects a response with an invalid UUID', () => {
    expect(() => applicationResponseSchema.parse({ id: 'not-uuid' })).toThrow();
  });
});
