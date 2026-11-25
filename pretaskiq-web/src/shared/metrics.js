// Safety metrics: the arithmetic, kept in one place so the server, the screen and the tests agree.
// OSHA incidence rates use the standard formula: cases x 200,000 / hours worked (200,000 = 100 full-time workers for a year).
export const RATE_BASE = 200000;
export const OSHA_CLASSES = {
  not_recordable: 'Not recordable (first aid only, or not work-related)',
  recordable: 'Recordable (no days away, restriction or transfer)',
  dart: 'Recordable with days away, restricted work or job transfer (DART)',
};
export const isMonth = (m) => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
// A rate needs hours. With none entered the answer is "not available" (null), never zero.
export const rate = (cases, hours) => (Number(hours) > 0 ? Math.round((cases * RATE_BASE / Number(hours)) * 100) / 100 : null);
export const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
export const avg = (list) => (list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null);
export const median = (list) => { if (!list.length) return null; const s = [...list].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10; };

// 'YYYY-MM' of a moment, in the viewer's time zone (offsetMinutes = minutes to ADD to UTC to get local time).
export function monthOf(iso, offsetMinutes = 0) {
  const t = new Date(iso).getTime(); if (Number.isNaN(t)) return null;
  return new Date(t + offsetMinutes * 60000).toISOString().slice(0, 7);
}
// The last n months ending with `last` ('YYYY-MM'), oldest first.
export function monthsBack(last, n) {
  const [y, m] = last.split('-').map(Number); const out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(Date.UTC(y, m - 1 - i, 1)); out.push(d.toISOString().slice(0, 7)); }
  return out;
}
export const monthLabel = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }); };

// The columns of the table and the spreadsheet, in order. `lower` = a lower number is better (used only for the arrow's colour).
export const COLUMNS = [
  { key: 'plans', label: 'Plans made' },
  { key: 'submitted', label: 'Plans submitted' },
  { key: 'submitRate', label: 'Plans submitted %', unit: '%' },
  { key: 'signRate', label: 'Crew sign-off %', unit: '%' },
  { key: 'audits', label: 'Audits' },
  { key: 'auditScore', label: 'Audit score %', unit: '%' },
  { key: 'auditClean', label: 'Audits with no failed items %', unit: '%' },
  { key: 'auditFails', label: 'Failed audit items', lower: true },
  { key: 'observations', label: 'Observations' },
  { key: 'protection', label: 'Controls in place %', unit: '%' },
  { key: 'prevention', label: 'Prevention controls in place %', unit: '%' },
  { key: 'mitigation', label: 'Mitigation controls in place %', unit: '%' },
  { key: 'nearMisses', label: 'Near misses reported' },
  { key: 'injuries', label: 'Injuries reported', lagging: true, lower: true },
  { key: 'damage', label: 'Damage reported', lagging: true, lower: true },
  { key: 'alerts', label: 'Hazard alerts raised' },
  { key: 'alertHours', label: 'Alert response (median hours)', lower: true },
  { key: 'hours', label: 'Hours worked', lagging: true },
  { key: 'recordables', label: 'Recordable cases', lagging: true, lower: true },
  { key: 'dartCases', label: 'DART cases', lagging: true, lower: true },
  { key: 'trir', label: 'TRIR', lagging: true, lower: true },
  { key: 'dart', label: 'DART rate', lagging: true, lower: true },
];
const cell = (v) => { if (v === null || v === undefined) return ''; const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
// The spreadsheet: one row per month, then one row per job. Empty cell = not available (for example, no hours entered).
// What a report can include. Each can be switched off before downloading.
export const REPORT_SECTIONS = [
  { key: 'months', label: 'Month by month' },
  { key: 'lagging', label: 'OSHA rates and injury counts (lagging indicators)' },
  { key: 'byJob', label: 'By job' },
  { key: 'auditTemplates', label: 'Audits by template' },
  { key: 'auditFails', label: 'Most-failed audit items' },
  { key: 'obsCategories', label: 'Observations by category' },
  { key: 'obsGaps', label: 'Controls most often not in place' },
];
export function toCsv({ months, total, byJob, company, audits, observations, scope }, include) {
  const on = (k) => !include || include[k] !== false;
  const COLS = COLUMNS.filter((c) => on('lagging') || !c.lagging);
  months = on('months') ? months : []; total = on('months') ? total : null; byJob = on('byJob') ? byJob : [];
  audits = audits ? { byTemplate: on('auditTemplates') ? audits.byTemplate : [], topFails: on('auditFails') ? audits.topFails : [] } : null;
  observations = observations ? { byCategory: on('obsCategories') ? observations.byCategory : [], gaps: on('obsGaps') ? observations.gaps : [] } : null;
  company = [company, scope].filter(Boolean).join(' - ');
  const lines = [[`PreTaskIQ safety metrics${company ? ' - ' + company : ''}`], ['TRIR and DART rate = cases x 200,000 / hours worked. An empty cell means the number is not available.'], [],
    ...(months.length ? [['Period', ...COLS.map((c) => c.label)], ...months.map((m) => [monthLabel(m.month), ...COLS.map((c) => m[c.key])])] : [])];
  if (total) lines.push([`Total (${months.length} months)`, ...COLS.map((c) => total[c.key])]);
  if (byJob && byJob.length) lines.push([], ['Job (same period)', ...COLS.map((c) => c.label)], ...byJob.map((j) => [j.name, ...COLS.map((c) => j[c.key])]));
  if (audits && audits.byTemplate.length) lines.push([], ['Audit template (same period)', 'Audits', 'Average score %', 'Audits with no failed items %', 'Failed items'], ...audits.byTemplate.map((t) => [t.title, t.audits, t.avgScore, t.cleanRate, t.failedItems]));
  if (audits && audits.topFails.length) lines.push([], ['Most-failed audit items', 'Template', 'Times failed'], ...audits.topFails.map((f) => [f.text, f.template, f.fails]));
  if (observations && observations.byCategory.length) lines.push([], ['Observation category (same period)', 'Observations', 'Controls in place %', 'Prevention %', 'Mitigation %'], ...observations.byCategory.map((c) => [c.label, c.n, c.protection, c.prevention, c.mitigation]));
  if (observations && observations.gaps.length) lines.push([], ['Controls most often not in place', 'Category', 'Kind', 'Times required', 'Times not in place', 'Gap %'], ...observations.gaps.map((g) => [g.text, g.label, g.kind, g.required, g.notInPlace, g.gapRate]));
  return lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
}
