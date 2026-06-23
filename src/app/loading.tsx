// Shown while the board page prefetches its data on navigation, so a route change gives
// immediate feedback instead of a frozen previous page. Fills the shell like the real board.
export default function Loading() {
  return (
    <div className="flex h-full flex-col gap-6" role="status" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-40 shrink-0 animate-pulse rounded bg-muted" />
      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto">
        {[0, 1, 2, 3].map((column) => (
          <div key={column} className="flex h-full w-72 shrink-0 flex-col gap-3">
            <div className="h-5 w-24 shrink-0 animate-pulse rounded bg-muted" />
            {[0, 1, 2].map((card) => (
              <div key={card} className="h-20 shrink-0 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
