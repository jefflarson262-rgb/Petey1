// Tests for api/audits.js: safety builds templates, anyone approved runs an audit, a Fail needs a comment, photos are kept only on request.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.PRETASKIQ_SIGN_IN = 'on';
import { startFakeSupabase, makeJwt } from './helpers/fakeSupabase.mjs';
import api from '../api/audits.js';

let fake, U;
const fakeRes = () => { const r = { statusCode: 200, headers: {}, body: '' }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.end = (b = '') => { r.body = b; }; r.writeHead = (c, h) => { r.statusCode = c; Object.assign(r.headers, h || {}); }; return r; };
const call = async (req) => { const res = fakeRes(); await api({ headers: {}, ...req }, res); return { status: res.statusCode, json: res.body && res.body[0] === '{' ? JSON.parse(res.body) : null }; };
const as = (u) => ({ authorization: 'Bearer ' + makeJwt(u.id, u.email) });
const get = (u, query) => call({ method: 'GET', url: '/api/audits?' + new URLSearchParams(query), query, headers: as(u) });
const post = (u, body) => call({ method: 'POST', url: '/api/audits', headers: as(u), body });
const jpg = 'data:image/jpeg;base64,' + 'A'.repeat(200);
const template = { title: 'Test audit', description: 'for tests', items: [{ text: 'Item one' }, { text: 'Item two' }, { text: 'Item three' }] };
let tpl;
const answers = (over = {}) => tpl.items.map((it, i) => ({ id: it.id, result: 'pass', ...(over[i] || {}) }));
const makeTemplate = async () => { const r = await post(U.sam, { template }); tpl = r.json.template; return tpl; };

before(async () => {
  fake = await startFakeSupabase();
  U = { sam: fake.addUser('sam@example.com', 'pw'), ann: fake.addUser('ann@example.com', 'pw', { role: 'foreman', approved: true }), bob: fake.addUser('bob@example.com', 'pw', { role: 'foreman', approved: true }), wait: fake.addUser('wait@example.com', 'pw', { role: 'foreman', approved: false }) };
});
after(() => fake.close());
beforeEach(() => {
  process.env.SUPABASE_URL = fake.url; process.env.SUPABASE_PUBLISHABLE_KEY = fake.publishableKey; process.env.SUPABASE_SECRET_KEY = fake.secretKey;
  fake.state.tables.audit_templates.length = 0; fake.state.tables.audits.length = 0;
});

test('only safety builds, edits or retires templates; everyone approved can read them', async () => {
  assert.equal((await post(U.ann, { template })).status, 403);
  const t = await makeTemplate(); assert.equal(t.items.length, 3);
  assert.equal((await get(U.ann, { what: 'templates' })).json.templates.length, 1);
  assert.equal((await get(U.wait, { what: 'templates' })).status, 403);
  const edited = await post(U.sam, { template: { id: t.id, title: 'Renamed', items: [{ text: 'Only item' }] } });
  assert.equal(edited.status, 200); assert.equal(edited.json.template.title, 'Renamed'); assert.equal(edited.json.template.items.length, 1);
  assert.equal((await post(U.ann, { id: t.id, action: 'archive' })).status, 403);
  assert.equal((await post(U.sam, { id: t.id, action: 'archive' })).status, 200);
  assert.equal((await get(U.ann, { what: 'templates' })).json.templates.length, 0);
});

test('an invalid template is refused', async () => {
  assert.equal((await post(U.sam, { template: { title: '', items: [{ text: 'x' }] } })).status, 400);
  assert.equal((await post(U.sam, { template: { title: 'T', items: [] } })).status, 400);
  assert.equal((await post(U.sam, { template: { id: '00000000-0000-4000-8000-000000000000', title: 'T', items: [{ text: 'x' }] } })).status, 404);
});

test('an audit must answer every item, and every Fail needs a comment', async () => {
  await makeTemplate();
  const send = (a) => post(U.ann, { audit: { templateId: tpl.id, location: 'Building 2', answers: a } });
  const missing = await send(answers().slice(1)); assert.equal(missing.status, 400); assert.equal(missing.json.error, 'incomplete_audit'); assert.match(missing.json.missing[0], /no answer/);
  const noComment = await send(answers({ 1: { result: 'fail', comment: '' } })); assert.equal(noComment.status, 400); assert.match(noComment.json.missing[0], /needs a comment/);
  assert.equal(fake.state.tables.audits.length, 0);
  const ok = await send(answers({ 1: { result: 'fail', comment: 'Guard missing', photos: [jpg] }, 2: { result: 'na' } }));
  assert.equal(ok.status, 201); assert.equal(ok.json.audit.fail_count, 1); assert.equal(ok.json.audit.pass_count, 1); assert.equal(ok.json.audit.na_count, 1); assert.equal(Number(ok.json.audit.score), 50);
  assert.ok(!('answers' in ok.json.audit), 'the list view carries no photos or answers');
});

test('unapproved people cannot submit; a retired or unknown template is refused', async () => {
  await makeTemplate();
  assert.equal((await post(U.wait, { audit: { templateId: tpl.id, answers: answers() } })).status, 403);
  assert.equal((await post(U.ann, { audit: { templateId: '00000000-0000-4000-8000-000000000000', answers: answers() } })).status, 404);
  await post(U.sam, { id: tpl.id, action: 'archive' });
  assert.equal((await post(U.ann, { audit: { templateId: tpl.id, answers: answers() } })).status, 404);
});

test('photos are kept only if they are small JPEGs, and come back only when one audit is opened', async () => {
  await makeTemplate();
  const r = await post(U.ann, { audit: { templateId: tpl.id, answers: answers({ 0: { photos: [jpg, 'http://x/y.jpg', 'data:image/png;base64,AAA'] } }) } });
  const row = fake.state.tables.audits[0]; assert.equal(row.answers[0].photos.length, 1);
  const list = await get(U.sam, { what: 'audits' }); assert.ok(!JSON.stringify(list.json).includes('base64'));
  const one = await get(U.sam, { id: r.json.audit.id }); assert.equal(one.json.audit.answers[0].photos.length, 1);
});

test('a foreman sees only their own audits; safety sees all; a double tap makes one audit', async () => {
  await makeTemplate();
  await post(U.ann, { audit: { templateId: tpl.id, answers: answers() }, clientKey: 'k1' });
  const dupe = await post(U.ann, { audit: { templateId: tpl.id, answers: answers() }, clientKey: 'k1' }); assert.equal(dupe.status, 200); assert.equal(dupe.json.duplicate, true);
  const bobs = await post(U.bob, { audit: { templateId: tpl.id, answers: answers() } });
  assert.equal(fake.state.tables.audits.length, 2);
  assert.equal((await get(U.ann, { what: 'audits' })).json.audits.length, 1); assert.equal((await get(U.sam, { what: 'audits' })).json.audits.length, 2);
  assert.equal((await get(U.ann, { id: bobs.json.audit.id })).status, 404); assert.equal((await get(U.sam, { id: bobs.json.audit.id })).status, 200);
});
