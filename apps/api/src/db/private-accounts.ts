import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';

const legacyDemoEmail = 'demo@jenosize.local';
const legacyPasswordDigest = '0ead2060b65992dca4769af601a1b3a35ef38cfad2c2c465bb160ea764157c5d';

function requirePrivatePassword(value: string | undefined, variable: string): string {
 if (!value || value.trim().length < 12 || new Set(value).size < 4
  || /<[^<>]*>|\$\{[^}]*\}/.test(value)
  || /^(?:change[-_ ]?me|password|replace[-_ ]?me|example|demo)[-_\s\d]*$/i.test(value)
  || createHash('sha256').update(value).digest('hex') === legacyPasswordDigest) {
  throw new Error(`${variable} must be a private password of at least 12 characters; public defaults and placeholders are not allowed.`);
 }
 return value;
}

export function requireSeedPassword(env: NodeJS.ProcessEnv = process.env): string {
 return requirePrivatePassword(env.DEMO_SEED_PASSWORD, 'DEMO_SEED_PASSWORD');
}

export type BootstrapAdminConfig = { email: string; password: string; name: string };

export function bootstrapAdminConfig(env: NodeJS.ProcessEnv = process.env): BootstrapAdminConfig {
 const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || '';
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('@jenosize.local')) {
  throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a private administrator email, not a local demo account.');
 }
 const password = requirePrivatePassword(env.BOOTSTRAP_ADMIN_PASSWORD, 'BOOTSTRAP_ADMIN_PASSWORD');
 const name = env.BOOTSTRAP_ADMIN_NAME?.trim() || '';
 if (!name) throw new Error('BOOTSTRAP_ADMIN_NAME is required.');
 return { email, password, name };
}

type DatabaseClient = Pick<PoolClient, 'query'>;

// Creating an administrator never changes an existing account or its credentials.
export async function createBootstrapAdmin(client: DatabaseClient, config: BootstrapAdminConfig,
 hashPassword: (password: string) => Promise<string> = password => bcrypt.hash(password, 12)): Promise<string> {
 const passwordHash = await hashPassword(config.password);
 await client.query('BEGIN');
 try {
  // Serialize provisioning commands, including email case variants.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('crm-private-admin-bootstrap'))");
  const existing = await client.query('SELECT id FROM users WHERE lower(email) = $1 FOR UPDATE', [config.email]);
  if (existing.rowCount) throw new Error('Administrator bootstrap refused: that email already exists; no password or role was changed.');
  const created = await client.query(
   "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'super_admin') ON CONFLICT (email) DO NOTHING RETURNING id",
   [config.name, config.email, passwordHash]);
  if (created.rowCount !== 1) throw new Error('Administrator bootstrap refused: the account already exists; no password or role was changed.');
  await client.query('COMMIT');
  return created.rows[0].id as string;
 } catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
 }
}

// Call only inside a transaction, after provisioning/verifying a replacement admin.
export async function retireLegacyDemoAdmin(client: DatabaseClient): Promise<number> {
 const admins = await client.query("SELECT id, email FROM users WHERE role = 'super_admin' AND active = true ORDER BY id FOR UPDATE");
 const replacement = admins.rows.some(admin => String(admin.email).toLowerCase() !== legacyDemoEmail);
 if (!replacement) throw new Error('Demo retirement refused: another active Super Admin is required.');
 const retired = await client.query(
  'UPDATE users SET active = false, session_version = session_version + 1 WHERE lower(email) = $1 AND active = true RETURNING id',
  [legacyDemoEmail]);
 return retired.rowCount || 0;
}
