import { QueryClient, MutationCache, matchQuery, type QueryKey } from '@tanstack/react-query';

// SSR-safe environment check (the package's isServer re-export is deprecated).
const isServer = typeof window === 'undefined';

// Mutations may tag the query-key prefixes they invalidate.
declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { invalidates?: QueryKey[] };
  }
}

function makeQueryClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000 } }, // tempers broad invalidation
    mutationCache: new MutationCache({
      // Auto-invalidate after every successful mutation: broad by default,
      // narrowed when a mutation tags meta.invalidates.
      onSuccess: (_data, _vars, _ctx, mutation) => {
        client.invalidateQueries({
          predicate: (query) =>
            mutation.meta?.invalidates?.some((key) => matchQuery({ queryKey: key }, query)) ?? true,
        });
      },
    }),
  });
  return client;
}

let browserClient: QueryClient | undefined;

/**
 * Builds the request-scoped (server) or singleton (browser) QueryClient.
 * @public
 */
export function getQueryClient() {
  if (isServer) return makeQueryClient(); // fresh per request (RSC prefetch)
  return (browserClient ??= makeQueryClient()); // singleton in the browser
}
