import { z } from 'zod';

// Schemas the client uses to parse API response envelopes. The response DTO is the
// inner `data`, so hooks parse the envelope and then read `.data`.

const cursorMetaSchema = z.object({
  limit: z.number(),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

// Envelope around a single resource: { message, data }.
export function clientResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({ message: z.string(), data: dataSchema });
}

// Envelope around a keyset page: { message, data: { items, meta } }.
export function clientPaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    message: z.string(),
    data: z.object({ items: z.array(itemSchema), meta: cursorMetaSchema }),
  });
}
