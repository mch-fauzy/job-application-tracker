// Entity-first query keys from a typed factory. The entity prefix is what makes
// matchQuery-based invalidation work (see query-client.ts).
export const queryKeys = {
  applications: {
    all: ['applications'] as const,
    list: (params?: unknown) => ['applications', 'list', params] as const,
    detail: (id: string) => ['applications', 'detail', id] as const,
  },
  timeline: {
    detail: (id: string) => ['timeline', 'detail', id] as const,
  },
} as const;
