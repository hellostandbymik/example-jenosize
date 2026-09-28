import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { databaseConfig, databaseErrorCode } from './config.js';

describe('hosted database configuration', () => {
  it('rejects missing and local Vercel credentials before attempting a connection', () => {
    expect(() => databaseConfig({ VERCEL: '1' })).toThrow('Set DATABASE_URL');
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect(() => databaseConfig({ VERCEL: '1', DATABASE_URL: `postgres://user:password@${host}/postgres` })).toThrow('not localhost');
    }
  });

  it('keeps the local database default for local development', () => {
    expect(databaseConfig({}).connectionString).toContain('localhost:5432/jenosize_crm');
    expect(databaseConfig({ PGSSLMODE: 'disable' }).ssl).toBe(false);
  });

  it('keeps the Supabase CA after pg parses a URL containing sslmode', async () => {
    const config = databaseConfig({
      VERCEL: '1',
      DATABASE_URL: 'postgres://postgres.project:password@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require',
      PGSSL_CA: 'certificate-line-1\\ncertificate-line-2'
    });
    const pool = new pg.Pool(config);
    try {
      const client = new pg.Client(pool.options);
      expect(client.ssl).toEqual({ rejectUnauthorized: true, ca: 'certificate-line-1\ncertificate-line-2' });
      expect(config.max).toBe(1);
      expect(config.connectionTimeoutMillis).toBe(5000);
    } finally { await pool.end(); }
  });

  it('uses verified TLS for Supabase even without PGSSLMODE', () => {
    expect(databaseConfig({ DATABASE_URL: 'postgres://user:password@db.project.supabase.co:5432/postgres' }).ssl)
      .toEqual({ rejectUnauthorized: true });
  });

  it('does not include invalid connection secrets in configuration errors', () => {
    expect(() => databaseConfig({ DATABASE_URL: 'invalid-secret-password' })).toThrow('DATABASE_URL must be a valid PostgreSQL connection URL.');
  });

  it('logs only a bounded error code, without raw error details', () => {
    expect(databaseErrorCode({ code: '28P01', message: 'password=secret' })).toBe('28P01');
    expect(databaseErrorCode({ code: 'postgres://user:secret@host/database' })).toBe('DB_CONNECTION_FAILED');
    expect(databaseErrorCode(new Error('password=secret'))).toBe('DB_CONNECTION_FAILED');
  });
});
