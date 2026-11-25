// Incident reports, in two steps.
//   GET  /api/incidents                                   safety administrators see every report; everyone else sees only their own
//   POST /api/incidents { report: { kind, title, data }, clientKey? }   any signed-in, approved person files a PRELIMINARY report.
//                                                          The safety inbox is alerted, and a full report is due within DUE_HOURS.
//   POST /api/incidents { id, action: 'save_full', full }  safety administrators: save the in-depth report as it is worked on
//   POST /api/incidents { id, action: 'complete', full, kbEntryId? }   safety administrators: complete it. Refused (400, with a "missing" list) until every part is filled in.
// Alerts are only shown inside the app. Nothing is emailed or texted.
import { requireUser } from '../server/auth.js';
import { dbError } from '../server/supabase.js';
import { HttpError, send, handle, readJson } from '../server/http.js';
import { KINDS, DUE_HOURS, sanitizeFull } from '../src/shared/incidentFull.js';

const COLUMNS = 'id,kind,title,reported_by,reported_by_name,reporter_role,data,full_report,status,due_at,completed_by_name,completed_at,kb_entry_id,created_at,updated_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DATA_CHARS = 20_000;
const PER_HOUR = 10;
const text = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const list = (v, max, len) => (Array.isArray(v) ? v.map((x) => text(x, len)).filter(Boolean).slice(0, max) : []);

// The preliminary account: only these fields, each limited, so nothing else can be stored through this door.
function cleanPreliminary(d) {
  const x = d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  return {
    when: text(x.when, 80), location: text(x.location, 120), work: text(x.work, 220), narrative: text(x.narrative, 1400),
    people: list(x.people, 6, 60), injury: text(x.injury, 240), damage: text(x.damage, 240),
    actions: list(x.actions, 5, 160), conditions: list(x.conditions, 5, 160), unknowns: list(x.unknowns, 5, 160),
  };
}

export default handle(async (req, res) => {
  const method = req.method;
  if (method !== 'GET' && method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const me = await requireUser(req, { feature: 'incidents' });
  const admin = me.db;   // this company's data only
  const isSafety = me.profile.role === 'safety';

  if (method === 'GET') {
    let q = admin.from('incident_reports').select(COLUMNS).order('created_at', { ascending: false }).limit(200);
    if (!isSafety) q = q.eq('reported_by', me.user.id);
    const { data, error } = await q;
    if (error) throw dbError(error);
    return send(res, 200, { reports: data || [], scope: isSafety ? 'all' : 'mine', dueHours: DUE_HOURS });
  }

  const body = await readJson(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_body');

  // Safety administrators: save or complete the in-depth report
  if (body.id !== undefined) {
    if (!isSafety) throw new HttpError(403, 'wrong_role');
    if (typeof body.id !== 'string' || !UUID.test(body.id)) throw new HttpError(404, 'report_not_found');
    if (body.action !== 'save_full' && body.action !== 'complete') throw new HttpError(400, 'invalid_action');
    const { data: found, error } = await admin.from('incident_reports').select('id,status').eq('id', body.id).maybeSingle();
    if (error) throw dbError(error);
    if (!found) throw new HttpError(404, 'report_not_found');
    const { full, missing, ok } = sanitizeFull(body.full);
    const now = new Date().toISOString();
    const patch = { full_report: full, updated_at: now };
    if (body.action === 'complete') {
      if (!ok) throw new HttpError(400, 'incomplete_report', { message: 'The full report is not finished.', missing });
      Object.assign(patch, { status: 'complete', completed_by: me.user.id, completed_by_name: me.profile.display_name || me.user.email || null, completed_at: found.status === 'complete' ? undefined : now });
      if (typeof body.kbEntryId === 'string' && UUID.test(body.kbEntryId)) patch.kb_entry_id = body.kbEntryId;
      if (patch.completed_at === undefined) delete patch.completed_at;
    }
    const { data: after, error: e2 } = await admin.from('incident_reports').update(patch).eq('id', found.id).select(COLUMNS).single();
    if (e2) throw dbError(e2);
    return send(res, 200, { report: after });
  }

  // File a preliminary report
  const r = body.report;
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new HttpError(400, 'invalid_report');
  if (!Object.prototype.hasOwnProperty.call(KINDS, r.kind)) throw new HttpError(400, 'invalid_report');
  if (JSON.stringify(r.data || {}).length > MAX_DATA_CHARS) throw new HttpError(413, 'report_too_large');
  const data = cleanPreliminary(r.data);
  const title = text(r.title, 80);
  if (!title || !data.narrative) throw new HttpError(400, 'invalid_report');
  const clientKey = text(body.clientKey === undefined ? '' : String(body.clientKey), 80) || null;
  if (clientKey) {
    const { data: dupe, error: de } = await admin.from('incident_reports').select(COLUMNS).eq('reported_by', me.user.id).eq('client_key', clientKey).maybeSingle();
    if (de) throw dbError(de);
    if (dupe) return send(res, 200, { report: dupe, duplicate: true });
  }
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent, error: re } = await admin.from('incident_reports').select('id').eq('reported_by', me.user.id).gte('created_at', since).limit(PER_HOUR);
  if (re) throw dbError(re);
  if ((recent || []).length >= PER_HOUR) throw new HttpError(429, 'rate_limited', { message: `Limit of ${PER_HOUR} incident reports per hour reached.` });

  const dueAt = new Date(Date.now() + DUE_HOURS * 60 * 60 * 1000).toISOString();
  const reporter = me.profile.display_name || me.user.email || null;
  const { data: row, error } = await admin.from('incident_reports').insert({
    kind: r.kind, title, reported_by: me.user.id, reported_by_name: reporter, reporter_role: me.profile.role || null, data, due_at: dueAt, client_key: clientKey,
  }).select(COLUMNS).single();
  if (error) throw dbError(error);

  // Alert the safety inbox. If this part fails the report is still saved; the answer says so.
  let alerted = true;
  try {
    const { error: ae } = await admin.from('alerts').insert({
      raised_by: me.user.id, raised_by_name: reporter, hazard: `${KINDS[r.kind]} reported: ${title}`.slice(0, 300),
      context: `Preliminary report. Full report due within ${DUE_HOURS} hours.`, job: [data.work, data.location].filter(Boolean).join(' · ').slice(0, 200) || null,
    });
    if (ae) alerted = false;
  } catch { alerted = false; }
  return send(res, 201, { report: row, alerted });
});
