import express from 'express';
import { getLineProfile } from './line-profile.js';
import { databaseErrorCode } from './db/config.js';

type Database = { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> };

export const unmappedSendersSql = `
  WITH senders AS (
    SELECT we.line_user_id, max(we.processed_at) AS processed_at,
      count(*) FILTER (WHERE we.payload->>'type'='message')::int AS message_count
    FROM webhook_events we LEFT JOIN contacts c ON c.line_user_id=we.line_user_id
    WHERE we.line_user_id IS NOT NULL AND c.id IS NULL
    GROUP BY we.line_user_id
  )
  SELECT s.*, latest.payload->'message'->>'text' AS latest_message,
    latest.payload->'message'->>'type' AS latest_message_type
  FROM senders s LEFT JOIN LATERAL (
    SELECT we.payload FROM webhook_events we
    WHERE we.line_user_id=s.line_user_id AND we.payload->>'type'='message'
    ORDER BY we.processed_at DESC, we.event_key DESC LIMIT 1
  ) latest ON true ORDER BY s.processed_at DESC, s.line_user_id LIMIT 200`;

export function createContactsLineRouter(database: Database, getProfile = getLineProfile) {
  const router = express.Router();
  const handle = (action: (req: express.Request, res: express.Response) => Promise<unknown>): express.RequestHandler =>
    (req, res, next) => { void action(req, res).catch(next); };
  router.get('/contacts', handle(async (req, res) => {
    const filter = req.query.line || 'all';
    if (!['all', 'linked', 'unlinked'].includes(String(filter))) return res.status(400).json({ error: 'Invalid LINE filter' });
    const requestedPage = req.query.page ?? '1';
    if (typeof requestedPage !== 'string' || !/^[1-9]\d{0,6}$/.test(requestedPage)) return res.status(400).json({ error: 'Invalid contact page' });
    const countsResult = await database.query(`SELECT count(*)::int AS all,
      count(*) FILTER (WHERE line_user_id IS NOT NULL)::int AS linked,
      count(*) FILTER (WHERE line_user_id IS NULL)::int AS unlinked FROM contacts`);
    const counts = countsResult.rows[0] || { all: 0, linked: 0, unlinked: 0 };
    const total = counts[String(filter)];
    const pageSize = 200;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Number(requestedPage), totalPages);
    const where = filter === 'linked' ? 'WHERE ct.line_user_id IS NOT NULL'
      : filter === 'unlinked' ? 'WHERE ct.line_user_id IS NULL' : '';
    const result = await database.query(`SELECT ct.*,c.name company FROM contacts ct LEFT JOIN companies c ON c.id=ct.company_id ${where} ORDER BY ct.updated_at DESC,ct.id DESC LIMIT 200 OFFSET $1`, [(page - 1) * pageSize]);
    res.json({ items: result.rows, counts, total, page, pageSize, totalPages });
  }));
  router.get('/contacts/unmapped', handle(async (_req, res) => {
    const result = await database.query(unmappedSendersSql);
    res.json({ items: result.rows });
  }));
  router.get('/contacts/line/:userId/profile', handle(async (req, res) => {
    const userId = String(req.params.userId);
    if (!/^U[0-9a-f]{32}$/.test(userId)) return res.status(400).json({ error: 'Invalid LINE user ID' });
    res.set('Cache-Control', 'private, no-store');
    res.json(await getProfile(userId));
  }));
  router.get('/contacts/unmapped/:userId/messages', handle(async (req, res) => {
    const userId = String(req.params.userId);
    if (!/^U[0-9a-f]{32}$/.test(userId)) return res.status(400).json({ error: 'Invalid LINE user ID' });
    const before = req.query.before;
    if (before !== undefined && (typeof before !== 'string' || !before || before.length > 200)) {
      return res.status(400).json({ error: 'Invalid message cursor' });
    }
    const result = await database.query(`
      SELECT we.event_key AS id, we.payload->'message'->>'text' AS content,
        we.payload->'message'->>'type' AS message_type, we.processed_at AS created_at,
        we.payload->'source'->>'type' AS source_type
      FROM webhook_events we WHERE we.line_user_id=$1 AND we.payload->>'type'='message'
        AND ($2::text IS NULL OR (we.processed_at,we.event_key) < (
          SELECT processed_at,event_key FROM webhook_events WHERE event_key=$2 AND line_user_id=$1
        )) ORDER BY we.processed_at DESC,we.event_key DESC LIMIT 51`, [userId, before || null]);
    const items = result.rows.slice(0, 50);
    res.json({ items, nextCursor: result.rows.length > 50 ? items[items.length - 1].id : null });
  }));
  const onError: express.ErrorRequestHandler = (error, req, res, _next) => {
    req.log?.error({ event: 'contacts_line_failed', code: databaseErrorCode(error) }, 'Contacts LINE request failed');
    res.status(503).json({ error: 'Contacts unavailable; please retry' });
  };
  router.use(onError);
  return router;
}
