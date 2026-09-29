import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { currentSession, resourceAccess } from './access.js';
import { issueToken, requireAuth } from './auth.js';
import { createMemberRouter } from './member-routes.js';

describe('Member authorization', () => {
  const member = { id: '10000000-0000-4000-8000-000000000001', email: 'sales01@test.local', name: 'Sales', role: 'sales' as const, session_version: 0 };
  const admin = { ...member, id: '10000000-0000-4000-8000-000000000002', role: 'super_admin' as const };
  const id = '10000000-0000-4000-8000-000000000003';
  const query = vi.fn(); let server: Server; let origin: string;
  async function request(path: string, user = member as typeof member | typeof admin, method = 'GET', body?: unknown) {
    return fetch(origin + path, { method, headers: { authorization: `Bearer ${issueToken(user)}`, 'content-type': 'application/json' }, ...(body && method !== 'GET' ? { body: JSON.stringify(body) } : {}) });
  }
  beforeAll(async () => {
    const app = express(); app.use(express.json(), requireAuth, currentSession({ query }), resourceAccess({ query }), createMemberRouter({ query }));
    app.use((_req, res) => res.json({ allowed: true }));
    server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw Error('Missing server'); origin = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  beforeEach(() => { query.mockReset().mockImplementation(async (sql, values) => ({ rows: sql.includes('session_version FROM users') ? [values[0] === admin.id ? admin : member] : [] })); });
  it.each([
    ['GET', `/leads/${id}`], ['PATCH', `/leads/${id}`], ['DELETE', `/leads/${id}`], ['PATCH', `/leads/${id}/stage`],
    ['GET', `/leads/${id}/delete-impact`], ['POST', `/leads/${id}/activities`], ['POST', `/leads/${id}/messages/drafts`],
    ['POST', `/ai/leads/${id}/analyze`], ['POST', `/messages/${id}/approve`], ['POST', `/messages/${id}/send`],
  ])('denies another owner’s resource: %s %s', async (method, path) => { expect((await request(path, member, method, {})).status).toBe(404); });
  it('allows own lead and uses a bound owner predicate', async () => {
    query.mockImplementation(async sql => ({ rows: sql.includes('session_version FROM users') ? [member] : [{ id }] }));
    expect((await request(`/leads/${id}`)).status).toBe(200);
    expect(query.mock.calls[1]).toEqual(['SELECT id FROM leads WHERE id=$1 AND owner_id=$2', [id, member.id]]);
  });
  it('allows Super Admin to access all resources', async () => {
    for (const path of [`/leads/${id}`, `/ai/leads/${id}/analyze`, `/messages/${id}/approve`, '/contacts/unmapped']) expect((await request(path, admin)).status).toBe(200);
  });
  it('keeps membership management and shared record deletion restricted to Super Admin', async () => {
    expect((await request('/members')).status).toBe(403);
    expect((await request('/members', member, 'POST', { name: 'Test' })).status).toBe(403);
    expect((await request(`/members/${id}`, member, 'PATCH', {})).status).toBe(403);
    expect((await request(`/companies/${id}`, member, 'DELETE', {})).status).toBe(403);
    expect((await request(`/contacts/${id}`, member, 'PATCH', {})).status).toBe(403);
    expect((await request('/contacts/unmapped')).status).toBe(403);
  });
  it('uses the current database role rather than an old token’s role', async () => {
    query.mockResolvedValue({ rows: [{ ...admin, role: 'sales' }] });
    expect((await request('/members', admin)).status).toBe(403);
  });
  it('revokes deactivated accounts and password-reset sessions immediately', async () => {
    query.mockResolvedValue({ rows: [] }); expect((await request('/members', admin)).status).toBe(401);
    query.mockResolvedValue({ rows: [{ ...admin, session_version: 1 }] }); expect((await request('/members', admin)).status).toBe(401);
  });
  it('blocks self-deactivation and self-demotion', async () => {
    expect((await request(`/members/${admin.id}`, admin, 'PATCH', { active: false })).status).toBe(400);
    expect((await request(`/members/${admin.id}`, admin, 'PATCH', { role: 'sales' })).status).toBe(400);
  });
  it('validates membership and rejects privilege injection', async () => {
    expect((await request('/members', admin, 'POST', { name: 'Test', email: 't@example.test', password: 'short' })).status).toBe(400);
    expect((await request(`/members/${id}`, admin, 'PATCH', { password_hash: 'injected' })).status).toBe(400);
  });
  it('hashes new passwords and invalidates existing sessions without returning the hash', async () => {
    query.mockImplementation(async sql => ({ rows: sql.includes('session_version FROM users') ? [admin] : [{ id, name: 'Test', email: 't@example.test', role: 'sales' }] }));
    const response = await request(`/members/${id}`, admin, 'PATCH', { password: 'replacement123' });
    expect(response.status).toBe(200); expect(JSON.stringify(await response.json())).not.toContain('password');
    const update = query.mock.calls.find(([sql]) => sql.startsWith('UPDATE users'))!;
    expect(update[0]).toContain('session_version=session_version+1'); expect(update[1][0]).toMatch(/^\$2[aby]\$/); expect(update[1][0]).not.toBe('replacement123');
  });
});
