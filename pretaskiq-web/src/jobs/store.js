// Job folders on the browser side. Everything needs sign-in (the files and documents live in the company's database and private storage).
// Talks to /api/jobs; uploads each original file straight to storage through a short-lived link the server hands out.
import { apiJson, ApiError } from '../api/client.js';
import { nativeFetch } from '../api/nativeFetch.js';
import { getSnapshot as auth } from '../auth/session.js';
import { CATEGORIES, CATEGORY_KEYS, FILE_TYPES, MAX_FILE_BYTES, expiryStatus } from '../shared/jobs.js';

let state = { jobs: [], canEdit: false, loaded: false, error: '' };
const listeners = new Set();
const set = (next) => { state = { ...state, ...next }; listeners.forEach((fn) => fn()); };
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getSnapshot = () => state;
export const enabled = () => { const a = auth(); return a.mode === 'supabase' && a.phase === 'signed_in'; };
export const categories = () => CATEGORIES;
export const categoryKeys = () => CATEGORY_KEYS;
export const maxFileBytes = () => MAX_FILE_BYTES;

// The person's calendar day, as YYYY-MM-DD (the server judges "expired" by this, so a permit runs through its last day).
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const q = (o) => Object.entries({ ...o, today: today() }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const fail = (e, fallback) => ({ ok: false, message: (e && e.message) || fallback });

export async function refresh() {
  if (!enabled()) { set({ jobs: [], canEdit: false, loaded: true, error: '' }); return; }
  try { const out = await apiJson('/api/jobs?' + q({})); set({ jobs: out.jobs || [], canEdit: !!out.canEdit, loaded: true, error: '' }); }
  catch (e) { set({ loaded: true, error: e.message || 'Could not load the jobs.' }); }
}
export async function getJob(id) {
  try { const out = await apiJson('/api/jobs?' + q({ id })); return { ok: true, job: out.job, documents: out.documents || [], canEdit: !!out.canEdit }; }
  catch (e) { return fail(e, 'Could not open that job.'); }
}
const act = async (body, fallback) => { try { const out = await apiJson('/api/jobs', { method: 'POST', body }); return { ok: true, ...out }; } catch (e) { return fail(e, fallback); } };
export const createJob = async (f) => { const r = await act({ action: 'create_job', ...f }, 'Could not create the job.'); if (r.ok) await refresh(); return r; };
export const updateJob = async (id, f) => { const r = await act({ action: 'update_job', id, ...f }, 'Could not save the job.'); if (r.ok) await refresh(); return r; };
export const archiveJob = async (id) => { const r = await act({ action: 'archive_job', id }, 'Could not remove the job.'); if (r.ok) await refresh(); return r; };
export const addDocument = (jobId, f) => act({ action: 'add_document', jobId, ...f }, 'Could not add the document.');
export const updateDocument = (id, f) => act({ action: 'update_document', id, ...f }, 'Could not save the document.');
export const archiveDocument = (id) => act({ action: 'archive_document', id }, 'Could not remove the document.');

export function checkFile(file) {
  if (!file) return 'Choose a file.';
  if (!FILE_TYPES[file.type]) return 'Only PDF, PNG or JPG files can be kept.';
  if (file.size > MAX_FILE_BYTES) return `That file is larger than ${Math.round(MAX_FILE_BYTES / 1048576)} MB.`;
  if (file.size <= 0) return 'That file is empty.';
  return '';
}
// Sends the original to private storage. Resolves { ok, file: { path, name, type, size } }.
export async function uploadFile(jobId, file) {
  const bad = checkFile(file); if (bad) return { ok: false, message: bad };
  const link = await act({ action: 'upload_url', jobId, fileName: file.name, fileType: file.type, fileSize: file.size }, 'Could not start the upload.');
  if (!link.ok) return link;
  const form = new FormData(); form.append('cacheControl', '3600'); form.append('', file);
  try {
    const res = await nativeFetch(link.signedUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: form });
    if (!res.ok) return { ok: false, message: 'The file could not be uploaded. Check your connection and try again.' };
  } catch { return { ok: false, message: 'The file could not be uploaded. Check your connection and try again.' }; }
  return { ok: true, file: { path: link.path, name: file.name, type: file.type, size: file.size } };
}
export async function fileLink(jobId, docId) {
  try { const out = await apiJson('/api/jobs?' + q({ id: jobId, doc: docId, file: 1 })); return { ok: true, url: out.url, name: out.name }; }
  catch (e) { return fail(e, 'Could not open the file.'); }
}

// What Petey is told about a job when a plan is started for it: the job, its current documents, and any permit or ticket that has run out
// or is about to. Resolves { ok, text, warnings: [...], name }. Never invents dates: it only repeats what the administrator entered.
const one = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
export async function briefing(jobId) {
  const r = await getJob(jobId); if (!r.ok) return r;
  const t = today(), warnings = [], lines = [];
  const live = r.documents.filter((d) => d.status !== 'superseded' && d.status !== 'closed');
  for (const key of CATEGORY_KEYS) {
    const docs = live.filter((d) => d.category === key); if (!docs.length) continue;
    lines.push(CATEGORIES[key].label.toUpperCase() + ':');
    for (const d of docs.slice(0, 25)) {
      const bits = [one(d.title, 120)];
      if (d.docNumber) bits.push('no. ' + one(d.docNumber, 40));
      if (d.revision) bits.push('rev ' + one(d.revision, 20));
      if (key === 'rfi') bits.push('status: ' + d.status);
      if (d.expiresOn) { const e = expiryStatus(d.expiresOn, t); bits.push('expires ' + d.expiresOn + (e === 'expired' ? ' (EXPIRED)' : e === 'soon' ? ' (expires soon)' : '')); if (e && d.status === 'active') warnings.push({ id: d.id, category: key, title: d.title, expiresOn: d.expiresOn, expiry: e }); }
      let line = '- ' + bits.join(', ');
      if (d.summary) line += ': ' + one(d.summary, 500);
      if (d.details && d.details.affected_work) line += ' Affects: ' + one(d.details.affected_work, 200);
      lines.push(line);
    }
  }
  let text = 'JOB: ' + one(r.job.name, 120) + (r.job.jobNumber ? ' (job no. ' + one(r.job.jobNumber, 40) + ')' : '') + (r.job.location ? ', ' + one(r.job.location, 120) : '') + '\n' + (lines.join('\n') || 'No documents have been added to this job yet.');
  if (text.length > 9000) text = text.slice(0, 9000) + '\n(more documents are in the job folder)';
  return { ok: true, text, warnings, name: r.job.name };
}
