import type { PoolConfig } from 'pg';

const localUrl = 'postgresql://crm:crm_dev_password@localhost:5432/jenosize_crm';

export function databaseConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  const connectionString = env.DATABASE_URL?.trim() || (env.VERCEL === '1' ? '' : localUrl);
  if (!connectionString) throw new Error('Set DATABASE_URL on the Vercel API project before deploying.');

  let url: URL;
  try {
    url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error();
  } catch {
    // Do not include the connection string: it contains the database password.
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }
  if (env.VERCEL === '1' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('DATABASE_URL on Vercel must point to the hosted database, not localhost.');
  }

  const sslMode = url.searchParams.get('sslmode') || env.PGSSLMODE;
  const supabase = url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.pooler.supabase.com');
  const ca = env.PGSSL_CA?.replace(/\\n/g, '\n');
  const ssl = sslMode === 'disable' ? false
    : (ca || supabase || ['require', 'verify-ca', 'verify-full'].includes(sslMode || ''))
      ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : undefined;
  if (ssl !== undefined) {
    // pg parses URL SSL options after PoolConfig and would discard the supplied CA.
    if (ca && ['sslcert', 'sslkey', 'sslrootcert'].some(key => url.searchParams.has(key))) {
      throw new Error('Use PGSSL_CA without certificate file parameters in DATABASE_URL.');
    }
    url.searchParams.delete('sslmode');
    url.searchParams.delete('ssl');
    url.searchParams.delete('uselibpqcompat');
  }

  return {
    connectionString: url.toString(),
    max: Number(env.PG_POOL_MAX || (env.VERCEL === '1' ? 1 : 10)),
    connectionTimeoutMillis: 5000,
    query_timeout: 10000,
    ...(ssl !== undefined ? { ssl } : {})
  };
}

export function databaseErrorCode(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  return typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code) ? code : 'DB_CONNECTION_FAILED';
}
