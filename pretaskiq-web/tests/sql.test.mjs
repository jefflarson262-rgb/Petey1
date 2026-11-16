// Runs supabase/setup.sql in a real (in-memory) Postgres to prove the script is valid, can be run twice, creates profiles the
// way the app expects, and really does lock the tables against the browser (public) key.
// Supabase's own pieces (the auth.users table and the three database roles) are stood in for with minimal copies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const setup = readFileSync(new URL('../supabase/setup.sql', import.meta.url), 'utf8');
const standIn = `
  create schema if not exists auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;   -- as in Supabase: this role skips row-level security
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to service_role;
`;

test('setup.sql: valid, repeatable, creates profiles correctly, and locks the browser key out', async () => {
  const db = new PGlite();
  await db.exec(standIn);
  await db.exec(setup);
  await db.exec(setup);                                           // running it again must not fail or change anything

  await db.exec(`insert into auth.users (email) values ('first@example.com'), ('second@example.com');`);
  const { rows } = await db.query(`select email, role, approved, display_name from public.profiles order by email`);
  assert.deepEqual(rows, [
    { email: 'first@example.com', role: 'safety', approved: true, display_name: 'first' },
    { email: 'second@example.com', role: 'foreman', approved: false, display_name: 'second' },
  ]);

  // The statement the README gives for approving a new person and choosing their role
  await db.exec(`update public.profiles set approved = true, role = 'construction' where email = 'second@example.com';`);
  assert.deepEqual((await db.query(`select role, approved from public.profiles where email='second@example.com'`)).rows, [{ role: 'construction', approved: true }]);

  await db.exec(`insert into auth.users (email, raw_user_meta_data) values ('named@example.com', '{"display_name":"Pat Lee"}');`);
  assert.equal((await db.query(`select display_name from public.profiles where email='named@example.com'`)).rows[0].display_name, 'Pat Lee');

  // The server (secret key = service_role) can work with the data
  await db.exec('set role service_role');
  const uid = (await db.query(`select id from public.profiles where email='first@example.com'`)).rows[0].id;
  const p = await db.query(`insert into public.plans (created_by, title, data) values ($1, 'T', '{"revision":1}') returning id, current_revision`, [uid]);
  await db.query(`insert into public.plan_revisions (plan_id, revision, data) values ($1, 1, '{}')`, [p.rows[0].id]);
  await assert.rejects(db.query(`insert into public.plan_revisions (plan_id, revision, data) values ($1, 1, '{}')`, [p.rows[0].id]), /duplicate key/);   // one row per revision
  await assert.rejects(db.query(`insert into public.plan_revisions (plan_id, revision, data, source) values ($1, 2, '{}', 'bogus')`, [p.rows[0].id]), /check constraint/);
  await assert.rejects(db.query(`update public.profiles set role = 'owner'`), /check constraint/);
  // Safety alerts: new ones start open, only the two known states are allowed, and the server (service_role) can raise and acknowledge them
  await db.query(`insert into public.alerts (raised_by, hazard) values ($1, 'Anchor not verified')`, [uid]);
  assert.deepEqual((await db.query(`select status, acknowledged_at from public.alerts`)).rows, [{ status: 'open', acknowledged_at: null }]);
  await assert.rejects(db.query(`insert into public.alerts (raised_by, hazard, status) values ($1, 'x', 'bogus')`, [uid]), /check constraint/);
  await assert.rejects(db.query(`insert into public.alerts (raised_by) values ($1)`, [uid]), /null value/);        // a hazard is required
  // Knowledge base: only the five known kinds, content required, and one client key per person (a retry cannot make a duplicate)
  await db.query(`insert into public.kb_entries (kb_type, data, client_key, created_by) values ('incident', '{"status":"ready"}', 'k1', $1)`, [uid]);
  await assert.rejects(db.query(`insert into public.kb_entries (kb_type, data, created_by) values ('bogus', '{}', $1)`, [uid]), /check constraint/);
  await assert.rejects(db.query(`insert into public.kb_entries (kb_type, created_by) values ('policy', $1)`, [uid]), /null value/);
  await assert.rejects(db.query(`insert into public.kb_entries (kb_type, data, client_key, created_by) values ('incident', '{}', 'k1', $1)`, [uid]), /duplicate key/);
  await db.query(`insert into public.kb_entries (kb_type, data, created_by) values ('incident', '{}', $1), ('policy', '{}', $1)`, [uid]);   // no key = never a duplicate
  await db.query(`update public.alerts set status = 'acknowledged', acknowledged_by = $1, acknowledged_at = now()`, [uid]);
  await db.exec('reset role');

  // Someone with saved plans cannot be deleted by accident (the database refuses); switching 'approved' off is how to cut them off
  await assert.rejects(db.exec(`delete from auth.users where email = 'first@example.com'`), /foreign key|violates/);
  await db.exec(`update public.profiles set approved = false where email = 'first@example.com'`);
  assert.equal((await db.query(`select approved from public.profiles where email='first@example.com'`)).rows[0].approved, false);

  // The browser keys (anon, and signed-in users going straight to the database) can read and write nothing
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    for (const t of ['profiles', 'plans', 'plan_revisions', 'ai_usage', 'alerts', 'kb_entries']) {
      await assert.rejects(db.query(`select * from public.${t}`), /permission denied/, `${role} must not read ${t}`);
    }
    await assert.rejects(db.query(`insert into public.ai_usage (user_id) values (gen_random_uuid())`), /permission denied/);
    await db.exec('reset role');
  }
  await db.close();
});
