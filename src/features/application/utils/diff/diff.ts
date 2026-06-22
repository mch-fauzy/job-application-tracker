// Computes the changed fields between two snapshots for the audit `diff`. Only keys present
// in BOTH objects are compared. Dates compare by instant, everything else by strict equality.
export function diffOf(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const result: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(before)) {
    if (!(key in after)) continue;
    const a = before[key];
    const b = after[key];
    const equal =
      a === b || (a instanceof Date && b instanceof Date && a.getTime() === b.getTime());
    if (!equal) {
      result[key] = { from: a, to: b };
    }
  }
  return result;
}
