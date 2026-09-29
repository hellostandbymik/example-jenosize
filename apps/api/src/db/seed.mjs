import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { demoSql } from './demo-data.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL||'postgresql://crm:crm_dev_password@localhost:5432/jenosize_crm',...(process.env.PGSSLMODE==='require'?{ssl:{rejectUnauthorized:true,...(process.env.PGSSL_CA?{ca:process.env.PGSSL_CA.replace(/\\n/g,'\n')}:{})}}:{})});
const client=await pool.connect();
try {
 await client.query('BEGIN');
 await client.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
 await client.query(demoSql(await bcrypt.hash('[removed-demo-password]',10)));
 await client.query('COMMIT');
 console.log('Seed complete: 20 members (1 Super Admin + 19 sales), 20 Thai companies, 2,000 fictional contacts and 300 fictional opportunities. Existing IDs and LINE links preserved.');
} catch(error){await client.query('ROLLBACK');throw error;}
finally{client.release();await pool.end();}
