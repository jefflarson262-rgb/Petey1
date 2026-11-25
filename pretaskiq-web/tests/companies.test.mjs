// Tests for companies and licenses: one company can never read or change another's data, tiers switch features, a suspended company is shut out,
// seat limits hold, administrators add their own people, and only the platform owner creates companies.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.PRETASKIQ_SIGN_IN = 'on';
import { startFakeSupabase, makeJwt } from './helpers/fakeSupabase.mjs';
import { featuresFor, TIERS } from '../src/shared/licensing.js';
import { companyDb } from '../server/company.js';
import plansApi from '../api/plans.js';
import alertsApi from '../api/alerts.js';
import kbApi from '../api/kb.js';
import incidentsApi from '../api/incidents.js';
import protectionApi from '../api/protection.js';
import auditsApi from '../api/audits.js';
import meApi from '../server/handlers/me.js';
import companyApi from '../server/handlers/company.js';
import ownerApi from '../server/handlers/owner.js';

let fake, U, A, B, C;
const fakeRes = () => { const r = { statusCode: 200, headers: {}, body: '' }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.end = (b = '') => { r.body = b; }; r.writeHead = (c, h) => { r.statusCode = c; Object.entries(h || {}).forEach(([k, v]) => r.setHeader(k, v)); }; return r; };
const call = async (api, req) => { const res = fakeRes(); await api({ headers: {}, ...req }, res); return { status: res.statusCode, json: res.body && res.body[0] === '{' ? JSON.parse(res.body) : null }; };
const as = (u) => ({ authorization: 'Bearer ' + makeJwt(u.id, u.email) });
const get = (api, path, u, query = {}) => call(api, { method: 'GET', url: path, query, headers: as(u) });
const post = (api, path, u, body) => call(api, { method: 'POST', url: path, headers: as(u), body });
const plan = (t) => ({ jobTitle: t, revision: 1, taskSteps: [{ step: 'Cut', hazards: [] }] });
const kbEntry = (t) => ({ kbType: 'policy', title: t, data: { id: 1, kbType: 'policy', title: t, status: 'ready', summary: t, keywords: [] } });
const prelim = { kind: 'near_miss', title: 'Ladder slipped', data: { when: 'Today', location: 'Bldg 2', work: 'Conduit', narrative: 'The ladder base slid. No one was hurt.', people: [], injury: '', damage: '', actions: [], conditions: [], unknowns: [] } };
const co = (name, tier, extra = {}) => { const c = { id: crypto.randomUUID(), name, tier, seat_limit: null, status: 'active', created_at: new Date().toISOString(), ...extra }; fake.state.tables.companies.push(c); return c; };

before(async () => {
  fake = await startFakeSupabase();
  const owner = fake.addUser('owner@example.com', 'pw');                                   // first user: safety, owner, default company (full)
  A = fake.state.tables.companies[0];
  B = co('Bravo Builders', 'full'); C = co('Cedar Contractors', 'basic');
  U = {
    owner, aAdmin: owner,
    aForeman: fake.addUser('af@a.com', 'pw', { role: 'foreman', approved: true, company: A }),
    bAdmin: fake.addUser('badmin@b.com', 'pw', { role: 'safety', approved: true, company: B }),
    bForeman: fake.addUser('bf@b.com', 'pw', { role: 'foreman', approved: true, company: B }),
    cAdmin: fake.addUser('cadmin@c.com', 'pw', { role: 'safety', approved: true, company: C }),
    nocomp: fake.addUser('x@x.com', 'pw', { role: 'foreman', approved: true, company: null }),
  };
});
after(() => fake.close());
beforeEach(() => { process.env.SUPABASE_URL = fake.url; process.env.SUPABASE_PUBLISHABLE_KEY = fake.publishableKey; process.env.SUPABASE_SECRET_KEY = fake.secretKey; process.env.ANTHROPIC_API_KEY = 'x'; B.status = 'active'; B.tier = 'full'; B.seat_limit = null; });

test('licensing: every tier lists only known features, and higher tiers include lower ones', () => {
  for (const t of Object.keys(TIERS)) assert.ok(featuresFor(t).length > 0);
  for (const f of featuresFor('basic')) assert.ok(featuresFor('standard').includes(f) && featuresFor('full').includes(f));
  assert.deepEqual(featuresFor('nonsense'), []);
});

test('the company wrapper limits reads and updates and stamps inserts; it refuses non-company tables', async () => {
  const seen = [];
  const fakeQuery = (n) => new Proxy({}, { get: (_, k) => (...a) => { seen.push([n, k, a]); return fakeQuery(n); } });
  const db = companyDb({ from: (t) => fakeQuery(t) }, 'cid-1');
  db.from('plans').select('*'); db.from('plans').update({ a: 1 }); db.from('plans').insert({ x: 1 }); db.from('plan_revisions').upsert([{ y: 2 }]);
  assert.deepEqual(seen.filter((s) => s[1] === 'eq').map((s) => s[2]), [['company_id', 'cid-1'], ['company_id', 'cid-1']]);
  assert.deepEqual(seen.find((s) => s[1] === 'insert')[2][0], { x: 1, company_id: 'cid-1' });
  assert.deepEqual(seen.find((s) => s[1] === 'upsert')[2][0], [{ y: 2, company_id: 'cid-1' }]);
  assert.throws(() => db.from('profiles'), /not a company table/);
});

test('plans: a company never sees, opens or changes another company\'s plans, and the overview is per company', async () => {
  const mine = (await post(plansApi, '/api/plans', U.aForeman, { data: plan('A job') })).json.plan;
  assert.ok(mine && mine.id);
  const bList = await get(plansApi, '/api/plans', U.bAdmin);
  assert.equal(bList.status, 200); assert.ok(!bList.json.plans.some((p) => p.id === mine.id));
  assert.equal((await get(plansApi, '/api/plans?id=' + mine.id, U.bAdmin, { id: mine.id })).status, 404);
  assert.notEqual((await post(plansApi, '/api/plans', U.bAdmin, { id: mine.id, data: plan('Hijack'), baseRevision: 1 })).status, 200);
  const since = encodeURIComponent(new Date(Date.now() - 3600e3).toISOString());
  const bOv = await get(plansApi, '/api/plans?overview=1&since=' + since, U.bAdmin, { overview: '1', since: decodeURIComponent(since) });
  assert.ok(!bOv.json.plans.some((p) => p.id === mine.id));
  const aOv = await get(plansApi, '/api/plans?overview=1&since=' + since, U.aAdmin, { overview: '1', since: decodeURIComponent(since) });
  assert.ok(aOv.json.plans.some((p) => p.id === mine.id));
  assert.equal(fake.state.tables.plans.find((p) => p.id === mine.id).company_id, A.id);
});

test('alerts, knowledge base, incidents, audits and protection are all kept apart', async () => {
  const al = (await post(alertsApi, '/api/alerts', U.aForeman, { hazard: 'A-only hazard', job: 'J' })).json.alert;
  assert.ok(!(await get(alertsApi, '/api/alerts', U.bAdmin)).json.alerts.some((a) => a.id === al.id));
  assert.equal((await post(alertsApi, '/api/alerts', U.bAdmin, { id: al.id, action: 'acknowledge' })).status, 404);

  const kb = (await post(kbApi, '/api/kb', U.aAdmin, { entry: kbEntry('A policy') })).json.entry;
  assert.ok(!(await get(kbApi, '/api/kb', U.bAdmin)).json.entries.some((e) => e.id === kb.id));
  assert.equal((await post(kbApi, '/api/kb', U.bAdmin, { id: kb.id, action: 'archive' })).status, 404);

  const inc = (await post(incidentsApi, '/api/incidents', U.aForeman, { report: prelim, clientKey: 'k1' })).json.report;
  assert.ok(!(await get(incidentsApi, '/api/incidents', U.bAdmin)).json.reports.some((r) => r.id === inc.id));
  assert.equal((await post(incidentsApi, '/api/incidents', U.bAdmin, { id: inc.id, action: 'complete', full: {} })).status, 404);

  const tpl = (await post(auditsApi, '/api/audits', U.aAdmin, { template: { title: 'A audit', items: [{ text: 'One' }] } })).json.template;
  assert.ok(!(await get(auditsApi, '/api/audits?what=templates', U.bAdmin, { what: 'templates' })).json.templates.some((t) => t.id === tpl.id));
  assert.equal((await post(auditsApi, '/api/audits', U.bAdmin, { id: tpl.id, action: 'archive' })).status, 404);

  const cl = (await post(protectionApi, '/api/protection', U.aAdmin, { checklist: { category: 'Fall', label: 'Fall', sourceNote: 't', controls: [{ kind: 'prevention', text: 'Anchor checked' }] } })).json.checklist;
  assert.ok(!(await get(protectionApi, '/api/protection?what=checklists', U.bAdmin, { what: 'checklists' })).json.checklists.some((c) => c.id === cl.id));
  assert.equal((await post(protectionApi, '/api/protection', U.bAdmin, { id: cl.id, action: 'approve' })).status, 404);
  for (const t of ['plans', 'alerts', 'kb_entries', 'incident_reports', 'audit_templates', 'protection_checklists']) {
    for (const r of fake.state.tables[t]) assert.ok(r.company_id, t + ' row has a company');
  }
});

test('a person with no company, or a suspended company, is shut out; the owner can still see their license', async () => {
  assert.equal((await get(plansApi, '/api/plans', U.nocomp)).json.error, 'no_company');
  B.status = 'suspended';
  const r = await get(plansApi, '/api/plans', U.bForeman);
  assert.equal(r.status, 403); assert.equal(r.json.error, 'license_inactive');
  const me = await get(meApi, '/api/me', U.bForeman);
  assert.equal(me.status, 200); assert.equal(me.json.company.status, 'suspended'); assert.deepEqual(me.json.company.features, []);
});

test('tiers: a feature outside the company\'s tier is refused by the server', async () => {
  assert.equal((await get(plansApi, '/api/plans', U.cAdmin)).status, 200);                     // basic: planning
  assert.equal((await get(kbApi, '/api/kb', U.cAdmin)).status, 200);                           // basic: knowledge base
  for (const [api, path] of [[incidentsApi, '/api/incidents'], [auditsApi, '/api/audits?what=templates'], [protectionApi, '/api/protection?what=checklists']]) {
    const r = await get(api, path, U.cAdmin, { what: 'templates' });
    assert.equal(r.status, 403, path); assert.equal(r.json.error, 'feature_not_licensed');
  }
  B.tier = 'standard';
  assert.equal((await get(incidentsApi, '/api/incidents', U.bAdmin)).status, 200);
  const me = await get(meApi, '/api/me', U.bAdmin);
  assert.deepEqual(me.json.company.features, featuresFor('standard')); assert.equal(me.json.company.name, 'Bravo Builders');
});

test('company admin: adds people with a temporary password, respects the seat limit, switches people off and on, only for own company', async () => {
  B.seat_limit = 3;                                                      // bAdmin + bForeman = 2 used
  const add = await post(companyApi, '/api/company', U.bAdmin, { action: 'add_member', email: 'New.Person@B.com', displayName: 'New Person', role: 'foreman' });
  assert.equal(add.status, 201); assert.ok(add.json.temporaryPassword.length >= 12); assert.equal(add.json.member.email, 'new.person@b.com');
  const prof = fake.state.tables.profiles.find((p) => p.email === 'new.person@b.com');
  assert.equal(prof.company_id, B.id); assert.equal(prof.approved, true); assert.equal(prof.role, 'foreman'); assert.equal(prof.is_owner, false);
  const signedIn = fake.state.users.find((u) => u.email === 'new.person@b.com'); assert.equal(signedIn.password, add.json.temporaryPassword);
  const full = await post(companyApi, '/api/company', U.bAdmin, { action: 'add_member', email: 'fourth@b.com', role: 'foreman' });
  assert.equal(full.status, 409); assert.equal(full.json.error, 'seat_limit_reached');
  assert.equal((await post(companyApi, '/api/company', U.bAdmin, { action: 'add_member', email: 'bf@b.com', role: 'foreman' })).json.error, 'seat_limit_reached');
  B.seat_limit = 10;
  assert.equal((await post(companyApi, '/api/company', U.bAdmin, { action: 'add_member', email: 'bf@b.com', role: 'foreman' })).json.error, 'email_in_use');
  B.seat_limit = 3;
  assert.equal((await post(companyApi, '/api/company', U.bAdmin, { action: 'add_member', email: 'not-an-email', role: 'foreman' })).status, 400);
  assert.equal((await post(companyApi, '/api/company', U.bAdmin, { action: 'add_member', email: 'x1@b.com', role: 'owner' })).status, 400);
  assert.equal((await post(companyApi, '/api/company', U.bForeman, { action: 'add_member', email: 'x2@b.com', role: 'foreman' })).status, 403);   // not an administrator
  // switch off frees a seat; switching back on needs a free seat
  const off = await post(companyApi, '/api/company', U.bAdmin, { action: 'set_active', id: add.json.member.id, active: false });
  assert.equal(off.json.member.active, false);
  assert.equal((await post(companyApi, '/api/company', U.bAdmin, { action: 'add_member', email: 'fourth@b.com', role: 'foreman' })).status, 201);
  assert.equal((await post(companyApi, '/api/company', U.bAdmin, { action: 'set_active', id: add.json.member.id, active: true })).json.error, 'seat_limit_reached');
  assert.equal((await post(companyApi, '/api/company', U.bAdmin, { action: 'set_active', id: U.bAdmin.id, active: false })).json.error, 'cannot_deactivate_self');
  assert.equal((await post(companyApi, '/api/company', U.bAdmin, { action: 'set_active', id: U.aForeman.id, active: false })).status, 404);   // another company's person
  const list = await get(companyApi, '/api/company', U.bAdmin);
  assert.ok(list.json.members.every((m) => !['af@a.com', 'cadmin@c.com'].includes(m.email))); assert.equal(list.json.company.seatLimit, 3);
  B.seat_limit = null;
});

test('owner tools: only the owner; create a company with its first administrator; change tier, seats and status', async () => {
  assert.equal((await get(ownerApi, '/api/owner', U.bAdmin)).status, 403);
  assert.equal((await post(ownerApi, '/api/owner', U.bAdmin, { action: 'create_company', name: 'X', tier: 'basic', admin: { email: 'a@x.com' } })).status, 403);
  const made = await post(ownerApi, '/api/owner', U.owner, { action: 'create_company', name: 'Delta Electric', tier: 'standard', seatLimit: 10, admin: { email: 'boss@delta.com', displayName: 'Dee Boss' } });
  assert.equal(made.status, 201); assert.equal(made.json.company.tier, 'standard'); assert.equal(made.json.company.seatLimit, 10);
  const boss = fake.state.tables.profiles.find((p) => p.email === 'boss@delta.com');
  assert.equal(boss.company_id, made.json.company.id); assert.equal(boss.role, 'safety'); assert.equal(boss.approved, true); assert.equal(boss.is_owner, false);
  assert.equal((await get(meApi, '/api/me', { id: boss.id, email: boss.email })).json.company.name, 'Delta Electric');
  // bad input
  for (const bad of [{ name: '', tier: 'basic' }, { name: 'N', tier: 'gold' }, { name: 'N', tier: 'basic', seatLimit: 0 }]) assert.equal((await post(ownerApi, '/api/owner', U.owner, { action: 'create_company', admin: { email: 'q@q.com' }, ...bad })).status, 400);
  // if the administrator cannot be created, no half-made company is left behind
  const before = fake.state.tables.companies.length;
  assert.equal((await post(ownerApi, '/api/owner', U.owner, { action: 'create_company', name: 'Dup', tier: 'basic', admin: { email: 'boss@delta.com' } })).json.error, 'email_in_use');
  assert.equal(fake.state.tables.companies.length, before);
  // update
  const up = await post(ownerApi, '/api/owner', U.owner, { action: 'update_company', id: made.json.company.id, tier: 'full', seatLimit: null, status: 'suspended' });
  assert.equal(up.json.company.tier, 'full'); assert.equal(up.json.company.status, 'suspended'); assert.equal(up.json.company.seatLimit, null);
  assert.equal((await post(ownerApi, '/api/owner', U.owner, { action: 'update_company', id: A.id, status: 'suspended' })).json.error, 'cannot_suspend_own_company');
  assert.equal((await post(ownerApi, '/api/owner', U.owner, { action: 'update_company', id: made.json.company.id, tier: 'gold' })).status, 400);
  const list = await get(ownerApi, '/api/owner', U.owner);
  assert.ok(list.json.companies.length >= 4); assert.ok(list.json.companies.find((c) => c.name === 'Bravo Builders').seatsUsed >= 2);
});

test('account endpoint: routes /api/me, /api/company and /api/owner, and the project stays within the 12-function limit', async () => {
  const { default: account } = await import('../api/account.js');
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(new URL('../api/', import.meta.url)).filter((f) => f.endsWith('.js'));
  assert.ok(files.length <= 12, `${files.length} serverless functions; Vercel's free plan allows 12`);
  assert.equal((await call(account, { method: 'GET', url: '/api/account?area=me', query: { area: 'me' }, headers: as(U.bAdmin) })).json.company.name, 'Bravo Builders');
  assert.equal((await call(account, { method: 'GET', url: '/api/company', headers: as(U.bAdmin) })).json.company.name, 'Bravo Builders');   // area found from the path
  assert.equal((await call(account, { method: 'GET', url: '/api/owner', query: { area: 'owner' }, headers: as(U.bAdmin) })).status, 403);
  assert.equal((await call(account, { method: 'GET', url: '/api/account?area=x', query: { area: 'x' }, headers: as(U.bAdmin) })).status, 404);
});
