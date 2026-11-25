// The Team screen (company administrators) and the Companies screen (platform owner). Both are small stores that React reads.
import { apiJson } from '../api/client.js';

let state = { team: null, companies: null, loading: false, error: '', busy: false, teamOpen: false, companiesOpen: false };
const listeners = new Set();
const set = (next) => { state = { ...state, ...next }; listeners.forEach((fn) => fn()); };
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getSnapshot = () => state;

export const openTeam = () => { set({ teamOpen: true, error: '' }); loadTeam(); };
export const closeTeam = () => set({ teamOpen: false });
export const openCompanies = () => { set({ companiesOpen: true, error: '' }); loadCompanies(); };
export const closeCompanies = () => set({ companiesOpen: false });

async function run(fn) {
  set({ busy: true, error: '' });
  try { return { ok: true, out: await fn() }; }
  catch (e) { set({ error: e.message || 'Something went wrong.' }); return { ok: false, message: e.message }; }
  finally { set({ busy: false }); }
}

export async function loadTeam() {
  try { set({ team: await apiJson('/api/company'), error: '' }); } catch (e) { set({ error: e.message }); }
}
export async function addMember({ email, displayName, role }) {
  const r = await run(() => apiJson('/api/company', { method: 'POST', body: { action: 'add_member', email, displayName, role } }));
  if (r.ok) await loadTeam();
  return r;
}
export async function setActive(id, active) {
  const r = await run(() => apiJson('/api/company', { method: 'POST', body: { action: 'set_active', id, active } }));
  if (r.ok) await loadTeam();
  return r;
}
export async function loadCompanies() {
  try { set({ companies: (await apiJson('/api/owner')).companies, error: '' }); } catch (e) { set({ error: e.message }); }
}
export async function createCompany(body) {
  const r = await run(() => apiJson('/api/owner', { method: 'POST', body: { action: 'create_company', ...body } }));
  if (r.ok) await loadCompanies();
  return r;
}
export async function updateCompany(id, patch) {
  const r = await run(() => apiJson('/api/owner', { method: 'POST', body: { action: 'update_company', id, ...patch } }));
  if (r.ok) await loadCompanies();
  return r;
}
