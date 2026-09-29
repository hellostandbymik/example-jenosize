import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { AuthUser } from './auth.js';

type Database = { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> };
export const isSuperAdmin = (user?: AuthUser) => user?.role === 'super_admin';
// Bind these parameters in every list, aggregate and nested lead query.
export const leadScope = (req: Request) => [isSuperAdmin(req.user), req.user!.id];
export const messageScopeSql = `(lead_id IN (SELECT id FROM leads WHERE owner_id=$4)
  OR (lead_id IS NULL AND contact_id IN (SELECT contact_id FROM leads WHERE owner_id=$4)))`;

export function currentSession(db: Database) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (await db.query('SELECT id,name,email,role,session_version FROM users WHERE id=$1 AND active=true', [req.user!.id])).rows[0];
      if (!user || user.session_version !== (req.user!.session_version ?? 0)) return res.status(401).json({ error: 'Session revoked; please sign in again' });
      req.user = user;
      res.set('Cache-Control', 'private, no-store');
      next();
    } catch { res.status(503).json({ error: 'Could not verify session; please retry' }); }
  };
}

// Runs before every API router, including record edits and AI analysis.
export function resourceAccess(db: Database) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (isSuperAdmin(req.user)) return next();
    const lead = req.path.match(/^\/(?:ai\/)?leads\/([^/]+)/);
    const message = req.path.match(/^\/messages\/([^/]+)/);
    try {
      if (lead || message) {
        const id = (lead || message)![1];
        if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ error: 'Invalid record ID' });
        const sql = lead ? 'SELECT id FROM leads WHERE id=$1 AND owner_id=$2'
          : 'SELECT m.id FROM messages m JOIN leads l ON l.id=m.lead_id WHERE m.id=$1 AND l.owner_id=$2';
        if (!(await db.query(sql, [id, req.user!.id])).rows.length) return res.status(404).json({ error: 'Lead or message not found' });
      }
      if (req.path.startsWith('/contacts/unmapped') || /\/delete-impact$/.test(req.path) && /^\/(companies|contacts)\//.test(req.path)
        || ['PATCH', 'DELETE'].includes(req.method) && /^\/(companies|contacts)\//.test(req.path)
        || /^\/contacts\/[^/]+\/link-line$/.test(req.path)) return res.status(403).json({ error: 'Super Admin access required' });
      const profile = req.path.match(/^\/contacts\/line\/([^/]+)\/profile$/);
      if (profile && !(await db.query('SELECT ct.id FROM contacts ct JOIN leads l ON l.contact_id=ct.id WHERE ct.line_user_id=$1 AND l.owner_id=$2', [profile[1], req.user!.id])).rows.length) return res.status(404).json({ error: 'Contact not found' });
      next();
    } catch { res.status(503).json({ error: 'Could not verify access; please retry' }); }
  };
}
