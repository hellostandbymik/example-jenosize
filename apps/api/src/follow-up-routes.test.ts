import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { issueToken, requireAuth } from './auth.js';
import { createFollowUpRouter } from './follow-up-routes.js';
describe('Follow up access', () => {
  const user = { id: '10000000-0000-4000-8000-000000000002', email: 'test@example.test', name: 'Test', role: 'sales' as const };
  const query = vi.fn();
  let server: Server, origin: string;
  beforeAll(async () => {
    const app = express(); app.use(requireAuth, createFollowUpRouter({ query }));
    server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw Error('Missing server');
    origin = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  beforeEach(() => query.mockReset().mockResolvedValue({ rows: [] }));
  it('requires a session', async () => {
    expect((await fetch(`${origin}/follow-ups`)).status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
  it('scopes a member to their own open leads regardless of client query parameters', async () => {
    const response = await fetch(`${origin}/follow-ups?ownerId=another&role=super_admin`, { headers: { authorization: `Bearer ${issueToken(user)}` } });
    expect(response.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([false, user.id]);
    expect(query.mock.calls[0][0]).toContain('l.owner_id=$2');
    expect(query.mock.calls[0][0]).toContain("l.stage NOT IN ('Won','Lost')");
  });
  it('allows super admin to see the entire team without the leads list limit', async () => {
    query.mockResolvedValue({ rows: Array.from({ length: 501 }, (_, i) => ({ id: String(i), next_follow_up: null })) });
    const response = await fetch(`${origin}/follow-ups`, { headers: { authorization: `Bearer ${issueToken({ ...user, role: 'super_admin' })}` } });
    expect(query.mock.calls[0][1]).toEqual([true, user.id]);
    expect((await response.json()).items).toHaveLength(501);
    expect(query.mock.calls[0][0]).not.toMatch(/LIMIT/i);
  });
});
