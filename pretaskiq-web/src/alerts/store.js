// The safety inbox on the browser side. Raises alerts, keeps the list, and (for safety administrators) checks for new ones while the app is open.
// Alerts live in the database behind /api/alerts and are shown only inside the app: nothing is emailed, texted or pushed.
import { apiJson } from '../api/client.js';
import { getSnapshot as auth } from '../auth/session.js';

const POLL_MS = 30_000;
let state = { alerts: [], loaded: false, loading: false, error: '', scope: 'mine', dialogOpen: false, fresh: [] };   // fresh = alerts that arrived since the last look, for the banner
const listeners = new Set();
const set = (next) => { state = { ...state, ...next }; listeners.forEach((fn) => fn()); };
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getSnapshot = () => state;

export const enabled = () => { const a = auth(); return a.mode === 'supabase' && a.phase === 'signed_in'; };
export const isSafety = () => { const a = auth(); return enabled() && a.profile && a.profile.role === 'safety'; };
export const openCount = (s = state) => s.alerts.filter((a) => a.status === 'open').length;

let seen = new Set();          // ids already known, so only genuinely new alerts trigger the banner
let firstLoad = true;

export async function refresh() {
  if (!enabled()) return;
  if (state.loading) return;
  set({ loading: true });
  try {
    const out = await apiJson('/api/alerts');
    const alerts = out.alerts || [];
    const arrived = firstLoad ? [] : alerts.filter((a) => a.status === 'open' && !seen.has(a.id) && a.raised_by !== (auth().user && auth().user.id));
    firstLoad = false;
    alerts.forEach((a) => seen.add(a.id));
    set({ alerts, loaded: true, loading: false, error: '', scope: out.scope || 'mine', fresh: isSafety() && arrived.length ? [...arrived, ...state.fresh].slice(0, 5) : state.fresh });
  } catch (e) {
    set({ loading: false, error: e.message || 'Could not load alerts.' });
  }
}

// Raise an alert. Always resolves (never throws): { ok: true, alert } or { ok: false, message }.
export async function raise({ hazard, context, job, planId }) {
  if (!enabled()) return { ok: false, message: 'Not signed in.' };
  const body = { hazard, context, job, planId };
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {              // one quick retry for a dropped connection; a refusal from the server is not retried
    try {
      const out = await apiJson('/api/alerts', { method: 'POST', body });
      if (out && out.alert) { seen.add(out.alert.id); refresh(); }
      return { ok: true, alert: out.alert };
    } catch (e) {
      lastError = e;
      if (e.status && e.status !== 502 && e.status !== 503 && e.status !== 504) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return { ok: false, message: (lastError && lastError.message) || 'Could not reach the server.' };
}

export async function acknowledge(id) {
  try {
    const out = await apiJson('/api/alerts', { method: 'POST', body: { id, action: 'acknowledge' } });
    set({ alerts: state.alerts.map((a) => (a.id === id ? out.alert : a)), error: '' });
    return { ok: true };
  } catch (e) {
    set({ error: e.message || 'Could not acknowledge.' });
    return { ok: false, message: e.message };
  }
}

export const openDialog = () => { set({ dialogOpen: true, fresh: [] }); refresh(); };
export const closeDialog = () => set({ dialogOpen: false });
export const dismissFresh = () => set({ fresh: [] });

// Safety administrators: look for new alerts every 30 seconds while the app is open and visible, and as soon as the tab comes back.
let timer = null;
const onVisible = () => { if (!document.hidden) refresh(); };
export function startWatching() {
  if (timer) return;
  refresh();
  timer = setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
  document.addEventListener('visibilitychange', onVisible);
}
export function stopWatching() {
  if (timer) { clearInterval(timer); timer = null; document.removeEventListener('visibilitychange', onVisible); }
}
// Forget everything when someone signs out, so the next person never sees the last person's alerts.
export function reset() { stopWatching(); seen = new Set(); firstLoad = true; set({ alerts: [], loaded: false, loading: false, error: '', scope: 'mine', dialogOpen: false, fresh: [] }); }
