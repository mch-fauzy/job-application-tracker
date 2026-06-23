import { APPLICATION_STATUS } from './status';
import type { ApplicationStatus, TerminalStatus } from './status';

// Human-readable column and badge labels for every status. One source for the board,
// the archived list, and card menus, so a label never drifts between views.
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  [APPLICATION_STATUS.SAVED]: 'Saved',
  [APPLICATION_STATUS.APPLIED]: 'Applied',
  [APPLICATION_STATUS.INTERVIEWING]: 'Interviewing',
  [APPLICATION_STATUS.OFFER]: 'Offer',
  [APPLICATION_STATUS.ACCEPTED]: 'Accepted',
  [APPLICATION_STATUS.REJECTED]: 'Rejected',
  [APPLICATION_STATUS.WITHDRAWN]: 'Withdrawn',
};

// The card menu's terminal actions: the verb shown and the status it sets.
export const TERMINAL_ACTIONS: ReadonlyArray<{ status: TerminalStatus; label: string }> = [
  { status: APPLICATION_STATUS.ACCEPTED, label: 'Mark Accepted' },
  { status: APPLICATION_STATUS.REJECTED, label: 'Reject' },
  { status: APPLICATION_STATUS.WITHDRAWN, label: 'Withdraw' },
];
