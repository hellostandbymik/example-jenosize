import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { databaseConfig, databaseErrorCode } from './config.ts';
import { requireSeedPassword } from './private-accounts.ts';
import { demoSql } from './demo-data.mjs';
// Workspace commands run from apps/api. Preserve any injected environment values.
dotenv.config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), override: false });
let pool;
let client;
let transactionStarted = false;
try {
 const password = requireSeedPassword(process.env);
 const passwordHash = await bcrypt.hash(password, 12);
 pool = new pg.Pool(databaseConfig());
 client = await pool.connect();
 await client.query('BEGIN');
 transactionStarted = true;
 await client.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
 await client.query(demoSql(passwordHash));
 await client.query('COMMIT');
 transactionStarted = false;
 console.log('Seed complete: 20 sales members, 20 Thai companies, 2,000 fictional contacts and 300 fictional opportunities. Existing passwords, roles, IDs and LINE links preserved.');
} catch (error) {
 if (client && transactionStarted) await client.query('ROLLBACK').catch(() => {});
 const message = error instanceof Error && /^(DEMO_SEED_PASSWORD|DATABASE_URL|Set DATABASE_URL|Use PGSSL_CA)/.test(error.message)
  ? error.message : `Seed failed (${databaseErrorCode(error)}).`;
 console.error(message);
 process.exitCode = 1;
} finally {
 client?.release();
 await pool?.end();
}
