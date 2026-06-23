// Read the message field from an error response body of unknown shape.
export function apiErrorMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('message' in body)) {
    return undefined;
  }
  const { message } = body;
  return typeof message === 'string' ? message : undefined;
}
