import { describe, it, expect } from 'vitest';
import { toSafeHttpUrl } from './safe-url';

describe('toSafeHttpUrl', () => {
  it('returns http(s) URLs unchanged', () => {
    expect(toSafeHttpUrl('https://acme.com/jobs')).toBe('https://acme.com/jobs');
    expect(toSafeHttpUrl('http://x.com')).toBe('http://x.com');
  });

  it('returns null for dangerous or non-http(s) schemes', () => {
    for (const raw of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'ftp://x.com']) {
      expect(toSafeHttpUrl(raw)).toBeNull();
    }
  });

  it('returns null for an unparseable value', () => {
    expect(toSafeHttpUrl('not a url')).toBeNull();
  });
});
