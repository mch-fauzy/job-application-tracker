// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormattedDate } from './formatted-date';

describe('FormattedDate', () => {
  it('renders the localized date after mount', () => {
    render(<FormattedDate value="2026-06-23T16:18:59.000Z" />);
    // After mount the effect runs, so the localized (non-ISO) form is shown.
    const expected = new Date('2026-06-23T16:18:59.000Z').toLocaleString();
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('applies the given className', () => {
    render(<FormattedDate value="2026-06-23T16:18:59.000Z" className="text-xs" />);
    const expected = new Date('2026-06-23T16:18:59.000Z').toLocaleString();
    expect(screen.getByText(expected)).toHaveClass('text-xs');
  });
});
