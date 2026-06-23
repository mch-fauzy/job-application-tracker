// Defense in depth for rendered links: only an http(s) URL may reach an href. Schemes like
// javascript: or data: are an XSS vector, so this returns null for anything that is not http(s).
export function toSafeHttpUrl(raw: string): string | null {
  try {
    const { protocol } = new URL(raw);
    return protocol === 'http:' || protocol === 'https:' ? raw : null;
  } catch {
    return null;
  }
}