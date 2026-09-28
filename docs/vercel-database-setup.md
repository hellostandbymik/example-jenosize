# Vercel API database connection

The Express API runs in the `example-jenosize-api` Vercel project. The PostgreSQL database runs in the `jenosize-ai-crm` Supabase project (`hxtiwtrnzxfftgzoened`).

In Supabase, open **Connect > Transaction pooler** and copy the exact connection URL. Use port `6543`, the database `postgres`, and the pooler's project-specific username. Replace the password placeholder with the database password, URL-encoding special characters. Do not use a Supabase API key as the database password.

Set these variables on the **API** Vercel project for Production:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The private Supabase transaction pooler URL |
| `PG_POOL_MAX` | `1` |
| `PGSSLMODE` | `verify-full` |
| `WEB_ORIGIN` | `https://example-jenosize.vercel.app` |

For certificate-chain errors, download the database's root CA from Supabase Database Settings > SSL Configuration and store the PEM contents in the server-only `PGSSL_CA` variable. Actual newlines and literal `\n` are accepted. Keep certificate verification enabled. Do not use certificate-file query parameters in `DATABASE_URL` together with `PGSSL_CA`.

On the **web** Vercel project, set `NEXT_PUBLIC_API_URL=https://example-jenosize-api.vercel.app`.

Redeploy each project whose environment variables changed. Editing the local `.env` does not update an existing Vercel deployment.

Verify `https://example-jenosize-api.vercel.app/api/health` returns HTTP 200 and `{"status":"ok","database":"ok",...}`, then sign in and load the dashboard and lead list. Health failures log a credential-free database error code: `28P01` indicates authentication failure, `ENOTFOUND` a hostname problem, and `SELF_SIGNED_CERT_IN_CHAIN` an untrusted certificate chain. Use the actual code to choose the fix; a 503 alone does not identify the cause.

References: [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [SSL enforcement and root CA](https://supabase.com/docs/guides/platform/ssl-enforcement), [node-postgres SSL configuration](https://node-postgres.com/features/ssl).

## Verification on 2026-09-28

The original API failed with `SELF_SIGNED_CERT_IN_CHAIN`. The official Supabase Root 2021 CA was added as `PGSSL_CA` in the API project's Production environment. Its download URL was verified against the Supabase Dashboard source at `apps/studio/hooks/custom-content/custom-content.json`; its SHA-256 fingerprint is `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA` and it expires on 2031-04-26.

After the database password was reset, the direct connection succeeded with verified TLS. The transaction pooler initially returned `28P01` and then succeeded on a bounded reconnect after the credential cache refreshed. The verified local `DATABASE_URL` was updated as a sensitive Production variable on the API project, without printing the credential.

Deployment `dpl_5iwcafqobuCdetZ9u4cwKVpXotNG` was built successfully, checked at its deployment URL, and promoted to `https://example-jenosize-api.vercel.app`. The public domain returned HTTP 200 for health, demo login, current user, dashboard, leads, lead details, companies, and contacts. CORS allowed the web origin. Results included 300 leads, 20 companies, and 200 contacts in the limited contact-list endpoint.

The live web app at `https://example-jenosize.vercel.app` was verified in an isolated browser session: demo sign-in succeeded, Lead management rendered 300 lead rows, and no error banner appeared. The new API's runtime logs had zero error-level application entries or database health failures during the verification window. AI and LINE remain in their existing mock modes; this verification covered database connectivity, authentication, and CRM reads.
