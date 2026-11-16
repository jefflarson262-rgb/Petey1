// Reenactments saved on incident entries (api/kb.js): who may publish one, and that nothing unchecked is stored. Plus the draft prompt/parser.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.PRETASKIQ_SIGN_IN = 'on';
import { startFakeSupabase, makeJwt } from './helpers/fakeSupabase.mjs';
import kbApi from '../api/kb.js';
import { sourceFor, parseDraft, buildUserPrompt, MIN_SOURCE_CHARS } from '../src/reenact/draft.js';

let fake, U;
const fakeRes = () => { const r = { statusCode: 200, headers: {}, body: '' }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.end = (b = '') => { r.body = b; }; return r; };
const call = async (req) => { const res = fakeRes(); await kbApi({ headers: {}, ...req }, res); return { status: res.statusCode, json: res.body && res.body[0] === '{' ? JSON.parse(res.body) : res.body }; };
const as = (u) => ({ authorization: 'Bearer ' + makeJwt(u.id, u.email) });
const post = (u, body) => call({ method: 'POST', url: '/api/kb', headers: as(u), body });
const sb = () => ({
  title: 'Fragment strike', kind: 'Incident', setting: 'indoor',
  actors: [{ id: 'p1', label: 'Worker on ladder', x: 60, level: 'elevated' }, { id: 'p2', label: 'Worker below', x: 40 }],
  objects: [{ id: 'o1', type: 'tool', x: 60 }],
  beats: [{ phase: 'happened', caption: ['A worker drills overhead.', ''] }, { phase: 'happened', caption: ['A fragment hits the worker below.', ''], event: 'strike', from: 'o1', to: 'p2' }, { phase: 'controls', caption: ['Same task with a barricade.', ''] }],
  controls: [{ short: 'Barricade below', full: 'Barricade the area below.' }], unknowns: [],
});
const incident = (extra = {}) => ({ kbType: 'incident', title: 'INC-301', data: { id: 1, kbType: 'incident', title: 'INC-301', status: 'ready', summary: 'x', ...extra } });
const approved = (over = {}) => ({ status: 'approved', storyboard: sb(), approvedBy: 'Hacker', approvedAt: '2000-01-01T00:00:00Z', ...over });

before(async () => {
  fake = await startFakeSupabase();
  U = { sam: fake.addUser('sam@example.com', 'pw'), carl: fake.addUser('carl@example.com', 'pw', { role: 'construction', approved: true }), ann: fake.addUser('ann@example.com', 'pw', { role: 'foreman', approved: true }) };
});
after(() => fake.close());
beforeEach(() => { process.env.SUPABASE_URL = fake.url; process.env.SUPABASE_PUBLISHABLE_KEY = fake.publishableKey; process.env.SUPABASE_SECRET_KEY = fake.secretKey; fake.state.tables.kb_entries.length = 0; });

test('a safety administrator can attach an approved reenactment; the server stamps who approved it and when', async () => {
  const r = await post(U.sam, { entry: incident({ reenactment: approved() }) });
  assert.equal(r.status, 201);
  const re = r.json.entry.data.reenactment;
  assert.equal(re.status, 'approved'); assert.equal(re.approvedBy, 'sam'); assert.notEqual(re.approvedAt, '2000-01-01T00:00:00Z'); assert.equal(re.storyboard.beats.length, 3);
});

test('re-saving the same approval does not change who approved it', async () => {
  const id = (await post(U.sam, { entry: incident({ reenactment: approved() }) })).json.entry.id;
  const first = fake.state.tables.kb_entries[0].data.reenactment;
  const r = await post(U.sam, { id, entry: { title: 'INC-301 renamed', data: { status: 'ready', reenactment: first } } });
  assert.equal(r.status, 200); assert.deepEqual(r.json.entry.data.reenactment, first);
});

test('nobody else can attach one, and it only goes on incidents', async () => {
  assert.equal((await post(U.carl, { entry: { kbType: 'drawings', title: 'D', data: { status: 'ready', reenactment: approved() } } })).status, 403);
  assert.equal((await post(U.ann, { entry: incident({ reenactment: approved() }) })).status, 403);
  assert.equal((await post(U.sam, { entry: { kbType: 'policy', title: 'P', data: { status: 'ready', reenactment: approved() } } })).status, 403);
  assert.equal(fake.state.tables.kb_entries.length, 0);
});

test('a reenactment that is not approved, or whose drawing is not valid, is refused', async () => {
  assert.equal((await post(U.sam, { entry: incident({ reenactment: approved({ status: 'draft' }) }) })).status, 400);
  assert.equal((await post(U.sam, { entry: incident({ reenactment: approved({ storyboard: { actors: [] } }) }) })).status, 400);
  assert.equal((await post(U.sam, { entry: incident({ reenactment: 'yes' }) })).status, 400);
  assert.equal(fake.state.tables.kb_entries.length, 0);
});

test('what is stored is the cleaned storyboard, never the raw one', async () => {
  const dirty = sb(); dirty.title = '<img src=x onerror=alert(1)>'; dirty.beats[0].caption[0] = 'A <b>worker</b> & "drills"'; dirty.objects.push({ id: 'o9', type: 'script', x: 5 });
  const r = await post(U.sam, { entry: incident({ reenactment: approved({ storyboard: dirty }) }) });
  const out = r.json.entry.data.reenactment.storyboard;
  assert.ok(![out.title, ...out.beats[0].caption].some((t) => /[<>&"]/.test(t))); assert.equal(out.objects.length, 1);
});

test('taking a reenactment down (saving without it) works for a safety administrator', async () => {
  const id = (await post(U.sam, { entry: incident({ reenactment: approved() }) })).json.entry.id;
  const r = await post(U.sam, { id, entry: { data: { status: 'ready', summary: 'x' } } });
  assert.equal(r.status, 200); assert.equal(r.json.entry.data.reenactment, undefined);
});

test('the draft prompt uses only the record, and a thin record is flagged before any AI call', () => {
  assert.ok(sourceFor({ summary: 'Short.' }).thin);
  const long = 'A worker on a ladder was removing overhead bolts when a fragment was ejected and struck a second worker below in the face. '.repeat(2);
  assert.ok(!sourceFor({ sourceText: long }).thin && long.length >= MIN_SOURCE_CHARS);
  assert.equal(sourceFor({ summary: long, change_description: long }).text.split('A worker').length - 1, 2);     // identical text is not repeated
  assert.ok(buildUserPrompt({ title: 'INC-1', sourceText: long }).includes('ejected'));
});

test('the AI reply is read as a storyboard, as "not enough to draw", or as an error, and never half-trusted', () => {
  assert.ok(parseDraft('```json\n' + JSON.stringify(sb()) + '\n```').ok);
  assert.equal(parseDraft('{"insufficient":true,"reason":"No sequence is described."}').insufficient, true);
  assert.ok(parseDraft('not json at all').error);
  assert.equal(parseDraft(JSON.stringify({ actors: [{ id: 'p1' }], beats: [{ caption: ['x'] }] })).insufficient, true);     // too few steps to draw
});
