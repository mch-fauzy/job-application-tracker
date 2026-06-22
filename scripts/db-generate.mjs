// Wraps `drizzle-kit generate` to REQUIRE an explicit, descriptive snake_case --name, so
// migrations never receive drizzle's random "adjective_noun" names. Extra flags (e.g.
// --custom) are forwarded unchanged.
// Usage: npm run db:generate -- --name create_applications
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const nameIdx = args.indexOf('--name');
const name = nameIdx !== -1 ? args[nameIdx + 1] : undefined;

if (!name || !/^[a-z0-9]+(_[a-z0-9]+)*$/.test(name)) {
  // A standalone CLI wrapper - no app logger context here, so console is the right tool.
  console.error(
    'Migration name required. Use a descriptive snake_case name:\n' +
      '  npm run db:generate -- --name create_applications',
  );
  process.exit(1);
}

const result = spawnSync('drizzle-kit', ['generate', ...args], { stdio: 'inherit' });
if (result.status === null) {
  console.error('Failed to spawn drizzle-kit');
  process.exit(1);
}
process.exit(result.status);
