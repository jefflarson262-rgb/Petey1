// Who is signed in. A tiny store (subscribe / getSnapshot) that React reads, plus the sign-in actions.
//
// Phases:
//   loading        asking the server how sign-in is set up
//   code           old mode: no Supabase on the server, a shared access code is used instead (no accounts)
//   misconfigured  Supabase settings are only partly filled in on the server
//   signed_out     show the sign-in form
//   signed_in      signed in and approved; `profile.role` says which views they get
//   error          the server or database could not be reached; "Try again" is shown
import { createClient } from '@supabase/supabase-js';
import { nativeFetch } from '../api/nativeFetch.js';

const ROLE_VIEWS = { foreman: ['foreman'], construction: ['foreman', 'construction'], safety: ['foreman', 'safety', 'construction'] };
export const allowedViews = (role) => ROLE_VIEWS[role] || ['foreman'];

const LOCAL_KEYS_TO_CLEAR = ['pretaskiq_sync_queue', 'jha_signatures'];
const LOCAL_PREFIXES_TO_CLEAR = ['pretaskiq_jha_cache_'];

let state = { phase: 'loading', mode: null, user: null, profile: null, notice: '', error: '', missing: [], problem: '' };
const listeners = new Set();
const set = (next) => { state = { ...state, ...next }; listeners.forEach((fn) => fn()); };
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getSnapshot = () => state;
export const getMode = () => state.mode;

let supabase = null;
let started = null;
let signingOut = false;      // a deliberate sign-out is in progress (the page reloads at the end, so no "you were signed out" flash)
let expiredUserId = null;   // who was signed in when the session ran out (a different person signing in then forces a reload)

function clearDeviceData() {
  try {
    for (const k of LOCAL_KEYS_TO_CLEAR) localStorage.removeItem(k);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && LOCAL_PREFIXES_TO_CLEAR.some((p) => k.startsWith(p))) localStorage.removeItem(k);
    }
  } catch { /* storage blocked: nothing to clear */ }
}

export function initAuth() {
  if (!started) started = start();
  return started;
}

async function start() {
  let cfg;
  try {
    const res = await nativeFetch('/api/config');   // (no Accept header on purpose: a plain static server then falls back to the page, which we read as "no server functions")
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) throw new Error('no config');
    cfg = await res.json();
  } catch {
    // No server functions here (for example `npm run preview`): behave like the old shared-code mode.
    set({ phase: 'code', mode: 'code' });
    return;
  }
  if (cfg.auth === 'misconfigured') { set({ phase: 'misconfigured', mode: 'supabase', missing: cfg.missing || [], problem: cfg.problem || '' }); return; }
  if (cfg.auth !== 'supabase' || !cfg.supabaseUrl || !cfg.publishableKey) { set({ phase: 'code', mode: 'code' }); return; }

  supabase = createClient(cfg.supabaseUrl, cfg.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  set({ mode: 'supabase' });
  // Keep this callback synchronous: calling other Supabase functions inside it can deadlock (see the supabase-js docs).
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' && state.phase === 'signed_in' && !signingOut) set({ phase: 'signed_out', notice: 'You were signed out. Sign in again to continue.', user: null, profile: null });
  });

  const { data } = await supabase.auth.getSession();
  if (!data || !data.session) { set({ phase: 'signed_out' }); return; }
  await loadProfile(data.session.access_token);
}

async function loadProfile(token) {
  let res;
  try { res = await nativeFetch('/api/me', { headers: { accept: 'application/json', Authorization: `Bearer ${token}` } }); }
  catch { set({ phase: 'error', error: 'Could not reach the server. Check your connection and try again.' }); return { ok: false };   }
  let body = null; try { body = await res.json(); } catch { /* not json */ }
  const code = body && typeof body.error === 'string' ? body.error : '';

  if (res.ok && body && body.profile) {
    if (expiredUserId && body.user && body.user.id !== expiredUserId) { location.reload(); return { ok: true }; }   // a different person: start clean
    expiredUserId = null;
    set({ phase: 'signed_in', user: body.user, profile: body.profile, notice: '', error: '' });
    return { ok: true };
  }
  if (res.status === 401) { await localSignOut(); set({ phase: 'signed_out', notice: 'Your session expired. Sign in again.' }); return { ok: false, message: 'Your session expired. Sign in again.' }; }
  if (res.status === 403 && code === 'not_approved') {
    const message = 'Your account has not been approved yet. Ask your administrator to approve it, then sign in again.';
    await localSignOut(); set({ phase: 'signed_out', notice: '' });
    return { ok: false, message };
  }
  if (code === 'supabase_misconfigured') { set({ phase: 'misconfigured', missing: (body && body.missing) || [], problem: (body && body.problem) || '' }); return { ok: false }; }
  const hint = body && body.hint ? ` (${String(body.hint).replace(/_/g, ' ')})` : '';
  set({ phase: 'error', error: code === 'database_error' ? `The database is not ready${hint}. Open /api/health to see what needs fixing.` : `The server answered with an error (${res.status}). Try again in a moment.` });
  return { ok: false };
}

export async function retryAuth() {
  set({ phase: 'loading', error: '' });
  started = null;
  return initAuth();
}

const friendlySignInError = (error) => {
  const text = `${error.code || ''} ${error.message || ''}`;
  if (/invalid[_ ]login[_ ]credentials|invalid_credentials/i.test(text)) return 'That email and password did not match. Check them and try again.';
  if (/email[_ ]not[_ ]confirmed/i.test(text)) return 'This email address has not been confirmed yet. Ask your administrator.';
  if (/rate|too many/i.test(text)) return 'Too many attempts. Wait a few minutes, then try again.';
  if (/fetch|network|retryable/i.test(text)) return 'Could not reach the sign-in service. Check your connection and try again.';
  return `Could not sign in. ${error.message || ''}`.trim();
};

// Resolves with nothing on success; throws an Error whose message is safe to show on the sign-in form.
export async function signIn(email, password) {
  if (!supabase) throw new Error('Sign-in is not available right now.');
  const { data, error } = await supabase.auth.signInWithPassword({ email: String(email).trim(), password });
  if (error || !data || !data.session) throw new Error(error ? friendlySignInError(error) : 'Could not sign in.');
  const result = await loadProfile(data.session.access_token);
  if (!result.ok && result.message) throw new Error(result.message);
}

export async function getAccessToken() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();   // refreshes an expired token on the way
    return data && data.session ? data.session.access_token : null;
  } catch { return null; }
}

async function localSignOut() {
  try { if (supabase) await supabase.auth.signOut({ scope: 'local' }); } catch { /* already gone */ }
}

// The server says our token no longer works. Show the sign-in form over the app WITHOUT reloading, so a plan in progress survives.
export function handleSessionExpired() {
  if (state.phase !== 'signed_in') return;
  expiredUserId = state.user ? state.user.id : null;
  localSignOut();
  set({ phase: 'signed_out', notice: 'Your session expired. Sign in again; your plan on screen is kept.', user: null, profile: null });
}

// A deliberate sign-out: clear this device's saved plans and reload, so nothing carries over to the next person.
export async function signOut() {
  signingOut = true;
  clearDeviceData();
  await localSignOut();
  clearDeviceData();   // once more, in case anything was written while signing out
  location.reload();
}
