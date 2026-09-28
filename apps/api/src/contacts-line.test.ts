import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { createContactsLineRouter } from './contacts-line.js';

describe('Contacts LINE browsing', () => {
  let server: Server;
  let origin: string;
  const query = vi.fn();
  const getProfile = vi.fn();
  const userId = 'U0123456789abcdef0123456789abcdef';
  beforeAll(async () => {
    const app = express(); app.use(createContactsLineRouter({ query }, getProfile));
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server');
    origin = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  beforeEach(() => { query.mockReset().mockResolvedValue({ rows: [] }); getProfile.mockReset().mockResolvedValue({ display_name: 'ชื่อทดสอบ' }); });
  it('rejects invalid filters instead of using them in SQL', async () => {
    expect((await fetch(`${origin}/contacts?line=anything`)).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
  it('returns a retryable JSON error if the database is unavailable', async () => {
    query.mockRejectedValue(new Error('private connection details'));
    const response = await fetch(`${origin}/contacts/unmapped`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Contacts unavailable; please retry' });
  });
  it('filters linked and unlinked contacts before the result limit', async () => {
    for (const [filter, clause] of [['linked', 'IS NOT NULL'], ['unlinked', 'IS NULL']]) {
      expect((await fetch(`${origin}/contacts?line=${filter}`)).status).toBe(200);
      const sql = query.mock.lastCall?.[0];
      expect(sql).toContain(`WHERE ct.line_user_id ${clause}`);
      expect(sql.indexOf('WHERE')).toBeLessThan(sql.indexOf('LIMIT'));
    }
  });
  it('returns names without exposing an access token', async () => {
    const response = await fetch(`${origin}/contacts/line/${userId}/profile`);
    expect(await response.json()).toEqual({ display_name: 'ชื่อทดสอบ' });
    expect(getProfile).toHaveBeenCalledWith(userId);
    expect((await fetch(`${origin}/contacts/line/not-a-user/profile`)).status).toBe(400);
    expect(getProfile).toHaveBeenCalledOnce();
  });
  it('paginates conversation history without dropping the extra row', async () => {
    query.mockResolvedValue({ rows: Array.from({ length: 51 }, (_, index) => ({ id: `event-${index}`, content: `ข้อความ ${index}` })) });
    const response = await fetch(`${origin}/contacts/unmapped/${userId}/messages?before=older-event`);
    const data = await response.json();
    expect(data.items).toHaveLength(50);
    expect(data.nextCursor).toBe('event-49');
    expect(query.mock.lastCall?.[1]).toEqual([userId, 'older-event']);
    expect(query.mock.lastCall?.[0]).toContain('processed_at,we.event_key');
  });
  it('marks the final page and rejects invalid sender IDs and cursors', async () => {
    const data = await (await fetch(`${origin}/contacts/unmapped/${userId}/messages`)).json();
    expect(data).toEqual({ items: [], nextCursor: null });
    query.mockClear();
    for (const path of ['/contacts/unmapped/invalid/messages', `/contacts/unmapped/${userId}/messages?before=`]) {
      expect((await fetch(origin + path)).status).toBe(400);
    }
    expect(query).not.toHaveBeenCalled();
  });
});
