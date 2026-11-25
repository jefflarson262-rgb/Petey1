// Hazard alerts: the safety inbox.
//   GET  /api/alerts                              alerts you may see, newest first. Safety administrators see all; everyone else sees only the ones they raised.
//   POST /api/alerts  { hazard, context?, job?, planId? }   raise an alert (any signed-in, approved person)
//   POST /api/alerts  { id, action: 'acknowledge' }         mark one as seen (safety administrators only)
// Alerts are only shown inside the app. Nothing is emailed or texted.
import { requireUser } from '../server/auth.js';
import { dbError } from '../server/supabase.js';
import { HttpError, send, handle, readJson } from '../server/http.js';

const COLUMNS = 'id,raised_by,raised_by_name,hazard,context,job,plan_id,status,acknowledged_by_name,acknowledged_at,created_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PER_HOUR = 30;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const text = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export default handle(async (req, res) => {
  const method = req.method;
  if (method !== 'GET' && method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const me = await requireUser(req);
  const admin = me.db;   // this company's data only
  const isSafety = me.profile.role === 'safety';

  if (method === 'GET') {
    let q = admin.from('alerts').select(COLUMNS).order('created_at', { ascending: false }).limit(100);
    if (!isSafety) q = q.eq('raised_by', me.user.id);
    const { data, error } = await q;
    if (error) throw dbError(error);
    return send(res, 200, { alerts: data || [], scope: isSafety ? 'all' : 'mine' });
  }

  const body = await readJson(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_body');

  if (body.action === 'acknowledge') {
    if (!isSafety) throw new HttpError(403, 'wrong_role');
    if (typeof body.id !== 'string' || !UUID.test(body.id)) throw new HttpError(404, 'alert_not_found');
    const { data: found, error } = await admin.from('alerts').select('id,status').eq('id', body.id).maybeSingle();
    if (error) throw dbError(error);
    if (!found) throw new HttpError(404, 'alert_not_found');
    if (found.status !== 'acknowledged') {                      // acknowledging twice changes nothing (the first person is kept)
      const { error: upError } = await admin.from('alerts').update({
        status: 'acknowledged', acknowledged_by: me.user.id,
        acknowledged_by_name: me.profile.display_name || me.user.email || null, acknowledged_at: new Date().toISOString(),
      }).eq('id', found.id);
      if (upError) throw dbError(upError);
    }
    const { data: after, error: readError } = await admin.from('alerts').select(COLUMNS).eq('id', found.id).single();
    if (readError) throw dbError(readError);
    return send(res, 200, { alert: after });
  }

  // Raise an alert
  const hazard = text(body.hazard, 300);
  if (!hazard) throw new HttpError(400, 'invalid_alert');
  const context = text(body.context, 120) || null;
  const job = text(body.job, 200) || null;
  const planId = typeof body.planId === 'string' && UUID.test(body.planId) ? body.planId : null;

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent, error: recentError } = await admin.from('alerts').select(COLUMNS).eq('raised_by', me.user.id).gte('created_at', since).order('created_at', { ascending: false }).limit(PER_HOUR);
  if (recentError) throw dbError(recentError);
  const dupe = (recent || []).find((a) => a.hazard === hazard && Date.now() - new Date(a.created_at).getTime() < DUPLICATE_WINDOW_MS);
  if (dupe) return send(res, 200, { alert: dupe, duplicate: true });          // the same flag sent twice in a row is one alert
  if ((recent || []).length >= PER_HOUR) throw new HttpError(429, 'rate_limited', { message: `Limit of ${PER_HOUR} alerts per hour reached.` });

  const { data, error } = await admin.from('alerts').insert({
    raised_by: me.user.id, raised_by_name: me.profile.display_name || me.user.email || null, hazard, context, job, plan_id: planId,
  }).select(COLUMNS).single();
  if (error) throw dbError(error);
  return send(res, 201, { alert: data });
});
