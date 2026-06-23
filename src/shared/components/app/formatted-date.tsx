'use client';

import { useSyncExternalStore } from 'react';

interface FormattedDateProps {
  value: string; // ISO 8601 timestamp
  className?: string;
}

// "Am I running in the browser yet" without a setState-in-effect: useSyncExternalStore returns the
// server snapshot (false) during SSR and the first hydration render, then the client snapshot (true)
// afterwards. The store never changes, so subscribe is a no-op.
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

// Renders a timestamp without a hydration mismatch. toLocaleString depends on the runtime locale
// and timezone, so the server and the browser format the same instant differently. We render the
// stable ISO date on the server and the first client paint, then upgrade to the user's full local
// date-time once hydrated, when only the browser is running.
export function FormattedDate({ value, className }: FormattedDateProps) {
  const isClient = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const text = isClient ? new Date(value).toLocaleString() : value.slice(0, 10);

  return (
    <span className={className} suppressHydrationWarning>
      {text}
    </span>
  );
}
