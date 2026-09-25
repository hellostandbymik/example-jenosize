import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
const secret = () => process.env.JWT_SECRET || '[removed-legacy-signing-key]';
export type AuthUser = { id: string; email: string; name: string; role: 'admin'|'sales' };
declare global { namespace Express { interface Request { user?: AuthUser } } }
export function issueToken(user: AuthUser) { return jwt.sign(user, secret(), { expiresIn: '12h' }); }
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || (req as any).cookies?.crm_token;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try { req.user = jwt.verify(token, secret()) as AuthUser; return next(); } catch { return res.status(401).json({ error: 'Invalid or expired session' }); }
}
