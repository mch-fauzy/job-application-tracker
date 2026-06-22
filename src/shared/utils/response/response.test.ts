import { describe, it, expect } from 'vitest';
import { ok, paginated } from './response';

describe('response helpers', () => {
  it('ok wraps data with a message', () => {
    expect(ok({ id: '1' }, 'Retrieved')).toEqual({ message: 'Retrieved', data: { id: '1' } });
  });

  it('paginated nests items + meta under data', () => {
    const meta = { limit: 20, nextCursor: 'abc', hasMore: true };
    expect(paginated([{ id: '1' }], meta, 'Retrieved')).toEqual({
      message: 'Retrieved',
      data: { items: [{ id: '1' }], meta },
    });
  });
});
