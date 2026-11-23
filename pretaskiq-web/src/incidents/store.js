// Incident reports on the browser side. Talks to /api/incidents. Works only when signed in; with sign-in off, callers keep reports in this browser.
// A foreman files a preliminary report; a safety administrator completes the in-depth one. A report is "overdue" when its full report is past due.
import { apiJson } from '../api/client.js';
import { getSnapshot as auth } from '../auth/session.js';
import { sanitizeFull, DUE_HOURS } from '../shared/incidentFull.js';

let state = { reports: [], loaded: false, loading: false, error: '', scope: 'mine', dueHours: 24 };
const listeners = new Set();
const set = (next) => { state = { ...state, ...next }; listeners.forEach((fn) => fn()); };
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getSnapshot = () => state;

export const enabled = () => { const a = auth(); return a.mode === 'supabase' && a.phase === 'signed_in'; };
export const isSafety = () => { const a = auth(); return enabled() && !!a.profile && a.profile.role === 'safety'; };
// With sign-in off there is no server, so reports are kept in this browser only (and nobody else can see them).
const LOCAL_KEY = 'pretaskiq.incidents.v1';
const readLocal = () => { try { const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeLocal = (list) => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 100))); } catch { /* storage full or blocked: the report stays in memory for this visit */ } };
export const isLocal = () => !enabled();
export const isOpen = (r) => r.status !== 'complete';
export const isOverdue = (r, now = Date.now()) => isOpen(r) && new Date(r.due_at).getTime() < now;
export const openReports = (s = state) => s.reports.filter(isOpen);
export const overdueCount = (s = state, now = Date.now()) => s.reports.filter((r) => isOverdue(r, now)).length;
export const ageText = (iso, now = Date.now()) => {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 60) return mins + ' min';
  const h = Math.floor(mins / 60);
  return h < 48 ? h + ' h' : Math.floor(h / 24) + ' days';
};

export async function refresh() {
  if (isLocal()) { set({ reports: readLocal(), loaded: true, loading: false, error: '', scope: 'local', dueHours: DUE_HOURS }); return; }
  if (state.loading) return;
  set({ loading: true });
  try {
    const out = await apiJson('/api/incidents');
    set({ reports: out.reports || [], loaded: true, loading: false, error: '', scope: out.scope || 'mine', dueHours: out.dueHours || 24 });
  } catch (e) {
    set({ loading: false, error: e.message || 'Could not load incident reports.' });
  }
}

const replace = (report) => set({ reports: state.reports.some((r) => r.id === report.id) ? state.reports.map((r) => (r.id === report.id ? report : r)) : [report, ...state.reports] });

// File a preliminary report. Always resolves: { ok: true, report, alerted } or { ok: false, message }. clientKey makes a double tap harmless.
export async function submitPreliminary({ kind, title, data, clientKey }) {
  if (isLocal()) {
    const now = Date.now(); const list = readLocal();
    const dupe = clientKey && list.find((r) => r.client_key === clientKey);
    if (dupe) return { ok: true, report: dupe, alerted: false, local: true };
    const report = { id: 'local-' + now, kind, title, data, full_report: null, status: 'preliminary', client_key: clientKey || null, reported_by_name: null, created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(), due_at: new Date(now + DUE_HOURS * 36e5).toISOString() };
    writeLocal([report, ...list]); set({ reports: [report, ...list], loaded: true, scope: 'local' });
    return { ok: true, report, alerted: false, local: true };
  }
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await apiJson('/api/incidents', { method: 'POST', body: { report: { kind, title, data }, clientKey } });
      replace(out.report);
      return { ok: true, report: out.report, alerted: out.alerted !== false };
    } catch (e) {
      lastError = e;
      if (e.status && e.status !== 502 && e.status !== 503 && e.status !== 504) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return { ok: false, message: (lastError && lastError.message) || 'Could not reach the server.' };
}

// Safety administrators. action is 'save_full' or 'complete'. On a refusal for missing parts, `missing` lists them.
export async function saveFull(id, action, full, kbEntryId) {
  if (isLocal()) {
    const list = readLocal(); const r = list.find((x) => x.id === id);
    if (!r) return { ok: false, message: 'Report not found on this device.', missing: [] };
    const { full: clean, missing, ok } = sanitizeFull(full);
    if (action === 'complete' && !ok) return { ok: false, message: 'The full report is not finished.', missing };
    r.full_report = clean; r.updated_at = new Date().toISOString();
    if (action === 'complete') { r.status = 'complete'; r.completed_at = r.completed_at || r.updated_at; if (kbEntryId) r.kb_entry_id = kbEntryId; }
    writeLocal(list); set({ reports: list });
    return { ok: true, report: r };
  }
  try {
    const out = await apiJson('/api/incidents', { method: 'POST', body: { id, action, full, kbEntryId } });
    replace(out.report);
    return { ok: true, report: out.report };
  } catch (e) {
    return { ok: false, message: e.message || 'Could not save.', missing: (e.body && e.body.missing) || [] };
  }
}

// Browser-side copy of the same completeness rules the server enforces, so the screen can say what is missing before it asks.
export { sanitizeFull as validateFull, blankFull, EVIDENCE_ITEMS, FACTOR_CATEGORIES, NOTIFY_ITEMS, KINDS } from '../shared/incidentFull.js';
