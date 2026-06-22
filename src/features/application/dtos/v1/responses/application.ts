import { z } from 'zod';
import {
  applicationStatusSchema,
  type ApplicationStatus,
} from '@/features/application/constants/status';

// The single response contract for both data paths (RSC service call + HTTP client).
// camelCase, ISO 8601 date strings, and never exposes internal/audit columns. status is
// validated against the enum so both data paths get the narrow union, not a bare string.
export const applicationResponseSchema = z.object({
  id: z.uuid(),
  company: z.string(),
  role: z.string(),
  status: applicationStatusSchema,
  jobUrl: z.url().nullable(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ApplicationResponse = z.infer<typeof applicationResponseSchema>;

// Maps a Drizzle row to the response shape: dates to ISO strings, internal columns dropped.
export function mapApplication(row: {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  jobUrl: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ApplicationResponse {
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    status: row.status,
    jobUrl: row.jobUrl,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
