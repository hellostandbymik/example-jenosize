import pg from 'pg';
const { Pool } = pg;
// Reuse one small pool per serverless instance; set PG_POOL_MAX=10 for a persistent local server if desired.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://crm:crm_dev_password@localhost:5432/jenosize_crm',
  max: Number(process.env.PG_POOL_MAX || (process.env.VERCEL ? 1 : 10)),
  ...(process.env.PGSSLMODE === 'require' ? { ssl: { rejectUnauthorized: true } } : {})
});
export const query = (text: string, values: unknown[] = []) => pool.query(text, values);
