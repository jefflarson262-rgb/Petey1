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
  { key: 'submitRate', label: 'Submitted %', unit: '%' },
  { key: 'signRate', label: 'Crew sign-off %', unit: '%' },
  { key: 'audits', label: 'Audits' },
  { key: 'auditScore', label: 'Audit score %', unit: '%' },
  { key: 'observations', label: 'Observations' },
  { key: 'protection', label: 'Controls in place %', unit: '%' },
  { key: 'nearMisses', label: 'Near misses reported' },
  { key: 'injuries', label: 'Injuries reported', lower: true },
  { key: 'damage', label: 'Damage reported', lower: true },
  { key: 'alerts', label: 'Hazard alerts raised' },
  { key: 'alertHours', label: 'Alert response (median hours)', lower: true },
  { key: 'hours', label: 'Hours worked' },
  { key: 'recordables', label: 'Recordable cases', lower: true },
  { key: 'dartCases', label: 'DART cases', lower: true },
  { key: 'trir', label: 'TRIR', lower: true },
  { key: 'dart', label: 'DART rate', lower: true },
];
const cell = (v) => { if (v === null || v === undefined) return ''; const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
// The spreadsheet: one row per month, then one row per job. Empty cell = not available (for example, no hours entered).
export function toCsv({ months, total, byJob, company }) {
  const lines = [[`PreTaskIQ safety metrics${company ? ' - ' + company : ''}`], ['TRIR and DART rate = cases x 200,000 / hours worked. An empty cell means the number is not available.'], [],
    ['Period', ...COLUMNS.map((c) => c.label)], ...months.map((m) => [monthLabel(m.month), ...COLUMNS.map((c) => m[c.key])])];
  if (total) lines.push([`Total (${months.length} months)`, ...COLUMNS.map((c) => total[c.key])]);
  if (byJob && byJob.length) lines.push([], ['Job (same period)', ...COLUMNS.map((c) => c.label)], ...byJob.map((j) => [j.name, ...COLUMNS.map((c) => j[c.key])]));
  return lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
}
