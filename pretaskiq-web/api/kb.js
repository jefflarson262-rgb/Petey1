// The company knowledge base (incident reports, RCAs, policies, procedures, revised drawings), saved so it survives a reload and is the same for everyone.
//   GET  /api/kb                                         every live entry (any signed-in, approved person)
//   POST /api/kb  { entry: { kbType, title, data }, clientKey? }   add one (safety: any kind; construction: drawings only). Same clientKey twice = one entry.
//   POST /api/kb  { id, entry: { title, data } }                    change one
//   POST /api/kb  { id, action: 'archive' }                        remove one from the list (kept in the database)
import { requireUser } from '../server/auth.js';
import { dbError } from '../server/supabase.js';
import { HttpError, send, handle, readJson } from '../server/http.js';

export const KB_TYPES = ['drawings', 'incident', 'rca', 'policy', 'procedure'];
const MAY_WRITE = { safety: KB_TYPES, construction: ['drawings'] };
const MAX_DATA_CHARS = 150_000;
const COLUMNS = 'id,kb_type,title,data,created_by_name,created_at,updated_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function checkData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'invalid_entry');
  if (data.status && data.status !== 'ready') throw new HttpError(400, 'invalid_entry');     // only finished entries are saved
  if (JSON.stringify(data).length > MAX_DATA_CHARS) throw new HttpError(413, 'entry_too_large');
}
function mayWrite(profile, kbType) { return (MAY_WRITE[profile.role] || []).includes(kbType); }

export default handle(async (req, res) => {
  const method = req.method;
  if (method !== 'GET' && method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const me = await requireUser(req);
  const { admin } = me;

  if (method === 'GET') {
    const { data, error } = await admin.from('kb_entries').select(COLUMNS).is('archived_at', null).order('created_at', { ascending: true }).limit(1000);
    if (error) throw dbError(error);
    return send(res, 200, { entries: data || [], canWrite: MAY_WRITE[me.profile.role] || [] });
  }

  const body = await readJson(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_body');

  // Change or remove an existing entry
  if (body.id !== undefined) {
    if (typeof body.id !== 'string' || !UUID.test(body.id)) throw new HttpError(404, 'entry_not_found');
    const { data: found, error } = await admin.from('kb_entries').select('id,kb_type,archived_at').eq('id', body.id).maybeSingle();
    if (error) throw dbError(error);
    if (!found || found.archived_at) throw new HttpError(404, 'entry_not_found');
    if (!mayWrite(me.profile, found.kb_type)) throw new HttpError(403, 'wrong_role');
    if (body.action === 'archive') {
      const { error: e2 } = await admin.from('kb_entries').update({ archived_at: new Date().toISOString(), archived_by: me.user.id }).eq('id', found.id);
      if (e2) throw dbError(e2);
      return send(res, 200, { ok: true });
    }
    if (!body.entry || typeof body.entry !== 'object') throw new HttpError(400, 'invalid_entry');
    checkData(body.entry.data);
    const patch = { data: body.entry.data, updated_at: new Date().toISOString() };
    const title = clean(body.entry.title, 200); if (title) patch.title = title;
    const { data: after, error: e3 } = await admin.from('kb_entries').update(patch).eq('id', found.id).select(COLUMNS).single();
    if (e3) throw dbError(e3);
    return send(res, 200, { entry: after });
  }

  // Add one
  const e = body.entry;
  if (!e || typeof e !== 'object' || Array.isArray(e)) throw new HttpError(400, 'invalid_entry');
  if (!KB_TYPES.includes(e.kbType)) throw new HttpError(400, 'invalid_entry');
  if (!mayWrite(me.profile, e.kbType)) throw new HttpError(403, 'wrong_role');
  checkData(e.data);
  const clientKey = clean(body.clientKey === undefined ? '' : String(body.clientKey), 80) || null;
  if (clientKey) {
    const { data: dupe, error: de } = await admin.from('kb_entries').select(COLUMNS).eq('created_by', me.user.id).eq('client_key', clientKey).maybeSingle();
    if (de) throw dbError(de);
    if (dupe) return send(res, 200, { entry: dupe, duplicate: true });
  }
  const { data, error } = await admin.from('kb_entries').insert({
    kb_type: e.kbType, title: clean(e.title, 200) || 'Untitled', data: e.data, client_key: clientKey,
    created_by: me.user.id, created_by_name: me.profile.display_name || me.user.email || null,
  }).select(COLUMNS).single();
  if (error) throw dbError(error);
  return send(res, 201, { entry: data });
});
