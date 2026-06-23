import { z } from 'zod';
import { applicationStatusSchema } from '@/features/application/constants/status';

// All fields optional (partial update). jobUrl/notes are nullable so a client can clear them.
const updateApplicationBase = z.object({
  company: z.string().min(1).max(200).optional(),
  role: z.string().min(1).max(200).optional(),
  // Restrict to http(s): bare z.url() also accepts javascript: and data:, which would later land
  // in an href as an XSS vector. Reject other schemes at the boundary so they can never be stored.
  jobUrl: z.url({ protocol: /^https?$/ }).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  status: applicationStatusSchema.optional(),
});

// Block empty patches - at least one field must be present.
export const updateApplicationSchema = updateApplicationBase.refine(
  (obj) => Object.values(obj).some((v) => v !== undefined),
  { error: 'At least one field must be provided' },
);

export type UpdateApplicationRequest = z.infer<typeof updateApplicationSchema>;
