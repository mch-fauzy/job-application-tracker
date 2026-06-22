import 'server-only';
import './force-ipv4'; // prefer IPv4 before any connection is opened
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import { config } from '@/shared/config';

// neon-serverless needs a WebSocket constructor in Node (interactive transactions
// require it - neon-http has none, which the audit log depends on).
neonConfig.webSocketConstructor = ws;

// Conservative cap for Neon's pooled connection limits per serverless instance.
const POOL_MAX = 5;
const pool = new Pool({ connectionString: config.database.url, max: POOL_MAX }); // POOLED url
export const db = drizzle({ client: pool });

// The interactive-transaction handle passed to repositories and recordAudit.
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
