import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { clientResponseSchema, clientPaginatedResponseSchema } from './client-response';

const itemSchema = z.object({ id: z.string() });

describe('clientResponseSchema', () => {
  it('parses a single-resource envelope', () => {
    const schema = clientResponseSchema(itemSchema);
    const parsed = schema.parse({ message: 'ok', data: { id: 'a' } });
    expect(parsed.data.id).toBe('a');
  });

  it('rejects a body missing the message field', () => {
    const schema = clientResponseSchema(itemSchema);
    expect(() => schema.parse({ data: { id: 'a' } })).toThrow();
  });

  it('rejects data that does not match the item schema', () => {
    const schema = clientResponseSchema(itemSchema);
    expect(() => schema.parse({ message: 'ok', data: { id: 1 } })).toThrow();
  });
});

describe('clientPaginatedResponseSchema', () => {
  it('parses a keyset page envelope with items and meta', () => {
    const schema = clientPaginatedResponseSchema(itemSchema);
    const parsed = schema.parse({
      message: 'ok',
      data: { items: [{ id: 'a' }], meta: { limit: 20, nextCursor: 'c', hasMore: true } },
    });
    expect(parsed.data.items).toHaveLength(1);
    expect(parsed.data.meta.nextCursor).toBe('c');
    expect(parsed.data.meta.hasMore).toBe(true);
  });

  it('accepts a null nextCursor', () => {
    const schema = clientPaginatedResponseSchema(itemSchema);
    const parsed = schema.parse({
      message: 'ok',
      data: { items: [], meta: { limit: 20, nextCursor: null, hasMore: false } },
    });
    expect(parsed.data.meta.nextCursor).toBeNull();
  });

  it('rejects a page whose meta is missing hasMore', () => {
    const schema = clientPaginatedResponseSchema(itemSchema);
    expect(() =>
      schema.parse({ message: 'ok', data: { items: [], meta: { limit: 20, nextCursor: null } } }),
    ).toThrow();
  });
});
