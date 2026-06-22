import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

// Unidirectional import flow: shared -> features -> app.
// - shared/ is importable by anything but may import only shared/
// - a feature may import shared/ + its own files only (no cross-feature)
// - app/ composes features; nothing imports app/
const boundariesConfig = {
  files: ["src/**/*.{ts,tsx}"],
  plugins: { boundaries },
  settings: {
    "boundaries/include": ["src/**/*"],
    "boundaries/elements": [
      { type: "shared", mode: "full", pattern: "src/shared/**/*" },
      { type: "feature", mode: "full", pattern: "src/features/*/**/*", capture: ["feature"] },
      { type: "app", mode: "full", pattern: "src/app/**/*" },
    ],
    // Resolve the @/* path alias so boundaries can map import specifiers to elements.
    "import/resolver": { typescript: { project: "./tsconfig.json" } },
  },
  rules: {
    "boundaries/dependencies": [
      "error",
      {
        default: "disallow",
        rules: [
          // shared/ may import only shared/
          { from: [{ type: "shared" }], allow: [{ to: { type: "shared" } }] },
          // a feature may import shared/ + its own files (no cross-feature)
          {
            from: [{ type: "feature" }],
            allow: [
              { to: { type: "shared" } },
              { to: { type: "feature", captured: { feature: "{{ from.captured.feature }}" } } },
            ],
          },
          // app/ composes features and shared, and may import within the app layer
          {
            from: [{ type: "app" }],
            allow: [{ to: { type: "shared" } }, { to: { type: "feature" } }, { to: { type: "app" } }],
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  boundariesConfig,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated artifacts are not linted.
    "coverage/**",
    "src/shared/db/migrations/**",
  ]),
]);

export default eslintConfig;
