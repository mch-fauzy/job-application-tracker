import 'dotenv/config'; // load .env so DATABASE_URL_UNPOOLED is available to the CLI
import './src/shared/lib/db/force-ipv4'; // prefer IPv4 so migrations connect in IPv6-blackholed envs
import { defineConfig } from 'drizzle-kit';

// Migrations run against the UNPOOLED url (Neon/Vercel standard) as a deploy/CI step.
// Guarded here because this is the only env read outside the zod config (server-only).
const unpooledUrl = process.env.DATABASE_URL_UNPOOLED;
if (!unpooledUrl) {
  throw new Error('DATABASE_URL_UNPOOLED is required for migrations');
}

// Schema discovered by glob: each feature's db/schema.ts plus the shared audit log.
export default defineConfig({
  schema: ['./src/features/*/db/schema.ts', './src/shared/db/audit-log.ts'],
  out: './src/shared/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: unpooledUrl },
});
