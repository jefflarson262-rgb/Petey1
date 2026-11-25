// Safety metrics on the browser side. Needs sign-in (the numbers come from the company's saved records).
import { apiJson } from '../api/client.js';
import { getSnapshot as auth } from '../auth/session.js';
import { COLUMNS, OSHA_CLASSES, REPORT_SECTIONS, toCsv, monthLabel } from '../shared/metrics.js';

export const enabled = () => { const a = auth(); return a.mode === 'supabase' && a.phase === 'signed_in'; };
export const columns = () => COLUMNS;
export const classes = () => OSHA_CLASSES;
export const label = (m) => monthLabel(m);
const fail = (e, fallback) => ({ ok: false, message: (e && e.message) || fallback });
export const reportSections = () => REPORT_SECTIONS;
export async function load(months = 6, jobId = '') {
  try { return { ok: true, ...(await apiJson(`/api/metrics?months=${months}&tz=${-new Date().getTimezoneOffset()}${jobId ? '&job=' + encodeURIComponent(jobId) : ''}`)) }; }
  catch (e) { return fail(e, 'Could not load the metrics.'); }
}
const act = async (body, fallback) => { try { return { ok: true, ...(await apiJson('/api/metrics', { method: 'POST', body })) }; } catch (e) { return fail(e, fallback); } };
export const setHours = (month, jobId, hours) => act({ action: 'set_hours', month, jobId: jobId || null, hours }, 'Could not save the hours.');
export const classify = (incidentId, oshaClass, jobId) => act({ action: 'classify', incidentId, oshaClass: oshaClass || null, jobId: jobId || null }, 'Could not save the classification.');
export function download(data, include) {
  const blob = new Blob(['﻿' + toCsv(data, include)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `pretaskiq-safety-metrics-${data.months[data.months.length - 1].month}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// What this person chose to see: which cards, and which parts go in the report. Kept in this browser (per sign-in), not on the server.
const PREF = 'pretaskiq.metrics.prefs.';
export const DEFAULT_CARDS = ['submitRate', 'signRate', 'audits', 'auditScore', 'observations', 'protection', 'nearMisses', 'alertHours'];
const who = () => { const a = auth(); return (a.user && a.user.id) || 'device'; };
export function prefs() {
  let p = {}; try { p = JSON.parse(localStorage.getItem(PREF + who()) || '{}') || {}; } catch { p = {}; }
  const known = new Set(COLUMNS.map((c) => c.key));
  return { cards: Array.isArray(p.cards) ? p.cards.filter((k) => known.has(k)) : [...DEFAULT_CARDS], report: p.report && typeof p.report === 'object' ? p.report : {}, months: [3, 6, 12, 24].includes(p.months) ? p.months : 6 };
}
export function savePrefs(p) { try { localStorage.setItem(PREF + who(), JSON.stringify(p)); } catch { /* private mode: the choice lasts for this visit only */ } }
