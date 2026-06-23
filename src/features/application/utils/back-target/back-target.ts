import { isTerminalStatus } from '../../constants/status';
import type { ApplicationStatus } from '../../constants/status';

interface BackTarget {
  href: string;
  label: string;
}

// The detail page's back link points to the list the application lives in, derived from its status:
// terminal apps are in the Archived view, active apps on the board. Deriving it from the resource
// (not navigation history or a URL param) keeps the canonical link correct even when the detail page
// is shared, refreshed, or reached by any path - and it self-corrects if the status changes here.
export function resolveBackTarget(status: ApplicationStatus): BackTarget {
  const isArchived = isTerminalStatus(status);
  return isArchived
    ? { href: '/archived', label: 'Back to archived' }
    : { href: '/', label: 'Back to board' };
}
