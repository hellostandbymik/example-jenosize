import express from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { databaseErrorCode } from './db/config.js';
import { lineEventKey, verifyLineSignature } from './line.js';

const eventSchema = z.object({
  type: z.string().min(1),
  timestamp: z.number().nonnegative(),
  webhookEventId: z.string().min(1).optional(),
  source: z.object({ userId: z.string().min(1).optional() }).passthrough().optional(),
  message: z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    text: z.string().optional()
  }).passthrough().optional()
}).passthrough().superRefine((event, context) => {
  if (event.type === 'message' && (!event.message || (event.message.type === 'text' && event.message.text === undefined))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid message event' });
  }
});
const bodySchema = z.object({ events: z.array(eventSchema) }).passthrough();
type LineEvent = z.infer<typeof eventSchema>;
type WebhookDatabase = Pick<Pool, 'connect'>;

export async function persistLineEvents(database: WebhookDatabase, events: LineEvent[]) {
  if (!events.length) return;
  const client = await database.connect();
  let releaseError: Error | undefined;
  try {
    await client.query('BEGIN');
    for (const event of events) {
      const eventKey = lineEventKey(event);
      const lineId = event.source?.userId || null;
      const inserted = await client.query(
        'INSERT INTO webhook_events(event_key,line_user_id,payload) VALUES($1,$2,$3) ON CONFLICT(event_key) DO NOTHING RETURNING event_key',
        [eventKey, lineId, event]
      );
      if (!inserted.rowCount) continue;
      if (event.type === 'message' && event.message?.type === 'text' && lineId) {
        const contact = await client.query('SELECT id FROM contacts WHERE line_user_id=$1', [lineId]);
        await client.query(
          "INSERT INTO messages(contact_id,channel,direction,content,status,external_id) VALUES($1,'LINE','inbound',$2,'received',$3)",
          [contact.rows[0]?.id || null, event.message.text, event.message.id]
        );
      }
    }
    // The deduplication record and message must commit together, so a failed
    // delivery can be retried without skipping a message that was never saved.
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch { releaseError = new Error('Webhook transaction rollback failed'); }
    throw error;
  } finally { client.release(releaseError); }
}

export function createLineWebhookRouter(database: WebhookDatabase, getSecret = () => process.env.LINE_CHANNEL_SECRET) {
  const router = express.Router();
  router.post('/webhooks/line', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const secret = getSecret();
    if (!secret) return res.status(503).json({ error: 'LINE webhook is not configured' });
    if (!Buffer.isBuffer(req.body)) return res.status(415).json({ error: 'Expected application/json' });
    if (!verifyLineSignature(req.body, req.header('x-line-signature'), secret)) {
      return res.status(401).json({ error: 'Invalid LINE signature' });
    }
    let body: unknown;
    try { body = JSON.parse(req.body.toString('utf8')); }
    catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid LINE webhook payload' });
    try {
      await persistLineEvents(database, parsed.data.events);
      return res.status(200).json({ ok: true });
    } catch (error) {
      req.log?.error({ event: 'line_webhook_failed', code: databaseErrorCode(error) }, 'LINE webhook processing failed');
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });
  return router;
}
