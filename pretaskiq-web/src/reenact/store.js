// State of the reenactment screen: drafting a storyboard from an incident, and the Safety Admin's review and approval.
// Nothing becomes visible to crews until approve() saves it; the shared registry then makes it playable (see register.js).
import { sourceFor, buildUserPrompt, SYSTEM, parseDraft } from './draft.js';
import { sanitizeStoryboard } from '../shared/storyboard.js';
import { registerPreview } from './register.js';
import { getSnapshot as auth } from '../auth/session.js';

let state = { open: false, phase: 'idle', entry: null, draft: null, reason: '', error: '', unknownsOk: false, watched: false, busy: false };
const subs = new Set();
const set = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f()); };
export const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const getSnapshot = () => state;

const kb = () => window.PreTaskIQKb;
const findEntry = (id) => (window.projectKnowledgeBase || []).find((e) => String(e.id) === String(id) || e.dbId === id);

export function openFor(id) {
  const entry = findEntry(id);
  if (!entry || !kb() || !kb().mayEdit(entry) || entry.kbType !== 'incident') return false;
  const existing = entry.reenactment && entry.reenactment.storyboard;
  set({ open: true, entry, error: '', reason: '', busy: false, unknownsOk: false, watched: false,
    draft: existing ? structuredClone(existing) : null, phase: existing ? 'review' : 'start' });
  return true;
}
export function close() { set({ open: false, phase: 'idle', entry: null, draft: null, busy: false }); }

// One AI call. Too little text in the record: say so without calling the AI.
export async function generate() {
  const entry = state.entry; if (!entry) return;
  const src = sourceFor(entry);
  if (src.thin) { set({ phase: 'insufficient', reason: 'This record is too short to draw from. Add the written account of what happened (or upload the full report) and try again.' }); return; }
  set({ phase: 'drafting', error: '', reason: '' });
  try {
    const text = await window.callClaude({ system: SYSTEM, messages: [{ role: 'user', content: buildUserPrompt(entry) }], maxTokens: 3500 });
    if (state.entry !== entry || state.phase !== 'drafting') return;       // closed or restarted meanwhile
    const r = parseDraft(text);
    if (r.ok) set({ phase: 'review', draft: r.storyboard, unknownsOk: false, watched: false });
    else if (r.insufficient) set({ phase: 'insufficient', reason: r.reason });
    else set({ phase: 'start', error: r.error });
  } catch (e) {
    if (state.entry === entry) set({ phase: 'start', error: (e && e.message) || 'Could not reach the AI. Try again.' });
  }
}

// Edits from the review screen. The result is re-checked by the same gate the server uses.
export function edit(mutator) {
  const copy = structuredClone(state.draft); mutator(copy);
  set({ draft: copy, watched: false });          // the picture changed, so it has to be watched again
}
export const setUnknownsOk = (v) => set({ unknownsOk: !!v });

export function preview() {
  if (!state.draft) return false;
  const clean = sanitizeStoryboard(state.draft);
  if (!clean.ok) { set({ error: clean.reason }); return false; }
  if (!registerPreview(clean.storyboard, {})) return false;
  if (typeof window.openReenactment === 'function') window.openReenactment('__preview');
  set({ watched: true, error: '' });
  return true;
}

export async function approve() {
  const entry = state.entry; if (!entry || !state.draft) return;
  const clean = sanitizeStoryboard(state.draft);
  if (!clean.ok) { set({ error: clean.reason }); return; }
  if (!state.watched) { set({ error: 'Watch the preview first. You approve what you have seen.' }); return; }
  if (clean.storyboard.unknowns.length && !state.unknownsOk) { set({ error: 'Please confirm you have checked the replay against the record.' }); return; }
  const p = auth().profile || {};
  const previous = entry.reenactment;
  entry.reenactment = { status: 'approved', storyboard: clean.storyboard, approvedBy: p.display_name || '', approvedAt: new Date().toISOString() };
  set({ busy: true, error: '' });
  await kb().save(entry);
  if (entry.saveState === 'saved') { close(); return; }
  entry.reenactment = previous; if (!previous) delete entry.reenactment;      // not saved: do not pretend it is live
  kb().resync && kb().resync();
  set({ busy: false, error: 'Not saved: ' + (entry.saveError || 'no connection') + '. Nothing was published. Try again.' });
}

export async function removeReplay() {
  const entry = state.entry; if (!entry) return;
  const previous = entry.reenactment; delete entry.reenactment;
  set({ busy: true, error: '' });
  await kb().save(entry);
  if (entry.saveState === 'saved') { close(); return; }
  entry.reenactment = previous; kb().resync && kb().resync();
  set({ busy: false, error: 'Not removed: ' + (entry.saveError || 'no connection') + '. Try again.' });
}
