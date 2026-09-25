<<<<<<< HEAD
# Jenosize AI CRM MVP

Responsive internal CRM demo for a 20-person Commercial team. Built as a small monorepo with Next.js/React, a Node.js API, and PostgreSQL. Includes a conservative AI copilot, LINE OA webhook verification and approval-based outbound drafts.

## Included
- Demo login, lead list/search/filter, pipeline stage changes, contacts and lead detail
- Company and contact management, including LINE sender mapping
- Persistent relational schema, migration and synthetic seed data
- Activity and conversation timeline
- AI lead summary, qualification score/reasons, missing information, next-best action, and LINE draft
- LINE webhook signature verification, inbound event deduplication, sender mapping endpoint, approval before outbound send
- Structured request logging, audit events and safe AI/LINE failure behavior

## Requirements
- Node.js 20+
- Docker Compose (for PostgreSQL), or PostgreSQL 15+

## Run locally
```bash
cp .env.example .env
# Keep the local demo defaults, but replace JWT_SECRET before exposing the app.
npm install
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```
Open `http://localhost:3000`. Demo credentials: `demo@jenosize.local` / `[removed-demo-password]`. The API is at `http://localhost:4000`; health check: `/api/health`.

The AI works in deterministic fallback mode with no provider key. To enable the OpenAI adapter, set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and `AI_MODEL` in `.env`. AI results are suggestions only. LINE outbound messages require explicit approval. `LINE_MODE=mock` is the local default and records mock send results without contacting LINE; set `LINE_MODE=live` only after configuring the test OA credentials.

## LINE OA test setup
1. Create a LINE Messaging API channel for a test Official Account, then enable **Use webhook**. For a local API, expose `http://localhost:4000` through a temporary public HTTPS tunnel and set the webhook URL to `https://YOUR_TUNNEL_HOST/webhooks/line`. LINE cannot call `localhost` on your computer directly.
2. Copy the channel secret into `LINE_CHANNEL_SECRET` in the API `.env`, restart the API, then use **Verify** in LINE Developers Console. The endpoint verifies `x-line-signature` against the raw request body and returns HTTP 200 for a valid event, including LINE's empty verification event. Keep `LINE_MODE=mock` if you only need to receive and analyze messages.
3. Add the test OA as a friend and send it a text. In CRM, open **Contacts** and link the new unmapped LINE sender to its Contact. Historical messages received before linking are attached when the sender is linked. Then make sure that Contact is selected on the Lead you want to analyze.
4. Open the Lead, review the **Conversation** timeline, then click **Analyze**. Analysis reads recent messages stored against that Lead or its linked Contact. With `AI_PROVIDER=mock` (or without an OpenAI key), the app uses a deterministic fallback and does not semantically interpret message text. For content-based analysis, set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and optionally `AI_MODEL` in `.env`, then restart the API.
5. Real outbound replies are optional for conversation analysis. To send approved replies, also configure `LINE_CHANNEL_ACCESS_TOKEN` and set `LINE_MODE=live`; drafts still require explicit approval in CRM.

Never share channel secrets, access tokens, or AI keys in chat or commit them to the repository. LINE requires a publicly reachable HTTPS webhook; see [receiving messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/), [signature verification](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/), and [webhook URL verification](https://developers.line.biz/en/docs/messaging-api/verify-webhook-url/).

Never commit `.env` or live LINE/AI secrets. Use synthetic data only in this demo.

## Deploy the demo to Vercel + Supabase

The CRM-specific Supabase project is provisioned separately from any other Supabase project, and its tables are seeded with synthetic assignment data. To publish the app, connect the source repository to Vercel (or use the Vercel CLI after signing in) and create two Vercel projects from this monorepo:

1. Web project root: `apps/web` (Next.js). Set `NEXT_PUBLIC_API_URL` to the deployed API origin.
2. API project root: `apps/api` (Express / Node.js). Set `WEB_ORIGIN` to the deployed web origin; set `DATABASE_URL` to the Supabase **Transaction pooler** connection string for serverless, replacing the password in Vercel's environment settings; set `PG_POOL_MAX=1`, `PGSSLMODE=require`, and a new random `JWT_SECRET`.
3. Keep `AI_PROVIDER=mock` and `LINE_MODE=mock` for a safe demo unless private provider/OA credentials are configured in Vercel's secret environment settings. Never paste credentials into chat, commit them, or place server-only secrets in `NEXT_PUBLIC_*` variables.
4. Run the API `/api/health` check and sign in with `demo@jenosize.local / [removed-demo-password]`. The provisioned Supabase DB already contains synthetic seed data.

The Express API is exported for Vercel's Node.js runtime, and the database client caps itself to one connection per warm serverless instance. Supabase's transaction pooler is intended for short-lived serverless connections; this code uses unnamed parameterized queries rather than named prepared statements. The Vercel account connection is required before an actual Vercel deployment can be started.

## Tests
```bash
npm test
```
The default suite tests deterministic AI fallback, LINE signature validation, duplicate event-key stability, and the mock sender. PostgreSQL persistence and webhook deduplication flows are available with `CRM_INTEGRATION=true` after migration and seed; they create/check synthetic rows and clean them up.

## Architecture and API
- `apps/web`: Next.js App Router interface
- `apps/api`: Express REST API, authentication, AI and LINE modules
- `apps/api/src/db/schema.sql`: relational schema
- `skills/crm-copilot/SKILL.md`: reusable AI skill and seven evaluation cases
- `docs/architecture.md`: data flow and trade-offs
- `docs/api.md`: endpoint notes
- `docs/ai-usage-log.md`: example AI-assisted work and human review evidence

## Known limitations / production next steps
- Demo auth is deliberately simple; deploy with managed identity/SSO, secure cookies, CSRF protection, rate limiting and role-based authorization policies.
- Migrations are currently a versioned schema script; adopt a migration runner and backup/rollback procedure before production.
- LINE inbound events are idempotent and persisted, but queue-based retries, dead-letter handling, operational replay UI, and full delivery receipts should be added for production.
- The current AI model adapter is optional and has a deterministic fallback. Add provider governance, retention controls, prompt/version evaluation, token budgets and redaction before processing real customer data.
- Deploy web, API, worker/database with separate secrets and TLS. Add centralized metrics, alerting, database backups and a documented incident runbook.

## Five-day delivery priorities
The core vertical slice is functional locally. Priority order for a hosted handover is: provision managed PostgreSQL and API/web hosting; run migrations and seed; configure demo credentials and secrets; connect a LINE OA test account; execute automated and manual QA; record a 3–5 minute walkthrough. Do not expose a public deployment with the sample credentials unchanged.
=======
# example-jenosize
>>>>>>> ae53377eba40cbab2e292b39dbfd1d9ca219ec21
