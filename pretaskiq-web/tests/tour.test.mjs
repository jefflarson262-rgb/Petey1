// The guided tour's spoken lines are recordings. If a step's words change and its clip is not recorded again, the voice would say something
// different from the caption. This test fails until the clips are regenerated (and the manifest updated).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const src = readFileSync(new URL('../src/legacy/scripts/38-guided-tour.js', import.meta.url), 'utf8');
const TOURS = new Function(src.slice(src.indexOf('var TOURS = {'), src.indexOf('PT.tourDefinitions')) + ';return TOURS;')();
const manifest = JSON.parse(readFileSync(new URL('../public/tour/audio/manifest.json', import.meta.url), 'utf8'));
const dir = new URL('../public/tour/audio/', import.meta.url);

test('every tour step has a recording that matches its words', () => {
  const ids = [];
  for (const [key, tour] of Object.entries(TOURS)) {
    tour.steps.forEach((s, i) => {
      const id = `${key}-${i + 1}`; ids.push(id);
      assert.ok(s.title && s.text, `${id} has a title and text`);
      assert.ok(existsSync(new URL(`${id}.mp3`, dir)), `${id}.mp3 exists`);
      assert.equal(manifest[id], createHash('sha1').update(s.text).digest('hex'), `${id}: the words changed since the clip was recorded, so record it again`);
    });
  }
  assert.deepEqual(Object.keys(manifest).sort(), ids.sort(), 'the manifest lists exactly the current steps');
});

test('every tour is for a real role and every step names a screen that exists', () => {
  const screens = ['intake', 'document', 'admin', 'construction'];
  for (const [key, tour] of Object.entries(TOURS)) {
    assert.ok(['foreman', 'safety', 'construction'].includes(tour.role), key);
    for (const s of tour.steps) assert.ok(screens.includes(s.screen), `${key}: ${s.title} uses screen ${s.screen}`);
  }
});
