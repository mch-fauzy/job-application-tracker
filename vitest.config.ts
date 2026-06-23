import { defineConfig, coverageConfigDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  // server-only throws outside an RSC bundler; stub it so node-env tests can
  // import server-only modules (e.g. shared/lib/db.ts).
  'server-only': fileURLToPath(new URL('./tests/stubs/server-only.js', import.meta.url)),
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      // text prints the summary table - html writes a browsable report to coverage/ (gitignored).
      reporter: ['text', 'html'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
      exclude: [
        ...coverageConfigDefaults.exclude,
        // Generated shadcn/ui primitives (knip-ignored too) - not our logic.
        'src/shared/components/ui/**',
        // RSC pages, app shell, and route loading skeletons are verified by build, not unit-tested.
        'src/app/layout.tsx',
        'src/app/**/page.tsx',
        'src/app/**/loading.tsx',
      ],
    },
    // Two projects: `unit` is hermetic (used by the pre-commit hook); `integration`
    // hits the real DB. Run with `--project unit` / `--project integration`.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node', // client tests opt into jsdom per-file
          // scripts/ holds the seed CLI - its pure data builder is unit-tested here too.
          include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.{ts,tsx}'],
          exclude: ['**/*.integration.test.{ts,tsx}', '**/node_modules/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['src/**/*.integration.test.{ts,tsx}'],
        },
      },
    ],
  },
});
