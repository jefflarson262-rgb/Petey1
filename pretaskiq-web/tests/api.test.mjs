// Tests for the sign-in mode: config, who-am-I, saved plans, the AI proxy's sign-in check and hourly limit, and the setup check.
// Runs against a stand-in for Supabase (tests/helpers/fakeSupabase.mjs), so no network and no real project are needed.
import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
import { startFakeSupabase, makeJwt } from './helpers/fakeSupabase.mjs';
import { readConfig, publicConfig } from '../server/config.js';
import configApi from '../api/config.js';
import healthApi from '../api/health.js';
import meApi from '../api/me.js';
import plansApi from '../api/plans.js';
import claudeApi from '../api/claude.js';

const SECRET_ANTHROPIC = 'sk-ant-test-SECRET-KEY';
let fake, U, realFetch, anthropicCalls;

const fakeRes = () => { const r = { statusCode: 200, headers: {}, body: '' }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.end = (b = '') => { r.body = b; }; return r; };
const call = async (handler, req) => { const res = fakeRes(); await handler({ headers: {}, ...req }, res); return { status: res.statusCode, json: res.body && res.body[0] === '{' ? JSON.parse(res.body) : res.body, raw: res.body, headers: res.headers }; };
const as = (user) => ({ authorization: 'Bearer ' + makeJwt(user.id, user.email) });
const plan = (over = {}) => ({ jobTitle: 'Cut bolts at height', revision: 1, taskSteps: [{ step: 'Cut', hazards: [] }], ...over });
const save = (user, body) => call(plansApi, { method: 'POST', url: '/api/plans', headers: as(user), body });

before(async () => {
  fake = await startFakeSupabase();
  U = {
    admin: fake.addUser('admin@example.com', 'pw-admin'),                       // first user => safety, approved
    ann: fake.addUser('ann@example.com', 'pw-ann', { role: 'foreman', approved: true }),
    bob: fake.addUser('bob@example.com', 'pw-bob', { role: 'foreman', approved: true }),
    carl: fake.addUser('carl@example.com', 'pw-carl', { role: 'construction', approved: true }),
    pending: fake.addUser('new@example.com', 'pw-new', { role: 'foreman', approved: false }),
  };
});
after(() => fake.close());

beforeEach(() => {
  process.env.SUPABASE_URL = fake.url; process.env.SUPABASE_PUBLISHABLE_KEY = fake.publishableKey; process.env.SUPABASE_SECRET_KEY = fake.secretKey;
  process.env.ANTHROPIC_API_KEY = SECRET_ANTHROPIC; delete process.env.ACCESS_CODE; delete process.env.AI_CALLS_PER_HOUR; delete process.env.ANTHROPIC_MODEL;
  fake.state.failTable = null; fake.state.tables.ai_usage.length = 0; anthropicCalls = [];
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {                                    // only Anthropic is faked here; Supabase calls go to the stand-in
    if (String(url).startsWith('https://api.anthropic.com')) { anthropicCalls.push({ url, init, payload: JSON.parse(init.body) }); return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), { status: 200, headers: { 'content-type': 'application/json' } }); }
    return realFetch(url, init);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

// ---------- config ----------
test('config: three settings means Supabase mode, and the secret key is never in the public config', () => {
  const cfg = readConfig();
  assert.equal(cfg.mode, 'supabase');
  const pub = JSON.stringify(publicConfig(cfg));
  assert.ok(pub.includes(fake.publishableKey) && pub.includes(fake.url));
  assert.ok(!pub.includes(fake.secretKey));
});
test('config: none set is the shared-code mode; some set is flagged, not guessed', () => {
  assert.equal(readConfig({}).mode, 'code');
  const partial = readConfig({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'k' });
  assert.equal(partial.mode, 'misconfigured'); assert.deepEqual(partial.missing, ['SUPABASE_SECRET_KEY']);
  assert.equal(readConfig({ SUPABASE_URL: 'http://evil.example.com', SUPABASE_PUBLISHABLE_KEY: 'k', SUPABASE_SECRET_KEY: 's' }).mode, 'misconfigured');
  assert.equal(readConfig({ SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_ANON_KEY: 'k', SUPABASE_SERVICE_ROLE_KEY: 's' }).mode, 'supabase');   // older key names still work
});
test('GET /api/config returns what the browser needs and nothing secret', async () => {
  const r = await call(configApi, { method: 'GET' });
  assert.equal(r.status, 200); assert.equal(r.json.auth, 'supabase'); assert.ok(!r.raw.includes(fake.secretKey)); assert.ok(!r.raw.includes(SECRET_ANTHROPIC));
});

// ---------- who am I ----------
test('/api/me: needs a real, approved sign-in', async () => {
  assert.equal((await call(meApi, { method: 'GET' })).json.error, 'not_signed_in');
  assert.equal((await call(meApi, { method: 'GET', headers: { authorization: 'Bearer garbage' } })).json.error, 'invalid_session');
  const expired = { authorization: 'Bearer ' + makeJwt(U.ann.id, U.ann.email, -10) };
  assert.equal((await call(meApi, { method: 'GET', headers: expired })).status, 401);
  const pend = await call(meApi, { method: 'GET', headers: as(U.pending) });
  assert.equal(pend.status, 403); assert.equal(pend.json.error, 'not_approved');
  const stranger = await call(meApi, { method: 'GET', headers: { authorization: 'Bearer ' + makeJwt('00000000-0000-4000-8000-000000000000', 'x@y.z') } });
  assert.equal(stranger.status, 401);   // token for a user the auth server does not know
});
test('/api/me: returns the role', async () => {
  const r = await call(meApi, { method: 'GET', headers: as(U.admin) });
  assert.equal(r.status, 200); assert.equal(r.json.profile.role, 'safety'); assert.equal(r.json.user.email, 'admin@example.com');
});

// ---------- plans ----------
test('plans: save, list, open', async () => {
  const created = await save(U.ann, { data: plan(), source: 'planning' });
  assert.equal(created.status, 201); assert.equal(created.json.plan.title, 'Cut bolts at height'); assert.equal(created.json.plan.current_revision, 1);
  const list = await call(plansApi, { method: 'GET', url: '/api/plans', headers: as(U.ann) });
  assert.ok(list.json.plans.some((p) => p.id === created.json.plan.id));
  assert.ok(!('data' in list.json.plans[0]), 'the list does not carry full plan content');
  const one = await call(plansApi, { method: 'GET', url: '/api/plans?id=' + created.json.plan.id, headers: as(U.ann) });
  assert.equal(one.json.plan.data.taskSteps[0].step, 'Cut');
});
test('plans: a foreman cannot see or change another foreman\'s plan, and gets "not found", not "forbidden"', async () => {
  const p = (await save(U.ann, { data: plan({ jobTitle: 'Ann only' }) })).json.plan;
  const bobList = await call(plansApi, { method: 'GET', url: '/api/plans', headers: as(U.bob) });
  assert.ok(!bobList.json.plans.some((x) => x.id === p.id));
  assert.equal((await call(plansApi, { method: 'GET', url: '/api/plans?id=' + p.id, headers: as(U.bob) })).status, 404);
  assert.equal((await save(U.bob, { id: p.id, data: plan({ revision: 2 }) })).status, 404);
  assert.equal((await call(plansApi, { method: 'GET', url: '/api/plans?id=' + p.id + '&revisions=1', headers: as(U.bob) })).status, 404);
});
test('plans: safety sees and edits every plan; construction sees all but edits only its own', async () => {
  const p = (await save(U.ann, { data: plan({ jobTitle: 'Shared view' }) })).json.plan;
  const adminList = await call(plansApi, { method: 'GET', url: '/api/plans', headers: as(U.admin) });
  assert.ok(adminList.json.plans.some((x) => x.id === p.id));
  assert.equal((await save(U.admin, { id: p.id, data: plan({ jobTitle: 'Shared view', revision: 2 }), source: 'edit' })).status, 200);
  const carlList = await call(plansApi, { method: 'GET', url: '/api/plans', headers: as(U.carl) });
  assert.ok(carlList.json.plans.some((x) => x.id === p.id));
  const blocked = await save(U.carl, { id: p.id, data: plan({ revision: 3 }) });
  assert.equal(blocked.status, 403); assert.equal(blocked.json.error, 'read_only');
  assert.equal((await save(U.carl, { data: plan({ jobTitle: 'Carl own' }) })).status, 201);
});
test('plans: every revision is kept; saving the same revision twice replaces it instead of duplicating', async () => {
  const p = (await save(U.ann, { data: plan({ revision: 1 }), source: 'planning' })).json.plan;
  await save(U.ann, { id: p.id, data: plan({ revision: 2, lastUpdated: 'a' }), source: 'petey_update', note: 'Crew added a second ladder' });
  await save(U.ann, { id: p.id, data: plan({ revision: 2, lastUpdated: 'b' }), source: 'edit' });
  const revs = (await call(plansApi, { method: 'GET', url: `/api/plans?id=${p.id}&revisions=1`, headers: as(U.ann) })).json.revisions;
  assert.deepEqual(revs.map((r) => r.revision), [2, 1]);
  assert.equal(revs[0].source, 'edit');
  const open = (await call(plansApi, { method: 'GET', url: '/api/plans?id=' + p.id, headers: as(U.ann) })).json.plan;
  assert.equal(open.current_revision, 2); assert.equal(open.data.lastUpdated, 'b');
  assert.ok(!('data' in revs[0]));
});
test('plans: input checks', async () => {
  for (const body of [{}, { data: null }, { data: [] }, { data: 'x' }, null]) assert.equal((await save(U.ann, body)).status, 400, JSON.stringify(body));
  assert.equal((await save(U.ann, { data: plan({ blob: 'x'.repeat(401_000) }) })).status, 413);
  assert.equal((await call(plansApi, { method: 'GET', url: '/api/plans?id=not-a-uuid', headers: as(U.ann) })).status, 404);
  const ok = await save(U.ann, { data: { taskSteps: [] }, source: 'anything-else' });
  assert.equal(ok.status, 201); assert.equal(ok.json.plan.title, 'Untitled plan');
  assert.equal((await call(plansApi, { method: 'DELETE', headers: as(U.ann) })).status, 405);
});
test('plans: signed-out and unapproved people get nothing', async () => {
  assert.equal((await call(plansApi, { method: 'GET', url: '/api/plans' })).status, 401);
  assert.equal((await call(plansApi, { method: 'GET', url: '/api/plans', headers: as(U.pending) })).status, 403);
  assert.equal((await save(U.pending, { data: plan() })).status, 403);
});
test('a database problem is reported as a short hint, with no secrets', async () => {
  fake.state.failTable = 'plans';
  const r = await call(plansApi, { method: 'GET', url: '/api/plans', headers: as(U.ann) });
  assert.equal(r.status, 503); assert.equal(r.json.hint, 'tables_missing'); assert.ok(!r.raw.includes(fake.secretKey));
});

// ---------- the AI proxy ----------
const ask = (user, headers = {}) => call(claudeApi, { method: 'POST', headers: { ...(user ? as(user) : {}), ...headers }, body: { messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 } });
test('AI proxy: needs sign-in, ignores the old shared code, then forwards with the server key', async () => {
  assert.equal((await ask(null)).status, 401);
  assert.equal((await ask(null, { 'x-access-code': 'anything' })).status, 401);
  assert.equal((await ask(U.pending)).status, 403);
  assert.equal(anthropicCalls.length, 0);
  const ok = await ask(U.ann);
  assert.equal(ok.status, 200); assert.equal(anthropicCalls.length, 1);
  assert.equal(anthropicCalls[0].init.headers['x-api-key'], SECRET_ANTHROPIC);
  assert.ok(!ok.raw.includes(SECRET_ANTHROPIC));
});
test('AI proxy: hourly limit per person, and other people are not affected', async () => {
  process.env.AI_CALLS_PER_HOUR = '2';
  assert.equal((await ask(U.ann)).status, 200); assert.equal((await ask(U.ann)).status, 200);
  const third = await ask(U.ann);
  assert.equal(third.status, 429); assert.equal(third.json.error, 'rate_limited'); assert.equal(anthropicCalls.length, 2);
  assert.equal((await ask(U.bob)).status, 200);
});
test('AI proxy: a half-configured Supabase is refused, not silently downgraded to the shared code', async () => {
  delete process.env.SUPABASE_SECRET_KEY; process.env.ACCESS_CODE = 'letmein';
  const r = await ask(null, { 'x-access-code': 'letmein' });
  assert.equal(r.status, 503); assert.equal(r.json.error, 'supabase_misconfigured'); assert.deepEqual(r.json.missing, ['SUPABASE_SECRET_KEY']);
});
test('AI proxy status page reports sign-in mode', async () => {
  const r = await call(claudeApi, { method: 'GET' });
  assert.deepEqual(r.json, { ok: true, mode: 'supabase', signInRequired: true, configured: true });
});

// ---------- the setup check ----------
test('/api/health: all tables ok, no secrets shown', async () => {
  const r = await call(healthApi, { method: 'GET' });
  assert.equal(r.json.ok, true); assert.equal(r.json.mode, 'supabase'); assert.deepEqual(Object.values(r.json.tables), ['ok', 'ok', 'ok', 'ok']);
  assert.equal(r.json.hasApprovedUser, true);
  for (const secret of [fake.secretKey, fake.publishableKey, SECRET_ANTHROPIC, fake.url]) assert.ok(!r.raw.includes(secret));
});
test('/api/health: says which table is missing', async () => {
  fake.state.failTable = 'plan_revisions';
  const r = await call(healthApi, { method: 'GET' });
  assert.equal(r.json.ok, false); assert.equal(r.json.tables.plan_revisions, 'tables_missing'); assert.equal(r.json.tables.plans, 'ok');
});
test('/api/health: names the missing setting when only some are set', async () => {
  delete process.env.SUPABASE_URL;
  const r = await call(healthApi, { method: 'GET' });
  assert.equal(r.json.mode, 'misconfigured'); assert.equal(r.json.ok, false); assert.equal(r.json.settings.SUPABASE_URL, false);
});
