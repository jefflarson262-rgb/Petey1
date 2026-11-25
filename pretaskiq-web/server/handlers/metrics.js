// Safety metrics for safety administrators. Leading indicators come from what the app already records (plans, crew sign-offs, audits,
// observations, incident reports, hazard alerts). OSHA rates need two things only a person can supply: the hours worked each month, and whether
// each reported injury is recordable. Nothing is estimated: with no hours entered, a rate is "not available", never zero.
//   GET  /api/metrics?months=6&tz=-360                 months (oldest first), the total, the same numbers by job, and what still needs entering
//   POST /api/metrics { action: 'set_hours', month: 'YYYY-MM', jobId: JOB|null, hours: number|null }     null hours removes the entry
//   POST /api/metrics { action: 'classify', incidentId, oshaClass: not_recordable|recordable|dart|null, jobId: JOB|null }
import { requireUser } from '../auth.js';
import { HttpError, send, handle, readJson } from '../http.js';
import { dbError } from '../supabase.js';
import { crewCounts } from '../../src/shared/siteOverview.js';
import { controlResult, summarize, DEFAULT_CATEGORIES } from '../../src/shared/protection.js';
import { OSHA_CLASSES, isMonth, rate, pct, avg, median, monthOf, monthsBack } from '../../src/shared/metrics.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const blank = () => ({ plans: 0, submitted: 0, crewTotal: 0, crewSigned: 0, audits: 0, auditScores: [], auditClean: 0, auditFails: 0, observations: 0, obsReq: 0, obsIn: 0, prevReq: 0, prevIn: 0, mitReq: 0, mitIn: 0, nearMisses: 0, injuries: 0, damage: 0, alerts: 0, alertHrs: [], hours: null, recordables: 0, dartCases: 0, unclassified: 0 });
// `whole` = a month or the total (everything is known). A job row only has what can be tied to a job; the rest is left empty, not shown as zero.
function finish(a, whole) {
  const n = (v) => (whole ? v : null);
  return {
    plans: a.plans, submitted: a.submitted, submitRate: pct(a.submitted, a.plans), signRate: pct(a.crewSigned, a.crewTotal),
    audits: n(a.audits), auditScore: whole ? avg(a.auditScores) : null, auditClean: whole ? pct(a.auditClean, a.audits) : null, auditFails: n(a.auditFails),
    observations: n(a.observations), protection: whole ? pct(a.obsIn, a.obsReq) : null, prevention: whole ? pct(a.prevIn, a.prevReq) : null, mitigation: whole ? pct(a.mitIn, a.mitReq) : null,
    nearMisses: n(a.nearMisses), injuries: a.injuries, damage: n(a.damage), alerts: n(a.alerts), alertHours: whole ? median(a.alertHrs) : null,
    hours: a.hours, recordables: a.recordables, dartCases: a.dartCases, trir: rate(a.recordables, a.hours), dart: rate(a.dartCases, a.hours), unclassified: a.unclassified,
  };
}
const addHours = (a, h) => { a.hours = (a.hours || 0) + Number(h); };

export default handle(async (req, res) => {
  const method = req.method;
  if (method !== 'GET' && method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method_not_allowed' }); }
  const me = await requireUser(req, { roles: ['safety'], feature: 'metrics' });
  const db = me.db;

  if (method === 'POST') {
    const body = await readJson(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_body');
    const jobId = body.jobId === null || body.jobId === undefined || body.jobId === '' ? null : body.jobId;
    if (jobId !== null) {
      if (typeof jobId !== 'string' || !UUID.test(jobId)) throw new HttpError(400, 'job_not_found');
      const { data: job, error } = await db.from('jobs').select('id,archived_at').eq('id', jobId).maybeSingle();
      if (error) throw dbError(error);
      if (!job || job.archived_at) throw new HttpError(400, 'job_not_found');
    }
    if (body.action === 'set_hours') {
      if (!isMonth(body.month)) throw new HttpError(400, 'invalid_month');
      let q = db.from('safety_hours').select('id').eq('month', body.month);
      q = jobId ? q.eq('job_id', jobId) : q.is('job_id', null);
      const { data: rows, error } = await q.limit(5);
      if (error) throw dbError(error);
      const existing = (rows || [])[0];
      if (body.hours === null || body.hours === undefined || body.hours === '') {
        if (existing) { const { error: de } = await db.from('safety_hours').delete().eq('id', existing.id); if (de) throw dbError(de); }
        return send(res, 200, { ok: true, hours: null });
      }
      const hours = Number(body.hours);
      if (!Number.isFinite(hours) || hours < 0 || hours > 10000000) throw new HttpError(400, 'invalid_hours');
      const row = { hours, entered_by: me.user.id, updated_at: new Date().toISOString() };
      const { error: we } = existing ? await db.from('safety_hours').update(row).eq('id', existing.id) : await db.from('safety_hours').insert({ month: body.month, job_id: jobId, ...row });
      if (we) throw dbError(we);
      return send(res, 200, { ok: true, hours });
    }
    if (body.action === 'classify') {
      if (typeof body.incidentId !== 'string' || !UUID.test(body.incidentId)) throw new HttpError(404, 'incident_not_found');
      const cls = body.oshaClass === null || body.oshaClass === '' || body.oshaClass === undefined ? null : body.oshaClass;
      if (cls !== null && !Object.prototype.hasOwnProperty.call(OSHA_CLASSES, cls)) throw new HttpError(400, 'invalid_class');
      const { data: inc, error } = await db.from('incident_reports').select('id,kind').eq('id', body.incidentId).maybeSingle();
      if (error) throw dbError(error);
      if (!inc) throw new HttpError(404, 'incident_not_found');
      if (inc.kind !== 'injury') throw new HttpError(400, 'not_an_injury');
      const { error: ue } = await db.from('incident_reports').update({ osha_class: cls, job_id: jobId, classified_by: cls ? me.user.id : null, classified_at: cls ? new Date().toISOString() : null }).eq('id', inc.id);
      if (ue) throw dbError(ue);
      return send(res, 200, { ok: true });
    }
    throw new HttpError(400, 'unknown_action');
  }

  const q = req.query || {};
  const count = Math.min(24, Math.max(1, Math.floor(Number(q.months)) || 6));
  const tz = Math.min(840, Math.max(-840, Math.round(Number(q.tz)) || 0));
  const months = monthsBack(monthOf(new Date().toISOString(), tz), count);
  const since = new Date(new Date(months[0] + '-01T00:00:00Z').getTime() - tz * 60000 - 86400000).toISOString();   // a day of slack; rows are bucketed exactly below
  const inRange = new Set(months);
  const per = Object.fromEntries(months.map((m) => [m, blank()]));
  const jobs = {}; const total = blank();
  const get = async (table, cols, col = 'created_at', limit = 20000) => { const { data, error } = await db.from(table).select(cols).gte(col, since).limit(limit); if (error) throw dbError(error); return data || []; };
  const { data: jobRows, error: je } = await db.from('jobs').select('id,name,archived_at').limit(1000);
  if (je) throw dbError(je);
  const jobName = Object.fromEntries((jobRows || []).map((j) => [j.id, j.name]));
  const jobAcc = (id) => (id && jobName[id] ? (jobs[id] = jobs[id] || blank()) : null);
  // ?job=ID narrows everything to one job. Only what is tied to a job can be shown then (plans, injuries assigned to it, its hours);
  // audits, observations and alerts are not tied to a job, so they are left empty rather than shown as zero.
  const only = typeof q.job === 'string' && UUID.test(q.job) && jobName[q.job] ? q.job : null;
  if (q.job && !only) throw new HttpError(404, 'job_not_found');
  const each = (iso, jobId, fn) => { const m = monthOf(iso, tz); if (!inRange.has(m)) return; if (only && jobId !== only) return; fn(per[m]); fn(total); const j = jobAcc(jobId); if (j) fn(j); };

  for (const p of await get('plans', 'id,created_at,data', 'created_at', 5000)) {
    const d = p.data && typeof p.data === 'object' ? p.data : {}; const crew = crewCounts(d);
    each(p.created_at, d.jobId, (a) => { a.plans++; if (d.submitted && d.submitted.at) a.submitted++; a.crewTotal += crew.total; a.crewSigned += crew.signed; });
  }
  // Audits: counts and scores by month and by template, and the items that fail most often.
  const tpl = {};
  for (const a of await get('audits', 'created_at,score,template_title,fail_count')) {
    const score = a.score !== null && a.score !== undefined && Number.isFinite(Number(a.score)) ? Number(a.score) : null; const fails = Number(a.fail_count) || 0;
    const m = monthOf(a.created_at, tz); if (!inRange.has(m)) continue;
    each(a.created_at, null, (x) => { x.audits++; if (score !== null) x.auditScores.push(score); if (!fails) x.auditClean++; x.auditFails += fails; });
    const t = (tpl[a.template_title] = tpl[a.template_title] || { title: a.template_title || 'Untitled', audits: 0, scores: [], clean: 0, failedItems: 0 });
    t.audits++; if (score !== null) t.scores.push(score); if (!fails) t.clean++; t.failedItems += fails;
  }
  const failed = {};
  for (const f of await get('audit_failed_items', 'created_at,template_title,item_text')) {
    if (!inRange.has(monthOf(f.created_at, tz))) continue;
    const key = (f.template_title || '') + '::' + (f.item_text || '');
    const g = (failed[key] = failed[key] || { text: f.item_text || 'Untitled item', template: f.template_title || '', fails: 0 }); g.fails++;
  }
  // Observations: controls in place by month (prevention and mitigation separately), by category, and the controls most often missing.
  const obs = [];
  for (const o of await get('protection_observations', 'created_at,category,month,controls')) {
    if (!inRange.has(monthOf(o.created_at, tz))) continue;
    obs.push(o);
    const c = { req: 0, in: 0, pReq: 0, pIn: 0, mReq: 0, mIn: 0 };
    for (const ctl of Array.isArray(o.controls) ? o.controls : []) { const r = controlResult(ctl); if (r === 'na') continue; const mit = ctl.kind === 'mitigation'; c.req++; if (mit) c.mReq++; else c.pReq++; if (r === 'in_place') { c.in++; if (mit) c.mIn++; else c.pIn++; } }
    each(o.created_at, null, (x) => { x.observations++; x.obsReq += c.req; x.obsIn += c.in; x.prevReq += c.pReq; x.prevIn += c.pIn; x.mitReq += c.mReq; x.mitIn += c.mIn; });
  }
  const { data: lists, error: le } = await db.from('protection_checklists').select('category,label,controls,updated_at').order('updated_at', { ascending: true }).limit(500);
  if (le) throw dbError(le);
  const catLabel = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c.label])); const ctlText = {};
  for (const l of lists || []) { if (l.label) catLabel[l.category] = l.label; for (const c of Array.isArray(l.controls) ? l.controls : []) if (c && c.id) ctlText[l.category + '::' + c.id] = c.text; }
  const sum = summarize(obs);
  const injuries = [];
  for (const r of await get('incident_reports', 'id,kind,title,created_at,osha_class,job_id')) {
    each(r.created_at, r.job_id, (x) => {
      if (r.kind === 'near_miss') x.nearMisses++; else if (r.kind === 'damage') x.damage++;
      else if (r.kind === 'injury') { x.injuries++; if (r.osha_class === 'recordable' || r.osha_class === 'dart') x.recordables++; if (r.osha_class === 'dart') x.dartCases++; if (!r.osha_class) x.unclassified++; }
    });
    if (r.kind === 'injury' && inRange.has(monthOf(r.created_at, tz)) && (!only || r.job_id === only)) injuries.push({ id: r.id, title: r.title, createdAt: r.created_at, month: monthOf(r.created_at, tz), oshaClass: r.osha_class || null, jobId: r.job_id && jobName[r.job_id] ? r.job_id : null });
  }
  for (const al of await get('alerts', 'created_at,acknowledged_at')) each(al.created_at, null, (x) => { x.alerts++; if (al.acknowledged_at) { const h = (new Date(al.acknowledged_at) - new Date(al.created_at)) / 3600000; if (h >= 0) x.alertHrs.push(h); } });

  // Hours. A month's company figure is the company-wide entry when there is one; otherwise the sum of that month's job entries.
  const { data: hrs, error: he } = await db.from('safety_hours').select('month,job_id,hours').gte('month', months[0]).limit(20000);
  if (he) throw dbError(he);
  const entries = (hrs || []).filter((h) => inRange.has(h.month) && (h.job_id === null || jobName[h.job_id]));
  for (const m of months) {
    const mine = entries.filter((h) => h.month === m); const whole = mine.find((h) => h.job_id === null);
    const forJob = only ? mine.find((h) => h.job_id === only) : null;
    const sum = only ? (forJob ? Number(forJob.hours) : null) : whole ? Number(whole.hours) : mine.length ? mine.reduce((n, h) => n + Number(h.hours), 0) : null;
    if (sum !== null) { addHours(per[m], sum); addHours(total, sum); }
    for (const h of mine) if (h.job_id) { const j = jobAcc(h.job_id); if (j) addHours(j, h.hours); }
  }
  injuries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return send(res, 200, {
    company: me.company.name, scope: only ? jobName[only] : null, months: months.map((m) => ({ month: m, ...finish(per[m], !only) })), total: finish(total, !only),
    byJob: Object.entries(jobs).map(([id, a]) => ({ jobId: id, name: jobName[id], ...finish(a, false) })).sort((a, b) => a.name.localeCompare(b.name)),
    hours: entries.map((h) => ({ month: h.month, jobId: h.job_id, hours: Number(h.hours) })),
    audits: {
      byTemplate: Object.values(tpl).map((t) => ({ title: t.title, audits: t.audits, avgScore: avg(t.scores), cleanRate: pct(t.clean, t.audits), failedItems: t.failedItems })).sort((a, b) => b.audits - a.audits).slice(0, 30),
      topFails: Object.values(failed).sort((a, b) => b.fails - a.fails).slice(0, 10),
    },
    observations: {
      naRate: sum.naRate,
      byCategory: sum.categories.map((c) => ({ id: c.id, label: catLabel[c.id] || c.id, n: c.n, protection: c.protection, prevention: c.prevention, mitigation: c.mitigation })).sort((a, b) => b.n - a.n),
      gaps: sum.controlGaps.filter((g) => g.notInPlace > 0).slice(0, 10).map((g) => ({ label: catLabel[g.category] || g.category, text: ctlText[g.category + '::' + g.id] || 'A control that is no longer on the checklist', kind: g.kind, required: g.required, notInPlace: g.notInPlace, gapRate: g.gapRate })),
    },
    injuries: injuries.slice(0, 200), jobs: (jobRows || []).filter((j) => !j.archived_at).map((j) => ({ id: j.id, name: j.name })),
  });
});
