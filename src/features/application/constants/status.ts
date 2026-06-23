import { z } from 'zod';

// The status pipeline as an enum-like const object - named access (APPLICATION_STATUS.SAVED)
// and a derived union, per the no-TS-enum convention. Stored as a `text` column and validated
// only by the Zod enum below, so adding or removing a status is code-only (no migration).
export const APPLICATION_STATUS = {
  SAVED: 'saved',
  APPLIED: 'applied',
  INTERVIEWING: 'interviewing',
  OFFER: 'offer',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
} as const;

// The canonical status union, used across the DTOs, repository, and schema (and the client board later).
export type ApplicationStatus = (typeof APPLICATION_STATUS)[keyof typeof APPLICATION_STATUS];

// Active statuses map to the 4 board columns, in pipeline order.
export const ACTIVE_STATUSES = [
  APPLICATION_STATUS.SAVED,
  APPLICATION_STATUS.APPLIED,
  APPLICATION_STATUS.INTERVIEWING,
  APPLICATION_STATUS.OFFER,
] as const;

// Terminal statuses are archived - "Archived" is derived, there is no isArchived column.
export const TERMINAL_STATUSES = [
  APPLICATION_STATUS.ACCEPTED,
  APPLICATION_STATUS.REJECTED,
  APPLICATION_STATUS.WITHDRAWN,
] as const;

// The terminal-status union, used by the card menu and board terminal actions.
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

// True when a status is terminal (archived). some() (not includes) keeps the comparison typed
// against the wider ApplicationStatus union without an `as` cast on the narrow tuple.
export function isTerminalStatus(status: ApplicationStatus): boolean {
  return TERMINAL_STATUSES.some((terminal) => terminal === status);
}

// Boundary guard shared by the request DTOs and the Drizzle status default. z.enum takes the
// const object directly in Zod 4, replacing the deprecated z.nativeEnum.
export const applicationStatusSchema = z.enum(APPLICATION_STATUS);
