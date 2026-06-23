'use client';

import { createContext, use, type ReactNode } from 'react';
import type { ApplicationResponse } from '../dtos/v1/responses/application';
import type { ApplicationStatus, TerminalStatus } from '../constants/status';

// Board-level card actions, injected once at the board and read by every card through context,
// so a column never has to forward handlers it does not use itself.
export interface ApplicationActions {
  move: (app: ApplicationResponse, toStatus: ApplicationStatus) => void;
  markTerminal: (app: ApplicationResponse, terminalStatus: TerminalStatus) => void;
  edit: (app: ApplicationResponse) => void;
  remove: (id: string) => void;
}

const ApplicationActionsContext = createContext<ApplicationActions | null>(null);

export function ApplicationActionsProvider({
  actions,
  children,
}: {
  actions: ApplicationActions;
  children: ReactNode;
}) {
  return <ApplicationActionsContext value={actions}>{children}</ApplicationActionsContext>;
}

export function useApplicationActions(): ApplicationActions {
  const actions = use(ApplicationActionsContext);
  if (!actions) {
    throw new Error('useApplicationActions must be used within an ApplicationActionsProvider');
  }
  return actions;
}
