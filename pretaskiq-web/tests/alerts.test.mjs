// Tests for the safety inbox (api/alerts.js): who can raise, see and acknowledge alerts. Runs against the Supabase stand-in.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.PRETASKIQ_SIGN_IN = 'on';
import { startFakeSupabase, makeJwt } from './helpers/fakeSupabase.mjs';
import alertsApi from '../api/alerts.js';

let fake, U;
const fakeRes = () => { const r = { statusCode: 200, headers: {}, body: '' }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.end = (b = '') => { r.body = b; }; return r; };
const call = async (req) => { const res = fakeRes(); await alertsApi({ headers: {}, ...req }, res); return { status: res.statusCode, json: res.body && res.body[0] === '{' ? JSON.parse(res.body) : res.body, raw: res.body }; };
const as = (u) => ({ authorization: 'Bearer ' + makeJwt(u.id, u.email) });
const list = (u) => call({ method: 'GET', url: '/api/alerts', headers: as(u) });
const raise = (u, body) => call({ method: 'POST', url: '/api/alerts', headers: as(u), body });
const ack = (u, id) => call({ method: 'POST', url: '/api/alerts', headers: as(u), body: { id, action: 'acknowledge' } });

before(async () => {
  fake = await startFakeSupabase();
  U = {
    sam: fake.addUser('sam@example.com', 'pw'),                                            // first user = safety administrator
    sue: fake.addUser('sue@example.com', 'pw', { role: 'safety', approved: true }),        // a second safety administrator
    ann: fake.addUser('ann@example.com', 'pw', { role: 'foreman', approved: true }),
    bob: fake.addUser('bob@example.com', 'pw', { role: 'foreman', approved: true }),
    carl: fake.addUser('carl@example.com', 'pw', { role: 'construction', approved: true }),
    wait: fake.addUser('wait@example.com', 'pw', { role: 'foreman', approved: false }),
  };
});
after(() => fake.close());
beforeEach(() => {
  process.env.SUPABASE_URL = fake.url; process.env.SUPABASE_PUBLISHABLE_KEY = fake.publishableKey; process.env.SUPABASE_SECRET_KEY = fake.secretKey;
  fake.state.tables.alerts.length = 0; fake.state.failTable = null;
});

test('a foreman raises an alert, and it is saved with who raised it and the job', async () => {
  const r = await raise(U.ann, { hazard: 'Crane anchor not verified as rated', context: 'Morning planning conversation', job: 'Set transformer with crane' });
  assert.equal(r.status, 201);
  assert.equal(r.json.alert.status, 'open');
  assert.equal(r.json.alert.raised_by_name, 'ann');
  assert.equal(r.json.alert.job, 'Set transformer with crane');
  assert.equal(fake.state.tables.alerts.length, 1);
});

test('every safety administrator sees every alert', async () => {
  await raise(U.ann, { hazard: 'Hazard from Ann' }); await raise(U.bob, { hazard: 'Hazard from Bob' });
  for (const who of [U.sam, U.sue]) { const r = await list(who); assert.equal(r.status, 200); assert.equal(r.json.alerts.length, 2); assert.equal(r.json.scope, 'all'); }
});

test('a foreman sees only their own alerts; a construction administrator is not the safety inbox', async () => {
  await raise(U.ann, { hazard: 'Hazard from Ann' }); await raise(U.bob, { hazard: 'Hazard from Bob' });
  const a = await list(U.ann); assert.deepEqual(a.json.alerts.map((x) => x.hazard), ['Hazard from Ann']); assert.equal(a.json.scope, 'mine');
  const c = await list(U.carl); assert.equal(c.json.alerts.length, 0);
});

test('only a safety administrator can acknowledge; the first person is kept and a second tap changes nothing', async () => {
  const id = (await raise(U.ann, { hazard: 'Hazard A' })).json.alert.id;
  for (const who of [U.ann, U.carl]) assert.equal((await ack(who, id)).status, 403);
  assert.equal(fake.state.tables.alerts[0].status, 'open');
  const first = await ack(U.sam, id);
  assert.equal(first.status, 200); assert.equal(first.json.alert.status, 'acknowledged'); assert.equal(first.json.alert.acknowledged_by_name, 'sam');
  const second = await ack(U.sue, id);
  assert.equal(second.status, 200); assert.equal(second.json.alert.acknowledged_by_name, 'sam');
  assert.equal((await list(U.ann)).json.alerts[0].status, 'acknowledged');                        // the foreman can see that it was acknowledged
});

test('acknowledging something that does not exist is a 404', async () => {
  assert.equal((await ack(U.sam, '11111111-1111-4111-8111-111111111111')).status, 404);
  assert.equal((await ack(U.sam, 'not-an-id')).status, 404);
});

test('the same flag sent twice in a row is one alert', async () => {
  const a = await raise(U.ann, { hazard: 'Same hazard' }); const b = await raise(U.ann, { hazard: '  Same   hazard ' });
  assert.equal(a.status, 201); assert.equal(b.status, 200); assert.equal(b.json.duplicate, true); assert.equal(b.json.alert.id, a.json.alert.id);
  assert.equal(fake.state.tables.alerts.length, 1);
  assert.equal((await raise(U.bob, { hazard: 'Same hazard' })).status, 201);                       // a different person flagging it is a separate alert
});

test('bad input is refused, and long text is cut', async () => {
  for (const body of [{}, { hazard: '' }, { hazard: '   ' }, { hazard: 42 }, null, [], 'x']) assert.equal((await raise(U.ann, body)).status, 400, JSON.stringify(body));
  const r = await raise(U.ann, { hazard: 'h'.repeat(1000), context: 'c'.repeat(500), job: 'j'.repeat(900), planId: 'nope' });
  assert.equal(r.status, 201); assert.equal(r.json.alert.hazard.length, 300); assert.equal(r.json.alert.context.length, 120); assert.equal(r.json.alert.job.length, 200); assert.equal(r.json.alert.plan_id, null);
});

test('a person cannot raise more than 30 alerts in an hour', async () => {
  for (let i = 0; i < 30; i++) assert.equal((await raise(U.ann, { hazard: 'Hazard ' + i })).status, 201);
  assert.equal((await raise(U.ann, { hazard: 'One too many' })).status, 429);
  assert.equal((await raise(U.bob, { hazard: 'Bob is not limited by Ann' })).status, 201);
});

test('signed out, not approved, wrong method', async () => {
  assert.equal((await call({ method: 'GET', url: '/api/alerts' })).status, 401);
  assert.equal((await list(U.wait)).status, 403);
  assert.equal((await raise(U.wait, { hazard: 'x' })).status, 403);
  assert.equal((await call({ method: 'DELETE', url: '/api/alerts', headers: as(U.sam) })).status, 405);
});

test('a missing table is reported as a database problem, not a crash', async () => {
  fake.state.failTable = 'alerts';
  const r = await list(U.sam); assert.equal(r.status, 503); assert.equal(r.json.error, 'database_error'); assert.equal(r.json.hint, 'tables_missing');
});

test('without sign-in (shared-code mode) the inbox is not available', async () => {
  process.env.PRETASKIQ_SIGN_IN = 'off';
  try { const r = await call({ method: 'GET', url: '/api/alerts', headers: as(U.sam) }); assert.equal(r.status, 503); assert.equal(r.json.error, 'supabase_not_configured'); }
  finally { process.env.PRETASKIQ_SIGN_IN = 'on'; }
});

test('replies never contain the secret key', async () => {
  const r = await raise(U.ann, { hazard: 'Hazard' }); assert.ok(!r.raw.includes(fake.secretKey)); assert.ok(!(await list(U.sam)).raw.includes(fake.secretKey));
});
