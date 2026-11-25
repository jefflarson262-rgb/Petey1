// Job folders. A job is a folder with five kinds of documents: scope documents, RFIs, drawing revisions, permits and 811 tickets.
// Everyone approved in the company can read them; construction and safety administrators add, change and remove them. The original
// files (PDF or photo) are kept in private storage and opened through short-lived links, after the company is checked.
//   GET  /api/jobs?today=YYYY-MM-DD                      the jobs, with document counts and what is expired or expiring
//   GET  /api/jobs?overview=1&today=...                 Project Overview: what needs attention, counts, jobs, latest revisions, open RFIs
//   GET  /api/jobs?id=JOB&today=...                      one job and its documents
//   GET  /api/jobs?id=JOB&doc=DOC&file=1                 { url }: a link to the original file that works for one minute
//   POST /api/jobs { action: 'create_job', name, jobNumber, location }
//   POST /api/jobs { action: 'update_job', id, name?, jobNumber?, location?, status? }       status: active | closed
//   POST /api/jobs { action: 'archive_job', id }
//   POST /api/jobs { action: 'add_scope', jobId, code, name } | { action: 'update_scope', id, code?, name? } | { action: 'archive_scope', id }
//   POST /api/jobs { action: 'upload_url', jobId, fileName, fileType, fileSize }            -> { path, token, signedUrl } to upload one file
//   POST /api/jobs { action: 'add_document', jobId, category, title, ..., file?: { path, name, type, size } }
//   POST /api/jobs { action: 'update_document', id, ...fields }
//   POST /api/jobs { action: 'archive_document', id }
import { randomUUID } from 'node:crypto';
import { requireUser } from '../auth.js';
import { HttpError, send, handle, readJson } from '../http.js';
import { dbError } from '../supabase.js';
import { CATEGORIES, CATEGORY_KEYS, defaultStatus, FILE_TYPES, MAX_FILE_BYTES, isDateString, expiryStatus } from '../../src/shared/jobs.js';

export const BUCKET = 'job-files';
const WRITERS = ['construction', 'safety'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOB_COLS = 'id,name,job_number,location,status,created_at';
const SCOPE_COLS = 'id,job_id,code,name,created_at';
const shapeScope = (x) => ({ id: x.id, jobId: x.job_id, code: x.code, name: x.name });
const DOC_COLS = 'id,job_id,scope_id,category,title,doc_number,revision,summary,details,issued_on,expires_on,status,file_path,file_name,file_type,file_size,created_by_name,created_at';
const clean = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const cleanLong = (v, max) => (typeof v === 'string' ? v.replace(/\r/g, '').trim().slice(0, max) : '');

const shapeJob = (j) => ({ id: j.id, name: j.name, jobNumber: j.job_number || '', location: j.location || '', status: j.status, createdAt: j.created_at });
const shapeDoc = (d, today) => ({
  id: d.id, jobId: d.job_id, scopeId: d.scope_id || null, category: d.category, title: d.title, docNumber: d.doc_number || '', revision: d.revision || '', summary: d.summary || '',
  details: d.details || {}, issuedOn: d.issued_on || null, expiresOn: d.expires_on || null, status: d.status,
  expiry: d.status === 'active' ? expiryStatus(d.expires_on, today) : null,
  file: d.file_path ? { name: d.file_name || 'file', type: d.file_type || '', size: d.file_size || 0 } : null,
  createdByName: d.created_by_name || '', createdAt: d.created_at,
});

// The caller's calendar day (so a permit that expires "today" is judged by the person's date, not the server's UTC date).
function todayOf(q) {
  const utc = new Date().toISOString().slice(0, 10);
  const t = q && q.today;
  if (!isDateString(t)) return utc;
  const off = Math.abs((new Date(t + 'T00:00:00Z') - new Date(utc + 'T00:00:00Z')) / 86400000);
  return off <= 1 ? t : utc;
}

function cleanDetails(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return {};
  const list = (v, n, len) => (Array.isArray(v) ? v.map((x) => clean(String(x == null ? '' : x), len)).filter(Boolean).slice(0, n) : []);
  const out = {};
  const kw = list(d.keywords, 12, 40); if (kw.length) out.keywords = kw;
  const aw = clean(d.affected_work, 400); if (aw) out.affected_work = aw;
  const hq = clean(d.hold_question, 300); if (hq) out.hold_question = hq;
  return out;
}

function checkDate(v, field) {
  if (v === null || v === undefined || v === '') return null;
  if (!isDateString(v)) throw new HttpError(400, 'invalid_date', { field });
  return v;
}

async function loadJob(db, id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(404, 'job_not_found');
  const { data, error } = await db.from('jobs').select(JOB_COLS + ',archived_at').eq('id', id).maybeSingle();
  if (error) throw dbError(error);
  if (!data || data.archived_at) throw new HttpError(404, 'job_not_found');
  return data;
}
async function loadDoc(db, id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(404, 'document_not_found');
  const { data, error } = await db.from('job_documents').select(DOC_COLS + ',archived_at').eq('id', id).maybeSingle();
  if (error) throw dbError(error);
  if (!data || data.archived_at) throw new HttpError(404, 'document_not_found');
  return data;
}

async function liveScopes(db, jobId) {
  const { data, error } = await db.from('job_scopes').select(SCOPE_COLS).eq('job_id', jobId).is('archived_at', null).order('created_at', { ascending: true }).limit(500);
  if (error) throw dbError(error);
  return data || [];
}
// The scope a document is filed under: null (the whole job) or a live scope of THIS job.
async function resolveScope(db, jobId, scopeId) {
  if (scopeId === null || scopeId === undefined || scopeId === '') return null;
  if (typeof scopeId !== 'string' || !UUID.test(scopeId)) throw new HttpError(400, 'invalid_scope');
  const found = (await liveScopes(db, jobId)).find((x) => x.id === scopeId);
  if (!found) throw new HttpError(400, 'invalid_scope');
  return found.id;
}
function scopeFields(body, existing, others) {
  const out = {};
  if (!existing || body.code !== undefined) { const c = clean(body.code, 30); if (!c) throw new HttpError(400, 'scope_code_required'); out.code = c; }
  if (!existing || body.name !== undefined) { const n = clean(body.name, 120); if (!n) throw new HttpError(400, 'scope_name_required'); out.name = n; }
  if (out.code && others.some((x) => x.code.toLowerCase() === out.code.toLowerCase())) throw new HttpError(409, 'scope_code_in_use');
  return out;
}

// Checks the file a document points at: it must live under THIS company's THIS job, be an allowed type and size, and really be uploaded.
async function checkFile(me, jobId, f) {
  if (!f || typeof f !== 'object') throw new HttpError(400, 'invalid_file');
  const path = typeof f.path === 'string' ? f.path : '';
  if (!path.startsWith(`${me.company.id}/${jobId}/`) || path.includes('..')) throw new HttpError(400, 'invalid_file');
  if (!FILE_TYPES[f.type]) throw new HttpError(400, 'invalid_file_type');
  const size = Number(f.size);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) throw new HttpError(400, 'file_too_large');
  const { error } = await me.admin.storage.from(BUCKET).createSignedUrl(path, 10);
  if (error) throw new HttpError(400, 'file_missing');
  return { file_path: path, file_name: clean(f.name, 120) || 'file', file_type: f.type, file_size: Math.floor(size) };
}

function docFields(body, category, { partial }) {
  const out = {};
  const cat = CATEGORIES[category];
  if (!partial || body.title !== undefined) { const t = clean(body.title, 200); if (!t) throw new HttpError(400, 'title_required'); out.title = t; }
  if (body.docNumber !== undefined) out.doc_number = clean(body.docNumber, 80) || null;
  if (body.revision !== undefined) out.revision = clean(body.revision, 40) || null;
  if (body.summary !== undefined) out.summary = cleanLong(body.summary, 4000) || null;
  if (body.details !== undefined) out.details = cleanDetails(body.details);
  if (body.issuedOn !== undefined) out.issued_on = checkDate(body.issuedOn, 'issuedOn');
  if (body.expiresOn !== undefined) {
    out.expires_on = checkDate(body.expiresOn, 'expiresOn');
    if (out.expires_on && !cat.hasExpiry) throw new HttpError(400, 'expiry_not_allowed');
  }
  if (body.status !== undefined) { if (!cat.statuses.includes(body.status)) throw new HttpError(400, 'invalid_status'); out.status = body.status; }
  if (!partial && cat.hasExpiry && !out.expires_on) throw new HttpError(400, 'expiry_required');          // a permit or 811 ticket must say when it runs out
  return out;
}

// Where each crew with a recent plan on a job stands on one current drawing revision:
// 'planned' = Petey showed it to them at planning, 'confirmed' = filed later and the crew confirmed it, 'pending' = filed later, not confirmed yet.
function crewStates(d, plans) {
  const list = [];
  for (const p of plans) {
    if (!p.data || p.data.jobId !== d.job_id) continue;
    if (d.scope_id && p.data.scopeId && p.data.scopeId !== d.scope_id) continue;        // a different scope's crew
    const acked = Array.isArray(p.data.revisionAcks) && p.data.revisionAcks.some((a) => a && a.id === d.id);
    const seen = Array.isArray(p.data.jobRevsSeen) && p.data.jobRevsSeen.includes(d.id);
    list.push({ crew: p.owner_name || 'A crew', scopeCode: p.data.scopeCode || '', state: acked ? 'confirmed' : seen ? 'planned' : 'pending' });
  }
  return list;
}
async function recentPlans(db) {
  const since = new Date(Date.now() - 16 * 3600 * 1000).toISOString();
  const { data, error } = await db.from('plans').select('id,owner_name,updated_at,data').gte('updated_at', since).order('updated_at', { ascending: false }).limit(200);
  if (error) throw dbError(error);
  return data || [];
}

// Project Overview: one roll-up across the active jobs. What needs attention first (revisions a crew has not confirmed, expired and expiring
// permits and tickets), the counts, each job with its flags, the latest current revisions and the open RFIs.
async function overview(me, db, today) {
  const admin = WRITERS.includes(me.profile.role);
  const { data: jobs, error } = await db.from('jobs').select(JOB_COLS).is('archived_at', null).order('created_at', { ascending: false }).limit(500);
  if (error) throw dbError(error);
  const active = (jobs || []).filter((j) => j.status === 'active');
  const jobOf = Object.fromEntries(active.map((j) => [j.id, j]));
  const { data: docs, error: de } = await db.from('job_documents').select('id,job_id,scope_id,category,title,doc_number,revision,summary,status,expires_on,created_at').is('archived_at', null).order('created_at', { ascending: false }).limit(20000);
  if (de) throw dbError(de);
  const { data: scopes, error: se } = await db.from('job_scopes').select('id,code').is('archived_at', null).limit(5000);
  if (se) throw dbError(se);
  const codeOf = Object.fromEntries((scopes || []).map((x) => [x.id, x.code]));
  const plans = admin ? await recentPlans(db) : [];
  const per = {}; const attention = []; const revisions = []; const rfis = [];
  const flag = (id) => (per[id] = per[id] || { documents: 0, expired: 0, soon: 0, openRfis: 0, unconfirmed: 0 });
  const base = (d) => ({ id: d.id, jobId: d.job_id, jobName: jobOf[d.job_id].name, title: d.title, docNumber: d.doc_number || '', revision: d.revision || '', scopeCode: codeOf[d.scope_id] || '', category: d.category });
  for (const d of docs || []) {
    if (!jobOf[d.job_id]) continue;
    const f = flag(d.job_id); f.documents++;
    if (d.category === 'rfi' && d.status === 'open') { f.openRfis++; rfis.push({ ...base(d), summary: (d.summary || '').slice(0, 240), createdAt: d.created_at, days: Math.max(0, Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86400000)) }); }
    if (d.category === 'revision' && d.status === 'current') {
      const crews = crewStates(d, plans);
      const pending = crews.filter((c) => c.state === 'pending');
      if (pending.length) { f.unconfirmed++; attention.push({ kind: 'unconfirmed', ...base(d), crews: pending.map((c) => c.crew).slice(0, 10) }); }
      revisions.push({ ...base(d), summary: (d.summary || '').slice(0, 240), createdAt: d.created_at, pending: pending.length, confirmed: crews.filter((c) => c.state === 'confirmed').length, planned: crews.filter((c) => c.state === 'planned').length });
    }
    const e = d.status === 'active' ? expiryStatus(d.expires_on, today) : null;
    if (e) { f[e]++; attention.push({ kind: e, ...base(d), expiresOn: d.expires_on }); }
  }
  const rank = { unconfirmed: 0, expired: 1, soon: 2 };
  attention.sort((a, b) => rank[a.kind] - rank[b.kind]);
  const sum = (k) => Object.values(per).reduce((n, f) => n + f[k], 0);
  return {
    canEdit: admin,
    counts: { jobs: active.length, openRfis: sum('openRfis'), unconfirmed: sum('unconfirmed'), expired: sum('expired'), soon: sum('soon') },
    attention: attention.slice(0, 20),
    jobs: active.slice(0, 50).map((j) => ({ ...shapeJob(j), ...(per[j.id] || { documents: 0, expired: 0, soon: 0, openRfis: 0, unconfirmed: 0 }) })),
    revisions: revisions.slice(0, 8), rfis: rfis.slice(0, 8),
  };
}

export default handle(async (req, res) => {
  const method = req.method;
  if (method !== 'GET' && method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const me = await requireUser(req, { feature: 'jobs' });
  const db = me.db;
  const q = req.query || {};

  if (method === 'GET') {
    const today = todayOf(q);
    if (q.overview) return send(res, 200, await overview(me, db, today));
    if (!q.id) {
      const { data: jobs, error } = await db.from('jobs').select(JOB_COLS).is('archived_at', null).order('created_at', { ascending: false }).limit(500);
      if (error) throw dbError(error);
      const { data: docs, error: de } = await db.from('job_documents').select('job_id,category,status,expires_on').is('archived_at', null).limit(20000);
      if (de) throw dbError(de);
      const by = {};
      for (const d of docs || []) {
        const j = (by[d.job_id] = by[d.job_id] || { counts: {}, expired: 0, soon: 0, openRfis: 0 });
        j.counts[d.category] = (j.counts[d.category] || 0) + 1;
        if (d.category === 'rfi' && d.status === 'open') j.openRfis++;
        const e = d.status === 'active' ? expiryStatus(d.expires_on, today) : null;
        if (e === 'expired') j.expired++; else if (e === 'soon') j.soon++;
      }
      return send(res, 200, { canEdit: WRITERS.includes(me.profile.role), jobs: (jobs || []).map((j) => ({ ...shapeJob(j), ...(by[j.id] || { counts: {}, expired: 0, soon: 0, openRfis: 0 }) })) });
    }
    const job = await loadJob(db, String(q.id));
    if (q.doc && q.file) {
      const doc = await loadDoc(db, String(q.doc));
      if (doc.job_id !== job.id || !doc.file_path) throw new HttpError(404, 'file_not_found');
      const { data, error } = await me.admin.storage.from(BUCKET).createSignedUrl(doc.file_path, 60);
      if (error || !data || !data.signedUrl) throw new HttpError(404, 'file_not_found');
      return send(res, 200, { url: data.signedUrl, name: doc.file_name || 'file' });
    }
    const scopes = await liveScopes(db, job.id);
    const { data: docs, error } = await db.from('job_documents').select(DOC_COLS).eq('job_id', job.id).is('archived_at', null).order('created_at', { ascending: false }).limit(2000);
    if (error) throw dbError(error);
    // For administrators: which crews have a plan on this job from the last 16 hours, and where each stands on every current drawing revision
    // ('planned' = Petey showed it to them at planning, 'confirmed' = filed later and the crew confirmed it, 'pending' = filed later, not confirmed yet).
    const crews = {};
    if (WRITERS.includes(me.profile.role)) {
      const plans = await recentPlans(db);
      for (const d of docs || []) {
        if (d.category !== 'revision' || d.status !== 'current') continue;
        const list = crewStates(d, plans);
        if (list.length) crews[d.id] = list.slice(0, 30);
      }
    }
    return send(res, 200, { canEdit: WRITERS.includes(me.profile.role), job: shapeJob(job), crews, scopes: scopes.map(shapeScope), documents: (docs || []).map((d) => shapeDoc(d, today)) });
  }

  if (!WRITERS.includes(me.profile.role)) throw new HttpError(403, 'wrong_role');
  const body = await readJson(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_body');

  if (body.action === 'create_job') {
    const name = clean(body.name, 120);
    if (!name) throw new HttpError(400, 'name_required');
    const row = { name, job_number: clean(body.jobNumber, 60) || null, location: clean(body.location, 200) || null, created_by: me.user.id };
    const { data, error } = await db.from('jobs').insert(row).select(JOB_COLS).single();
    if (error) throw dbError(error);
    return send(res, 201, { job: { ...shapeJob(data), counts: {}, expired: 0, soon: 0, openRfis: 0 } });
  }
  if (body.action === 'update_job' || body.action === 'archive_job') {
    const job = await loadJob(db, body.id);
    const patch = {};
    if (body.action === 'archive_job') patch.archived_at = new Date().toISOString();
    else {
      if (body.name !== undefined) { const n = clean(body.name, 120); if (!n) throw new HttpError(400, 'name_required'); patch.name = n; }
      if (body.jobNumber !== undefined) patch.job_number = clean(body.jobNumber, 60) || null;
      if (body.location !== undefined) patch.location = clean(body.location, 200) || null;
      if (body.status !== undefined) { if (!['active', 'closed'].includes(body.status)) throw new HttpError(400, 'invalid_status'); patch.status = body.status; }
      if (!Object.keys(patch).length) throw new HttpError(400, 'nothing_to_update');
    }
    const { data, error } = await db.from('jobs').update(patch).eq('id', job.id).select(JOB_COLS).single();
    if (error) throw dbError(error);
    return send(res, 200, { job: shapeJob(data) });
  }
  if (body.action === 'add_scope') {
    const job = await loadJob(db, body.jobId);
    const fields = scopeFields(body, null, await liveScopes(db, job.id));
    const { data, error } = await db.from('job_scopes').insert({ job_id: job.id, created_by: me.user.id, ...fields }).select(SCOPE_COLS).single();
    if (error) throw dbError(error);
    return send(res, 201, { scope: shapeScope(data) });
  }
  if (body.action === 'update_scope' || body.action === 'archive_scope') {
    if (typeof body.id !== 'string' || !UUID.test(body.id)) throw new HttpError(404, 'scope_not_found');
    const { data: sc, error: le } = await db.from('job_scopes').select(SCOPE_COLS + ',archived_at').eq('id', body.id).maybeSingle();
    if (le) throw dbError(le);
    if (!sc || sc.archived_at) throw new HttpError(404, 'scope_not_found');
    await loadJob(db, sc.job_id);
    let patch;
    if (body.action === 'archive_scope') {
      patch = { archived_at: new Date().toISOString() };
      // its documents stay in the job and go back to "whole job", so no crew loses sight of them
      const { error: de } = await db.from('job_documents').update({ scope_id: null }).eq('scope_id', sc.id);
      if (de) throw dbError(de);
    } else {
      patch = scopeFields(body, sc, (await liveScopes(db, sc.job_id)).filter((x) => x.id !== sc.id));
      if (!Object.keys(patch).length) throw new HttpError(400, 'nothing_to_update');
    }
    const { data, error } = await db.from('job_scopes').update(patch).eq('id', sc.id).select(SCOPE_COLS).single();
    if (error) throw dbError(error);
    return send(res, 200, { scope: shapeScope(data) });
  }
  if (body.action === 'upload_url') {
    const job = await loadJob(db, body.jobId);
    if (!FILE_TYPES[body.fileType]) throw new HttpError(400, 'invalid_file_type');
    const size = Number(body.fileSize);
    if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) throw new HttpError(400, 'file_too_large');
    const safe = clean(body.fileName, 120).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/\.{2,}/g, '.').replace(/^\.+/, '').slice(-80) || 'file';
    const path = `${me.company.id}/${job.id}/${randomUUID()}-${safe}`;
    const { data, error } = await me.admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new HttpError(502, 'storage_unavailable');
    return send(res, 200, { path, token: data.token, signedUrl: data.signedUrl });
  }
  if (body.action === 'add_document') {
    const job = await loadJob(db, body.jobId);
    if (!CATEGORY_KEYS.includes(body.category)) throw new HttpError(400, 'invalid_category');
    const fields = docFields(body, body.category, { partial: false });
    const row = { job_id: job.id, category: body.category, status: fields.status || defaultStatus(body.category), created_by: me.user.id, created_by_name: me.profile.display_name || me.user.email || null, scope_id: await resolveScope(db, job.id, body.scopeId), ...fields };
    if (body.file) Object.assign(row, await checkFile(me, job.id, body.file));
    const { data, error } = await db.from('job_documents').insert(row).select(DOC_COLS).single();
    if (error) throw dbError(error);
    // A newer revision of a drawing replaces the earlier ones with the same number, which stay on file as superseded.
    if (body.category === 'revision' && row.doc_number && row.status === 'current') {
      const { error: se } = await db.from('job_documents').update({ status: 'superseded' }).eq('job_id', job.id).eq('category', 'revision').eq('doc_number', row.doc_number).eq('status', 'current').neq('id', data.id);
      if (se) throw dbError(se);
    }
    return send(res, 201, { document: shapeDoc(data, todayOf(q)) });
  }
  if (body.action === 'update_document' || body.action === 'archive_document') {
    const doc = await loadDoc(db, body.id);
    let patch;
    if (body.action === 'archive_document') patch = { archived_at: new Date().toISOString() };
    else {
      patch = docFields(body, doc.category, { partial: true });
      if (body.scopeId !== undefined) patch.scope_id = await resolveScope(db, doc.job_id, body.scopeId);
      if (!Object.keys(patch).length) throw new HttpError(400, 'nothing_to_update');
      patch.updated_at = new Date().toISOString();
    }
    const { data, error } = await db.from('job_documents').update(patch).eq('id', doc.id).select(DOC_COLS).single();
    if (error) throw dbError(error);
    return send(res, 200, { document: shapeDoc(data, todayOf(q)) });
  }
  throw new HttpError(400, 'unknown_action');
});
