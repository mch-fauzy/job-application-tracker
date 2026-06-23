'use client';

import { useEffect, useRef, type RefObject } from 'react';

interface InfiniteScrollOptions {
  // The scroll container used as the observer root. Omit to root at the viewport - use that when
  // the content flows in the page scroll rather than its own bounded panel.
  scrollRef?: RefObject<HTMLDivElement | null>;
  sentinelRef: RefObject<HTMLDivElement | null>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

// Loads the next page when the sentinel scrolls into view. The observer is wired once on mount and
// reads the latest query state through a ref, so a page fetch starting or finishing never tears the
// observer down and rebuilds it.
// Precondition: sentinelRef (and scrollRef when given) must point at elements that stay mounted for
// the hook's lifetime - the observer is wired once and is not re-created if those nodes are replaced.
export function useInfiniteScroll({
  scrollRef,
  sentinelRef,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: InfiniteScrollOptions) {
  // Latest query state, read inside the observer callback so the wiring effect stays wire-once.
  const stateRef = useRef({ hasNextPage, isFetchingNextPage, fetchNextPage });
  useEffect(() => {
    stateRef.current = { hasNextPage, isFetchingNextPage, fetchNextPage };
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const root = scrollRef?.current ?? null; // null roots the observer at the viewport
    const observer = new IntersectionObserver(
      (entries) => {
        const state = stateRef.current;
        if (entries[0]?.isIntersecting && state.hasNextPage && !state.isFetchingNextPage) {
          state.fetchNextPage();
        }
      },
      { root, threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollRef, sentinelRef]);
}
