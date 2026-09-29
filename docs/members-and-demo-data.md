# Members and lead ownership

The demo has **20 accounts in total**: the current `demo@jenosize.local` account is Super Admin, and `sales01@jenosize.local` through `sales19@jenosize.local` are sales members. Existing passwords are retained; the seed password for new demo accounts is `[removed-demo-password]`.

Super Admin can see all leads, create/edit/deactivate members, reset passwords, change roles and assign leads to active members. Members can create leads and read/edit/delete their own leads. Company and Contact directories are shared; their nested lead lists and counts respect ownership. Changes and deletion of shared companies/contacts and LINE sender mapping require Super Admin.

Every authenticated request reloads the active user and role from the database. Password resets, role changes and activation changes increment `session_version`, revoking old tokens. Super Admin cannot deactivate or demote their own account. The API checks ownership for lead details, mutation/deletion, stages, activities, AI analysis, message drafts and message approval/send. Conversation queries exclude messages attached to another member’s leads.

## API

- `GET /api/members`: Super Admin member directory with owned lead counts; excludes password hashes.
- `POST /api/members`: Super Admin creates a member with `name`, `email`, `password` (8–100 characters), `role` (`sales` or `super_admin`) and optional `active`.
- `PATCH /api/members/:id`: Super Admin changes the above fields. Omitted passwords stay unchanged.
- `POST /api/leads`: defaults to the current owner; Super Admin may specify `ownerId`.
- `PATCH /api/leads/:id`: only Super Admin may change `ownerId`; selected owner must be active.

## Thai demo data

`npm run db:seed` uses `apps/api/src/db/demo-data.mjs`: 20 real Thai company names, 2,000 fictional Thai contacts with `.test` email addresses, and 300 fictional CRM/digital-project opportunities with company-specific scopes, budgets, stages, probabilities and discovery/proposal notes. Each of the 20 initial accounts owns 15 leads. Existing synthetic company/contact/lead IDs and LINE associations are preserved. Reruns do not duplicate data or reset passwords; contact names edited away from the old `Synthetic` name are preserved.

These are realistic sales scenarios, **not verified live deals or actual contacts of those companies**. The UI, company notes, lead source and activity notes label them as demo data. Retail CRM/Omnichannel scenarios are informed by [Central Retail’s public report](https://www.centralretail.com/storage/document/sustainability-reports/2020/sd-report-2020-en.pdf); industrial digital-project scenarios are informed by [SCG’s public report](https://scc.listedcompany.com/misc/one-report/2021/20220309-scc-one-report2021-en.pdf). All opportunity amounts, dates, people and sales outcomes are invented.

## Verification

Run `npm test` and `npm run build`. Authorization tests cover foreign-lead access on all routes, role restrictions, ownership inside record transactions, self-demotion protection, password hashing, current database roles and revoked sessions. The deployed API verification signs in as all 20 accounts, checks every sales member receives exactly their 15 leads, verifies scoped company/contact/dashboard reads, denies foreign mutations and AI access, verifies reassignment, and removes its temporary lead.
