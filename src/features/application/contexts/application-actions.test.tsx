// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import {
  ApplicationActionsProvider,
  useApplicationActions,
  type ApplicationActions,
} from './application-actions';

const actions: ApplicationActions = {
  move: vi.fn(),
  markTerminal: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
};

describe('useApplicationActions', () => {
  it('returns the actions provided by the nearest provider', () => {
    const { result } = renderHook(() => useApplicationActions(), {
      wrapper: ({ children }) => (
        <ApplicationActionsProvider actions={actions}>{children}</ApplicationActionsProvider>
      ),
    });
    expect(result.current).toBe(actions);
  });

  it('throws when used outside a provider', () => {
    // Silence the expected React error boundary log for this case.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Consumer() {
      useApplicationActions();
      return null;
    }
    expect(() => render(<Consumer />)).toThrow(/within an ApplicationActionsProvider/);
    spy.mockRestore();
  });

  it('renders its children', () => {
    render(
      <ApplicationActionsProvider actions={actions}>
        <span>child</span>
      </ApplicationActionsProvider>,
    );
    expect(screen.getByText('child')).toBeInTheDocument();
  });
});
