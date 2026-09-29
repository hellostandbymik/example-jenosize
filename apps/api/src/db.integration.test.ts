import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {pool} from './db/pool.js';
const enabled=process.env.CRM_INTEGRATION==='true';
describe.skipIf(!enabled)('CRM persistence vertical slice (requires migrated and seeded PostgreSQL)',()=>{
  it('creates a lead, advances stage, and preserves the activity audit trail',async()=>{
    const user=await pool.query("SELECT id FROM users WHERE email='sales01@jenosize.local' AND active=true");
    expect(user.rowCount).toBe(1);
    const created=await pool.query("INSERT INTO leads(title,owner_id,stage,source) VALUES('Integration flow',$1,'New','Test') RETURNING id",[user.rows[0].id]);
    const id=created.rows[0].id;
    try { await pool.query("UPDATE leads SET stage='Qualified',updated_at=now() WHERE id=$1",[id]);await pool.query("INSERT INTO activities(lead_id,actor_id,type,body) VALUES($1,$2,'stage_changed','New → Qualified')",[id,user.rows[0].id]);const lead=await pool.query('SELECT stage FROM leads WHERE id=$1',[id]);const activities=await pool.query('SELECT body FROM activities WHERE lead_id=$1',[id]);expect(lead.rows[0].stage).toBe('Qualified');expect(activities.rows[0].body).toBe('New → Qualified');} finally {await pool.query('DELETE FROM leads WHERE id=$1',[id]);}
  });
  it('persists each LINE webhook event only once when a delivery is repeated',async()=>{
    const key=`integration-${randomUUID()}`;
    try {const first=await pool.query('INSERT INTO webhook_events(event_key,payload) VALUES($1,$2) ON CONFLICT(event_key) DO NOTHING RETURNING event_key',[key,{events:[]}]);const duplicate=await pool.query('INSERT INTO webhook_events(event_key,payload) VALUES($1,$2) ON CONFLICT(event_key) DO NOTHING RETURNING event_key',[key,{events:[]}]);expect(first.rowCount).toBe(1);expect(duplicate.rowCount).toBe(0);} finally {await pool.query('DELETE FROM webhook_events WHERE event_key=$1',[key]);}
  });
});
