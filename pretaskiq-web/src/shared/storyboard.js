// Reenactment storyboards: the small piece of data an incident replay is drawn from.
// The AI drafts one from the written incident record, a Safety Admin edits the wording and approves it, and the player draws it.
// This file is the one gate every storyboard passes through (the browser and the server both use it): it keeps only a fixed vocabulary of
// scene objects, events and people, clamps every number, cuts every string to length, and strips anything that could be page code.
// The player draws text only as plain text and never puts a storyboard string into markup.

export const OBJECT_TYPES = ['ladder', 'platform', 'panel', 'overhead', 'load', 'vehicle', 'trench', 'tool', 'barricade', 'sign', 'energy'];
export const EVENTS = ['none', 'hazard', 'strike', 'fall', 'energized', 'swing', 'contact', 'safe'];
export const LEVELS = ['ground', 'elevated', 'trench'];
export const LIMITS = { actors: 5, objects: 8, beats: 12, minBeats: 3, controls: 6, unknowns: 6, line: 64, label: 28, title: 90, note: 400, control: 70, controlFull: 200, unknown: 120, ppe: 3, ppeText: 24 };

const ID = /^[a-z][a-z0-9_]{0,11}$/;
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>&"`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const pick = (v, list, d) => (list.includes(v) ? v : d);

// Returns { ok: true, storyboard } with a cleaned copy, or { ok: false, reason }.
export function sanitizeStoryboard(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'The draft was not in the expected form.' };
  const used = new Set();
  const ids = (v, prefix, i) => { let id = typeof v === 'string' && ID.test(v) ? v : prefix + (i + 1); while (used.has(id)) id += 'x'; id = id.slice(0, 12); used.add(id); return id; };

  const actors = (Array.isArray(raw.actors) ? raw.actors : []).slice(0, LIMITS.actors).map((a, i) => {
    a = a && typeof a === 'object' ? a : {};
    return { id: ids(a.id, 'p', i), label: str(a.label, LIMITS.label) || 'Worker ' + (i + 1), x: num(a.x, 4, 96, 50), level: pick(a.level, LEVELS, 'ground'),
      ppe: (Array.isArray(a.ppe) ? a.ppe : []).slice(0, LIMITS.ppe).map((p) => str(p, LIMITS.ppeText)).filter(Boolean) };
  });
  if (!actors.length) return { ok: false, reason: 'The draft has no people in it.' };
  const objects = (Array.isArray(raw.objects) ? raw.objects : []).slice(0, LIMITS.objects).filter((o) => o && OBJECT_TYPES.includes(o.type)).map((o, i) => ({
    id: ids(o.id, 'o', i), type: o.type, label: str(o.label, LIMITS.label), x: num(o.x, 4, 96, 50), phase: pick(o.phase, ['both', 'happened', 'controls'], 'both') }));

  const known = new Set([...actors, ...objects].map((e) => e.id));
  const ref = (v) => (typeof v === 'string' && known.has(v) ? v : null);
  const beatsIn = (Array.isArray(raw.beats) ? raw.beats : []).slice(0, LIMITS.beats).filter((b) => b && typeof b === 'object');
  let beats = beatsIn.map((b) => {
    const cap = Array.isArray(b.caption) ? b.caption : [b.caption];
    let event = pick(b.event, EVENTS, 'none'); const from = ref(b.from), to = ref(b.to);
    if (event === 'strike' && !(from && to)) event = to ? 'contact' : 'none';
    if (event === 'swing' && !(from && to)) event = 'none';
    if (['hazard', 'fall', 'energized', 'contact', 'safe'].includes(event) && !(to || ref(b.focus))) event = 'none';
    return { phase: pick(b.phase, ['happened', 'controls'], 'happened'), caption: [str(cap[0], LIMITS.line), str(cap[1], LIMITS.line)], focus: ref(b.focus), event, from, to,
      move: (Array.isArray(b.move) ? b.move : []).slice(0, 4).filter((m) => m && ref(m.id)).map((m) => ({ id: m.id, ...(m.x !== undefined ? { x: num(m.x, 4, 96, 50) } : {}), ...(LEVELS.includes(m.level) ? { level: m.level } : {}) })) };
  }).filter((b) => b.caption[0]);
  beats = [...beats.filter((b) => b.phase === 'happened'), ...beats.filter((b) => b.phase === 'controls')];     // what happened always comes before the controls
  if (beats.filter((b) => b.phase === 'happened').length < 2) return { ok: false, reason: 'The draft does not describe what happened in enough steps.' };
  if (beats.length < LIMITS.minBeats) return { ok: false, reason: 'The draft has too few steps.' };

  const controls = (Array.isArray(raw.controls) ? raw.controls : []).slice(0, LIMITS.controls).map((c) => {
    c = typeof c === 'string' ? { short: c, full: c } : (c && typeof c === 'object' ? c : {});
    const short = str(c.short || c.full, LIMITS.control); return { short, full: str(c.full || c.short, LIMITS.controlFull) };
  }).filter((c) => c.short);
  const hasControlBeats = beats.some((b) => b.phase === 'controls');
  return { ok: true, storyboard: {
    version: 1, title: str(raw.title, LIMITS.title) || 'Incident reenactment', kind: pick(raw.kind, ['Incident', 'Near miss'], 'Incident'), setting: pick(raw.setting, ['outdoor', 'indoor'], 'outdoor'),
    actors, objects, beats: hasControlBeats || controls.length ? beats : beats, controls,
    unknowns: (Array.isArray(raw.unknowns) ? raw.unknowns : []).slice(0, LIMITS.unknowns).map((u) => str(u, LIMITS.unknown)).filter(Boolean),
    note: str(raw.note, LIMITS.note) } };
}

// How long each part plays. The player and the review screen both use this, so a preview matches the real thing.
export function storyboardTiming(sb) {
  const TITLE = 1.7, GAP = 0.9;
  let t = TITLE; const beats = []; let prevPhase = 'happened'; let controlsAt = null;
  for (const b of sb.beats) {
    if (b.phase === 'controls' && prevPhase !== 'controls') { t += GAP; controlsAt = t; }
    const words = (b.caption[0] + ' ' + b.caption[1]).trim().split(/\s+/).filter(Boolean).length;
    const dur = Math.min(5.4, Math.max(2.6, 1.9 + words * 0.3)) + (b.event !== 'none' ? 0.5 : 0);
    beats.push({ t0: t, t1: t + dur }); t += dur; prevPhase = b.phase;
  }
  let cardAt = null;
  if (sb.controls.length) { t += 0.5; cardAt = t; t += 1.2 + sb.controls.length * 0.9 + 2.2; } else t += 0.8;
  return { title: TITLE, beats, controlsAt, cardAt, dur: Math.round(t * 100) / 100 };
}

// The player's definition for an approved or draft storyboard.
export function storyboardDef(sb, meta = {}) {
  const timing = storyboardTiming(sb);
  const chapters = [[0, 'What happened']];
  if (timing.controlsAt !== null) chapters.push([timing.controlsAt, 'With controls in place']);
  if (timing.cardAt !== null) chapters.push([timing.cardAt, 'Controls added']);
  return { scene: 'storyboard', kind: sb.kind, title: sb.title, dur: timing.dur, chapters, listTitle: 'Controls added as corrective actions', controls: sb.controls, sb, timing,
    note: (sb.note ? sb.note + ' ' : '') + 'Illustrative storyboard animation, not video footage.' + (meta.approvedBy ? ' Reviewed and approved by ' + str(meta.approvedBy, 60) + '.' : '') };
}
