// The saved knowledge base on the browser side. The prototype's scripts keep the entries in one list (window.projectKnowledgeBase) and every part of
// Petey reads that list, so this file's job is to fill that same list from the database, and to save, change and remove entries there.
// Not signed in (shared-code mode): nothing here runs, entries stay in the tab only, and the screen says so.
import { apiJson } from '../api/client.js';
import { getSnapshot as auth } from '../auth/session.js';
import { syncApproved } from '../reenact/register.js';

const POLL_MS = 60_000;
let canWrite = [];
let lastLoad = 0, loading = null, timer = null;

export const enabled = () => { const a = auth(); return a.mode === 'supabase' && a.phase === 'signed_in'; };
const list = () => (window.projectKnowledgeBase = window.projectKnowledgeBase || []);
// Every change to the list also refreshes which approved reenactments crews can play.
const repaint = () => { try { syncApproved(list()); } catch { /* never block the list on this */ } try { if (typeof window.renderKbEntries === 'function') window.renderKbEntries(); } catch { /* settings box not open */ } };

// Turn a database row into the entry object the rest of the app already understands.
const fromRow = (r) => ({ ...(r.data || {}), kbType: r.kb_type, title: r.title, status: 'ready', dbId: r.id, savedBy: r.created_by_name || '', saveState: 'saved' });
// What goes into the database: the entry without the bookkeeping fields that only mean something in this tab.
const toData = (e) => { const { dbId, saveState, saveError, savedBy, ...rest } = e; return rest; };

export const resync = () => repaint();
export const mayWrite = (kbType) => canWrite.includes(kbType);
export const mayEdit = (entry) => !!(entry && entry.dbId && mayWrite(entry.kbType));

// Replace what the database knows about, keep anything still being parsed or not saved yet.
function merge(rows) {
  const arr = list();
  const local = arr.filter((e) => !e.dbId);
  const next = [...rows.map(fromRow), ...local];
  arr.splice(0, arr.length, ...next);
}

export async function refresh() {
  if (!enabled()) return false;
  if (loading) return loading;
  loading = (async () => {
    try {
      const out = await apiJson('/api/kb');
      canWrite = out.canWrite || [];
      merge(out.entries || []);
      lastLoad = Date.now(); repaint(); return true;
    } catch { return false; } finally { loading = null; }
  })();
  return loading;
}

// Called before a planning conversation asks the AI, so a drawing revision uploaded a minute ago is never missed. Never holds the conversation up for long.
export async function ensureFresh(maxAgeMs = 10_000) {
  if (!enabled() || Date.now() - lastLoad < maxAgeMs) return;
  await Promise.race([refresh(), new Promise((r) => setTimeout(r, 3000))]);
}

// Save a finished entry (new, or changed since it was last saved). Never throws; the entry carries the result in saveState.
export async function save(entry) {
  if (!entry) return;
  if (!enabled()) { entry.saveState = 'session'; repaint(); return; }
  entry.saveState = 'saving'; entry.saveError = ''; repaint();
  try {
    const body = entry.dbId
      ? { id: entry.dbId, entry: { title: entry.title, data: toData(entry) } }
      : { entry: { kbType: entry.kbType || 'drawings', title: entry.title, data: toData(entry) }, clientKey: String(entry.id || '') };
    const out = await apiJson('/api/kb', { method: 'POST', body });
    entry.dbId = out.entry.id;
    if (out.entry.data && out.entry.data.reenactment) entry.reenactment = out.entry.data.reenactment;     // the server's stamped, cleaned copy (who approved it, when)
    entry.savedBy = out.entry.created_by_name || ''; entry.saveState = 'saved';
  } catch (e) {
    entry.saveState = 'failed'; entry.saveError = (e && e.message) || 'Could not reach the server.';
  }
  repaint();
}

export async function remove(dbId) {
  try {
    await apiJson('/api/kb', { method: 'POST', body: { id: dbId, action: 'archive' } });
    const arr = list(); const i = arr.findIndex((e) => e.dbId === dbId); if (i >= 0) arr.splice(i, 1);
    repaint(); return { ok: true };
  } catch (e) { return { ok: false, message: (e && e.message) || 'Could not remove it.' }; }
}

export const retry = (id) => { const e = list().find((x) => String(x.id) === String(id) && !x.dbId); return e ? save(e) : undefined; };

const onVisible = () => { if (!document.hidden) refresh(); };
export function startWatching() {
  if (timer) return;
  refresh();
  timer = setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
  document.addEventListener('visibilitychange', onVisible);
}
export function stopWatching() { if (timer) { clearInterval(timer); timer = null; document.removeEventListener('visibilitychange', onVisible); } }
// Signing out: take the shared entries off the screen so the next person on this device does not see them before they sign in.
export function reset() {
  stopWatching(); canWrite = []; lastLoad = 0;
  const arr = list(); const keep = arr.filter((e) => !e.dbId); arr.splice(0, arr.length, ...keep); repaint();
}
