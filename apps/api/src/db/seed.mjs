import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { readFile } from 'node:fs/promises';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://crm:crm_dev_password@localhost:5432/jenosize_crm',
  max: Number(process.env.PG_POOL_MAX || (process.env.VERCEL ? 1 : 10)),
  ...(process.env.PGSSLMODE === 'require' ? { ssl: { rejectUnauthorized: true } } : {})
});

try {
  await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  const password = await bcrypt.hash('[removed-demo-password]', 10);
  await pool.query(`INSERT INTO users(name,email,password_hash,role)
   SELECT CASE WHEN n=0 THEN 'Demo Sales' ELSE 'Sales User '||lpad(n::text,2,'0') END,
   CASE WHEN n=0 THEN 'demo@jenosize.local' ELSE 'sales'||lpad(n::text,2,'0')||'@jenosize.local' END,
   $1, CASE WHEN n=0 THEN 'admin' ELSE 'sales' END
   FROM generate_series(0,19) n ON CONFLICT(email) DO NOTHING`, [password]);
  await pool.query(`INSERT INTO companies(name,website,industry)
   SELECT 'Synthetic Company '||lpad(n::text,2,'0'),'https://company-'||n||'.example.test',
   CASE WHEN n%3=0 THEN 'Technology' WHEN n%3=1 THEN 'Retail' ELSE 'Services' END
   FROM generate_series(1,20) n ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO contacts(company_id,first_name,last_name,email,phone,title)
   SELECT c.id,'Synthetic','Contact '||lpad(n::text,4,'0'),'contact'||n||'@example.test',
   '080000'||lpad(n::text,4,'0'),CASE WHEN n%2=0 THEN 'Manager' ELSE 'Director' END
   FROM generate_series(1,2000) n
   JOIN companies c ON c.name='Synthetic Company '||lpad(((n-1)%20+1)::text,2,'0')
   WHERE NOT EXISTS (SELECT 1 FROM contacts x WHERE x.email='contact'||n||'@example.test')`);
  await pool.query(`INSERT INTO leads(title,company_id,contact_id,owner_id,stage,source,value,probability,next_follow_up)
   SELECT 'Synthetic Opportunity '||lpad(n::text,3,'0'),c.id,ct.id,u.id,
   CASE WHEN n%10<3 THEN 'New' WHEN n%10<6 THEN 'Qualified' WHEN n%10<8 THEN 'Proposal' WHEN n%10=8 THEN 'Won' ELSE 'Lost' END,
   CASE WHEN n%3=0 THEN 'Website' WHEN n%3=1 THEN 'LINE' ELSE 'Manual' END,
   (n%25+1)*10000,CASE WHEN n%10<3 THEN 20 WHEN n%10<6 THEN 55 WHEN n%10<8 THEN 80 ELSE 100 END,
   now()+((n%14)::text||' days')::interval
   FROM generate_series(1,300) n
   JOIN companies c ON c.name='Synthetic Company '||lpad(((n-1)%20+1)::text,2,'0')
   JOIN contacts ct ON ct.email='contact'||n||'@example.test'
   JOIN users u ON u.email=CASE WHEN n%20=0 THEN 'demo@jenosize.local' ELSE 'sales'||lpad((n%20)::text,2,'0')||'@jenosize.local' END
   WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.title='Synthetic Opportunity '||lpad(n::text,3,'0'))`);
  const owner = (await pool.query("SELECT id FROM users WHERE email='demo@jenosize.local'")).rows[0].id;
  const lead = (await pool.query("SELECT id FROM leads WHERE title='Synthetic Opportunity 001' LIMIT 1")).rows[0];
  if (lead) await pool.query(`INSERT INTO activities(lead_id,actor_id,type,body)
   SELECT $1,$2,'note','Synthetic discovery note: confirm business need, budget and decision timeline.'
   WHERE NOT EXISTS (SELECT 1 FROM activities WHERE lead_id=$1)`, [lead.id, owner]);
  console.log('Seed complete: 20 users, 20 companies, 2,000 contacts, 300 leads. Demo: demo@jenosize.local / [removed-demo-password]');
} finally {
  await pool.end();
}
