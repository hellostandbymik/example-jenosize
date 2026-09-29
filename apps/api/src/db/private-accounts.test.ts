import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { bootstrapAdminConfig, createBootstrapAdmin, requireSeedPassword, retireLegacyDemoAdmin } from './private-accounts.js';
import { companies, contacts, demoSql, leads, members } from './demo-data.mjs';

const privatePassword = () => randomBytes(24).toString('base64url');
const adminEnvironment = () => ({ BOOTSTRAP_ADMIN_EMAIL: 'owner@example.test', BOOTSTRAP_ADMIN_PASSWORD: privatePassword(), BOOTSTRAP_ADMIN_NAME: 'Private Owner' });
const asClient = (query: ReturnType<typeof vi.fn>) => ({ query }) as unknown as PoolClient;

describe('private account configuration', () => {
 it.each([undefined, '', 'short-value', ' '.repeat(24), 'x'.repeat(24), 'password123456789', 'change-me-123456789', '<private-sales-demo-password>', '<unique-private-admin-password>', '${PRIVATE_PASSWORD}', 'prefix-${PRIVATE_PASSWORD}-suffix'])('refuses missing, short and public seed passwords', password => {
  expect(() => requireSeedPassword({ DEMO_SEED_PASSWORD: password })).toThrow('DEMO_SEED_PASSWORD must be a private password');
 });

 it('preserves an explicit seed password exactly without a fallback', () => {
  const password = privatePassword();
  expect(requireSeedPassword({ DEMO_SEED_PASSWORD: password })).toBe(password);
 });

 it('normalizes a private administrator email and requires its password and name', () => {
  const env = adminEnvironment();
  expect(bootstrapAdminConfig({ ...env, BOOTSTRAP_ADMIN_EMAIL: ' Owner@Example.Test ', BOOTSTRAP_ADMIN_NAME: ' Private Owner ' }))
   .toEqual({ email: 'owner@example.test', password: env.BOOTSTRAP_ADMIN_PASSWORD, name: 'Private Owner' });
  expect(() => bootstrapAdminConfig({ ...env, BOOTSTRAP_ADMIN_PASSWORD: undefined })).toThrow('BOOTSTRAP_ADMIN_PASSWORD');
  expect(() => bootstrapAdminConfig({ ...env, BOOTSTRAP_ADMIN_NAME: ' ' })).toThrow('BOOTSTRAP_ADMIN_NAME');
 });

 it.each([undefined, '', 'invalid', 'DEMO@JENOSIZE.LOCAL', 'sales01@jenosize.local', 'sales20@jenosize.local'])('refuses demo or missing administrator addresses', email => {
  expect(() => bootstrapAdminConfig({ ...adminEnvironment(), BOOTSTRAP_ADMIN_EMAIL: email })).toThrow('BOOTSTRAP_ADMIN_EMAIL');
 });

 it.each(['<unique-private-admin-password>', '${BOOTSTRAP_ADMIN_PASSWORD}', 'prefix-${BOOTSTRAP_ADMIN_PASSWORD}-suffix'])('refuses documented administrator password placeholders', password => {
  expect(() => bootstrapAdminConfig({ ...adminEnvironment(), BOOTSTRAP_ADMIN_PASSWORD: password })).toThrow('BOOTSTRAP_ADMIN_PASSWORD');
 });
});

describe('administrator provisioning without destructive account changes', () => {
 it('creates a private Super Admin transactionally using only a password hash', async () => {
  const config = bootstrapAdminConfig(adminEnvironment());
  const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
  query.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 0, rows: [] })
   .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'private-admin-id' }] });
  const hash = vi.fn().mockResolvedValue('private-password-hash');
  expect(await createBootstrapAdmin(asClient(query), config, hash)).toBe('private-admin-id');
  expect(hash).toHaveBeenCalledWith(config.password);
  const inserted = query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO users'))!;
  expect(inserted[1]).toEqual([config.name, config.email, 'private-password-hash']);
  expect(inserted[0]).toContain("'super_admin'");
  expect(query.mock.calls.map(([sql]) => sql)).not.toContainEqual(expect.stringMatching(/^UPDATE /));
  expect(query.mock.calls.at(-1)).toEqual(['COMMIT']);
 });

 it('refuses an existing email without changing password, name or role', async () => {
  const query = vi.fn().mockResolvedValue({});
  query.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'existing-id' }] });
  await expect(createBootstrapAdmin(asClient(query), bootstrapAdminConfig(adminEnvironment()), async () => 'hash'))
   .rejects.toThrow('email already exists');
  expect(query.mock.calls.some(([sql]) => /^(INSERT|UPDATE|DELETE)/.test(sql))).toBe(false);
  expect(query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
 });

 it('rolls back a concurrent insert conflict instead of changing the winning account', async () => {
  const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
  await expect(createBootstrapAdmin(asClient(query), bootstrapAdminConfig(adminEnvironment()), async () => 'hash'))
   .rejects.toThrow('account already exists');
  expect(query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
  expect(query.mock.calls.some(([sql]) => /^UPDATE/.test(sql))).toBe(false);
 });

 it('rolls back an insertion error', async () => {
  const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
  query.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 0, rows: [] })
   .mockRejectedValueOnce(new Error('database write error'));
  await expect(createBootstrapAdmin(asClient(query), bootstrapAdminConfig(adminEnvironment()), async () => 'hash'))
   .rejects.toThrow('database write error');
  expect(query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
 });
});

describe('legacy demo retirement with retained account references', () => {
 it('requires another active Super Admin before disabling the demo account', async () => {
  const query = vi.fn().mockResolvedValue({ rows: [{ id: 'legacy-id', email: 'demo@jenosize.local' }] });
  await expect(retireLegacyDemoAdmin(asClient(query))).rejects.toThrow('another active Super Admin is required');
  expect(query.mock.calls).toHaveLength(1);
 });

 it('disables the legacy account and invalidates its sessions without deleting its ID or leads', async () => {
  const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: 'legacy-id', email: 'demo@jenosize.local' }, { id: 'private-id', email: 'owner@example.test' }] })
   .mockResolvedValueOnce({ rowCount: 1 });
  expect(await retireLegacyDemoAdmin(asClient(query))).toBe(1);
  expect(query.mock.calls[1]).toEqual([
   'UPDATE users SET active = false, session_version = session_version + 1 WHERE lower(email) = $1 AND active = true RETURNING id', ['demo@jenosize.local']
  ]);
  expect(query.mock.calls.some(([sql]) => /DELETE|UPDATE leads/.test(sql))).toBe(false);
 });

 it('does not invalidate sessions repeatedly when the account is already disabled', async () => {
  const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: 'private-id', email: 'owner@example.test' }] }).mockResolvedValueOnce({ rowCount: 0 });
  expect(await retireLegacyDemoAdmin(asClient(query))).toBe(0);
 });
});

describe('sample data seeding without privileged shared credentials', () => {
 it('creates 20 sales members with 15 leads each while retaining company/contact identifiers', () => {
  expect(members).toHaveLength(20);
  expect(members[0].email).toBe('sales20@jenosize.local');
  expect(new Set(members.map(member => member.email)).size).toBe(20);
  expect(members.every(member => member.role === 'sales')).toBe(true);
  expect(companies.map(company => company.n)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  expect(contacts).toHaveLength(2000);
  expect(leads).toHaveLength(300);
  for (const member of members) expect(leads.filter(lead => lead.owner === member.n)).toHaveLength(15);
  expect(leads.every(lead => lead.contact === lead.n && lead.company === (lead.n - 1) % 20 + 1)).toBe(true);
 });

 it('never promotes or reactivates demo accounts or resets existing passwords and identifiers', () => {
  const sql = demoSql('private-password-hash');
  expect(sql).not.toContain('super_admin');
  expect(sql).not.toContain('demo@jenosize.local');
  expect(sql).toContain('ON CONFLICT(email) DO NOTHING');
  const updates = sql.split(';').filter(statement => /^\s*UPDATE users/.test(statement));
  expect(updates.every(statement => !/SET\s+(?:password_hash|role|active|id)\s*=/.test(statement))).toBe(true);
  expect(sql).not.toMatch(/UPDATE leads\s+(?:\w+\s+)?SET\s+(?:id|owner_id|company_id|contact_id)\s*=/);
 });
});
