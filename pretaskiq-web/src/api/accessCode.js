// Tiny store behind the access-code dialog. The fetch wrapper asks for a code; the dialog (a React component) answers.
const KEY = 'pretaskiq_access_code';
const listeners = new Set();
const waiters = [];
let state = { open: false, wrong: false };

const set = (next) => { state = { ...state, ...next }; listeners.forEach((fn) => fn()); };

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getSnapshot = () => state;

// sessionStorage, not localStorage: the code is forgotten when the tab closes.
export function getStoredCode() { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } }
export function storeCode(code) { try { sessionStorage.setItem(KEY, code); } catch { /* private mode: just ask again next time */ } }
export function clearStoredCode() { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } }

// Opens the dialog and resolves with the typed code, or null if the person cancels.
// Several callers at once share one dialog and all get the same answer.
export function requestAccessCode({ wrong = false } = {}) {
  return new Promise((resolve) => { waiters.push(resolve); set({ open: true, wrong }); });
}

function finish(value) {
  set({ open: false, wrong: false });
  waiters.splice(0).forEach((resolve) => resolve(value));
}
export const submitAccessCode = (code) => finish(code.trim() || null);
export const cancelAccessCode = () => finish(null);
