// Asks the AI to draft a reenactment storyboard from an incident record, and checks what comes back.
// Pure functions (no network): the dialog supplies the AI call, so this is testable on its own.
import { sanitizeStoryboard, OBJECT_TYPES, EVENTS, LIMITS } from '../shared/storyboard.js';

export const MIN_SOURCE_CHARS = 160;

// The words the draft may be built from: the written account if the record kept one, otherwise the summary fields.
export function sourceFor(entry) {
  const e = entry || {};
  const parts = [e.sourceText, e.incident_narrative, e.change_description, e.affected_work, e.summary]
    .filter((p) => typeof p === 'string' && p.trim());
  const seen = new Set(); const uniq = parts.filter((p) => { const k = p.trim(); if (seen.has(k)) return false; seen.add(k); return true; });
  const text = uniq.join('\n\n').slice(0, 8000);
  return { text, thin: text.length < MIN_SOURCE_CHARS };
}

export const SYSTEM = [
  'You draw simple storyboards for safety training from a written incident record. A person reviews your draft before any crew sees it.',
  'Use ONLY facts stated in the record. Never invent details: no names, no injuries beyond what is written, no causes, tools, heights or distances that are not stated.',
  'Refer to people by role only (for example "Worker on ladder", "Worker below"). Never use a real name. Show no graphic injury; describe it plainly and briefly.',
  'Anything the record does not say that a viewer might wonder about goes in "unknowns", not in the picture.',
  'If the record is too thin, or the incident cannot be shown with the pieces below, answer exactly {"insufficient":true,"reason":"<one plain sentence>"} instead of guessing.',
  'Reply with ONLY one JSON object, no markdown.',
].join('\n');

export function buildUserPrompt(entry) {
  const { text } = sourceFor(entry);
  return [
    'INCIDENT RECORD (title: ' + String((entry && entry.title) || 'untitled').slice(0, 120) + '):',
    '"""', text, '"""',
    '',
    'Return JSON in this shape:',
    '{',
    '  "title": "short title (max ' + LIMITS.title + ' chars)",',
    '  "kind": "Incident" or "Near miss",',
    '  "setting": "outdoor" or "indoor",',
    '  "actors": [{"id":"p1","label":"role, max ' + LIMITS.label + ' chars","x":0-100 position left to right,"level":"ground"|"elevated"|"trench","ppe":["only PPE the record says they wore"]}],   // 1 to ' + LIMITS.actors,
    '  "objects": [{"id":"o1","type":"' + OBJECT_TYPES.join('|') + '","label":"max ' + LIMITS.label + ' chars","x":0-100,"phase":"both"|"happened"|"controls"}],   // up to ' + LIMITS.objects + '; phase "controls" = only shown after the controls are added',
    '  "beats": [{"phase":"happened"|"controls","caption":["line 1 (max ' + LIMITS.line + ' chars)","line 2 (max ' + LIMITS.line + ' chars)"],"focus":"id or null","event":"' + EVENTS.join('|') + '","from":"id or null","to":"id or null","move":[{"id":"id","x":0-100,"level":"ground|elevated|trench"}]}],   // ' + LIMITS.minBeats + ' to ' + LIMITS.beats + ' beats; at least 2 with phase "happened"',
    '  "controls": [{"short":"max ' + LIMITS.control + ' chars","full":"one sentence"}],   // controls that would have prevented it, ONLY if the record states them or they are standard for this exact hazard; up to ' + LIMITS.controls,
    '  "unknowns": ["what the record does not say", "..."],',
    '  "note": "one sentence of context, optional"',
    '}',
    'Events: strike = something (from) hits a person (to); fall = to falls; energized = to touches live equipment; swing = a load (from) swings toward a person (to); hazard = highlight a danger at "focus" or "to"; contact = contact with "to"; safe = shows safety at "focus" or "to"; none otherwise.',
    'The "happened" beats show only what the record says happened. The "controls" beats replay the same task with the controls in place.',
  ].join('\n');
}

// Turns the AI's text into one of: { ok:true, storyboard } | { insufficient:true, reason } | { error }.
export function parseDraft(text) {
  let obj;
  try {
    const s = String(text || '').replace(/```json|```/g, '').trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('no json');
    obj = JSON.parse(s.slice(a, b + 1));
  } catch { return { error: 'The AI sent back something that could not be read. Try again.' }; }
  if (obj && obj.insufficient === true) return { insufficient: true, reason: String(obj.reason || 'The record does not give enough to draw.').slice(0, 300) };
  const r = sanitizeStoryboard(obj);
  return r.ok ? { ok: true, storyboard: r.storyboard } : { insufficient: true, reason: r.reason };
}
