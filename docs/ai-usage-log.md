# AI usage log (sample to complete honestly for each submission)

This file is a submission template. Replace the examples below with the actual prompts, outputs, and changes from the development session before presenting it as evidence.

| Task | Sample prompt | Human review / changes |
|---|---|---|
| Draft CRM schema | “Design relational tables for users, companies, contacts, leads, activities, messages and audit.” | Verify every foreign key, uniqueness rule, nullable relationship and deletion behavior against the assignment. |
| Implement AI analysis | “Return JSON summary, score, reasons, missing information, next action and LINE draft.” | Reject autonomous writes; validate JSON shape; add deterministic fallback and human approval gate. |
| Implement LINE webhook | “Process LINE webhook events and avoid duplicates.” | Verify HMAC over raw bytes with timing-safe comparison; add idempotency key and malformed signature tests. |

Human inspection change: the AI response is stored as a suggestion and does not modify a lead or send an outbound message. The LINE send endpoint rejects drafts that have not been approved.
