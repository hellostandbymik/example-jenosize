import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
const legacySecretDigest = '362c26a825602f5b365187bffc048c9eba4ceb6722def4e7d9b7142c785cfb82';
export function validateJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret.trim(), 'utf8') < 32
    || /^(?:<.*>|\$\{.*\})$/.test(secret.trim())
    || createHash('sha256').update(secret).digest('hex') === legacySecretDigest
    || /(?:change[-_ ]?(?:me|this)|replace[-_ ]?me|your[-_ ]?(?:jwt[-_ ]?)?secret|example[-_ ]?secret|placeholder|local[-_ ]?only|before[-_ ]?deploy)/i.test(secret)
    || /^(.{1,16})\1+$/.test(secret)) {
    throw new Error('JWT_SECRET must be a random secret of at least 32 UTF-8 bytes; default and placeholder values are not allowed.');
  }
  return secret;
}
export type AuthUser = { id: string; email: string; name: string; role: 'super_admin'|'admin'|'sales'; session_version?: number };
declare global { namespace Express { interface Request { user?: AuthUser } } }
export function issueToken(user: AuthUser) { return jwt.sign(user, validateJwtSecret(), { algorithm: 'HS256', expiresIn: '12h' }); }
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || (req as any).cookies?.crm_token;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try { req.user = jwt.verify(token, validateJwtSecret(), { algorithms: ['HS256'] }) as AuthUser; return next(); } catch { return res.status(401).json({ error: 'Invalid or expired session' }); }
}
