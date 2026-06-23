import { describe, it, expect } from 'vitest';
import { queryKeys } from './query-keys';

describe('queryKeys', () => {
  it('are entity-first', () => {
    expect(queryKeys.applications.all).toEqual(['applications']);
    expect(queryKeys.applications.list({ status: 'applied' })).toEqual(['applications', 'list', { status: 'applied' }]);
    expect(queryKeys.applications.detail('id-1')).toEqual(['applications', 'detail', 'id-1']);
    expect(queryKeys.timeline.all).toEqual(['timeline']);
    expect(queryKeys.timeline.detail('id-1')).toEqual(['timeline', 'detail', 'id-1']);
  });
});
