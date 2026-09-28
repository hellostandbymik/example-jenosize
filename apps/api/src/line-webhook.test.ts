import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { createHmac } from 'node:crypto';
import type { Pool } from 'pg';
import { createLineWebhookRouter, persistLineEvents } from './line-webhook.js';

const secret = 'synthetic-channel-secret';
const connect = vi.fn();
const database = { connect } as unknown as Pick<Pool, 'connect'>;
const event = {
  type: 'message', timestamp: 1727000000000, webhookEventId: 'synthetic-event',
  source: { type: 'user', userId: 'synthetic-user' },
  message: { type: 'text', id: 'synthetic-message', text: 'สวัสดีครับ\ntest ✅' }
};

describe('LINE webhook HTTP boundary', () => {
  let server: Server;
  let origin: string;
  beforeAll(async () => {
    const app = express();
    app.use(createLineWebhookRouter(database, () => secret));
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
  beforeEach(() => connect.mockReset());

  async function post(raw: string, signature = createHmac('sha256', secret).update(raw).digest('base64')) {
    return fetch(`${origin}/webhooks/line`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': signature }, body: raw });
  }

  it('accepts LINE verification with no events even when the database is unavailable', async () => {
    const response = await post('{"destination":"synthetic-bot","events":[]}');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects a changed raw body before touching the database', async () => {
    const signature = createHmac('sha256', secret).update('{"events":[]}').digest('base64');
    expect((await post('{ "events": [] }', signature)).status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects signed malformed JSON and an invalid event envelope', async () => {
    for (const body of ['{', '{"events":{}}', '{"events":[null]}', JSON.stringify({ events: [{ ...event, message: { type: 'text', id: 'missing-text' } }] })]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(connect).not.toHaveBeenCalled();
  });

  it('returns a retryable failure if saving a message fails', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith('INSERT INTO webhook_events')) return { rowCount: 1, rows: [] };
      if (sql.startsWith('INSERT INTO messages')) throw Object.assign(new Error('private database detail'), { code: '08006' });
      return { rowCount: 0, rows: [] };
    });
    const release = vi.fn();
    connect.mockResolvedValue({ query, release });
    const response = await post(JSON.stringify({ events: [event] }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Webhook processing failed' });
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(query).not.toHaveBeenCalledWith('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });
});

describe('LINE delivery persistence', () => {
  beforeEach(() => connect.mockReset());

  it('skips message creation for an already committed event', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const release = vi.fn();
    connect.mockResolvedValue({ query, release });
    await persistLineEvents(database, [event]);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO messages'))).toBe(false);
    expect(query).toHaveBeenCalledWith('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });

  it('preserves Unicode text and stores unknown senders for later contact linking', async () => {
    const query = vi.fn(async (sql: string) => ({ rowCount: sql.startsWith('INSERT INTO webhook_events') ? 1 : 0, rows: [] }));
    connect.mockResolvedValue({ query, release: vi.fn() });
    await persistLineEvents(database, [event]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO messages'), [null, event.message.text, event.message.id]);
    expect(query).toHaveBeenCalledWith('COMMIT');
  });

  it('discards the connection if rollback itself fails', async () => {
    const query = vi.fn().mockRejectedValue(new Error('Connection lost'));
    const release = vi.fn();
    connect.mockResolvedValue({ query, release });
    await expect(persistLineEvents(database, [event])).rejects.toThrow('Connection lost');
    expect(release).toHaveBeenCalledWith(expect.any(Error));
  });
});
