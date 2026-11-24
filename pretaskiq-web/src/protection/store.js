// Protection observations on the browser side: checklists of required controls, observations scored as found, and the roll-up for safety.
// Talks to /api/protection when signed in. With sign-in off everything stays in this browser (localStorage) and the roll-up covers this browser only.
import { apiJson } from '../api/client.js';
import { getSnapshot as auth } from '../auth/session.js';
import { summarize, cleanChecklist, controlResult, scoreObservation, DEFAULT_CATEGORIES } from '../shared/protection.js';

let state = { checklists: [], summary: null, loaded: false, loading: false, error: '', scope: 'local' };
const listeners = new Set();
const set = (next) => { state = { ...state, ...next }; listeners.forEach((fn) => fn()); };
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getSnapshot = () => state;
export const enabled = () => { const a = auth(); return a.mode === 'supabase' && a.phase === 'signed_in'; };
export const isLocal = () => !enabled();

const CL_KEY = 'pretaskiq.protection.checklists.v1', OB_KEY = 'pretaskiq.protection.observations.v1';
const read = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (k, list) => { try { localStorage.setItem(k, JSON.stringify(list.slice(0, 2000))); } catch { /* storage full or blocked */ } };
const slug = (v) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
const monthNow = () => { const d = new Date(); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); };
export const labelFor = (category) => { const c = state.checklists.find((x) => x.category === category) || DEFAULT_CATEGORIES.find((x) => x.id === category); return (c && c.label) || category; };
export const approvedFor = (category) => state.checklists.find((c) => c.category === category && c.status === 'approved') || null;
export const approvedList = () => state.checklists.filter((c) => c.status === 'approved');
export const draftList = () => state.checklists.filter((c) => c.status === 'draft');

export async function refreshChecklists() {
  if (isLocal()) { set({ checklists: read(CL_KEY).filter((c) => !c.archived_at), loaded: true, error: '', scope: 'local' }); return; }
  try { const out = await apiJson('/api/protection?what=checklists'); set({ checklists: out.checklists || [], loaded: true, error: '', scope: 'all' }); }
  catch (e) { set({ error: e.message || 'Could not load the checklists.' }); }
}

export async function refreshSummary() {
  if (isLocal()) { set({ summary: summarize(read(OB_KEY)), scope: 'local' }); return; }
  try { const out = await apiJson('/api/protection?what=summary'); set({ summary: out.summary, error: '', scope: 'all' }); }
  catch (e) { set({ error: e.message || 'Could not load the results.' }); }
}

// Safety: save a draft checklist for a category. Always resolves { ok, checklist } or { ok: false, message }.
export async function saveDraft({ category, label, controls, sourceNote }) {
  if (isLocal()) {
    const c = cleanChecklist({ category: slug(category), controls }); const lbl = String(label || '').trim().slice(0, 100);
    if (!c.category || !lbl || !c.controls.length) return { ok: false, message: 'Add a name and at least one control.' };
    const list = read(CL_KEY); const now = new Date().toISOString();
    let row = list.find((x) => x.category === c.category && x.status === 'draft' && !x.archived_at);
    if (row) Object.assign(row, { label: lbl, controls: c.controls, source_note: sourceNote || null, updated_at: now });
    else { row = { id: 'local-' + Date.now() + Math.random().toString(36).slice(2, 6), category: c.category, label: lbl, controls: c.controls, status: 'draft', source_note: sourceNote || null, created_at: now, updated_at: now }; list.push(row); }
    write(CL_KEY, list); await refreshChecklists(); return { ok: true, checklist: row };
  }
  try { const out = await apiJson('/api/protection', { method: 'POST', body: { checklist: { category, label, controls, sourceNote } } }); await refreshChecklists(); return { ok: true, checklist: out.checklist }; }
  catch (e) { return { ok: false, message: e.message || 'Could not save.' }; }
}

export async function decide(id, action) {            // 'approve' or 'discard'
  if (isLocal()) {
    const list = read(CL_KEY); const row = list.find((x) => x.id === id); if (!row || row.archived_at || row.status !== 'draft') return { ok: false, message: 'That draft was not found.' };
    const now = new Date().toISOString();
    if (action === 'discard') row.archived_at = now;
    else { list.forEach((x) => { if (x.category === row.category && x.status === 'approved' && !x.archived_at) x.archived_at = now; }); row.status = 'approved'; row.approved_at = now; }
    write(CL_KEY, list); await refreshChecklists(); return { ok: true };
  }
  try { await apiJson('/api/protection', { method: 'POST', body: { id, action } }); await refreshChecklists(); return { ok: true }; }
  catch (e) { return { ok: false, message: e.message || 'Could not update the checklist.' }; }
}

// Record an observation. answers: [{ id, applies, present, works }]. Resolves { ok, score } or { ok: false, message }.
export async function submitObservation({ category, answers, clientKey }) {
  const cl = approvedFor(category); if (!cl) return { ok: false, message: 'There is no approved checklist for that category yet.' };
  const byId = new Map((answers || []).map((a) => [a.id, a]));
  const controls = cl.controls.map((c) => { const a = byId.get(c.id) || {}; const applies = a.applies === true; const present = applies && a.present === true; return { id: c.id, kind: c.kind, applies, present, works: present && a.works === true }; });
  const score = scoreObservation({ controls });
  if (isLocal()) {
    const list = read(OB_KEY);
    if (clientKey && list.some((o) => o.client_key === clientKey)) return { ok: true, score, local: true };
    list.push({ category, month: monthNow(), controls, client_key: clientKey || null, created_at: new Date().toISOString() }); write(OB_KEY, list);
    return { ok: true, score, local: true };
  }
  try { await apiJson('/api/protection', { method: 'POST', body: { observation: { category, answers: controls.map((c) => ({ id: c.id, applies: c.applies, present: c.present, works: c.works })) }, clientKey } }); return { ok: true, score }; }
  catch (e) { return { ok: false, message: e.message || 'Could not save the observation.' }; }
}

export { controlResult, scoreObservation, cleanChecklist, DEFAULT_CATEGORIES };
