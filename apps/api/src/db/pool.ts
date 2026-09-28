import pg from 'pg';
import { databaseConfig, databaseErrorCode } from './config.js';
const { Pool } = pg;
// Reuse one small pool per serverless instance; set PG_POOL_MAX=10 for a persistent local server if desired.
export const pool = new Pool(databaseConfig());
pool.on('error', error => {
  // Idle connection errors must not terminate the API or expose credentials in logs.
  console.error(JSON.stringify({ event: 'database_pool_error', code: databaseErrorCode(error) }));
});
export const query = (text: string, values: unknown[] = []) => pool.query(text, values);
