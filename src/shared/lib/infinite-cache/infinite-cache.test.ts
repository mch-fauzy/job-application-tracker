import { describe, it, expect } from 'vitest';
import { withoutItem, type PaginatedInfiniteCache } from './infinite-cache';

interface Item {
  id: string;
  label: string;
}

function cache(...pages: Item[][]): PaginatedInfiniteCache<Item> {
  return {
    pages: pages.map((items) => ({ items, meta: { limit: 20, nextCursor: null, hasMore: false } })),
    pageParams: pages.map(() => null),
  };
}

describe('withoutItem', () => {
  it('returns undefined when the cache is undefined', () => {
    expect(withoutItem(undefined, 'a')).toBeUndefined();
  });

  it('removes the matching item from its page', () => {
    const result = withoutItem(cache([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]), 'a');
    expect(result?.pages[0].items).toEqual([{ id: 'b', label: 'B' }]);
  });

  it('removes the item from whichever page holds it', () => {
    const result = withoutItem(cache([{ id: 'a', label: 'A' }], [{ id: 'b', label: 'B' }]), 'b');
    expect(result?.pages[0].items).toEqual([{ id: 'a', label: 'A' }]);
    expect(result?.pages[1].items).toEqual([]);
  });

  it('leaves items intact when the id is not present', () => {
    const result = withoutItem(cache([{ id: 'a', label: 'A' }]), 'missing');
    expect(result?.pages[0].items).toEqual([{ id: 'a', label: 'A' }]);
  });

  it('does not mutate the input cache', () => {
    const input = cache([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]);
    const before = structuredClone(input);
    withoutItem(input, 'a');
    expect(input).toEqual(before);
  });
});
