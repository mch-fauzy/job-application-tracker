// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInfiniteScroll } from './use-infinite-scroll';

let observerCallback: IntersectionObserverCallback | null = null;
const observe = vi.fn();
const disconnect = vi.fn();

beforeEach(() => {
  observerCallback = null;
  observe.mockClear();
  disconnect.mockClear();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IntersectionObserverCallback) {
        observerCallback = cb;
      }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = vi.fn();
    },
  );
});

// Fires the captured observer callback as if the sentinel scrolled into view.
function intersect() {
  act(() => {
    observerCallback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
}

function refs() {
  return {
    scrollRef: { current: document.createElement('div') },
    sentinelRef: { current: document.createElement('div') },
  };
}

describe('useInfiniteScroll', () => {
  it('fetches the next page when the sentinel intersects', () => {
    const fetchNextPage = vi.fn();
    renderHook(() =>
      useInfiniteScroll({ ...refs(), hasNextPage: true, isFetchingNextPage: false, fetchNextPage }),
    );
    expect(observe).toHaveBeenCalledOnce();
    intersect();
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it('does not fetch when there is no next page', () => {
    const fetchNextPage = vi.fn();
    renderHook(() =>
      useInfiniteScroll({ ...refs(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage }),
    );
    intersect();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('does not fetch while a page is already being fetched', () => {
    const fetchNextPage = vi.fn();
    renderHook(() =>
      useInfiniteScroll({ ...refs(), hasNextPage: true, isFetchingNextPage: true, fetchNextPage }),
    );
    intersect();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('reads the latest query state without rewiring the observer', () => {
    const fetchNextPage = vi.fn();
    const stableRefs = refs();
    const { rerender } = renderHook(
      (props: { hasNextPage: boolean; isFetchingNextPage: boolean }) =>
        useInfiniteScroll({ ...stableRefs, fetchNextPage, ...props }),
      { initialProps: { hasNextPage: true, isFetchingNextPage: false } },
    );
    intersect();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    // A fetch is now in flight: the same observer must read the new state and skip.
    rerender({ hasNextPage: true, isFetchingNextPage: true });
    intersect();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledOnce();
  });

  it('disconnects the observer on unmount', () => {
    const { unmount } = renderHook(() =>
      useInfiniteScroll({ ...refs(), hasNextPage: true, isFetchingNextPage: false, fetchNextPage: vi.fn() }),
    );
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
