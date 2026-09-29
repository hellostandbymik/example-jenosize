import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { isSuperAdmin } from './access.js';
import { databaseErrorCode } from './db/config.js';

type Database = { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> };
const schema = z.object({ name: z.string().trim().min(2).max(200), email: z.string().trim().email().max(300).transform(value => value.toLowerCase()), password: z.string().min(8).max(100), role: z.enum(['sales', 'super_admin']).default('sales'), active: z.boolean().default(true) }).strict();
const columns = 'id,name,email,role,active,created_at';
export function createMemberRouter(db: Database) {
  const router = Router();
  router.use('/members', (req, res, next) => isSuperAdmin(req.user) ? next() : res.status(403).json({ error: 'Super Admin access required' }));
  const handle = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void fn(req, res).catch(next); };
  router.get('/members', handle(async (_req, res) => {
    const result = await db.query(`SELECT u.id,u.name,u.email,u.role,u.active,u.created_at,count(l.id)::int lead_count FROM users u LEFT JOIN leads l ON l.owner_id=u.id GROUP BY u.id ORDER BY u.created_at,u.email`);
    res.json({ items: result.rows });
  }));
  router.post('/members', handle(async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'กรุณาตรวจข้อมูลสมาชิก (รหัสผ่านอย่างน้อย 8 ตัว)' });
    const u = parsed.data;
    const saved = await db.query(`INSERT INTO users(name,email,password_hash,role,active) VALUES($1,$2,$3,$4,$5) RETURNING ${columns}`, [u.name, u.email, await bcrypt.hash(u.password, 10), u.role, u.active]);
    res.status(201).json({ item: saved.rows[0] });
  }));
  router.patch('/members/:id', handle(async (req, res) => {
    const parsed = schema.partial().safeParse(req.body);
    if (!z.string().uuid().safeParse(req.params.id).success || !parsed.success || !Object.keys(parsed.data).length) return res.status(400).json({ error: 'Invalid member data' });
    const u = parsed.data;
    if (req.params.id === req.user!.id && (u.active === false || u.role && u.role !== 'super_admin')) return res.status(400).json({ error: 'ไม่สามารถปิดบัญชีหรือลดสิทธิ์ Super Admin ของตัวเองได้' });
    const values: Record<string, unknown> = { ...u };
    if (u.password) { delete values.password; values.password_hash = await bcrypt.hash(u.password, 10); }
    const keys = Object.keys(values);
    const revoke = u.password !== undefined || u.active !== undefined || u.role !== undefined;
    const result = await db.query(`UPDATE users SET ${keys.map((key, i) => `${key}=$${i + 1}`).join(',')}${revoke ? ',session_version=session_version+1' : ''} WHERE id=$${keys.length + 1} RETURNING ${columns}`, [...keys.map(key => values[key]), req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Member not found' });
    res.json({ item: result.rows[0] });
  }));
  router.use(((error, _req, res, _next) => res.status(databaseErrorCode(error) === '23505' ? 409 : 503).json({ error: databaseErrorCode(error) === '23505' ? 'อีเมลนี้มีสมาชิกอยู่แล้ว' : 'จัดการสมาชิกไม่สำเร็จ กรุณาลองใหม่' })) as import('express').ErrorRequestHandler);
  return router;
}
