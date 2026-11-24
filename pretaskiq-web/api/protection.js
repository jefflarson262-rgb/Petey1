// Protection observations: verify that the required controls are in place, scored as found.
//   GET  /api/protection?what=checklists    approved checklists (everyone signed in and approved); safety administrators also see drafts
//   GET  /api/protection?what=summary       safety only: category averages, most-missed controls, N/A rate, monthly trend (aggregates only)
//   POST { checklist: { category, label, controls, sourceNote } }          safety: save a DRAFT checklist for a category (replaces that category's draft)
//   POST { id, action: 'approve' | 'discard' }                              safety: approve a draft (it replaces the live one) or discard it
//   POST { observation: { category, answers: [{ id, applies, present, works }] }, clientKey? }   anyone approved: record an observation
// Observations are stored without a name. The observer's id is kept only for double-tap protection and a rate limit and is never returned.
import { requireUser } from '../server/auth.js';
import { dbError } from '../server/supabase.js';
import { HttpError, send, handle, readJson } from '../server/http.js';
import { cleanChecklist, summarize } from '../src/shared/protection.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CL_COLUMNS = 'id,category,label,controls,status,source_note,approved_at,created_at,updated_at';
const PER_HOUR = 60;
const text = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const slug = (v) => text(v, 40).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');

export default handle(async (req, res) => {
  const method = req.method;
  if (method !== 'GET' && method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const me = await requireUser(req);
  const { admin } = me;
  const isSafety = me.profile.role === 'safety';

  if (method === 'GET') {
    const what = (req.query && req.query.what) || new URL(req.url, 'http://x').searchParams.get('what') || 'checklists';
    if (what === 'summary') {
      if (!isSafety) throw new HttpError(403, 'wrong_role');
      const { data, error } = await admin.from('protection_observations').select('category,month,controls').order('created_at', { ascending: false }).limit(5000);
      if (error) throw dbError(error);
      return send(res, 200, { summary: summarize(data || []), capped: (data || []).length >= 5000 });
    }
    let q = admin.from('protection_checklists').select(CL_COLUMNS).is('archived_at', null).order('label', { ascending: true });
    if (!isSafety) q = q.eq('status', 'approved');
    const { data, error } = await q;
    if (error) throw dbError(error);
    return send(res, 200, { checklists: data || [] });
  }

  const body = await readJson(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_body');

  // Safety administrators: draft, approve or discard a checklist
  if (body.checklist !== undefined || body.id !== undefined) {
    if (!isSafety) throw new HttpError(403, 'wrong_role');
    if (body.checklist !== undefined) {
      const c = cleanChecklist({ ...body.checklist, category: slug(body.checklist && body.checklist.category) });
      const label = text(body.checklist && body.checklist.label, 100);
      if (!c.category || !label || !c.controls.length) throw new HttpError(400, 'invalid_checklist');
      if (!c.controls.some((x) => x.kind === 'prevention') && !c.controls.some((x) => x.kind === 'mitigation')) throw new HttpError(400, 'invalid_checklist');
      const row = { category: c.category, label, controls: c.controls, source_note: text(body.checklist.sourceNote, 200) || null, updated_at: new Date().toISOString() };
      const { data: existing, error: ee } = await admin.from('protection_checklists').select('id').eq('category', c.category).eq('status', 'draft').is('archived_at', null).maybeSingle();
      if (ee) throw dbError(ee);
      const q = existing ? admin.from('protection_checklists').update(row).eq('id', existing.id) : admin.from('protection_checklists').insert({ ...row, created_by: me.user.id });
      const { data, error } = await q.select(CL_COLUMNS).single();
      if (error) throw dbError(error);
      return send(res, existing ? 200 : 201, { checklist: data });
    }
    if (typeof body.id !== 'string' || !UUID.test(body.id)) throw new HttpError(404, 'checklist_not_found');
    if (body.action !== 'approve' && body.action !== 'discard') throw new HttpError(400, 'invalid_action');
    const { data: found, error } = await admin.from('protection_checklists').select('id,category,status').eq('id', body.id).is('archived_at', null).maybeSingle();
    if (error) throw dbError(error);
    if (!found) throw new HttpError(404, 'checklist_not_found');
    const now = new Date().toISOString();
    if (body.action === 'discard') {
      if (found.status !== 'draft') throw new HttpError(400, 'not_a_draft');
      const { error: e1 } = await admin.from('protection_checklists').update({ archived_at: now }).eq('id', found.id);
      if (e1) throw dbError(e1);
      return send(res, 200, { ok: true });
    }
    if (found.status !== 'draft') throw new HttpError(400, 'not_a_draft');
    const { error: e2 } = await admin.from('protection_checklists').update({ archived_at: now }).eq('category', found.category).eq('status', 'approved').is('archived_at', null);
    if (e2) throw dbError(e2);
    const { data: after, error: e3 } = await admin.from('protection_checklists').update({ status: 'approved', approved_by: me.user.id, approved_at: now, updated_at: now }).eq('id', found.id).select(CL_COLUMNS).single();
    if (e3) throw dbError(e3);
    return send(res, 200, { checklist: after });
  }

  // Record an observation, checked against the approved checklist for its category
  const o = body.observation;
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new HttpError(400, 'invalid_observation');
  const category = slug(o.category);
  const { data: cl, error: ce } = await admin.from('protection_checklists').select('id,controls').eq('category', category).eq('status', 'approved').is('archived_at', null).maybeSingle();
  if (ce) throw dbError(ce);
  if (!cl) throw new HttpError(404, 'no_approved_checklist');
  const answers = new Map();
  for (const a of Array.isArray(o.answers) ? o.answers : []) {
    if (!a || typeof a.id !== 'string' || answers.has(a.id)) throw new HttpError(400, 'invalid_observation');
    if (typeof a.applies !== 'boolean') throw new HttpError(400, 'invalid_observation');
    answers.set(a.id, a);
  }
  const ids = new Set(cl.controls.map((c) => c.id));
  if (answers.size !== ids.size || [...answers.keys()].some((k) => !ids.has(k))) throw new HttpError(400, 'invalid_observation', { message: 'Answer every control on the checklist.' });
  const controls = cl.controls.map((c) => { const a = answers.get(c.id); const applies = a.applies; return { id: c.id, kind: c.kind, applies, present: applies && a.present === true, works: applies && a.present === true && a.works === true }; });
  const clientKey = text(body.clientKey === undefined ? '' : String(body.clientKey), 80) || null;
  if (clientKey) {
    const { data: dupe, error: de } = await admin.from('protection_observations').select('id').eq('created_by', me.user.id).eq('client_key', clientKey).maybeSingle();
    if (de) throw dbError(de);
    if (dupe) return send(res, 200, { ok: true, duplicate: true });
  }
  const since = new Date(Date.now() - 3600e3).toISOString();
  const { data: recent, error: re } = await admin.from('protection_observations').select('id').eq('created_by', me.user.id).gte('created_at', since).limit(PER_HOUR);
  if (re) throw dbError(re);
  if ((recent || []).length >= PER_HOUR) throw new HttpError(429, 'rate_limited', { message: `Limit of ${PER_HOUR} observations per hour reached.` });
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const { error } = await admin.from('protection_observations').insert({ category, checklist_id: cl.id, month, controls, created_by: me.user.id, client_key: clientKey });
  if (error) throw dbError(error);
  return send(res, 201, { ok: true });
});
