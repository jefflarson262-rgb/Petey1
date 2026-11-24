import test from 'node:test';
import assert from 'node:assert/strict';
import { controlResult, scoreObservation, summarize, cleanChecklist } from '../src/shared/protection.js';

// Made-up controls, for testing the arithmetic only.
const ctl = (id, kind, applies, present, works) => ({ id, kind, applies, present, works });
const obs = (category, month, controls) => ({ category, month, controls });

test('a control is in place only when it applies, is present and works today', () => {
  assert.equal(controlResult({ applies: false, present: true, works: true }), 'na');
  assert.equal(controlResult({ applies: true, present: false }), 'missing');
  assert.equal(controlResult({ applies: true, present: true, works: false }), 'not_working');
  assert.equal(controlResult({ applies: true, present: true, works: true }), 'in_place');
  assert.equal(controlResult(null), 'na');
});

test('one observation: percentages are controls in place / controls required, N/A left out', () => {
  const s = scoreObservation(obs('x', '2026-06', [
    ctl('p1', 'prevention', true, true, true), ctl('p2', 'prevention', true, true, true), ctl('p3', 'prevention', true, true, false), ctl('p4', 'prevention', true, false, false),
    ctl('m1', 'mitigation', true, true, true), ctl('m2', 'mitigation', true, false, false), ctl('m3', 'mitigation', false, false, false)]));
  assert.equal(s.prevention, 50); assert.equal(s.mitigation, 50); assert.equal(s.protection, 50);   // 3 of 6 required in place; m3 excluded
  assert.equal(s.required, 6); assert.equal(s.inPlace, 3); assert.equal(s.naCount, 1); assert.equal(s.checks, 7);
});

test('nothing required gives null, not 0 or 100', () => {
  const s = scoreObservation(obs('x', '2026-06', [ctl('p1', 'prevention', false), ctl('m1', 'mitigation', false)]));
  assert.deepEqual([s.prevention, s.mitigation, s.protection], [null, null, null]);
  assert.equal(scoreObservation({}).protection, null);
});

test('summary: category averages, most-missed controls, N/A rate and monthly trend', () => {
  const all = [
    obs('exc', '2026-05', [ctl('p1', 'prevention', true, true, true), ctl('m1', 'mitigation', true, false, false)]),
    obs('exc', '2026-06', [ctl('p1', 'prevention', true, false, false), ctl('m1', 'mitigation', true, false, false)]),
    obs('exc', '2026-06', [ctl('p1', 'prevention', true, true, true), ctl('m1', 'mitigation', false)]),
  ];
  const r = summarize(all);
  assert.equal(r.observations, 3);
  const c = r.categories[0]; assert.equal(c.n, 3); assert.equal(c.prevention, 66.7); assert.equal(c.mitigation, 0);    // prevention (100+0+100)/3; mitigation (0+0) ignoring the null
  assert.equal(r.controlGaps[0].id, 'm1'); assert.equal(r.controlGaps[0].gapRate, 100); assert.equal(r.controlGaps[0].required, 2);
  assert.equal(r.controlGaps[1].id, 'p1'); assert.equal(r.controlGaps[1].gapRate, 33.3);
  assert.equal(r.naRate, 16.7);                                                                                          // 1 of 6 checks
  assert.deepEqual(r.trend.map((t) => [t.month, t.n]), [['2026-05', 2 - 1], ['2026-06', 2]]);
  assert.equal(r.trend[1].protection, 50);                                                                                // (0 + 100) / 2
});

test('summary is safe on empty or bad input', () => {
  assert.equal(summarize([]).observations, 0); assert.equal(summarize(null).naRate, null); assert.equal(summarize([null, {}, { controls: 'x' }]).observations, 0);
});

test('cleanChecklist: trims, caps and gives each control an id from its wording, never position', () => {
  const r = cleanChecklist({ category: 'excavation', controls: [{ text: '  A  ', kind: 'mitigation' }, { id: 'ignored', text: 'B' }, { text: 'C' }, { text: 'C' }, { text: '   ' }] });
  assert.deepEqual(r.controls.map((c) => c.text), ['A', 'B', 'C', 'C']); assert.equal(new Set(r.controls.map((c) => c.id)).size, 4);
  assert.equal(r.controls[0].kind, 'mitigation'); assert.equal(r.controls[1].kind, 'prevention'); assert.ok(!r.controls.some((c) => c.id === 'ignored'));
  const again = cleanChecklist({ controls: [{ text: 'C' }, { text: 'B' }] });                                   // reordered: same ids
  assert.equal(again.controls[1].id, r.controls[1].id); assert.equal(again.controls[0].id, r.controls[2].id);
  assert.notEqual(cleanChecklist({ controls: [{ text: 'B changed' }] }).controls[0].id, r.controls[1].id);        // reworded: a different id
});
