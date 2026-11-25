// Tests for the safety metrics: the arithmetic, who may see them, that companies stay apart, and that a rate is never shown without hours.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.PRETASKIQ_SIGN_IN = 'on';
import { startFakeSupabase, makeJwt } from './helpers/fakeSupabase.mjs';
import accountApi from '../api/account.js';
import { rate, pct, median, monthOf, monthsBack, toCsv, COLUMNS } from '../src/shared/metrics.js';

let fake, U, A, B, T;
const fakeRes = () => { const r = { statusCode: 200, headers: {}, body: '' }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.end = (b = '') => { r.body = b; }; r.writeHead = (c, h) => { r.statusCode = c; Object.assign(r.headers, h || {}); }; return r; };
const call = async (req) => { const res = fakeRes(); await accountApi({ headers: {}, ...req }, res); return { status: res.statusCode, json: res.body && res.body[0] === '{' ? JSON.parse(res.body) : null }; };
const as = (u) => ({ authorization: 'Bearer ' + makeJwt(u.id, u.email) });
const get = (u, query = {}) => call({ method: 'GET', url: '/api/metrics', query: { area: 'metrics', ...query }, headers: as(u) });
const post = (u, body) => call({ method: 'POST', url: '/api/metrics', query: { area: 'metrics' }, headers: as(u), body });
const now = new Date(); const thisMonth = now.toISOString().slice(0, 7); const [lastMonth] = monthsBack(thisMonth, 2);
const at = (month, day = 10) => `${month}-${String(day).padStart(2, '0')}T15:00:00.000Z`;
const add = (table, row) => { const r = { id: crypto.randomUUID(), ...row }; fake.state.tables[table].push(r); return r; };

before(async () => {
  fake = await startFakeSupabase();
  const owner = fake.addUser('owner@example.com', 'pw');
  A = fake.state.tables.companies[0];
  B = { id: crypto.randomUUID(), name: 'Bravo', tier: 'full', seat_limit: null, status: 'active', created_at: now.toISOString() };
  const C = { id: crypto.randomUUID(), name: 'Cedar', tier: 'basic', seat_limit: null, status: 'active', created_at: now.toISOString() };
  fake.state.tables.companies.push(B, C);
  U = { safety: owner, cons: fake.addUser('c@a.com', 'pw', { role: 'construction', approved: true, company: A }), foreman: fake.addUser('f@a.com', 'pw', { role: 'foreman', approved: true, company: A }),
    bSafety: fake.addUser('s@b.com', 'pw', { role: 'safety', approved: true, company: B }), cSafety: fake.addUser('s@c.com', 'pw', { role: 'safety', approved: true, company: C }) };
  T = { job: add('jobs', { company_id: A.id, name: 'Tower', status: 'active', archived_at: null }), bJob: add('jobs', { company_id: B.id, name: 'Bravo job', status: 'active', archived_at: null }) };
  const sig = { d: 'M 1 1', revision: 1 };
  const plan = (month, data, company = A) => add('plans', { company_id: company.id, created_by: owner.id, created_at: at(month), updated_at: at(month), data: { revision: 1, taskSteps: [], ...data } });
  plan(thisMonth, { jobId: T.job.id, submitted: { at: at(thisMonth), revision: 1 }, crew: [{ signature: sig }, { signature: sig }] });
  plan(thisMonth, { crew: [{ signature: sig }, { signature: null }] });
  plan(lastMonth, { jobId: T.job.id, crew: [] });
  plan(thisMonth, { submitted: { at: at(thisMonth) } }, B);                                    // another company's plan
  add('audits', { company_id: A.id, created_at: at(thisMonth), score: 90 }); add('audits', { company_id: A.id, created_at: at(thisMonth), score: 70 });
  add('protection_observations', { company_id: A.id, created_at: at(thisMonth), controls: [{ id: 1, kind: 'prevention', applies: true, present: true, works: true }, { id: 2, kind: 'prevention', applies: true, present: false }, { id: 3, kind: 'mitigation', applies: false }] });
  T.inj1 = add('incident_reports', { company_id: A.id, kind: 'injury', title: 'Cut hand', created_at: at(thisMonth), osha_class: null, job_id: null });
  T.inj2 = add('incident_reports', { company_id: A.id, kind: 'injury', title: 'Twisted ankle', created_at: at(thisMonth, 12), osha_class: null, job_id: null });
  T.nm = add('incident_reports', { company_id: A.id, kind: 'near_miss', title: 'Dropped wrench', created_at: at(thisMonth), osha_class: null, job_id: null });
  T.bInj = add('incident_reports', { company_id: B.id, kind: 'injury', title: 'Bravo injury', created_at: at(thisMonth), osha_class: 'dart', job_id: null });
  add('alerts', { company_id: A.id, created_at: at(thisMonth), acknowledged_at: new Date(new Date(at(thisMonth)).getTime() + 2 * 3600000).toISOString() });
  add('alerts', { company_id: A.id, created_at: at(thisMonth), acknowledged_at: null });
});
after(() => fake.close());
beforeEach(() => { process.env.SUPABASE_URL = fake.url; process.env.SUPABASE_PUBLISHABLE_KEY = fake.publishableKey; process.env.SUPABASE_SECRET_KEY = fake.secretKey; process.env.ANTHROPIC_API_KEY = 'x'; });

test('the arithmetic: OSHA rate, percentages, median, months', () => {
  assert.equal(rate(3, 450000), 1.33);                  // 3 x 200,000 / 450,000
  assert.equal(rate(0, 100000), 0);
  assert.equal(rate(2, 0), null); assert.equal(rate(2, null), null);        // no hours: not available, never zero
  assert.equal(pct(1, 3), 33.3); assert.equal(pct(0, 0), null);
  assert.equal(median([4, 1, 3]), 3); assert.equal(median([1, 2]), 1.5); assert.equal(median([]), null);
  assert.equal(monthOf('2026-12-01T03:00:00Z', -360), '2026-11');           // late evening on Nov 30 in Chicago
  assert.deepEqual(monthsBack('2026-02', 4), ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('only a safety administrator of a licensed company can open the metrics', async () => {
  assert.equal((await get(U.safety)).status, 200);
  assert.equal((await get(U.cons)).status, 403); assert.equal((await get(U.foreman)).status, 403);
  assert.equal((await get(U.cSafety)).json.error, 'feature_not_licensed');
  assert.equal((await post(U.foreman, { action: 'set_hours', month: thisMonth, hours: 5 })).status, 403);
});

test('leading indicators are counted from what the app recorded, this company only', async () => {
  const r = (await get(U.safety, { months: 2 })).json;
  assert.deepEqual(r.months.map((m) => m.month), [lastMonth, thisMonth]);
  const m = r.months[1];
  assert.equal(m.plans, 2); assert.equal(m.submitted, 1); assert.equal(m.submitRate, 50); assert.equal(m.signRate, 75);       // 3 of 4 signed
  assert.equal(m.audits, 2); assert.equal(m.auditScore, 80);
  assert.equal(m.observations, 1); assert.equal(m.protection, 50);                                                            // 1 of 2 required controls in place
  assert.equal(m.nearMisses, 1); assert.equal(m.injuries, 2); assert.equal(m.unclassified, 2);
  assert.equal(m.alerts, 2); assert.equal(m.alertHours, 2);
  assert.equal(r.months[0].plans, 1); assert.equal(r.months[0].signRate, null);                                               // no crew listed: not available
  assert.equal(r.total.plans, 3);
  assert.equal(m.hours, null); assert.equal(m.trir, null); assert.equal(m.dart, null);                                        // no hours yet: no rate
  assert.deepEqual(r.injuries.map((i) => i.title), ['Twisted ankle', 'Cut hand']);
  const tower = r.byJob.find((j) => j.name === 'Tower');
  assert.equal(tower.plans, 2); assert.equal(tower.audits, null);                                                             // audits are not tied to a job: left empty
  assert.equal((await get(U.bSafety, { months: 1 })).json.months[0].plans, 1);
});

test('hours and injury classifications give TRIR and DART, and are checked', async () => {
  assert.equal((await post(U.safety, { action: 'set_hours', month: 'nope', hours: 5 })).json.error, 'invalid_month');
  assert.equal((await post(U.safety, { action: 'set_hours', month: thisMonth, hours: -1 })).json.error, 'invalid_hours');
  assert.equal((await post(U.safety, { action: 'set_hours', month: thisMonth, jobId: T.bJob.id, hours: 5 })).json.error, 'job_not_found');   // another company's job
  assert.equal((await post(U.safety, { action: 'set_hours', month: thisMonth, jobId: T.job.id, hours: 40000 })).status, 200);
  assert.equal((await post(U.safety, { action: 'classify', incidentId: T.nm.id, oshaClass: 'recordable' })).json.error, 'not_an_injury');
  assert.equal((await post(U.safety, { action: 'classify', incidentId: T.bInj.id, oshaClass: 'recordable' })).status, 404);                    // another company's incident
  assert.equal((await post(U.safety, { action: 'classify', incidentId: T.inj1.id, oshaClass: 'bogus' })).json.error, 'invalid_class');
  assert.equal((await post(U.safety, { action: 'classify', incidentId: T.inj1.id, oshaClass: 'dart', jobId: T.job.id })).status, 200);
  assert.equal((await post(U.safety, { action: 'classify', incidentId: T.inj2.id, oshaClass: 'recordable' })).status, 200);
  let r = (await get(U.safety, { months: 1 })).json; let m = r.months[0];
  assert.equal(m.hours, 40000);                                  // no company-wide entry, so the month is the sum of its job entries
  assert.equal(m.recordables, 2); assert.equal(m.dartCases, 1); assert.equal(m.trir, 10); assert.equal(m.dart, 5); assert.equal(m.unclassified, 0);
  const tower = r.byJob.find((j) => j.name === 'Tower');
  assert.equal(tower.hours, 40000); assert.equal(tower.recordables, 1); assert.equal(tower.trir, 5);
  // a company-wide entry for the month takes over from the job sum; saving again replaces, it does not add
  await post(U.safety, { action: 'set_hours', month: thisMonth, hours: 100000 }); await post(U.safety, { action: 'set_hours', month: thisMonth, hours: 200000 });
  r = (await get(U.safety, { months: 1 })).json; m = r.months[0];
  assert.equal(m.hours, 200000); assert.equal(m.trir, 2); assert.equal(m.dart, 1);
  assert.equal(fake.state.tables.safety_hours.filter((h) => h.company_id === A.id).length, 2);
  // not recordable drops out; clearing the hours makes the rate unavailable again
  await post(U.safety, { action: 'classify', incidentId: T.inj2.id, oshaClass: 'not_recordable' });
  await post(U.safety, { action: 'set_hours', month: thisMonth, hours: null }); await post(U.safety, { action: 'set_hours', month: thisMonth, jobId: T.job.id, hours: '' });
  m = (await get(U.safety, { months: 1 })).json.months[0];
  assert.equal(m.recordables, 1); assert.equal(m.hours, null); assert.equal(m.trir, null);
  assert.equal((await get(U.bSafety, { months: 1 })).json.months[0].dartCases, 1);            // Bravo's own numbers are untouched
});

test('the spreadsheet has one row per month and per job, with empty cells for what is not available', async () => {
  const r = (await get(U.safety, { months: 2 })).json;
  const csv = toCsv(r); const rows = csv.trim().split('\r\n');
  const head = rows.findIndex((l) => l.startsWith('Period,'));
  assert.equal(rows[head].split(',').length, COLUMNS.length + 1);
  assert.equal(rows[head + 1].split(',').length, COLUMNS.length + 1); assert.ok(rows[head + 3].startsWith('Total (2 months),3,'));
  assert.ok(csv.includes('Job (same period)') && /\r\nTower,2,1,50,/.test(csv));
  assert.ok(/,,\r\n/.test(csv), 'TRIR and DART are empty when there are no hours');
  assert.equal(toCsv({ months: [], total: null, byJob: [{ name: 'A "big", job', ...Object.fromEntries(COLUMNS.map((c) => [c.key, 1])) }] }).includes('"A ""big"", job"'), true);
});
