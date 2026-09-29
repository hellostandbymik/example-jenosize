import { Router } from 'express';
import { leadScope } from './access.js';

type Database = { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> };
export function createFollowUpRouter(db: Database) {
  const router = Router();
  router.get('/follow-ups', async (req, res, next) => {
    try {
      const result = await db.query(`SELECT l.id,l.title,l.stage,l.owner_id,l.next_follow_up,
        c.name company,ct.first_name contact_first,ct.last_name contact_last,u.name owner
        FROM leads l LEFT JOIN companies c ON c.id=l.company_id
        LEFT JOIN contacts ct ON ct.id=l.contact_id JOIN users u ON u.id=l.owner_id
        WHERE ($1::boolean OR l.owner_id=$2) AND l.stage NOT IN ('Won','Lost')
        ORDER BY l.next_follow_up ASC NULLS LAST,l.id`, leadScope(req));
      res.json({ items: result.rows });
    } catch (error) { next(error); }
  });
  return router;
}
