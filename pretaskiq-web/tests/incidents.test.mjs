// Tests for incident reports (api/incidents.js): a foreman files a preliminary report, safety must complete the in-depth one.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.PRETASKIQ_SIGN_IN = 'on';
import { startFakeSupabase, makeJwt } from './helpers/fakeSupabase.mjs';
import api from '../api/incidents.js';
import { sanitizeFull, EVIDENCE_ITEMS, NOTIFY_ITEMS, DUE_HOURS } from '../src/shared/incidentFull.js';

let fake, U;
const fakeRes = () => { const r = { statusCode: 200, headers: {}, body: '' }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.end = (b = '') => { r.body = b; }; r.writeHead = (c, h) => { r.statusCode = c; Object.assign(r.headers, h || {}); }; return r; };
const call = async (req) => { const res = fakeRes(); await api({ headers: {}, ...req }, res); return { status: res.statusCode, json: res.body && res.body[0] === '{' ? JSON.parse(res.body) : null }; };
const as = (u) => ({ authorization: 'Bearer ' + makeJwt(u.id, u.email) });
const list = (u) => call({ method: 'GET', url: '/api/incidents', headers: as(u) });
const file = (u, report, extra = {}) => call({ method: 'POST', url: '/api/incidents', headers: as(u), body: { report, ...extra } });
const act = (u, id, action, full) => call({ method: 'POST', url: '/api/incidents', headers: as(u), body: { id, action, full } });

const prelim = { kind: 'near_miss', title: 'Ladder slipped', data: { when: 'Today 10:15', location: 'Building 2', work: 'Conduit install', narrative: 'The ladder base slid. No one was hurt.', people: ['electrician'], injury: '', damage: '', actions: ['Work stopped'], conditions: ['Dusty floor'], unknowns: [] } };
const goodFull = () => ({
  timeline: [{ when: '10:15', what: 'Ladder base slid' }],
  evidence: EVIDENCE_ITEMS.map((e) => ({ id: e.id, status: 'collected', note: '' })),
  witnesses: [{ role: 'spotter', status: 'to_interview' }], factors: { equipment: 'Ladder feet worn' },
  interim: ['Ladder tagged out'], areaSecured: 'yes', notify: NOTIFY_ITEMS.map((n) => ({ id: n.id, status: 'not_needed' })),
});

before(async () => {
  fake = await startFakeSupabase();
  U = {
    sam: fake.addUser('sam@example.com', 'pw'),
    ann: fake.addUser('ann@example.com', 'pw', { role: 'foreman', approved: true }),
    bob: fake.addUser('bob@example.com', 'pw', { role: 'foreman', approved: true }),
    wait: fake.addUser('wait@example.com', 'pw', { role: 'foreman', approved: false }),
  };
});
after(() => fake.close());
beforeEach(() => {
  process.env.SUPABASE_URL = fake.url; process.env.SUPABASE_PUBLISHABLE_KEY = fake.publishableKey; process.env.SUPABASE_SECRET_KEY = fake.secretKey;
  fake.state.tables.incident_reports.length = 0; fake.state.tables.alerts.length = 0; fake.state.failTable = null;
});

test('a foreman files a preliminary report: saved, due in 24 hours, and the safety inbox is alerted', async () => {
  const r = await file(U.ann, prelim);
  assert.equal(r.status, 201); assert.equal(r.json.alerted, true);
  assert.equal(r.json.report.status, 'preliminary'); assert.equal(r.json.report.reported_by_name, 'ann'); assert.equal(r.json.report.reporter_role, 'foreman');
  const hours = (new Date(r.json.report.due_at) - Date.now()) / 36e5; assert.ok(hours > DUE_HOURS - 0.1 && hours <= DUE_HOURS);
  assert.equal(fake.state.tables.alerts.length, 1); assert.match(fake.state.tables.alerts[0].hazard, /^Near miss reported: Ladder slipped/);
});

test('someone who is not approved cannot file; a bad kind or a missing account is refused', async () => {
  assert.equal((await file(U.wait, prelim)).status, 403);
  assert.equal((await file(U.ann, { ...prelim, kind: 'bogus' })).status, 400);
  assert.equal((await file(U.ann, { ...prelim, data: { ...prelim.data, narrative: '' } })).status, 400);
  assert.equal((await file(U.ann, { ...prelim, title: '' })).status, 400);
  assert.equal(fake.state.tables.incident_reports.length, 0);
});

test('a report is saved even if the alert cannot be raised, and says so', async () => {
  fake.state.failTable = 'alerts';
  const r = await file(U.ann, prelim); assert.equal(r.status, 201); assert.equal(r.json.alerted, false); assert.equal(fake.state.tables.incident_reports.length, 1);
});

test('filing the same report twice (a double tap) makes one report and one alert', async () => {
  const a = await file(U.ann, prelim, { clientKey: 'k1' }); const b = await file(U.ann, prelim, { clientKey: 'k1' });
  assert.equal(a.status, 201); assert.equal(b.status, 200); assert.equal(b.json.duplicate, true);
  assert.equal(fake.state.tables.incident_reports.length, 1); assert.equal(fake.state.tables.alerts.length, 1);
});

test('only safety sees everyone\'s reports; a foreman sees only their own', async () => {
  await file(U.ann, prelim); await file(U.bob, { ...prelim, title: 'Bob\'s report' });
  assert.equal((await list(U.sam)).json.reports.length, 2); assert.equal((await list(U.sam)).json.scope, 'all');
  const mine = await list(U.ann); assert.equal(mine.json.reports.length, 1); assert.equal(mine.json.reports[0].title, 'Ladder slipped');
});

test('only a safety administrator can work on the in-depth report', async () => {
  const id = (await file(U.ann, prelim)).json.report.id;
  assert.equal((await act(U.ann, id, 'save_full', goodFull())).status, 403);
  assert.equal((await act(U.ann, id, 'complete', goodFull())).status, 403);
  assert.equal((await act(U.sam, '00000000-0000-4000-8000-000000000000', 'save_full', goodFull())).status, 404);
});

test('progress can be saved part-way, but the report cannot be completed until every part is filled in', async () => {
  const id = (await file(U.ann, prelim)).json.report.id;
  const saved = await act(U.sam, id, 'save_full', { timeline: [{ when: '10:15', what: 'Ladder base slid' }] });
  assert.equal(saved.status, 200); assert.equal(saved.json.report.status, 'preliminary'); assert.equal(saved.json.report.full_report.timeline.length, 1);
  const no = await act(U.sam, id, 'complete', { timeline: [{ what: 'x' }] });
  assert.equal(no.status, 400); assert.equal(no.json.error, 'incomplete_report'); assert.ok(no.json.missing.length >= 5);
  assert.equal(fake.state.tables.incident_reports[0].status, 'preliminary');
  const yes = await act(U.sam, id, 'complete', goodFull());
  assert.equal(yes.status, 200); assert.equal(yes.json.report.status, 'complete'); assert.equal(yes.json.report.completed_by_name, 'sam'); assert.ok(yes.json.report.completed_at);
});

test('sanitizeFull: pending items, nothing known and unknown ids are all handled', () => {
  const r = sanitizeFull({ evidence: [{ id: 'photos', status: 'collected' }, { id: 'nope', status: 'collected' }], witnessesNone: true, factorsNone: true, interimNone: 'Nothing to control', areaSecured: 'na' });
  assert.equal(r.full.evidence.length, EVIDENCE_ITEMS.length); assert.equal(r.full.evidence.find((e) => e.id === 'photos').status, 'collected');
  assert.ok(r.missing.some((m) => /timeline/i.test(m)) && r.missing.some((m) => /evidence/i.test(m)) && r.missing.some((m) => /notification/i.test(m)));
  assert.ok(!r.missing.some((m) => /witness|contributing|interim|secured/i.test(m)));
  assert.equal(sanitizeFull(null).ok, false);
});
