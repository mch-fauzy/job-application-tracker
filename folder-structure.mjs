// @ts-check
import { createFolderStructure } from 'eslint-plugin-project-structure';

// Reusable file patterns for the feature/shared layers: kebab-case implementation files
// plus their colocated unit/integration tests. Framework files (page/layout/route) live
// under app/, which is left unconstrained below.
const codeFiles = [
  { name: '{kebab-case}.(ts|tsx)' },
  { name: '{kebab-case}.test.(ts|tsx)' },
  { name: '{kebab-case}.integration.test.(ts|tsx)' },
  { name: '{kebab-case}.css' },
];

// src splits into app | features | shared; lib/ and utils/ are utility buckets that may
// contain ONLY concern subfolders (no loose files); single-role folders stay flat with
// kebab-case files. db/ is left open for generated migrations.
export const folderStructureConfig = createFolderStructure({
  structure: [
    { name: '*' }, // any root-level file (package.json, eslint.config.mjs, ...)
    { name: 'src', ruleId: 'src_root' },
    { name: '(?!src$).*', children: [] }, // any other root folder (docs, node_modules, ...)
  ],
  rules: {
    src_root: {
      children: [
        { name: 'app', children: [] }, // Next.js App Router - framework conventions, unconstrained
        { name: 'features', ruleId: 'segment' },
        { name: 'shared', ruleId: 'segment' },
      ],
    },
    // A layer segment: nested role folders + kebab-case files. lib/utils become buckets.
    // db/ holds generated SQL/JSON migrations so it is left open.
    segment: {
      children: [
        { name: '(lib|utils)', ruleId: 'bucket' },
        { name: 'db', children: [] },
        { name: '*', ruleId: 'segment' },
        ...codeFiles,
      ],
    },
    // lib/ and utils/ buckets: ONLY concern subfolders, never loose files.
    bucket: {
      children: [{ name: '*', ruleId: 'concern' }],
    },
    // A concern folder inside a bucket: holds its colocated files (may nest further).
    concern: {
      children: [{ name: '*', ruleId: 'concern' }, ...codeFiles],
    },
  },
});
