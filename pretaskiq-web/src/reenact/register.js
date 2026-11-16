// Makes approved storyboards playable: puts each one into the player's list (window.REENACTMENTS) under every name Petey might use for the incident.
// Anything not approved is never registered, so crews can only ever see reviewed replays. The two built-in replays (INC-310, INC-270) are never overwritten.
import { sanitizeStoryboard, storyboardDef } from '../shared/storyboard.js';

const BUILT_IN = new Set(['INC-310', 'INC-270']);
let mine = new Set();                       // names this file added, so it can take them away again without touching the built-ins

export const aliasesOf = (entry) => [entry.title, entry.id, entry.dbId, entry.incidentId].filter((v) => v !== undefined && v !== null && String(v).trim() !== '').map((v) => String(v).trim().slice(0, 80));

export function draftDef(storyboard, meta) { const r = sanitizeStoryboard(storyboard); return r.ok ? storyboardDef(r.storyboard, meta) : null; }

// Call whenever the knowledge-base list changes.
export function syncApproved(entries) {
  const reg = (window.REENACTMENTS = window.REENACTMENTS || {});
  mine.forEach((name) => { delete reg[name]; }); mine = new Set();
  for (const e of entries || []) {
    const r = e && e.reenactment;
    if (!r || r.status !== 'approved' || e.kbType !== 'incident') continue;
    if (e.saveState && e.saveState !== 'saved') continue;          // not safely stored yet: not live
    const clean = sanitizeStoryboard(r.storyboard); if (!clean.ok) continue;
    const def = storyboardDef(clean.storyboard, { approvedBy: r.approvedBy });
    for (const name of aliasesOf(e)) { if (BUILT_IN.has(name) || (reg[name] && !mine.has(name))) continue; reg[name] = def; mine.add(name); }
  }
}

// The player opens a draft under this name (never offered to crews).
export function registerPreview(storyboard, meta) { const def = draftDef(storyboard, meta); if (!def) return false; (window.REENACTMENTS = window.REENACTMENTS || {}).__preview = def; return true; }
