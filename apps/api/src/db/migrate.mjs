import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'node:fs/promises';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://crm:crm_dev_password@localhost:5432/jenosize_crm',
  max: Number(process.env.PG_POOL_MAX || (process.env.VERCEL ? 1 : 10)),
  ...(process.env.PGSSLMODE === 'require' ? { ssl: { rejectUnauthorized: true } } : {})
});

try {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  console.log('Database schema applied');
} finally {
  await pool.end();
}
