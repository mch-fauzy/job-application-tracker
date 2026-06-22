// Empty stub aliased over the `server-only` package in Vitest. The real package
// throws outside a React Server Component bundler, which would break node-env
// tests that import server-only modules (e.g. shared/lib/db.ts).
export {};
