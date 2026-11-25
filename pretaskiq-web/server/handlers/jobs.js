// Job folders. A job is a folder with five kinds of documents: scope documents, RFIs, drawing revisions, permits and 811 tickets.
// Everyone approved in the company can read them; construction and safety administrators add, change and remove them. The original
// files (PDF or photo) are kept in private storage and opened through short-lived links, after the company is checked.
//   GET  /api/jobs?today=YYYY-MM-DD                      the jobs, with document counts and what is expired or expiring
//   GET  /api/jobs?id=JOB&today=...                      one job and its documents
//   GET  /api/jobs?id=JOB&doc=DOC&file=1                 { url }: a link to the original file that works for one minute
//   POST /api/jobs { action: 'create_job', name, jobNumber, location }
//   POST /api/jobs { action: 'update_job', id, name?, jobNumber?, location?, status? }       status: active | closed
//   POST /api/jobs { action: 'archive_job', id }
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
const DOC_COLS = 'id,job_id,category,title,doc_number,revision,summary,details,issued_on,expires_on,status,file_path,file_name,file_type,file_size,created_by_name,created_at';
const clean = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const cleanLong = (v, max) => (typeof v === 'string' ? v.replace(/\r/g, '').trim().slice(0, max) : '');

const shapeJob = (j) => ({ id: j.id, name: j.name, jobNumber: j.job_number || '', location: j.location || '', status: j.status, createdAt: j.created_at });
const shapeDoc = (d, today) => ({
  id: d.id, jobId: d.job_id, category: d.category, title: d.title, docNumber: d.doc_number || '', revision: d.revision || '', summary: d.summary || '',
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

export default handle(async (req, res) => {
  const method = req.method;
  if (method !== 'GET' && method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const me = await requireUser(req, { feature: 'jobs' });
  const db = me.db;
  const q = req.query || {};

  if (method === 'GET') {
    const today = todayOf(q);
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
    const { data: docs, error } = await db.from('job_documents').select(DOC_COLS).eq('job_id', job.id).is('archived_at', null).order('created_at', { ascending: false }).limit(2000);
    if (error) throw dbError(error);
    return send(res, 200, { canEdit: WRITERS.includes(me.profile.role), job: shapeJob(job), documents: (docs || []).map((d) => shapeDoc(d, today)) });
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
    const row = { job_id: job.id, category: body.category, status: fields.status || defaultStatus(body.category), created_by: me.user.id, created_by_name: me.profile.display_name || me.user.email || null, ...fields };
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
      if (!Object.keys(patch).length) throw new HttpError(400, 'nothing_to_update');
      patch.updated_at = new Date().toISOString();
    }
    const { data, error } = await db.from('job_documents').update(patch).eq('id', doc.id).select(DOC_COLS).single();
    if (error) throw dbError(error);
    return send(res, 200, { document: shapeDoc(data, todayOf(q)) });
  }
  throw new HttpError(400, 'unknown_action');
});
