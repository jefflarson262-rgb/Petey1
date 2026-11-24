// Control-verification observations ("measuring protection"): for a work category, an observer checks each required control and scores it AS FOUND.
// Raw answers are stored per control (applies / present / works), and every number below is computed from them, so a formula change never loses data.
// ASSUMPTIONS to confirm with the method's owner (the source brief gives the idea, not every rule):
//   * A control counts as "in place" only when it applies AND is present AND works today.
//   * Protection % for one observation = controls in place / controls required (prevention and mitigation pooled).
//   * Category and monthly averages are the simple mean of the observations' percentages.
// Nothing here identifies a person: observations carry a category, a month and answers, never an observer name.
export const CONTROL_KINDS = { prevention: 'Prevention', mitigation: 'Mitigation' };
export const DEFAULT_CATEGORIES = [
  { id: 'dropped_load', label: 'Dropped load or object' }, { id: 'struck_by', label: 'Struck by equipment or vehicle' },
  { id: 'caught_in', label: 'Caught in equipment' }, { id: 'excavation', label: 'Excavation or trench collapse' },
  { id: 'electrical', label: 'Electrical contact or arc flash' }, { id: 'fall_elevation', label: 'Fall from elevation' },
  { id: 'motor_vehicle', label: 'Motor vehicle accident or rollover' }, { id: 'confined_space', label: 'Confined space or toxic atmosphere' },
  { id: 'other', label: 'Other' },
];
export const ANSWER_FIELDS = ['applies', 'present', 'works'];

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);          // one decimal, null when nothing was required
const mean = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };

// A control as scored: 'na' (does not apply), 'in_place', 'missing' (not present) or 'not_working' (present but does not work today).
export function controlResult(a) {
  if (!a || a.applies === false) return 'na';
  if (a.present !== true) return 'missing';
  return a.works === true ? 'in_place' : 'not_working';
}

// One observation: { category, month: 'YYYY-MM', controls: [{ id, kind, applies, present, works }] }
export function scoreObservation(obs) {
  const rows = (Array.isArray(obs && obs.controls) ? obs.controls : []).map((c) => ({ id: c.id, kind: c.kind === 'mitigation' ? 'mitigation' : 'prevention', result: controlResult(c) }));
  const req = (k) => rows.filter((r) => r.result !== 'na' && (!k || r.kind === k));
  const inPlace = (k) => req(k).filter((r) => r.result === 'in_place');
  return {
    prevention: pct(inPlace('prevention').length, req('prevention').length), mitigation: pct(inPlace('mitigation').length, req('mitigation').length),
    protection: pct(inPlace().length, req().length), required: req().length, inPlace: inPlace().length, naCount: rows.length - req().length, checks: rows.length,
  };
}

// Many observations -> category averages, the most-missed controls, N/A rate, and a monthly trend. Pure and deterministic.
export function summarize(observations) {
  const list = (Array.isArray(observations) ? observations : []).filter((o) => o && Array.isArray(o.controls));
  const scored = list.map((o) => ({ o, s: scoreObservation(o) }));
  const byCat = {};
  scored.forEach(({ o, s }) => { (byCat[o.category] = byCat[o.category] || []).push(s); });
  const categories = Object.keys(byCat).map((id) => ({ id, n: byCat[id].length, prevention: mean(byCat[id].map((s) => s.prevention)), mitigation: mean(byCat[id].map((s) => s.mitigation)), protection: mean(byCat[id].map((s) => s.protection)) }));
  const gaps = {};
  list.forEach((o) => (o.controls || []).forEach((c) => {
    const r = controlResult(c); const key = o.category + '::' + c.id;
    const g = gaps[key] = gaps[key] || { category: o.category, id: c.id, kind: c.kind === 'mitigation' ? 'mitigation' : 'prevention', required: 0, notInPlace: 0 };
    if (r !== 'na') { g.required++; if (r !== 'in_place') g.notInPlace++; }
  }));
  const controlGaps = Object.values(gaps).filter((g) => g.required > 0).map((g) => ({ ...g, gapRate: pct(g.notInPlace, g.required) })).sort((a, b) => b.gapRate - a.gapRate || b.required - a.required);
  const months = {};
  scored.forEach(({ o, s }) => { if (o.month) (months[o.month] = months[o.month] || []).push(s); });
  const trend = Object.keys(months).sort().map((m) => ({ month: m, n: months[m].length, prevention: mean(months[m].map((s) => s.prevention)), mitigation: mean(months[m].map((s) => s.mitigation)), protection: mean(months[m].map((s) => s.protection)) }));
  const checks = scored.reduce((a, { s }) => a + s.checks, 0), na = scored.reduce((a, { s }) => a + s.naCount, 0);
  return { observations: list.length, categories, controlGaps, trend, naRate: pct(na, checks) };
}

// A checklist is { category, controls: [{ kind, text }] }. Cleans one that came from an upload or an editor.
// A control's id comes from its wording (never from its position), so the same control keeps the same id across checklist versions
// and a control whose wording changes is counted separately instead of being silently mixed with the old one in the results.
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); };
export function cleanChecklist(input) {
  const s = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const seen = new Set(); const controls = [];
  (Array.isArray(input && input.controls) ? input.controls : []).forEach((c) => {
    const text = s(c && c.text, 300); if (!text) return;
    const kind = c.kind === 'mitigation' ? 'mitigation' : 'prevention';
    let id = 'k' + hash(kind + '|' + text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()); while (seen.has(id)) id += '_'; seen.add(id);
    controls.push({ id, kind, text });
  });
  return { category: s(input && input.category, 40), controls: controls.slice(0, 40) };
}
