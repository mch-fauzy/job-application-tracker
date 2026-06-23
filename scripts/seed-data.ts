import { APPLICATION_STATUS } from '@/features/application/constants/status';
import type { ApplicationStatus } from '@/features/application/constants/status';
import type { CreateApplicationRequest } from '@/features/application/dtos/v1/requests/create-application';

// Demo applications. Every entry is created at the default 'saved' status, so status is omitted
// here - the journey below drives each one forward, generating a realistic audit trail.
export function buildSeedApplications(): CreateApplicationRequest[] {
  return [
    {
      company: 'Stripe',
      role: 'Senior Software Engineer',
      jobUrl: 'https://stripe.com/jobs/listing/senior-software-engineer',
      notes: 'Recruiter screen done. Technical interview scheduled.',
    },
    {
      company: 'Linear',
      role: 'Full-Stack Engineer',
      jobUrl: 'https://linear.app/jobs',
      notes: 'Applied via referral from a former colleague.',
    },
    {
      company: 'Vercel',
      role: 'Developer Experience Engineer',
      jobUrl: 'https://vercel.com/careers',
      notes: 'Dream role. Tailor the cover letter before applying.',
    },
    {
      company: 'Planetscale',
      role: 'Backend Engineer',
      jobUrl: 'https://planetscale.com/careers',
      notes: 'Offer received. Reviewing the compensation package.',
    },
    {
      company: 'Fly.io',
      role: 'Infrastructure Engineer',
      notes: 'Passed the technical, did not clear the system design round.',
    },
    {
      company: 'Turso',
      role: 'Developer Advocate',
      jobUrl: 'https://turso.tech/careers',
      notes: 'Withdrew after accepting a better offer elsewhere.',
    },
    {
      company: 'Neon',
      role: 'Product Engineer',
      jobUrl: 'https://neon.tech/careers',
    },
  ];
}

// Ordered status steps applied after create, keyed by company. Each step becomes one `updated`
// audit row with diff.status. A company absent here stays at 'saved'.
export const STATUS_JOURNEYS: Record<string, ApplicationStatus[]> = {
  Stripe: [APPLICATION_STATUS.APPLIED, APPLICATION_STATUS.INTERVIEWING],
  Linear: [APPLICATION_STATUS.APPLIED],
  Planetscale: [APPLICATION_STATUS.APPLIED, APPLICATION_STATUS.INTERVIEWING, APPLICATION_STATUS.OFFER],
  'Fly.io': [APPLICATION_STATUS.APPLIED, APPLICATION_STATUS.INTERVIEWING, APPLICATION_STATUS.REJECTED],
  Turso: [APPLICATION_STATUS.APPLIED, APPLICATION_STATUS.WITHDRAWN],
};
