// Tests for the saved knowledge base (api/kb.js): who can add, change, remove and read entries. Runs against the Supabase stand-in.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.PRETASKIQ_SIGN_IN = 'on';
import { startFakeSupabase, makeJwt } from './helpers/fakeSupabase.mjs';
import kbApi from '../api/kb.js';

let fake, U;
const fakeRes = () => { const r = { statusCode: 200, headers: {}, body: '' }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.end = (b = '') => { r.body = b; }; return r; };
const call = async (req) => { const res = fakeRes(); await kbApi({ headers: {}, ...req }, res); return { status: res.statusCode, json: res.body && res.body[0] === '{' ? JSON.parse(res.body) : res.body, raw: res.body }; };
const as = (u) => ({ authorization: 'Bearer ' + makeJwt(u.id, u.email) });
const list = (u) => call({ method: 'GET', url: '/api/kb', headers: as(u) });
const post = (u, body) => call({ method: 'POST', url: '/api/kb', headers: as(u), body });
const entry = (kbType, extra = {}) => ({ kbType, title: 'INC-301', data: { id: 1, kbType, title: 'INC-301', status: 'ready', summary: 'Lockout missed', keywords: ['loto'], ...extra } });

before(async () => {
  fake = await startFakeSupabase();
  U = {
    sam: fake.addUser('sam@example.com', 'pw'),                                              // first user = safety administrator
    sue: fake.addUser('sue@example.com', 'pw', { role: 'safety', approved: true }),
    carl: fake.addUser('carl@example.com', 'pw', { role: 'construction', approved: true }),
    ann: fake.addUser('ann@example.com', 'pw', { role: 'foreman', approved: true }),
    wait: fake.addUser('wait@example.com', 'pw', { role: 'foreman', approved: false }),
  };
});
after(() => fake.close());
beforeEach(() => {
  process.env.SUPABASE_URL = fake.url; process.env.SUPABASE_PUBLISHABLE_KEY = fake.publishableKey; process.env.SUPABASE_SECRET_KEY = fake.secretKey;
  fake.state.tables.kb_entries.length = 0; fake.state.failTable = null;
});

test('a safety administrator adds every kind of entry, and everyone signed in can read them', async () => {
  for (const t of ['incident', 'rca', 'policy', 'procedure', 'drawings']) assert.equal((await post(U.sam, { entry: entry(t) })).status, 201, t);
  for (const who of [U.sam, U.sue, U.carl, U.ann]) { const r = await list(who); assert.equal(r.status, 200); assert.equal(r.json.entries.length, 5); }
  const r = await post(U.sam, { entry: entry('incident', { keywords: ['crane'] }) });
  assert.equal(r.json.entry.created_by_name, 'sam'); assert.equal(r.json.entry.data.keywords[0], 'crane'); assert.equal(r.json.entry.kb_type, 'incident');
});

test('a construction administrator may add drawings only; a foreman may add nothing', async () => {
  assert.equal((await post(U.carl, { entry: entry('drawings') })).status, 201);
  for (const t of ['incident', 'rca', 'policy', 'procedure']) assert.equal((await post(U.carl, { entry: entry(t) })).status, 403, t);
  for (const t of ['incident', 'drawings']) assert.equal((await post(U.ann, { entry: entry(t) })).status, 403, 'foreman ' + t);
  assert.equal(fake.state.tables.kb_entries.length, 1);
});

test('the same entry sent twice (a retry) is saved once; a different person with the same key is separate', async () => {
  const a = await post(U.sam, { entry: entry('incident'), clientKey: '1731700000000' });
  const b = await post(U.sam, { entry: entry('incident'), clientKey: '1731700000000' });
  assert.equal(a.status, 201); assert.equal(b.status, 200); assert.equal(b.json.duplicate, true); assert.equal(b.json.entry.id, a.json.entry.id);
  assert.equal((await post(U.sue, { entry: entry('incident'), clientKey: '1731700000000' })).status, 201);
  assert.equal(fake.state.tables.kb_entries.length, 2);
});

test('an entry can be changed by someone allowed to write that kind, and not by anyone else', async () => {
  const id = (await post(U.sam, { entry: entry('incident') })).json.entry.id;
  const ok = await post(U.sue, { id, entry: { title: 'INC-301 (updated)', data: { status: 'ready', summary: 'Changed', reenactment: { scene: 'panel' } } } });
  assert.equal(ok.status, 200); assert.equal(ok.json.entry.title, 'INC-301 (updated)'); assert.equal(ok.json.entry.data.reenactment.scene, 'panel');
  assert.equal((await post(U.carl, { id, entry: { data: { status: 'ready' } } })).status, 403);
  assert.equal((await post(U.ann, { id, entry: { data: { status: 'ready' } } })).status, 403);
  assert.equal(fake.state.tables.kb_entries[0].data.summary, 'Changed');
});

test('removing hides the entry from everyone but keeps it in the database; only people who may write that kind can remove', async () => {
  const inc = (await post(U.sam, { entry: entry('incident') })).json.entry.id; const dr = (await post(U.carl, { entry: entry('drawings') })).json.entry.id;
  assert.equal((await post(U.carl, { id: inc, action: 'archive' })).status, 403);
  assert.equal((await post(U.ann, { id: dr, action: 'archive' })).status, 403);
  assert.equal((await post(U.sam, { id: inc, action: 'archive' })).status, 200);
  assert.equal((await post(U.carl, { id: dr, action: 'archive' })).status, 200);
  assert.equal((await list(U.ann)).json.entries.length, 0);
  assert.equal(fake.state.tables.kb_entries.length, 2);                                       // still there
  assert.ok(fake.state.tables.kb_entries.every((r) => r.archived_at && r.archived_by));
  assert.equal((await post(U.sam, { id: inc, action: 'archive' })).status, 404);               // already removed
  assert.equal((await post(U.sam, { id: inc, entry: { data: { status: 'ready' } } })).status, 404);
});

test('bad input is refused', async () => {
  for (const body of [{}, { entry: null }, { entry: { kbType: 'bogus', data: { status: 'ready' } } }, { entry: { kbType: 'incident' } }, { entry: { kbType: 'incident', data: [] } }, { entry: { kbType: 'incident', data: 'x' } }, null, []])
    assert.equal((await post(U.sam, body)).status, 400, JSON.stringify(body));
  assert.equal((await post(U.sam, { entry: entry('incident', { status: 'processing' }) })).status, 400);       // not finished yet
  const big = await post(U.sam, { entry: entry('incident', { raw: 'x'.repeat(160000) }) });
  assert.equal(big.status, 413);
  assert.equal((await post(U.sam, { id: 'nope', action: 'archive' })).status, 404);
  assert.equal((await post(U.sam, { id: '11111111-1111-4111-8111-111111111111', action: 'archive' })).status, 404);
  assert.equal(fake.state.tables.kb_entries.length, 0);
  const t = await post(U.sam, { entry: { kbType: 'incident', title: 'T'.repeat(500), data: { status: 'ready' } } }); assert.equal(t.json.entry.title.length, 200);
});

test('signed out, not approved, wrong method', async () => {
  assert.equal((await call({ method: 'GET', url: '/api/kb' })).status, 401);
  assert.equal((await list(U.wait)).status, 403);
  assert.equal((await post(U.wait, { entry: entry('incident') })).status, 403);
  assert.equal((await call({ method: 'DELETE', url: '/api/kb', headers: as(U.sam) })).status, 405);
});

test('the list says what the caller may add, so the screen can hide buttons that would be refused', async () => {
  assert.deepEqual((await list(U.sam)).json.canWrite.sort(), ['drawings', 'incident', 'policy', 'procedure', 'rca']);
  assert.deepEqual((await list(U.carl)).json.canWrite, ['drawings']);
  assert.deepEqual((await list(U.ann)).json.canWrite, []);
});

test('a missing table is a database problem, and without sign-in the knowledge base is not available here', async () => {
  fake.state.failTable = 'kb_entries';
  const r = await list(U.sam); assert.equal(r.status, 503); assert.equal(r.json.hint, 'tables_missing');
  fake.state.failTable = null; process.env.PRETASKIQ_SIGN_IN = 'off';
  try { assert.equal((await list(U.sam)).json.error, 'supabase_not_configured'); } finally { process.env.PRETASKIQ_SIGN_IN = 'on'; }
});

test('replies never contain the secret key', async () => {
  const r = await post(U.sam, { entry: entry('incident') }); assert.ok(!r.raw.includes(fake.secretKey)); assert.ok(!(await list(U.sam)).raw.includes(fake.secretKey));
});
