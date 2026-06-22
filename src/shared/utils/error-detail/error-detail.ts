// Derives the error detail for the 500 response envelope. Returns null in production to avoid
// leaking internals (connection strings, schema names), and the raw message otherwise.
export function errorDetail(err: unknown, isProduction: boolean): string | null {
  if (isProduction) return null;
  return err instanceof Error ? err.message : String(err);
}
