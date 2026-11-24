// Saved plans (job hazard analyses) and their revision history.
//   GET  /api/plans                      list plans you may see (newest first)
//   GET  /api/plans?id=ID                one plan including its full content
//   GET  /api/plans?id=ID&revisions=1    the revision history of one plan (no content)
//   GET  /api/plans?overview=1&since=ISO the Site Overview: a short summary of every plan changed since that time (safety and construction administrators only)
//   POST /api/plans                      save: { id?, data, source?, note? }  -> creates the plan, or adds a revision to it
//
// Who can do what: a foreman sees and changes only their own plans. Safety administrators see and change all plans.
// Construction administrators see all plans but change only their own.
import { requireUser } from '../server/auth.js';
import { dbError } from '../server/supabase.js';
import { HttpError, send, handle, readJson } from '../server/http.js';
import { summarizePlan } from '../src/shared/siteOverview.js';

const LIST_COLUMNS = 'id,title,current_revision,created_by,owner_name,created_at,updated_at';
const SOURCES = ['planning', 'petey_update', 'edit'];
const MAX_PLAN_CHARS = 400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const canRead = (plan, me) => plan.created_by === me.user.id || me.profile.role === 'safety' || me.profile.role === 'construction';
const canWrite = (plan, me) => plan.created_by === me.user.id || me.profile.role === 'safety';

async function loadPlan(admin, id) {
  if (!UUID.test(id)) throw new HttpError(404, 'plan_not_found');
  const { data, error } = await admin.from('plans').select('*').eq('id', id).maybeSingle();
  if (error) throw dbError(error);
  return data;
}

export default handle(async (req, res) => {
  const method = req.method;
  if (method !== 'GET' && method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const me = await requireUser(req);
  const { admin } = me;
  const url = new URL(req.url || '/', 'http://x');
  const id = url.searchParams.get('id');

  if (method === 'GET' && !id && url.searchParams.get('overview')) {
    if (me.profile.role === 'foreman') throw new HttpError(403, 'not_allowed');
    const sinceRaw = url.searchParams.get('since');
    const sinceMs = sinceRaw ? Date.parse(sinceRaw) : NaN;
    const since = new Date(Number.isFinite(sinceMs) && sinceMs > 0 && sinceMs < Date.now() + 86400000 ? sinceMs : Date.now() - 24 * 3600 * 1000).toISOString();
    const { data, error } = await admin.from('plans').select('id,title,owner_name,updated_at,data').gte('updated_at', since).order('updated_at', { ascending: false }).limit(60);
    if (error) throw dbError(error);
    return send(res, 200, { since, plans: (data || []).map(summarizePlan) });
  }

  if (method === 'GET' && !id) {
    let q = admin.from('plans').select(LIST_COLUMNS).order('updated_at', { ascending: false }).limit(100);
    if (me.profile.role === 'foreman') q = q.eq('created_by', me.user.id);
    const { data, error } = await q;
    if (error) throw dbError(error);
    return send(res, 200, { plans: data || [] });
  }

  if (method === 'GET') {
    const plan = await loadPlan(admin, id);
    if (!plan || !canRead(plan, me)) throw new HttpError(404, 'plan_not_found');   // 404, not 403: do not reveal that it exists
    if (url.searchParams.get('revisions')) {
      const { data, error } = await admin.from('plan_revisions').select('revision,source,note,changed_by,created_at').eq('plan_id', id).order('revision', { ascending: false });
      if (error) throw dbError(error);
      return send(res, 200, { revisions: data || [] });
    }
    return send(res, 200, { plan });
  }

  // POST: save
  const body = await readJson(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_body');
  const { data: content } = body;
  if (!content || typeof content !== 'object' || Array.isArray(content)) throw new HttpError(400, 'invalid_plan');
  if (JSON.stringify(content).length > MAX_PLAN_CHARS) throw new HttpError(413, 'plan_too_large');
  const source = SOURCES.includes(body.source) ? body.source : 'planning';
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;
  const revision = Number.isInteger(content.revision) && content.revision >= 1 && content.revision < 100000 ? content.revision : 1;
  const title = (typeof content.jobTitle === 'string' && content.jobTitle.trim() ? content.jobTitle.trim() : 'Untitled plan').slice(0, 200);
  const now = new Date().toISOString();

  let plan;
  if (!body.id) {
    const { data, error } = await admin.from('plans').insert({
      created_by: me.user.id, owner_name: me.profile.display_name || me.user.email || null,
      title, current_revision: revision, data: content, created_at: now, updated_at: now,
    }).select('*').single();
    if (error) throw dbError(error);
    plan = data;
  } else {
    if (typeof body.id !== 'string') throw new HttpError(400, 'invalid_id');
    const existing = await loadPlan(admin, body.id);
    if (!existing || !canRead(existing, me)) throw new HttpError(404, 'plan_not_found');
    if (!canWrite(existing, me)) throw new HttpError(403, 'read_only');
    const { data, error } = await admin.from('plans').update({
      title, current_revision: Math.max(existing.current_revision || 1, revision), data: content, updated_at: now,
    }).eq('id', existing.id).select('*').single();
    if (error) throw dbError(error);
    plan = data;
  }

  const { error: revError } = await admin.from('plan_revisions').upsert(
    { plan_id: plan.id, revision, data: content, source, note, changed_by: me.user.id, created_at: now },
    { onConflict: 'plan_id,revision' },
  );
  if (revError) throw dbError(revError);

  return send(res, body.id ? 200 : 201, { plan: { id: plan.id, title: plan.title, current_revision: plan.current_revision, updated_at: plan.updated_at } });
});
