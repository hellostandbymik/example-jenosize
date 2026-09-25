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
