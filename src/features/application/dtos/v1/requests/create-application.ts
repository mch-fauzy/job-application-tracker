import { z } from 'zod';
import {
  applicationStatusSchema,
  APPLICATION_STATUS,
} from '@/features/application/constants/status';

// Create payload. The single source of truth for input - used by the server zValidator
// and the client form. Lengths are validated here, not at the (text) DB column.
export const createApplicationSchema = z.object({
  company: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  // Restrict to http(s): bare z.url() also accepts javascript: and data:, which would later land
  // in an href as an XSS vector. Reject other schemes at the boundary so they can never be stored.
  jobUrl: z.url({ protocol: /^https?$/ }).optional(),
  notes: z.string().max(2000).optional(),
  status: applicationStatusSchema.default(APPLICATION_STATUS.SAVED),
});

// Input type (not z.infer/output): status is optional for callers - the schema default
// and the service both fill 'saved'. The validated/output value stays assignable to this.
export type CreateApplicationRequest = z.input<typeof createApplicationSchema>;
