// The storyboard gate: what the AI drafts is cut down to a fixed vocabulary before anything is drawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeStoryboard, storyboardTiming, storyboardDef, LIMITS } from '../src/shared/storyboard.js';

const good = () => ({
  title: 'Overhead bolt work: fragment strikes a worker below', kind: 'Incident', setting: 'indoor',
  actors: [{ id: 'p1', label: 'Worker on ladder', x: 60, level: 'elevated', ppe: ['Face shield'] }, { id: 'p2', label: 'Worker below', x: 40, level: 'ground', ppe: ['Safety glasses'] }],
  objects: [{ id: 'o1', type: 'ladder', x: 60 }, { id: 'o2', type: 'tool', label: 'Impact drill', x: 60 }, { id: 'o3', type: 'barricade', x: 40, phase: 'controls' }],
  beats: [
    { phase: 'happened', caption: ['A worker on a ladder removes bolts overhead.', 'They wear a face shield.'], focus: 'p1', event: 'none' },
    { phase: 'happened', caption: ['A second worker stands below, looking up.', ''], focus: 'p2', event: 'hazard', to: 'p2' },
    { phase: 'happened', caption: ['A fragment is ejected and strikes the worker below.', ''], event: 'strike', from: 'o2', to: 'p2' },
    { phase: 'controls', caption: ['Same task. An exclusion zone is marked below.', ''], event: 'safe', to: 'o3', move: [{ id: 'p2', x: 20 }] },
  ],
  controls: [{ short: 'Mark an exclusion zone under overhead work', full: 'Establish and mark an exclusion zone beneath any overhead cutting or drilling.' }],
  unknowns: ['The record does not say how long the work had been under way.'], note: 'Based on the incident record.',
});

test('a good storyboard passes and comes back cleaned', () => {
  const r = sanitizeStoryboard(good()); assert.ok(r.ok); const sb = r.storyboard;
  assert.equal(sb.actors.length, 2); assert.equal(sb.objects.length, 3); assert.equal(sb.beats.length, 4); assert.equal(sb.controls.length, 1); assert.equal(sb.version, 1);
  assert.equal(sb.beats[2].event, 'strike'); assert.deepEqual(sb.beats[3].move, [{ id: 'p2', x: 20 }]);
});

test('the AI cannot add things the player does not know: unknown object types, events and levels are dropped or defaulted', () => {
  const g = good(); g.objects.push({ id: 'o9', type: 'script', x: 5 }, { id: 'o8', type: 'ladder; drop table', x: 5 }); g.beats[0].event = 'explode'; g.actors[0].level = 'roof';
  const sb = sanitizeStoryboard(g).storyboard;
  assert.equal(sb.objects.length, 3); assert.equal(sb.beats[0].event, 'none'); assert.equal(sb.actors[0].level, 'ground');
});

test('markup characters are stripped from every piece of text', () => {
  const g = good(); g.title = '<img src=x onerror=alert(1)>Title'; g.actors[0].label = '<b>Bold</b>'; g.beats[0].caption = ['"><script>x()</script> text', '`x` & y']; g.controls[0].short = '<i>c</i>'; g.note = '<a href="x">n</a>'; g.unknowns = ['<u>u</u>'];
  const sb = sanitizeStoryboard(g).storyboard; const all = JSON.stringify(sb);
  assert.ok(!/[<>`&"]{1}[^,:\]}]*[<>]/.test(sb.title)); for (const s of [sb.title, sb.actors[0].label, ...sb.beats[0].caption, sb.controls[0].short, sb.note, sb.unknowns[0]]) assert.ok(!/[<>&"`]/.test(s), s);
  assert.ok(all.includes('Title') && all.includes('Bold'));
});

test('lengths and counts are capped, numbers are clamped', () => {
  const g = good(); g.title = 'T'.repeat(500); g.beats[0].caption = ['c'.repeat(300), 'd'.repeat(300)]; g.actors[0].x = 9999; g.actors[1].x = -40; g.actors[0].label = 'L'.repeat(100);
  for (let i = 0; i < 20; i++) g.beats.push({ phase: 'happened', caption: ['More ' + i, ''] }); for (let i = 0; i < 20; i++) g.actors.push({ id: 'z' + i, x: 50 }); for (let i = 0; i < 20; i++) g.controls.push({ short: 'c' + i });
  const sb = sanitizeStoryboard(g).storyboard;
  assert.equal(sb.title.length, LIMITS.title); assert.equal(sb.beats[0].caption[0].length, LIMITS.line); assert.equal(sb.actors[0].x, 96); assert.equal(sb.actors[1].x, 4); assert.equal(sb.actors[0].label.length, LIMITS.label);
  assert.ok(sb.beats.length <= LIMITS.beats && sb.actors.length <= LIMITS.actors && sb.controls.length <= LIMITS.controls);
});

test('references that point at nothing are removed, and an event that needs a target is downgraded', () => {
  const g = good(); g.beats[2].from = 'ghost'; g.beats[1].to = 'ghost'; g.beats[1].focus = 'ghost'; g.beats[3].move = [{ id: 'ghost', x: 5 }, { id: 'p2', x: 30 }];
  const sb = sanitizeStoryboard(g).storyboard;
  assert.equal(sb.beats[2].event, 'contact'); assert.equal(sb.beats[2].from, null);        // a strike with no source becomes a plain contact at the target
  assert.equal(sb.beats[1].event, 'none'); assert.equal(sb.beats[1].to, null);
  assert.deepEqual(sb.beats[3].move, [{ id: 'p2', x: 30 }]);
});

test('duplicate or bad ids are repaired, not trusted', () => {
  const g = good(); g.actors[1].id = 'p1'; g.objects[0].id = 'BAD ID'; const sb = sanitizeStoryboard(g).storyboard;
  const all = [...sb.actors, ...sb.objects].map((e) => e.id); assert.equal(new Set(all).size, all.length);
  assert.ok(all.every((id) => /^[a-z][a-z0-9_]{0,11}$/.test(id)));
});

test('what happened always plays before the controls, even if the AI mixes them up', () => {
  const g = good(); const c = g.beats.pop(); g.beats.splice(1, 0, c); const sb = sanitizeStoryboard(g).storyboard;
  assert.deepEqual(sb.beats.map((b) => b.phase), ['happened', 'happened', 'happened', 'controls']);
});

test('drafts that are too thin or broken are refused with a reason', () => {
  for (const bad of [null, [], 'x', {}, { actors: [] }, { ...good(), actors: [] }, { ...good(), beats: good().beats.slice(0, 1) }, { ...good(), beats: [{ caption: ['', ''] }, { caption: [''] }, {}] }, { ...good(), beats: 'nope' }]) {
    const r = sanitizeStoryboard(bad); assert.equal(r.ok, false, JSON.stringify(bad)); assert.ok(r.reason.length > 5);
  }
});

test('a storyboard with no controls still works (no controls phase, no card)', () => {
  const g = good(); g.controls = []; g.beats = g.beats.filter((b) => b.phase === 'happened'); g.beats.push({ phase: 'happened', caption: ['The worker is taken for medical evaluation.', ''] });
  const sb = sanitizeStoryboard(g).storyboard; const t = storyboardTiming(sb);
  assert.equal(t.controlsAt, null); assert.equal(t.cardAt, null); assert.ok(t.dur > 8);
  assert.deepEqual(storyboardDef(sb).chapters, [[0, 'What happened']]);
});

test('timing: beats run in order without overlap, controls start after a gap, the card comes last', () => {
  const sb = sanitizeStoryboard(good()).storyboard; const t = storyboardTiming(sb);
  for (let i = 1; i < t.beats.length; i++) assert.ok(t.beats[i].t0 >= t.beats[i - 1].t1);
  assert.ok(t.controlsAt > t.beats[2].t1 && t.controlsAt === t.beats[3].t0); assert.ok(t.cardAt >= t.beats[3].t1); assert.ok(t.dur > t.cardAt);
  assert.ok(t.dur > 10 && t.dur < 90);
  const d = storyboardDef(sb, { approvedBy: '<b>Sam</b> Safety' }); assert.equal(d.scene, 'storyboard'); assert.equal(d.dur, t.dur); assert.equal(d.chapters.length, 3); assert.ok(!/[<>]/.test(d.note) && /Sam/.test(d.note) && /not video footage/.test(d.note));
});
