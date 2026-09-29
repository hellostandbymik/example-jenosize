# Members and lead ownership

The synthetic team has 20 accounts, `sales01@jenosize.local` through `sales20@jenosize.local`, all with the `sales` role. Before running `npm run db:seed`, set a private `DEMO_SEED_PASSWORD` of at least 12 characters in the root `.env`; there is no built-in seed password. The legacy demo administrator is disabled with its old sessions revoked. Real Super Admin accounts and their credentials are managed privately by the operator and are not created by the demo seed.

Distribute test account access privately to intended testers. Seed reruns preserve existing passwords; use the member password-reset controls when access must change. Existing tokens are revoked when an account password, role or active status changes.

For a fresh database, run `npm run db:bootstrap-admin` after migration with private `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (at least 12 characters) and `BOOTSTRAP_ADMIN_NAME` values. Bootstrap creates a new Super Admin only; it rejects existing accounts and local demo addresses instead of changing their password or role. Remove these provisioning values after use. Subsequent account management happens through the member controls.

Super Admin can see all leads, create/edit/deactivate members, reset passwords, change roles and assign leads to active members. Members can create leads and read/edit/delete their own leads. Company and Contact directories are shared; their nested lead lists and counts respect ownership. Changes and deletion of shared companies/contacts and LINE sender mapping require Super Admin.

Every authenticated request reloads the active user and role from the database. Password resets, role changes and activation changes increment `session_version`, revoking old tokens. Super Admin cannot deactivate or demote their own account. The API checks ownership for lead details, mutation/deletion, stages, activities, AI analysis, message drafts and message approval/send. Conversation queries exclude messages attached to another member’s leads.

## API

- `GET /api/members`: Super Admin member directory with owned lead counts; excludes password hashes.
- `POST /api/members`: Super Admin creates a member with `name`, `email`, `password` (8–100 characters), `role` (`sales` or `super_admin`) and optional `active`.
- `PATCH /api/members/:id`: Super Admin changes the above fields. Omitted passwords stay unchanged.
- `POST /api/leads`: defaults to the current owner; Super Admin may specify `ownerId`.
- `PATCH /api/leads/:id`: only Super Admin may change `ownerId`; selected owner must be active.

## Thai demo data

`npm run db:seed` uses `apps/api/src/db/demo-data.mjs`: 20 real Thai company names, 2,000 fictional Thai contacts with `.test` email addresses, and 300 fictional CRM/digital-project opportunities with company-specific scopes, budgets, stages, probabilities and discovery/proposal notes. Each synthetic sales account owns 15 seeded leads. Existing synthetic company/contact/lead IDs and LINE associations are preserved. Reruns do not duplicate data or reset passwords; contact names edited away from the old `Synthetic` name are preserved.

These are realistic sales scenarios, **not verified live deals or actual contacts of those companies**. The UI, company notes, lead source and activity notes label them as demo data. Retail CRM/Omnichannel scenarios are informed by [Central Retail’s public report](https://www.centralretail.com/storage/document/sustainability-reports/2020/sd-report-2020-en.pdf); industrial digital-project scenarios are informed by [SCG’s public report](https://scc.listedcompany.com/misc/one-report/2021/20220309-scc-one-report2021-en.pdf). All opportunity amounts, dates, people and sales outcomes are invented.

## Verification

Run `npm test` and `npm run build`. Authorization tests cover foreign-lead access on all routes, role restrictions, ownership inside record transactions, self-demotion protection, password hashing, current database roles and revoked sessions. Deployment checks should use privately supplied credentials to verify scoped company/contact/dashboard reads, deny foreign mutations and AI access, verify reassignment, and remove their temporary test data. Also verify that the legacy demo administrator cannot sign in and that production rejects an invalid JWT secret.
