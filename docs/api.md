# API notes

Base URL: `http://localhost:4000`. All `/api/*` routes other than login and health require `Authorization: Bearer <token>`.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Return demo bearer token |
| GET | `/api/me` | Current user |
| GET | `/api/dashboard` | Stage totals, follow-up count, recent leads |
| GET | `/api/leads?q=&stage=` | Search/filter leads |
| POST | `/api/leads` | Create lead |
| GET | `/api/leads/:id` | Lead, activities, messages, AI suggestions |
| PATCH | `/api/leads/:id/stage` | Update stage with activity/audit trail |
| POST | `/api/leads/:id/activities` | Add note/activity |
| POST | `/api/ai/leads/:id/analyze` | Generate and persist AI suggestion |
| GET | `/api/ai/config` | Authenticated provider/model/readiness; no secret values |
| POST | `/api/leads/:id/messages/drafts` | Save outbound LINE draft |
| POST | `/api/messages/:id/approve` | Record explicit approval |
| POST | `/api/messages/:id/send` | Send approved message through LINE |
| GET | `/api/contacts` | List contacts |
| POST | `/api/contacts` | Create contact |
| GET | `/api/contacts/unmapped` | List LINE sender IDs without a linked contact |
| POST | `/api/contacts/:id/link-line` | Link LINE user ID to a contact |
| GET | `/api/companies` | List companies with contact/lead counts |
| POST | `/api/companies` | Create company |
| POST | `/webhooks/line` | Signed LINE webhook; no bearer token |
| GET | `/api/health` | API/database health |

Errors use JSON `{ "error": "..." }`; validation errors may include `details`. Stage values: `New`, `Qualified`, `Proposal`, `Won`, `Lost`.

Authenticated record management (Companies, Contacts and Leads):

| Method | Path | Purpose |
|---|---|---|
| PATCH | `/api/companies/:id` | Edit `name`, `website`, `industry`, `phone`, `notes` |
| PATCH | `/api/contacts/:id` | Edit `firstName`, `lastName`, `email`, `phone`, `companyId`, `title`; preserve LINE mapping |
| PATCH | `/api/leads/:id` | Edit `title`, `companyId`, `contactId`, `stage`, `source`, `value`, `probability`, `nextFollowUp`, `lossReason` |
| GET | `/api/{companies,contacts,leads}/:id/delete-impact` | Preview record name and affected record counts |
| DELETE | `/api/{companies,contacts,leads}/:id` | Delete with `{confirmName, expectedImpact}` from the preview |

PATCH accepts a nonempty subset of these fields, rejects unknown fields and leaves omitted fields unchanged. Optional text/relationships/dates can be cleared with `null`; probability is an integer from 0 to 100. Dates use an ISO timestamp with timezone. Lead stage changes create an activity; switching out of Lost clears the loss reason. All record mutations and their audit logs commit in one transaction.

Deletion is permanent and requires the preview's exact name and impact object. If the name or related counts changed, DELETE returns 409 and the UI requires a fresh preview. Deleting a company retains its contacts/leads with `company_id=null`. Deleting a contact retains its leads/messages with `contact_id=null` and removes that contact's LINE mapping; retained inbound webhook events allow the sender to appear in Unmapped again. Deleting a lead cascades its activities/AI suggestions, retains messages with `lead_id=null`, and preserves the company/contact. Audit history is retained.
