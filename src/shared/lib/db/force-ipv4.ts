import dns from 'node:dns';
import net from 'node:net';

// Side-effect module: prefer IPv4 and disable happy-eyeballs family autoselection.
// Some environments (WSL2, some CI) blackhole IPv6 to the DB host, so Node's
// default IPv6-first connect hangs (ETIMEDOUT). Neon serves IPv4 too, so forcing
// IPv4-first is safe on every OS and a no-op where IPv6 already works.
// Imported by the DB connection (shared/lib/db.ts) and by drizzle.config.ts.
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);
