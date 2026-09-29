# Secrets and account access

Store local configuration in the ignored root `.env`. Store deployed server secrets in the API project's private environment settings. `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `LINE_CHANNEL_SECRET` and `LINE_CHANNEL_ACCESS_TOKEN` must remain server-only. `NEXT_PUBLIC_API_URL` is a public API origin and must never contain credentials.

Production requires an explicit random `JWT_SECRET` with at least 32 bytes. There is no production fallback. Generate a unique value for each environment, keep it private, and redeploy after changes; rotating it invalidates previously signed sessions.

The legacy demo administrator is disabled and its old sessions are revoked. The synthetic seed creates sales accounts only and requires an operator-supplied `DEMO_SEED_PASSWORD` of at least 12 characters. Real administrator accounts are managed privately. Share test account credentials only with intended testers, use unique production passwords, and remove or deactivate test access when it is no longer needed.

Use `npm run db:bootstrap-admin` only to provision a new administrator. Supply `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` and a unique `BOOTSTRAP_ADMIN_PASSWORD` of at least 12 characters privately. Bootstrap rejects existing accounts and local demo addresses; it cannot reset an existing password or promote a demo account. Remove the bootstrap environment values after provisioning.

## Publishing the repository

Review tracked files and the complete Git history before making the repository public. Ignoring `.env` prevents future accidental additions; it does not remove previously committed secrets. Remove exposed credentials from all published history and rotate any credential that appeared in an earlier commit. Editing the current file alone is insufficient.

Public deployment URLs, project identifiers and variable names are configuration references rather than access credentials. Publishing them makes services easier to discover, so the live application must enforce authentication and authorization independently of repository visibility. Use synthetic CRM data, review attachments for private information, and keep database dumps, exported chats and provider credential files outside Git.
