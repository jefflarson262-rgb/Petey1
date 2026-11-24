// Safety audits on the browser side: templates, running an audit, and the history. Talks to /api/audits when signed in.
// With sign-in off everything is kept in this browser (localStorage). Photos make that small, so a full browser is reported, never ignored.
import { apiJson } from '../api/client.js';
import { getSnapshot as auth } from '../auth/session.js';
import { cleanTemplate, checkAudit } from '../shared/audit.js';

let state = { templates: [], audits: [], loaded: false, error: '', scope: 'local' };
const listeners = new Set();
const set = (next) => { state = { ...state, ...next }; listeners.forEach((fn) => fn()); };
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getSnapshot = () => state;
export const enabled = () => { const a = auth(); return a.mode === 'supabase' && a.phase === 'signed_in'; };
export const isLocal = () => !enabled();

const TK = 'pretaskiq.audit.templates.v1', AK = 'pretaskiq.audit.audits.v1';
const read = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (k, list) => { try { localStorage.setItem(k, JSON.stringify(list)); return true; } catch { return false; } };
const withoutPhotos = (a) => { const { answers, ...rest } = a; return rest; };

export async function refreshTemplates() {
  if (isLocal()) { set({ templates: read(TK).filter((t) => !t.archived_at), loaded: true, error: '', scope: 'local' }); return; }
  try { const out = await apiJson('/api/audits?what=templates'); set({ templates: out.templates || [], loaded: true, error: '', scope: 'all' }); }
  catch (e) { set({ error: e.message || 'Could not load the audit templates.' }); }
}
export async function refreshAudits() {
  if (isLocal()) { set({ audits: read(AK).map(withoutPhotos).reverse(), scope: 'local' }); return; }
  try { const out = await apiJson('/api/audits?what=audits'); set({ audits: out.audits || [], error: '', scope: out.scope || 'mine' }); }
  catch (e) { set({ error: e.message || 'Could not load the audits.' }); }
}
export async function getAudit(id) {                       // one audit with its answers and photos
  if (isLocal()) { const a = read(AK).find((x) => x.id === id); return a ? { ok: true, audit: a } : { ok: false, message: 'That audit was not found on this device.' }; }
  try { const out = await apiJson('/api/audits?id=' + encodeURIComponent(id)); return { ok: true, audit: out.audit }; }
  catch (e) { return { ok: false, message: e.message || 'Could not open the audit.' }; }
}

// Safety: create or update a template. Resolves { ok, template } or { ok: false, message }.
export async function saveTemplate({ id, title, description, items }) {
  const t = cleanTemplate({ title, description, items });
  if (!t.title || !t.items.length) return { ok: false, message: 'Add a name and at least one item.' };
  if (isLocal()) {
    const list = read(TK); const now = new Date().toISOString(); let row = id && list.find((x) => x.id === id);
    if (row) Object.assign(row, { ...t, updated_at: now }); else { row = { id: 'local-' + Date.now() + Math.random().toString(36).slice(2, 6), ...t, created_at: now, updated_at: now }; list.push(row); }
    if (!write(TK, list)) return { ok: false, message: 'This browser has no room left to save it.' };
    await refreshTemplates(); return { ok: true, template: row };
  }
  try { const out = await apiJson('/api/audits', { method: 'POST', body: { template: { id, ...t } } }); await refreshTemplates(); return { ok: true, template: out.template }; }
  catch (e) { return { ok: false, message: e.message || 'Could not save the template.' }; }
}
export async function archiveTemplate(id) {
  if (isLocal()) { const list = read(TK); const row = list.find((x) => x.id === id); if (row) row.archived_at = new Date().toISOString(); write(TK, list); await refreshTemplates(); return { ok: true }; }
  try { await apiJson('/api/audits', { method: 'POST', body: { id, action: 'archive' } }); await refreshTemplates(); return { ok: true }; }
  catch (e) { return { ok: false, message: e.message || 'Could not remove the template.' }; }
}

// Submit an audit. answers: [{ id, result, comment, photos }]. Resolves { ok, audit } or { ok: false, message, missing }.
export async function submitAudit({ templateId, location, answers, clientKey }) {
  const tpl = state.templates.find((t) => t.id === templateId); if (!tpl) return { ok: false, message: 'That template is no longer available.', missing: [] };
  const check = checkAudit(tpl, answers);
  if (!check.ok) return { ok: false, message: 'The audit is not finished.', missing: check.missing };
  if (isLocal()) {
    const list = read(AK); const dupe = clientKey && list.find((x) => x.client_key === clientKey); if (dupe) return { ok: true, audit: withoutPhotos(dupe), local: true };
    const row = { id: 'local-' + Date.now(), template_id: tpl.id, template_title: tpl.title, location: String(location || '').trim().slice(0, 120) || null, answers: check.answers,
      pass_count: check.counts.pass, fail_count: check.counts.fail, na_count: check.counts.na, score: check.score, created_by_name: null, client_key: clientKey || null, created_at: new Date().toISOString() };
    list.push(row);
    if (!write(AK, list)) return { ok: false, message: 'This browser has no room left for the photos. Remove a photo or two and try again, or sign in so audits are saved on the server.', missing: [] };
    return { ok: true, audit: withoutPhotos(row), local: true };
  }
  try { const out = await apiJson('/api/audits', { method: 'POST', body: { audit: { templateId, location, answers: check.answers }, clientKey } }); return { ok: true, audit: out.audit }; }
  catch (e) { return { ok: false, message: e.message || 'Could not save the audit.', missing: (e.body && e.body.missing) || [] }; }
}

export { cleanTemplate, checkAudit };
export { MAX_PHOTOS_PER_ITEM, MAX_PHOTO_CHARS, MIN_FAIL_COMMENT } from '../shared/audit.js';
