import { describe, it, expect } from 'vitest';
import { buildSeedApplications, STATUS_JOURNEYS } from './seed-data';
import { applicationStatusSchema } from '@/features/application/constants/status';

describe('buildSeedApplications', () => {
  const apps = buildSeedApplications();

  it('returns at least 5 application inputs', () => {
    expect(Array.isArray(apps)).toBe(true);
    expect(apps.length).toBeGreaterThanOrEqual(5);
  });

  it('every entry has a non-empty company and role', () => {
    for (const app of apps) {
      expect(app.company.length).toBeGreaterThan(0);
      expect(app.role.length).toBeGreaterThan(0);
    }
  });
});

describe('STATUS_JOURNEYS', () => {
  const apps = buildSeedApplications();
  const companies = new Set(apps.map((a) => a.company));

  it('only references companies that exist in the seed list (no orphan journeys)', () => {
    for (const company of Object.keys(STATUS_JOURNEYS)) {
      expect(companies.has(company)).toBe(true);
    }
  });

  it('every status in every journey is a valid application status', () => {
    for (const journey of Object.values(STATUS_JOURNEYS)) {
      for (const status of journey) {
        expect(() => applicationStatusSchema.parse(status)).not.toThrow();
      }
    }
  });

  it('produces variety: at least 3 distinct statuses across all journeys', () => {
    const distinct = new Set(Object.values(STATUS_JOURNEYS).flat());
    expect(distinct.size).toBeGreaterThanOrEqual(3);
  });
});
