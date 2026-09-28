# LINE OA webhook

The CRM receives LINE Messaging API events at:

```text
https://example-jenosize-api.vercel.app/webhooks/line
```

The endpoint is on the Vercel API project, not the web project or a Supabase Edge Function. It accepts POST requests with `Content-Type: application/json` and a valid `x-line-signature`. Configure the channel's `LINE_CHANNEL_SECRET` in the API project's Production environment, then redeploy. Keep secrets out of Git and browser environment variables.

In [LINE Developers Console](https://developers.line.biz/console/), select the Messaging API channel belonging to the intended OA. Open **Messaging API > Webhook settings**, set the URL above, click **Verify**, and enable **Use webhook**. Enable **Webhook redelivery** to retry failed event deliveries. A valid verification request with `events: []` returns HTTP 200 without needing a database connection.

Incoming events are authenticated against the exact raw body before parsing. Text messages are stored in Supabase, and duplicate `webhookEventId` deliveries are ignored. Each request commits its event records and inbound messages in the same database transaction. If persistence fails, it rolls back and returns HTTP 500 so LINE can retry.

Add the OA as a friend and send a text. In CRM, open **Contacts** to link an unmapped LINE sender ID to the matching contact. Existing messages are attached when linked. Select that contact on a lead to see its conversation in lead details.

Inbound webhook reception works independently of `LINE_MODE`. Real outbound sending additionally requires `LINE_CHANNEL_ACCESS_TOKEN` and `LINE_MODE=live`; the existing draft and approval flow still applies. Webhook verification does not send a message to a LINE user.

References: [LINE signature verification](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/), [webhook URL verification](https://developers.line.biz/en/docs/messaging-api/verify-webhook-url/), [receiving messages and redelivery](https://developers.line.biz/en/docs/messaging-api/receiving-messages/).

## Verification on 2026-09-28

The configured credentials were accepted by LINE for **Assignment Alert** (`@085ijlac`). The channel secret and access token were stored as sensitive Production variables on the API Vercel project. Deployment `dpl_AF3YnVKU6YU2mEQUUTbTU4hyEQ3X` was built and promoted after verification.

The API suite passed 17 tests; 2 unrelated optional database tests were skipped. Deployed webhook checks verified signature rejection, empty verification events, Unicode text persistence, duplicate delivery suppression, and transaction rollback after an intentionally failed message insert. All synthetic test records were removed. CRM health, login, dashboard, and data reads also passed.

LINE Platform's webhook test returned `success: true`, HTTP 200, and reason `OK`. The OA's Webhook URL was then set to the CRM URL and confirmed through LINE's settings API. **Use webhook was still disabled** at that point and must be enabled in LINE Developers Console before real customer events are delivered. Outbound messaging remains in the existing mock mode.
