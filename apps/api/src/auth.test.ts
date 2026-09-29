import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { issueToken, requireAuth, validateJwtSecret } from './auth.js';

const user = { id: '10000000-0000-4000-8000-000000000001', email: 'sales@example.test', name: 'Sales', role: 'sales' as const, session_version: 3 };

describe('JWT configuration and verification', () => {
  beforeEach(() => { vi.stubEnv('JWT_SECRET', randomBytes(32).toString('hex')); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it.each([undefined, '', ' '.repeat(40), 'too-short', ['local-only-', 'change-me-', 'before-deploy-', '32chars'].join(''), 'change-me-before-deploy-with-a-random-secret', 'your-jwt-secret'.repeat(3), 'a'.repeat(64)])('rejects missing, weak and public placeholder secrets', value => {
    expect(() => validateJwtSecret({ JWT_SECRET: value })).toThrow('JWT_SECRET must be a random secret');
  });

  it('measures UTF-8 bytes and returns the configured key without changing it', () => {
    const unicodeSecret = 'กขคงจฉชซฌญฎฏฐฑฒณ';
    expect(unicodeSecret.length).toBeLessThan(32);
    expect(validateJwtSecret({ JWT_SECRET: unicodeSecret })).toBe(unicodeSecret);
  });

  it('enforces the 32-byte boundary for otherwise valid key material', () => {
    const minimumSecret = randomBytes(16).toString('hex');
    expect(() => validateJwtSecret({ JWT_SECRET: minimumSecret.slice(0, 31) })).toThrow('JWT_SECRET must be a random secret');
    expect(validateJwtSecret({ JWT_SECRET: minimumSecret })).toBe(minimumSecret);
  });

  it.each(['<random-secret-at-least-32-bytes>', '${RANDOM_SECRET_AT_LEAST_32_BYTES}', '  <random-secret-at-least-32-bytes>  '])('rejects unresolved environment placeholders even when long enough', value => {
    expect(() => validateJwtSecret({ JWT_SECRET: value })).toThrow('JWT_SECRET must be a random secret');
  });

  it('does not fall back to a built-in key when issuing tokens', () => {
    vi.stubEnv('JWT_SECRET', undefined);
    expect(() => issueToken(user)).toThrow('JWT_SECRET must be a random secret');
  });

  it('issues HS256 tokens with the existing 12-hour session duration', () => {
    const token = issueToken(user);
    const decoded = jwt.decode(token, { complete: true });
    expect(decoded?.header.alg).toBe('HS256');
    const payload = decoded?.payload as jwt.JwtPayload;
    expect(payload.exp! - payload.iat!).toBe(12 * 60 * 60);
  });

  function verify(token?: string) {
    const req = { headers: token ? { authorization: `Bearer ${token}` } : {} } as Request;
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();
    requireAuth(req, { status, json } as unknown as Response, next);
    return { req, status, json, next };
  }

  it('accepts valid HS256 tokens and preserves user/session claims', () => {
    const verified = verify(issueToken(user));
    expect(verified.next).toHaveBeenCalledOnce();
    expect(verified.req.user).toMatchObject(user);
    expect(verified.status).not.toHaveBeenCalled();
  });

  it('rejects another HMAC algorithm even with the same configured key', () => {
    const token = jwt.sign(user, validateJwtSecret(), { algorithm: 'HS384', expiresIn: '12h' });
    const verified = verify(token);
    expect(verified.status).toHaveBeenCalledWith(401);
    expect(verified.next).not.toHaveBeenCalled();
  });

  it('rejects expired tokens and tokens signed by another key', () => {
    for (const token of [
      jwt.sign(user, validateJwtSecret(), { algorithm: 'HS256', expiresIn: -1 }),
      jwt.sign(user, randomBytes(32).toString('hex'), { algorithm: 'HS256', expiresIn: '12h' })
    ]) {
      const verified = verify(token);
      expect(verified.status).toHaveBeenCalledWith(401);
      expect(verified.next).not.toHaveBeenCalled();
    }
  });

  it('returns the existing authentication error when no token is supplied', () => {
    const verified = verify();
    expect(verified.status).toHaveBeenCalledWith(401);
    expect(verified.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(verified.next).not.toHaveBeenCalled();
  });
});
