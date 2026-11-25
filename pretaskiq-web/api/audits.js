// Safety audits: customizable pass/fail checklists, with a required comment on every failed item and optional photos.
//   GET  /api/audits?what=templates          live templates (everyone signed in and approved)
//   GET  /api/audits?what=audits             audit list WITHOUT photos: safety sees all, everyone else only their own
//   GET  /api/audits?id=<uuid>               one audit WITH photos (safety, or the person who ran it)
//   POST { template: { id?, title, description, items } }       safety: create a template, or update it when id is given
//   POST { id, action: 'archive' }                               safety: retire a template
//   POST { audit: { templateId, location, answers }, clientKey? } anyone approved: submit an audit; refused (400, with "missing") unless every item is answered and every Fail has a comment
import { requireUser } from '../server/auth.js';
import { dbError } from '../server/supabase.js';
import { HttpError, send, handle, readJson } from '../server/http.js';
import { cleanTemplate, checkAudit } from '../src/shared/audit.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TPL_COLUMNS = 'id,title,description,items,created_at,updated_at';
const LIST_COLUMNS = 'id,template_id,template_title,location,pass_count,fail_count,na_count,score,created_by,created_by_name,created_at';
const PER_HOUR = 30;
const text = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export default handle(async (req, res) => {
  const method = req.method;
  if (method !== 'GET' && method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const me = await requireUser(req, { feature: 'audits' });
  const admin = me.db;   // this company's data only
  const isSafety = me.profile.role === 'safety';

  if (method === 'GET') {
    const params = (req.query && Object.keys(req.query).length) ? req.query : Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    if (params.id !== undefined) {
      if (typeof params.id !== 'string' || !UUID.test(params.id)) throw new HttpError(404, 'audit_not_found');
      const { data, error } = await admin.from('audits').select(LIST_COLUMNS + ',answers').eq('id', params.id).maybeSingle();
      if (error) throw dbError(error);
      if (!data || (!isSafety && data.created_by !== me.user.id)) throw new HttpError(404, 'audit_not_found');
      return send(res, 200, { audit: data });
    }
    if (params.what === 'audits') {
      let q = admin.from('audits').select(LIST_COLUMNS).order('created_at', { ascending: false }).limit(200);
      if (!isSafety) q = q.eq('created_by', me.user.id);
      const { data, error } = await q;
      if (error) throw dbError(error);
      return send(res, 200, { audits: data || [], scope: isSafety ? 'all' : 'mine' });
    }
    const { data, error } = await admin.from('audit_templates').select(TPL_COLUMNS).is('archived_at', null).order('title', { ascending: true });
    if (error) throw dbError(error);
    return send(res, 200, { templates: data || [] });
  }

  const body = await readJson(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_body');

  // Safety administrators: create, update or retire a template
  if (body.template !== undefined || body.id !== undefined) {
    if (!isSafety) throw new HttpError(403, 'wrong_role');
    if (body.template !== undefined) {
      const t = cleanTemplate(body.template);
      if (!t.title || !t.items.length) throw new HttpError(400, 'invalid_template');
      const row = { title: t.title, description: t.description || null, items: t.items, updated_at: new Date().toISOString() };
      const tid = body.template && body.template.id;
      if (tid !== undefined) {
        if (typeof tid !== 'string' || !UUID.test(tid)) throw new HttpError(404, 'template_not_found');
        const { data: found, error: fe } = await admin.from('audit_templates').select('id').eq('id', tid).is('archived_at', null).maybeSingle();
        if (fe) throw dbError(fe);
        if (!found) throw new HttpError(404, 'template_not_found');
        const { data, error } = await admin.from('audit_templates').update(row).eq('id', tid).select(TPL_COLUMNS).single();
        if (error) throw dbError(error);
        return send(res, 200, { template: data });
      }
      const { data, error } = await admin.from('audit_templates').insert({ ...row, created_by: me.user.id }).select(TPL_COLUMNS).single();
      if (error) throw dbError(error);
      return send(res, 201, { template: data });
    }
    if (typeof body.id !== 'string' || !UUID.test(body.id)) throw new HttpError(404, 'template_not_found');
    if (body.action !== 'archive') throw new HttpError(400, 'invalid_action');
    const { data: done, error } = await admin.from('audit_templates').update({ archived_at: new Date().toISOString() }).eq('id', body.id).select('id');
    if (error) throw dbError(error);
    if (!done || !done.length) throw new HttpError(404, 'template_not_found');
    return send(res, 200, { ok: true });
  }

  // Submit an audit, checked against its template
  const a = body.audit;
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new HttpError(400, 'invalid_audit');
  if (typeof a.templateId !== 'string' || !UUID.test(a.templateId)) throw new HttpError(404, 'template_not_found');
  const { data: tpl, error: te } = await admin.from('audit_templates').select('id,title,items').eq('id', a.templateId).is('archived_at', null).maybeSingle();
  if (te) throw dbError(te);
  if (!tpl) throw new HttpError(404, 'template_not_found');
  const check = checkAudit(tpl, a.answers);
  if (!check.ok) throw new HttpError(400, 'incomplete_audit', { message: 'The audit is not finished.', missing: check.missing });
  const clientKey = text(body.clientKey === undefined ? '' : String(body.clientKey), 80) || null;
  if (clientKey) {
    const { data: dupe, error: de } = await admin.from('audits').select(LIST_COLUMNS).eq('created_by', me.user.id).eq('client_key', clientKey).maybeSingle();
    if (de) throw dbError(de);
    if (dupe) return send(res, 200, { audit: dupe, duplicate: true });
  }
  const since = new Date(Date.now() - 3600e3).toISOString();
  const { data: recent, error: re } = await admin.from('audits').select('id').eq('created_by', me.user.id).gte('created_at', since).limit(PER_HOUR);
  if (re) throw dbError(re);
  if ((recent || []).length >= PER_HOUR) throw new HttpError(429, 'rate_limited', { message: `Limit of ${PER_HOUR} audits per hour reached.` });
  const { data, error } = await admin.from('audits').insert({
    template_id: tpl.id, template_title: tpl.title, location: text(a.location, 120) || null, answers: check.answers,
    pass_count: check.counts.pass, fail_count: check.counts.fail, na_count: check.counts.na, score: check.score,
    created_by: me.user.id, created_by_name: me.profile.display_name || me.user.email || null, client_key: clientKey,
  }).select(LIST_COLUMNS).single();
  if (error) throw dbError(error);
  return send(res, 201, { audit: data });
});
