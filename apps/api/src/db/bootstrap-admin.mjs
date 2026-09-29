import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { databaseConfig, databaseErrorCode } from './config.ts';
import { bootstrapAdminConfig, createBootstrapAdmin } from './private-accounts.ts';

dotenv.config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), override: false });

let pool;
let client;
try {
 const config = bootstrapAdminConfig(process.env);
 pool = new pg.Pool(databaseConfig());
 client = await pool.connect();
 await createBootstrapAdmin(client, config);
 console.log('Private Super Admin created. No existing account was changed.');
} catch (error) {
 const message = error instanceof Error && /^(BOOTSTRAP_ADMIN_|Administrator bootstrap refused:|DATABASE_URL|Set DATABASE_URL|Use PGSSL_CA)/.test(error.message)
  ? error.message : `Administrator bootstrap failed (${databaseErrorCode(error)}).`;
 console.error(message);
 process.exitCode = 1;
} finally {
 client?.release();
 await pool?.end();
}
