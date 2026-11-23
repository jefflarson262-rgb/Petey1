// The in-depth incident report that a Safety Administrator completes after a foreman's preliminary report.
// Used by the browser (to show what is missing) and by the server (api/incidents.js, which is the one that really enforces it).
export const KINDS = { near_miss: 'Near miss', injury: 'Injury / first aid', damage: 'Property damage' };
export const DUE_HOURS = 24;

// What to collect or preserve for the investigation. Each one is marked Collected or Not available before the report can be completed.
export const EVIDENCE_ITEMS = [
  { id: 'photos', label: 'Photos or video of the scene' },
  { id: 'jha', label: "That day's plan (JHA) for the work" },
  { id: 'permits', label: 'Permits and lockout/tagout records' },
  { id: 'equipment', label: 'Equipment inspection and maintenance records' },
  { id: 'training', label: 'Training and qualification records' },
  { id: 'statements', label: 'Written statements from those involved' },
  { id: 'conditions', label: 'Site conditions (weather, lighting, housekeeping)' },
  { id: 'procedures', label: 'Drawings, procedures or instructions that were in use' },
];
export const FACTOR_CATEGORIES = [
  { id: 'people', label: 'People', hint: 'Staffing, experience, fatigue, communication, supervision' },
  { id: 'equipment', label: 'Equipment', hint: 'Condition, inspection, suitability, guarding' },
  { id: 'materials', label: 'Materials', hint: 'Quality, storage, handling, delivery' },
  { id: 'methods', label: 'Methods', hint: 'Procedure, sequence, planning, permits' },
  { id: 'environment', label: 'Environment', hint: 'Weather, lighting, noise, space, housekeeping' },
  { id: 'management', label: 'Management and systems', hint: 'Training, resources, scheduling, policies' },
];
// A reminder list only. It decides nothing about what is required: that is for the company's safety professional.
export const NOTIFY_ITEMS = [
  { id: 'supervisor', label: 'Project manager / superintendent' },
  { id: 'owner', label: 'Owner or client' },
  { id: 'insurer', label: 'Insurance carrier or broker' },
  { id: 'regulator', label: 'Government agency (check whether a report is required and by when)' },
  { id: 'others', label: 'Other contractors, union or site representatives' },
];

const s = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);

export function blankFull() {
  return sanitizeFull({}).full;
}

// Cleans whatever the browser sent into the one shape the report may have. Never throws. Also says what is still missing for completion.
export function sanitizeFull(input) {
  const f = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const timeline = (Array.isArray(f.timeline) ? f.timeline : []).map((t) => ({ when: s(t && t.when, 40), what: s(t && t.what, 240) })).filter((t) => t.what).slice(0, 30);
  const evById = new Map((Array.isArray(f.evidence) ? f.evidence : []).map((e) => [e && e.id, e]));
  const evidence = EVIDENCE_ITEMS.map((it) => { const e = evById.get(it.id) || {}; return { id: it.id, label: it.label, status: oneOf(e.status, ['pending', 'collected', 'not_available'], 'pending'), note: s(e.note, 240) }; });
  const witnesses = (Array.isArray(f.witnesses) ? f.witnesses : []).map((w) => ({ role: s(w && w.role, 60), status: oneOf(w && w.status, ['to_interview', 'interviewed'], 'to_interview'), note: s(w && w.note, 240) })).filter((w) => w.role).slice(0, 12);
  const fIn = f.factors && typeof f.factors === 'object' ? f.factors : {};
  const factors = {}; FACTOR_CATEGORIES.forEach((c) => { factors[c.id] = s(fIn[c.id], 400); });
  const interim = (Array.isArray(f.interim) ? f.interim : []).map((x) => s(x, 200)).filter(Boolean).slice(0, 8);
  const nById = new Map((Array.isArray(f.notify) ? f.notify : []).map((n) => [n && n.id, n]));
  const notify = NOTIFY_ITEMS.map((it) => { const n = nById.get(it.id) || {}; return { id: it.id, label: it.label, status: oneOf(n.status, ['pending', 'done', 'to_do', 'not_needed'], 'pending'), note: s(n.note, 240) }; });
  const full = {
    timeline, evidence, witnesses, witnessesNone: f.witnessesNone === true, factors, factorsNone: f.factorsNone === true,
    interim, interimNone: s(f.interimNone, 200), areaSecured: oneOf(f.areaSecured, ['yes', 'no', 'na', ''], ''), notify, notes: s(f.notes, 1000),
  };
  const missing = [];
  if (!full.timeline.length) missing.push('Add at least one event to the timeline.');
  const pe = full.evidence.filter((e) => e.status === 'pending').length;
  if (pe) missing.push('Mark each evidence item Collected or Not available (' + pe + ' left).');
  if (!full.witnesses.length && !full.witnessesNone) missing.push('List who should be interviewed, or confirm there were no witnesses.');
  if (!FACTOR_CATEGORIES.some((c) => full.factors[c.id]) && !full.factorsNone) missing.push('Add at least one lead under contributing factors, or confirm none are known yet.');
  if (!full.interim.length && !full.interimNone) missing.push('List the interim controls, or say why none were needed.');
  if (!full.areaSecured) missing.push('Say whether the area was secured.');
  const pn = full.notify.filter((n) => n.status === 'pending').length;
  if (pn) missing.push('Mark each notification item Done, To do or Not needed (' + pn + ' left).');
  return { full, missing, ok: missing.length === 0 };
}
