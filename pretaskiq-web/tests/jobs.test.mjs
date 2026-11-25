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

test('scopes: each has its own code, unique in the job; documents are filed under a scope of the same job; plans record the scope', async () => {
  const job = (await post(U.aCons, { action: 'create_job', name: 'Hospital' })).json.job;
  const other = (await post(U.aCons, { action: 'create_job', name: 'School' })).json.job;
  const addScope = (u, b) => post(u, { action: 'add_scope', ...b });
  const el = await addScope(U.aCons, { jobId: job.id, code: '26-ELEC', name: 'Electrical' });
  assert.equal(el.status, 201); assert.equal(el.json.scope.code, '26-ELEC');
  const me = (await addScope(U.aSafety, { jobId: job.id, code: '23-MECH', name: 'Mechanical' })).json.scope;
  assert.equal((await addScope(U.aCons, { jobId: job.id, code: '26-elec', name: 'Dup' })).json.error, 'scope_code_in_use');
  assert.equal((await addScope(U.aCons, { jobId: job.id, code: '', name: 'x' })).json.error, 'scope_code_required');
  assert.equal((await addScope(U.aCons, { jobId: job.id, code: 'X', name: '' })).json.error, 'scope_name_required');
  assert.equal((await addScope(U.aForeman, { jobId: job.id, code: 'F', name: 'F' })).status, 403);
  assert.equal((await addScope(U.bCons, { jobId: job.id, code: 'B', name: 'B' })).status, 404);
  const otherScope = (await addScope(U.aCons, { jobId: other.id, code: '26-ELEC', name: 'Electrical' })).json.scope;   // same code on another job is fine
  assert.ok(otherScope.id);
  const add = (b) => post(U.aCons, { action: 'add_document', jobId: job.id, category: 'revision', ...b });
  const d1 = await add({ title: 'E-201', docNumber: 'E-201', revision: '4', scopeId: el.json.scope.id });
  assert.equal(d1.json.document.scopeId, el.json.scope.id);
  assert.equal((await add({ title: 'G-001', docNumber: 'G-001', revision: '1' })).json.document.scopeId, null);
  assert.equal((await add({ title: 'x', scopeId: otherScope.id })).json.error, 'invalid_scope');            // a scope of a different job
  assert.equal((await add({ title: 'x', scopeId: 'nope' })).json.error, 'invalid_scope');
  assert.equal((await post(U.aCons, { action: 'update_document', id: d1.json.document.id, scopeId: me.id })).json.document.scopeId, me.id);
  assert.equal((await post(U.aCons, { action: 'update_scope', id: me.id, code: '26-ELEC' })).json.error, 'scope_code_in_use');
  assert.equal((await post(U.aCons, { action: 'update_scope', id: me.id, name: 'HVAC' })).json.scope.name, 'HVAC');
  assert.equal((await post(U.bCons, { action: 'archive_scope', id: me.id })).status, 404);
  const seen = await get(U.aForeman, { id: job.id });
  assert.deepEqual(seen.json.scopes.map((x) => x.code), ['26-ELEC', '23-MECH']);
  // plans
  const savePlan = async (data) => { const res = fakeRes(); await plansApi({ method: 'POST', url: '/api/plans', query: {}, headers: as(U.aForeman), body: { data: { jobTitle: 'Feeders', revision: 1, taskSteps: [], ...data } } }, res); return fake.state.tables.plans.find((r) => r.id === JSON.parse(res.body).plan.id).data; };
  const ok = await savePlan({ jobId: job.id, scopeId: el.json.scope.id, scopeCode: 'forged', scopeName: 'forged' });
  assert.equal(ok.scopeId, el.json.scope.id); assert.equal(ok.scopeCode, '26-ELEC'); assert.equal(ok.scopeName, 'Electrical');
  const wrong = await savePlan({ jobId: job.id, scopeId: otherScope.id, scopeCode: 'x' });
  assert.ok(wrong.jobId === job.id && wrong.scopeId === undefined && wrong.scopeCode === undefined);        // scope of another job: dropped
  const noJob = await savePlan({ scopeId: el.json.scope.id });
  assert.ok(noJob.scopeId === undefined);
  // removing a scope returns its documents to the whole job
  assert.equal((await post(U.aCons, { action: 'archive_scope', id: me.id })).status, 200);
  const after = await get(U.aCons, { id: job.id });
  assert.deepEqual(after.json.scopes.map((x) => x.code), ['26-ELEC']);
  assert.equal(after.json.documents.find((d) => d.id === d1.json.document.id).scopeId, null);
  assert.equal((await addScope(U.aCons, { jobId: job.id, code: '23-MECH', name: 'Mechanical again' })).status, 201);   // the code is free again
});

test('new revision after planning: the plan records what the crew saw and confirmed, and administrators see where each crew stands', async () => {
  const job = (await post(U.aCons, { action: 'create_job', name: 'Clinic' })).json.job;
  const el = (await post(U.aCons, { action: 'add_scope', jobId: job.id, code: 'ELEC', name: 'Electrical' })).json.scope;
  const me = (await post(U.aCons, { action: 'add_scope', jobId: job.id, code: 'MECH', name: 'Mechanical' })).json.scope;
  const rev = async (num, r, scopeId) => (await post(U.aCons, { action: 'add_document', jobId: job.id, category: 'revision', title: num, docNumber: num, revision: r, scopeId })).json.document;
  const e4 = await rev('E-201', '4', el.id);
  const save = async (u, id, data) => { const res = fakeRes(); await plansApi({ method: 'POST', url: '/api/plans', query: {}, headers: as(u), body: { id, data: { jobTitle: 'Feeders', revision: 1, taskSteps: [], ...data } } }, res); const out = JSON.parse(res.body); return out.plan ? fake.state.tables.plans.find((r) => r.id === out.plan.id) : out; };
  const plan = await save(U.aForeman, undefined, { jobId: job.id, scopeId: el.id, jobRevsSeen: [e4.id, 'junk', 7], revisionAcks: 'nope' });
  assert.deepEqual(plan.data.jobRevsSeen, [e4.id]); assert.deepEqual(plan.data.revisionAcks, []);
  const e5 = await rev('E-201', '5', el.id);                      // filed after the plan was made; rev 4 becomes superseded
  const m2 = await rev('M-104', '2', me.id);                      // another scope: not this crew's
  let seen = await get(U.aCons, { id: job.id });
  assert.deepEqual(seen.json.crews[e5.id].map((c) => [c.scopeCode, c.state]), [['ELEC', 'pending']]);
  assert.equal(seen.json.crews[m2.id], undefined);
  assert.equal(seen.json.crews[e4.id], undefined);                // superseded revisions are not tracked
  assert.deepEqual((await get(U.aForeman, { id: job.id })).json.crews, {});            // foremen do not see other crews
  await save(U.aForeman, plan.id, { jobId: job.id, scopeId: el.id, jobRevsSeen: [e4.id], revisionAcks: [{ id: e5.id, docNumber: 'E-201', revision: '5', title: 'E-201', at: new Date().toISOString(), extra: 'dropped' }, { id: 'bad' }] });
  const stored = fake.state.tables.plans.find((r) => r.id === plan.id).data.revisionAcks;
  assert.equal(stored.length, 1); assert.equal(stored[0].extra, undefined);
  seen = await get(U.aCons, { id: job.id });
  assert.equal(seen.json.crews[e5.id][0].state, 'confirmed');
  const noJob = await save(U.aForeman, undefined, { jobRevsSeen: [e4.id], revisionAcks: [] });
  assert.ok(noJob.data.jobRevsSeen === undefined && noJob.data.revisionAcks === undefined);
});

test('project overview: rolls up the active jobs for this company only, with what needs attention first', async () => {
  const fresh = fake.addUser('solo@d.com', 'pw', { role: 'construction', approved: true, company: (() => { const c = { id: crypto.randomUUID(), name: 'Delta', tier: 'full', seat_limit: null, status: 'active', created_at: new Date().toISOString() }; fake.state.tables.companies.push(c); return c; })() });
  const crew = fake.addUser('crew@d.com', 'pw', { role: 'foreman', approved: true, company: fake.state.tables.companies.at(-1), displayName: 'Dana' });
  let ov = await get(fresh, { overview: '1' });
  assert.equal(ov.status, 200); assert.deepEqual(ov.json.counts, { jobs: 0, openRfis: 0, unconfirmed: 0, expired: 0, soon: 0 }); assert.deepEqual(ov.json.jobs, []);
  const job = (await post(fresh, { action: 'create_job', name: 'Depot' })).json.job;
  const closed = (await post(fresh, { action: 'create_job', name: 'Old job' })).json.job;
  const sc = (await post(fresh, { action: 'add_scope', jobId: job.id, code: 'UG', name: 'Underground' })).json.scope;
  const add = (jobId, b) => post(fresh, { action: 'add_document', jobId, ...b }).then((r) => r.json.document);
  const r1 = await add(job.id, { category: 'revision', title: 'C-100', docNumber: 'C-100', revision: '1', scopeId: sc.id });
  await add(job.id, { category: 'rfi', title: 'Depth of main', docNumber: 'RFI-1', summary: 'How deep?' });
  await add(job.id, { category: 'permit', title: 'Street permit', expiresOn: day(-1) });
  await add(job.id, { category: 'ticket811', title: 'Ticket 9', expiresOn: day(2) });
  await add(closed.id, { category: 'rfi', title: 'Ignored', docNumber: 'RFI-9' });
  await post(fresh, { action: 'update_job', id: closed.id, status: 'closed' });
  const res = fakeRes(); await plansApi({ method: 'POST', url: '/api/plans', query: {}, headers: as(crew), body: { data: { jobTitle: 'Trench', revision: 1, taskSteps: [], jobId: job.id, scopeId: sc.id, jobRevsSeen: [r1.id] } } }, res);
  const r2 = await add(job.id, { category: 'revision', title: 'C-100', docNumber: 'C-100', revision: '2', scopeId: sc.id });
  ov = await get(fresh, { overview: '1', today: day(0) });
  assert.deepEqual(ov.json.counts, { jobs: 1, openRfis: 1, unconfirmed: 1, expired: 1, soon: 1 });
  assert.deepEqual(ov.json.attention.map((a) => a.kind), ['unconfirmed', 'expired', 'soon']);
  assert.deepEqual(ov.json.attention[0].crews, ['Dana']); assert.equal(ov.json.attention[0].scopeCode, 'UG'); assert.equal(ov.json.attention[0].revision, '2');
  assert.deepEqual(ov.json.revisions.map((r) => [r.id, r.pending]), [[r2.id, 1]]);            // the superseded revision is not listed
  assert.deepEqual(ov.json.rfis.map((r) => r.docNumber), ['RFI-1']);                            // the closed job's RFI is left out
  assert.equal(ov.json.jobs.length, 1); assert.equal(ov.json.jobs[0].unconfirmed, 1); assert.equal(ov.json.jobs[0].documents, 5);
  const mine = await get(crew, { overview: '1', today: day(0) });                                // a foreman gets the roll-up without other crews' status
  assert.equal(mine.json.counts.unconfirmed, 0); assert.equal(mine.json.canEdit, false);
  assert.equal((await get(U.bCons, { overview: '1' })).json.jobs.some((j) => j.name === 'Depot'), false);
});
