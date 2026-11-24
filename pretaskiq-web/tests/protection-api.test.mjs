// Tests for api/protection.js: checklists are drafted and approved by safety; observations are checked against the approved checklist.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.PRETASKIQ_SIGN_IN = 'on';
import { startFakeSupabase, makeJwt } from './helpers/fakeSupabase.mjs';
import api from '../api/protection.js';

let fake, U;
const fakeRes = () => { const r = { statusCode: 200, headers: {}, body: '' }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.end = (b = '') => { r.body = b; }; r.writeHead = (c, h) => { r.statusCode = c; Object.assign(r.headers, h || {}); }; return r; };
const call = async (req) => { const res = fakeRes(); await api({ headers: {}, ...req }, res); return { status: res.statusCode, json: res.body && res.body[0] === '{' ? JSON.parse(res.body) : null }; };
const as = (u) => ({ authorization: 'Bearer ' + makeJwt(u.id, u.email) });
const get = (u, what) => call({ method: 'GET', url: '/api/protection?what=' + what, query: { what }, headers: as(u) });
const post = (u, body) => call({ method: 'POST', url: '/api/protection', headers: as(u), body });

// Made-up controls for testing only
const checklist = { category: 'Test Category', label: 'Test category', sourceNote: 'test', controls: [
  { id: 'p1', kind: 'prevention', text: 'Prevention one' }, { id: 'p2', kind: 'prevention', text: 'Prevention two' }, { id: 'm1', kind: 'mitigation', text: 'Mitigation one' }] };
let ids = {};                                                                  // control ids are made from the wording, so read them back after saving
const answers = (over = {}) => ['p1', 'p2', 'm1'].map((n) => ({ id: ids[n], applies: true, present: true, works: true, ...(over[n] || {}) }));

before(async () => {
  fake = await startFakeSupabase();
  U = { sam: fake.addUser('sam@example.com', 'pw'), ann: fake.addUser('ann@example.com', 'pw', { role: 'foreman', approved: true }), wait: fake.addUser('wait@example.com', 'pw', { role: 'foreman', approved: false }) };
});
after(() => fake.close());
beforeEach(() => {
  process.env.SUPABASE_URL = fake.url; process.env.SUPABASE_PUBLISHABLE_KEY = fake.publishableKey; process.env.SUPABASE_SECRET_KEY = fake.secretKey;
  fake.state.tables.protection_checklists.length = 0; fake.state.tables.protection_observations.length = 0;
});
const approved = async () => { const d = await post(U.sam, { checklist }); await post(U.sam, { id: d.json.checklist.id, action: 'approve' }); const t = d.json.checklist.controls; ids = { p1: t[0].id, p2: t[1].id, m1: t[2].id }; return d.json.checklist.id; };

test('only safety can draft, approve or discard checklists', async () => {
  assert.equal((await post(U.ann, { checklist })).status, 403);
  const d = await post(U.sam, { checklist }); assert.equal(d.status, 201); assert.equal(d.json.checklist.status, 'draft'); assert.equal(d.json.checklist.category, 'test_category');
  assert.equal((await post(U.ann, { id: d.json.checklist.id, action: 'approve' })).status, 403);
  assert.equal((await post(U.sam, { id: d.json.checklist.id, action: 'approve' })).json.checklist.status, 'approved');
});

test('an invalid checklist is refused; saving again replaces the draft rather than adding another', async () => {
  assert.equal((await post(U.sam, { checklist: { ...checklist, controls: [] } })).status, 400);
  assert.equal((await post(U.sam, { checklist: { ...checklist, label: '' } })).status, 400);
  assert.equal((await post(U.sam, { checklist: { ...checklist, category: '!!!' } })).status, 400);
  await post(U.sam, { checklist }); const again = await post(U.sam, { checklist: { ...checklist, label: 'Renamed' } });
  assert.equal(again.status, 200); assert.equal(fake.state.tables.protection_checklists.length, 1); assert.equal(fake.state.tables.protection_checklists[0].label, 'Renamed');
});

test('foremen see only approved checklists; safety also sees drafts; approving replaces the live one', async () => {
  await post(U.sam, { checklist });
  assert.equal((await get(U.ann, 'checklists')).json.checklists.length, 0); assert.equal((await get(U.sam, 'checklists')).json.checklists.length, 1);
  const first = await approved();
  assert.equal((await get(U.ann, 'checklists')).json.checklists.length, 1);
  const d2 = await post(U.sam, { checklist: { ...checklist, label: 'Version two' } }); await post(U.sam, { id: d2.json.checklist.id, action: 'approve' });
  const live = (await get(U.ann, 'checklists')).json.checklists; assert.equal(live.length, 1); assert.equal(live[0].label, 'Version two'); assert.notEqual(live[0].id, first);
});

test('an observation needs an approved checklist and an answer for every control', async () => {
  assert.equal((await post(U.ann, { observation: { category: 'test_category', answers: answers() } })).status, 404);
  await approved();
  assert.equal((await post(U.wait, { observation: { category: 'test_category', answers: answers() } })).status, 403);
  assert.equal((await post(U.ann, { observation: { category: 'test_category', answers: answers().slice(1) } })).status, 400);
  assert.equal((await post(U.ann, { observation: { category: 'test_category', answers: [...answers(), { id: 'zz', applies: true, present: true, works: true }] } })).status, 400);
  assert.equal((await post(U.ann, { observation: { category: 'test_category', answers: [{ id: ids.p1, applies: 'yes' }, ...answers().slice(1)] } })).status, 400);
  const ok = await post(U.ann, { observation: { category: 'test_category', answers: answers() } }); assert.equal(ok.status, 201);
  assert.equal(fake.state.tables.protection_observations.length, 1);
});

test('answers are stored as found, with kinds taken from the checklist and impossible combinations tidied', async () => {
  await approved();
  await post(U.ann, { observation: { category: 'test_category', answers: [{ id: ids.p1, applies: false, present: true, works: true }, { id: ids.p2, applies: true, present: false, works: true }, { id: ids.m1, applies: true, present: true, works: false, kind: 'prevention' }] } });
  const row = fake.state.tables.protection_observations[0];
  assert.deepEqual(row.controls, [
    { id: ids.p1, kind: 'prevention', applies: false, present: false, works: false },
    { id: ids.p2, kind: 'prevention', applies: true, present: false, works: false },
    { id: ids.m1, kind: 'mitigation', applies: true, present: true, works: false }]);
  assert.match(row.month, /^\d{4}-\d{2}$/);
});

test('a double tap records one observation', async () => {
  await approved(); const body = { observation: { category: 'test_category', answers: answers() }, clientKey: 'k1' };
  assert.equal((await post(U.ann, body)).status, 201); const b = await post(U.ann, body); assert.equal(b.status, 200); assert.equal(b.json.duplicate, true);
  assert.equal(fake.state.tables.protection_observations.length, 1);
});

test('the summary is for safety only, contains only aggregates, and never names anyone', async () => {
  await approved();
  await post(U.ann, { observation: { category: 'test_category', answers: answers() } });
  await post(U.ann, { observation: { category: 'test_category', answers: answers({ m1: { present: false } }) } });
  assert.equal((await get(U.ann, 'summary')).status, 403);
  const s = await get(U.sam, 'summary'); assert.equal(s.status, 200);
  assert.equal(s.json.summary.observations, 2); assert.equal(s.json.summary.categories[0].mitigation, 50); assert.equal(s.json.summary.controlGaps[0].id, ids.m1);
  const raw = JSON.stringify(s.json); assert.ok(!/ann@example|created_by|"sam"|"ann"/.test(raw));
});
