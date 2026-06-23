// Shown while the archived page prefetches its data on navigation. Fills the shell.
export default function Loading() {
  return (
    <div className="flex h-full max-w-2xl flex-col gap-4" role="status" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-32 shrink-0 animate-pulse rounded bg-muted" />
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="h-20 shrink-0 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}
