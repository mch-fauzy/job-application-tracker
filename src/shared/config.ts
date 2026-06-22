import 'server-only';
import { z } from 'zod';

// Environment schema. The only place env is read - fails fast on bad config.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, { error: 'DATABASE_URL is required' }),
});

// Parse and shape the typed config. Throws on invalid env - env arg keeps it testable.
// loadConfig is exported only for tests - the runtime singleton is `config`.
export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    database: { url: e.DATABASE_URL },
  } as const;
}

// App-wide config singleton. Access env only through this object.
export const config = loadConfig();
