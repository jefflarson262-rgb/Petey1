import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTemplate, checkAudit, MAX_PHOTO_CHARS, MAX_PHOTOS_PER_ITEM } from '../src/shared/audit.js';

const tpl = () => cleanTemplate({ title: '  Test audit ', items: [{ text: 'Item one' }, { text: 'Item two', section: 'B' }, { text: 'Item three' }] });
const jpg = (n = 100) => 'data:image/jpeg;base64,' + 'A'.repeat(n);

test('cleanTemplate: trims, drops blanks, ids come from wording so reordering keeps them', () => {
  const t = tpl(); assert.equal(t.title, 'Test audit'); assert.equal(t.items.length, 3); assert.equal(new Set(t.items.map((i) => i.id)).size, 3);
  const r = cleanTemplate({ items: [{ text: 'Item three' }, { text: '  ' }, { text: 'Item one' }] }); assert.equal(r.items.length, 2);
  assert.equal(r.items[0].id, t.items[2].id); assert.equal(r.items[1].id, t.items[0].id);
  assert.equal(cleanTemplate({ items: [{ text: 'Same' }, { text: 'Same' }] }).items.length, 2);
  assert.equal(cleanTemplate(null).items.length, 0);
});

test('every item must be answered', () => {
  const t = tpl(); const r = checkAudit(t, [{ id: t.items[0].id, result: 'pass' }]);
  assert.equal(r.ok, false); assert.equal(r.missing.length, 2); assert.match(r.missing[0], /Item 2 has no answer/);
});

test('a Fail needs a comment; with one it passes the check', () => {
  const t = tpl(); const base = [{ id: t.items[0].id, result: 'pass' }, { id: t.items[2].id, result: 'na' }];
  const bad = checkAudit(t, [...base, { id: t.items[1].id, result: 'fail', comment: '  ' }]);
  assert.equal(bad.ok, false); assert.match(bad.missing[0], /failed and needs a comment/);
  const good = checkAudit(t, [...base, { id: t.items[1].id, result: 'fail', comment: 'Guard missing' }]);
  assert.equal(good.ok, true); assert.deepEqual(good.counts, { pass: 1, fail: 1, na: 1, total: 3 });
});

test('score is passed / (passed + failed), N/A left out, blank when nothing applied', () => {
  const t = tpl();
  assert.equal(checkAudit(t, [{ id: t.items[0].id, result: 'pass' }, { id: t.items[1].id, result: 'pass' }, { id: t.items[2].id, result: 'fail', comment: 'no' + 'pe' }]).score, 66.7);
  assert.equal(checkAudit(t, t.items.map((i) => ({ id: i.id, result: 'na' }))).score, null);
});

test('photos: only small JPEG data URLs are kept, capped per item and per audit', () => {
  const t = tpl(); const ans = (photos) => t.items.map((i, k) => ({ id: i.id, result: 'pass', photos: k === 0 ? photos : [] }));
  const r = checkAudit(t, ans([jpg(), 'http://evil/x.jpg', 'data:image/png;base64,AAA', jpg(MAX_PHOTO_CHARS + 10), jpg(), jpg(), jpg(), jpg(), jpg()]));
  assert.equal(r.answers[0].photos.length, MAX_PHOTOS_PER_ITEM);
  const big = checkAudit(t, t.items.map((i) => ({ id: i.id, result: 'pass', photos: [jpg(), jpg(), jpg(), jpg()] })).concat([]));
  assert.equal(big.photos, 12); assert.equal(big.ok, true);
  const t2 = cleanTemplate({ items: Array.from({ length: 5 }, (_, k) => ({ text: 'Item ' + k })) });
  const over = checkAudit(t2, t2.items.map((i) => ({ id: i.id, result: 'pass', photos: [jpg(), jpg(), jpg(), jpg()] })));
  assert.equal(over.ok, false); assert.match(over.missing.at(-1), /Too many photos/);
});

test('unknown answer ids are ignored and an empty template is never ok', () => {
  const t = tpl(); const r = checkAudit(t, [...t.items.map((i) => ({ id: i.id, result: 'pass' })), { id: 'zzz', result: 'fail' }]);
  assert.equal(r.ok, true); assert.equal(r.answers.length, 3);
  assert.equal(checkAudit({ items: [] }, []).ok, false); assert.equal(checkAudit(null, null).ok, false);
});
