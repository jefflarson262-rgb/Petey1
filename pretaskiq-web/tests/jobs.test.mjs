// Tests for Job folders: who may read and change them, that companies stay apart, that file uploads are checked, and expiry flags.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.PRETASKIQ_SIGN_IN = 'on';
import { startFakeSupabase, makeJwt } from './helpers/fakeSupabase.mjs';
import accountApi from '../api/account.js';
import plansApi from '../api/plans.js';
import { expiryStatus, isDateString } from '../src/shared/jobs.js';

let fake, U, A, B, C;
const fakeRes = () => { const r = { statusCode: 200, headers: {}, body: '' }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.end = (b = '') => { r.body = b; }; r.writeHead = (c, h) => { r.statusCode = c; Object.assign(r.headers, h || {}); }; return r; };
const call = async (req) => { const res = fakeRes(); await accountApi({ headers: {}, ...req }, res); return { status: res.statusCode, json: res.body && res.body[0] === '{' ? JSON.parse(res.body) : null }; };
const as = (u) => ({ authorization: 'Bearer ' + makeJwt(u.id, u.email) });
const get = (u, query = {}) => call({ method: 'GET', url: '/api/jobs', query: { area: 'jobs', ...query }, headers: as(u) });
const post = (u, body, query = {}) => call({ method: 'POST', url: '/api/jobs', query: { area: 'jobs', ...query }, headers: as(u), body });
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

before(async () => {
  fake = await startFakeSupabase();
  const owner = fake.addUser('owner@example.com', 'pw');
  A = fake.state.tables.companies[0];
  B = { id: crypto.randomUUID(), name: 'Bravo', tier: 'full', seat_limit: null, status: 'active', created_at: new Date().toISOString() };
  C = { id: crypto.randomUUID(), name: 'Cedar', tier: 'basic', seat_limit: null, status: 'active', created_at: new Date().toISOString() };
  fake.state.tables.companies.push(B, C);
  U = {
    aSafety: owner,
    aCons: fake.addUser('ac@a.com', 'pw', { role: 'construction', approved: true, company: A }),
    aForeman: fake.addUser('af@a.com', 'pw', { role: 'foreman', approved: true, company: A }),
    bCons: fake.addUser('bc@b.com', 'pw', { role: 'construction', approved: true, company: B }),
    cCons: fake.addUser('cc@c.com', 'pw', { role: 'construction', approved: true, company: C }),
  };
});
after(() => fake.close());
beforeEach(() => { process.env.SUPABASE_URL = fake.url; process.env.SUPABASE_PUBLISHABLE_KEY = fake.publishableKey; process.env.SUPABASE_SECRET_KEY = fake.secretKey; process.env.ANTHROPIC_API_KEY = 'x'; });

test('expiry helper: expired, soon, fine, and bad dates', () => {
  assert.equal(expiryStatus('2026-01-01', '2026-01-02'), 'expired');
  assert.equal(expiryStatus('2026-01-02', '2026-01-02'), 'soon');       // runs out today: still valid, but flagged
  assert.equal(expiryStatus('2026-01-09', '2026-01-02'), 'soon');
  assert.equal(expiryStatus('2026-01-10', '2026-01-02'), null);
  assert.equal(expiryStatus(null, '2026-01-02'), null);
  assert.equal(isDateString('2026-02-30'), false);
  assert.equal(isDateString('2026-02-28'), true);
});

test('construction admin creates a job; everyone in the company reads it; a foreman cannot change it', async () => {
  const c = await post(U.aCons, { action: 'create_job', name: 'Tower 2', jobNumber: '24-117', location: '5th & Main' });
  assert.equal(c.status, 201); assert.equal(c.json.job.name, 'Tower 2');
  assert.equal((await post(U.aSafety, { action: 'create_job', name: 'Garage' })).status, 201);   // safety may too
  assert.equal((await post(U.aForeman, { action: 'create_job', name: 'Nope' })).status, 403);
  assert.equal((await post(U.aCons, { action: 'create_job', name: '  ' })).json.error, 'name_required');
  const list = await get(U.aForeman);
  assert.equal(list.status, 200); assert.equal(list.json.canEdit, false);
  assert.deepEqual(list.json.jobs.map((j) => j.name).sort(), ['Garage', 'Tower 2']);
  assert.equal((await get(U.aCons)).json.canEdit, true);
});

test('another company sees none of it and cannot touch it; a company without the feature is refused', async () => {
  const job = (await get(U.aCons)).json.jobs[0];
  assert.deepEqual((await get(U.bCons)).json.jobs, []);
  assert.equal((await get(U.bCons, { id: job.id })).status, 404);
  assert.equal((await post(U.bCons, { action: 'update_job', id: job.id, name: 'Hijack' })).status, 404);
  assert.equal((await post(U.bCons, { action: 'archive_job', id: job.id })).status, 404);
  assert.equal((await post(U.bCons, { action: 'upload_url', jobId: job.id, fileName: 'a.pdf', fileType: 'application/pdf', fileSize: 10 })).status, 404);
  assert.equal((await post(U.bCons, { action: 'add_document', jobId: job.id, category: 'rfi', title: 'x' })).status, 404);
  const r = await get(U.cCons); assert.equal(r.status, 403); assert.equal(r.json.error, 'feature_not_licensed');   // basic tier has no Jobs
});

test('documents: each kind is validated; permits and 811 tickets need an expiry date; nothing is assumed', async () => {
  const job = (await get(U.aCons)).json.jobs.find((j) => j.name === 'Tower 2');
  const add = (b) => post(U.aCons, { action: 'add_document', jobId: job.id, ...b });
  assert.equal((await add({ category: 'scope', title: 'Division 26 scope', summary: 'Electrical scope.' })).status, 201);
  assert.equal((await add({ category: 'rfi', title: 'Conduit routing', docNumber: 'RFI-014' })).json.document.status, 'open');
  assert.equal((await add({ category: 'bogus', title: 'x' })).json.error, 'invalid_category');
  assert.equal((await add({ category: 'rfi', title: '' })).json.error, 'title_required');
  assert.equal((await add({ category: 'permit', title: 'Hot work permit' })).json.error, 'expiry_required');
  assert.equal((await add({ category: 'permit', title: 'Hot work permit', expiresOn: '2026-13-40' })).json.error, 'invalid_date');
  assert.equal((await add({ category: 'rfi', title: 'x', expiresOn: day(3) })).json.error, 'expiry_not_allowed');
  assert.equal((await add({ category: 'rfi', title: 'x', status: 'active' })).json.error, 'invalid_status');
  assert.equal((await add({ category: 'permit', title: 'Excavation permit', docNumber: 'P-9', expiresOn: day(-2) })).status, 201);
  assert.equal((await add({ category: 'ticket811', title: '811 ticket 123', expiresOn: day(3) })).status, 201);
  assert.equal((await add({ category: 'ticket811', title: '811 ticket 456', expiresOn: day(30) })).status, 201);
  const one = await get(U.aForeman, { id: job.id, today: day(0) });
  const byTitle = Object.fromEntries(one.json.documents.map((d) => [d.title, d]));
  assert.equal(byTitle['Excavation permit'].expiry, 'expired');
  assert.equal(byTitle['811 ticket 123'].expiry, 'soon');
  assert.equal(byTitle['811 ticket 456'].expiry, null);
  const summary = (await get(U.aForeman, { today: day(0) })).json.jobs.find((j) => j.id === job.id);
  assert.equal(summary.expired, 1); assert.equal(summary.soon, 1); assert.equal(summary.openRfis, 1); assert.equal(summary.counts.permit, 1);
  // closing a permit takes it out of the warnings
  const upd = await post(U.aCons, { action: 'update_document', id: byTitle['Excavation permit'].id, status: 'closed' });
  assert.equal(upd.json.document.expiry, null);
  assert.equal((await post(U.aForeman, { action: 'update_document', id: byTitle['Excavation permit'].id, title: 'x' })).status, 403);
});

test('a newer revision of the same drawing number supersedes the earlier one', async () => {
  const job = (await get(U.aCons)).json.jobs.find((j) => j.name === 'Garage');
  const add = (rev) => post(U.aSafety, { action: 'add_document', jobId: job.id, category: 'revision', title: 'E-101', docNumber: 'E-101', revision: rev });
  await add('A'); await add('B');
  const docs = (await get(U.aSafety, { id: job.id })).json.documents;
  assert.deepEqual(docs.map((d) => [d.revision, d.status]).sort(), [['A', 'superseded'], ['B', 'current']]);
});

test('files: upload link, type and size checks, path must belong to this company and job, and the file must exist', async () => {
  const job = (await get(U.aCons)).json.jobs.find((j) => j.name === 'Tower 2');
  const url = (b) => post(U.aCons, { action: 'upload_url', jobId: job.id, ...b });
  assert.equal((await url({ fileName: 'a.exe', fileType: 'application/x-msdownload', fileSize: 10 })).json.error, 'invalid_file_type');
  assert.equal((await url({ fileName: 'big.pdf', fileType: 'application/pdf', fileSize: 999999999 })).json.error, 'file_too_large');
  assert.equal((await post(U.aForeman, { action: 'upload_url', jobId: job.id, fileName: 'a.pdf', fileType: 'application/pdf', fileSize: 10 })).status, 403);
  const up = await url({ fileName: '../../Scope plan (v2).pdf', fileType: 'application/pdf', fileSize: 1234 });
  assert.equal(up.status, 200);
  assert.ok(up.json.path.startsWith(`${A.id}/${job.id}/`) && !up.json.path.includes('..') && !/[ ()]/.test(up.json.path), up.json.path);
  const file = { path: up.json.path, name: 'Scope plan (v2).pdf', type: 'application/pdf', size: 1234 };
  const add = (f) => post(U.aCons, { action: 'add_document', jobId: job.id, category: 'scope', title: 'With file', file: f });
  assert.equal((await add(file)).json.error, 'file_missing');                    // never uploaded
  fake.state.objects.add('job-files/' + file.path);                                              // the browser uploads it
  const ok = await add(file);
  assert.equal(ok.status, 201); assert.equal(ok.json.document.file.name, 'Scope plan (v2).pdf');
  assert.equal((await add({ ...file, path: `${B.id}/${job.id}/x.pdf` })).json.error, 'invalid_file');   // another company's folder
  assert.equal((await add({ ...file, path: `${A.id}/${crypto.randomUUID()}/x.pdf` })).json.error, 'invalid_file');   // another job
  assert.equal((await add({ ...file, type: 'text/html' })).json.error, 'invalid_file_type');
  // opening the original
  const link = await get(U.aForeman, { id: job.id, doc: ok.json.document.id, file: '1' });
  assert.equal(link.status, 200); assert.match(link.json.url, /\/object\/sign\//);
  assert.equal((await get(U.bCons, { id: job.id, doc: ok.json.document.id, file: '1' })).status, 404);
});

test('archiving hides a job and a document; the plain Jobs address is routed to the same function', async () => {
  const jobs = (await get(U.aCons)).json.jobs;
  const g = jobs.find((j) => j.name === 'Garage');
  assert.equal((await post(U.aCons, { action: 'update_job', id: g.id, status: 'closed' })).json.job.status, 'closed');
  assert.equal((await post(U.aCons, { action: 'update_job', id: g.id, status: 'weird' })).json.error, 'invalid_status');
  assert.equal((await post(U.aCons, { action: 'archive_job', id: g.id })).status, 200);
  assert.ok(!(await get(U.aCons)).json.jobs.some((j) => j.id === g.id));
  assert.equal((await get(U.aCons, { id: g.id })).status, 404);
  assert.equal((await post(U.aCons, { action: 'nonsense' })).json.error, 'unknown_action');
  const viaUrl = await call({ method: 'GET', url: '/api/account?area=jobs', headers: as(U.aCons) });     // area read from the URL, as Vercel's rewrite does
  assert.equal(viaUrl.status, 200);
});

test('a plan can say which job it is for: kept for this company\'s job, dropped for anything else, and a plan without a job is untouched', async () => {
  const aJob = (await get(U.aCons)).json.jobs.find((j) => j.name === 'Tower 2');
  const bJob = (await post(U.bCons, { action: 'create_job', name: 'Bravo job' })).json.job;
  const saveVia = async (u, data) => { const res = fakeRes(); await plansApi({ method: 'POST', url: '/api/plans', query: {}, headers: as(u), body: { data: { jobTitle: 'Conduit', revision: 1, taskSteps: [], ...data } } }, res); const stored = fake.state.tables.plans.find((r) => r.id === JSON.parse(res.body).plan.id); return { status: res.statusCode, plan: stored }; };
  const own = await saveVia(U.aForeman, { jobId: aJob.id, jobName: 'whatever the browser said' });
  assert.ok(own.status === 200 || own.status === 201, 'saved: ' + own.status);
  assert.equal(own.plan.data.jobId, aJob.id); assert.equal(own.plan.data.jobName, 'Tower 2');       // the name comes from the job, not the browser
  const other = await saveVia(U.aForeman, { jobId: bJob.id, jobName: 'Bravo job' });
  assert.ok(other.plan.data.jobId === undefined && other.plan.data.jobName === undefined);          // another company's job is dropped, the plan still saves
  const junk = await saveVia(U.aForeman, { jobId: 'not-a-uuid' });
  assert.ok(junk.plan.data.jobId === undefined);
  const none = await saveVia(U.aForeman, {});
  assert.ok(none.plan.data.jobId === undefined && none.plan.title === 'Conduit');
});
