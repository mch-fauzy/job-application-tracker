// Keyset pagination cursor codec. Encodes the sort key (timestamp + id) as a base64url
// token. Field name `ts` is generic (not `updatedAt`) so the audit timeline can reuse it
// with `createdAt`.

export function encodeCursor(input: { ts: Date; id: string }): string {
  const payload = `${input.ts.toISOString()}|${input.id}`;
  return Buffer.from(payload).toString('base64url');
}

export function decodeCursor(cursor: string): { ts: Date; id: string } {
  // Buffer.from with an encoding never throws - it decodes leniently, so the format
  // checks below (pipe separator + valid date) are what reject a malformed cursor.
  const payload = Buffer.from(cursor, 'base64url').toString('utf-8');

  const pipeIdx = payload.indexOf('|');
  if (pipeIdx === -1) throw new Error('Invalid cursor');

  const isoStr = payload.slice(0, pipeIdx);
  const id = payload.slice(pipeIdx + 1);

  const ts = new Date(isoStr);
  if (isNaN(ts.getTime())) throw new Error('Invalid cursor');
  if (!id) throw new Error('Invalid cursor');

  return { ts, id };
}
