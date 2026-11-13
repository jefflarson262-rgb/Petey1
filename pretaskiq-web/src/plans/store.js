// Saved plans. Remembers which saved plan is on screen, and saves changes to it through /api/plans.
// Saves run one at a time, in the order they were asked for, so a slow save can never overwrite a newer one.
import { apiJson } from '../api/client.js';
import { getSnapshot as auth } from '../auth/session.js';

let state = { status: 'idle', planId: null, revision: null, savedAt: 0, error: '', canRetry: false };
const listeners = new Set();
const set = (next) => { state = { ...state, ...next }; listeners.forEach((fn) => fn()); };
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getSnapshot = () => state;

export const enabled = () => { const a = auth(); return a.mode === 'supabase' && a.phase === 'signed_in'; };

let queue = Promise.resolve();
let failed = null;   // the last save that did not go through, so "Try again" can repeat it

const copy = (data) => JSON.parse(JSON.stringify(data));   // plans are plain JSON; copying freezes what is saved at this moment

async function run(job) {
  const { data, source, note, continues } = job;
  if (source === 'planning' && !continues) set({ planId: null, revision: null });   // a freshly generated plan is always a new plan (unless this save is only recording that it was submitted)
  set({ status: 'saving', error: '', canRetry: false });
  try {
    const out = await apiJson('/api/plans', { method: 'POST', body: { id: state.planId || undefined, data, source, note } });
    failed = null;
    set({ status: 'saved', planId: out.plan.id, revision: out.plan.current_revision, savedAt: Date.now(), error: '', canRetry: false });
    return out.plan;
  } catch (e) {
    failed = job;
    const retryable = !(e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 401);
    set({ status: 'error', error: e.message || 'Could not save.', canRetry: retryable });
    return null;
  }
}

export function savePlan(data, { source = 'edit', note = '', continues = false } = {}) {
  if (!enabled() || !data) return Promise.resolve(null);
  const job = { data: copy(data), source, note, continues };
  const result = queue.then(() => run(job));
  queue = result;   // run() never throws
  return result;
}

export const retrySave = () => (failed ? savePlan(failed.data, failed) : Promise.resolve(null));

// May this person change this saved plan? (The server decides for real; this only decides whether to offer the Submit button.)
// A foreman changes only their own plans, a safety administrator changes all, a construction administrator only their own.
export const canWrite = (rec) => {
  const a = auth();
  if (!rec || a.mode !== 'supabase' || a.phase !== 'signed_in') return true;
  return rec.created_by === (a.user && a.user.id) || (a.profile && a.profile.role) === 'safety';
};

// The plan on screen is a different one, or none that is saved.
export const markNone = () => { if (state.planId || state.status !== 'idle') { failed = null; set({ status: 'idle', planId: null, revision: null, error: '', canRetry: false }); } };
// The plan on screen is saved plan `id`.
export const markOpened = (id, revision) => { failed = null; set({ status: 'idle', planId: id, revision: revision || null, error: '', canRetry: false }); };

export async function listPlans() { return (await apiJson('/api/plans')).plans || []; }
export async function getPlan(id) { return (await apiJson(`/api/plans?id=${encodeURIComponent(id)}`)).plan; }
export async function getRevisions(id) { return (await apiJson(`/api/plans?id=${encodeURIComponent(id)}&revisions=1`)).revisions || []; }
