import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('reads required env vars', () => {
    const cfg = loadConfig({ DATABASE_URL: 'postgres://app', NODE_ENV: 'test' });
    expect(cfg.database.url).toBe('postgres://app');
    expect(cfg.nodeEnv).toBe('test');
  });

  it('defaults NODE_ENV to development and derives isProduction', () => {
    const cfg = loadConfig({ DATABASE_URL: 'postgres://app' });
    expect(cfg.nodeEnv).toBe('development');
    expect(cfg.isProduction).toBe(false);
    expect(loadConfig({ DATABASE_URL: 'postgres://app', NODE_ENV: 'production' }).isProduction).toBe(true);
  });

  it('throws when a required var is missing', () => {
    expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow(/DATABASE_URL/);
  });
});
