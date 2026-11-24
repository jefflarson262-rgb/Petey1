// Tests for the Site Overview summary of a saved plan (src/shared/siteOverview.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePlan, highestRisk, crewCounts } from '../src/shared/siteOverview.js';

const sig = (revision = 1) => ({ d: 'M0 0L5 5', vb: '0 0 10 10', at: '2026-11-24T14:00:00Z', revision });
const row = (data, over = {}) => ({ id: 'p1', title: 'Row title', owner_name: 'Ann Foreman', updated_at: '2026-11-24T15:00:00Z', data, ...over });

test('highest risk is the top hazard rating across every task step, or null when none are rated', () => {
  assert.equal(highestRisk({ taskSteps: [{ hazards: [{ riskRating: 'low' }] }, { hazards: [{ riskRating: 'High' }, { riskRating: 'medium' }] }] }), 'high');
  assert.equal(highestRisk({ taskSteps: [{ hazards: [{ riskRating: 'medium' }, { riskRating: 'low' }] }] }), 'medium');
  assert.equal(highestRisk({ taskSteps: [{ hazards: [] }] }), null);
  assert.equal(highestRisk({}), null);
});
test('crew counts only signatures that cover the current revision', () => {
  const d = { revision: 2, crew: [{ name: 'A', signature: sig(2) }, { name: 'B', signature: sig(1) }, { name: 'C', signature: null }] };
  assert.deepEqual(crewCounts(d), { total: 3, signed: 1 });
});
test('status: planning, signing, ready, submitted, changed', () => {
  const base = { jobTitle: 'Bus duct', location: 'Bldg 2, L3', revision: 1 };
  assert.equal(summarizePlan(row({ ...base })).status, 'planning');
  assert.equal(summarizePlan(row({ ...base, crew: [{ name: 'A', signature: sig() }, { name: 'B' }] })).status, 'signing');
  assert.equal(summarizePlan(row({ ...base, crew: [{ name: 'A', signature: sig() }] })).status, 'ready');
  assert.equal(summarizePlan(row({ ...base, crew: [{ name: 'A', signature: sig() }], submitted: { at: '2026-11-24T14:05:00Z', revision: 1 } })).status, 'submitted');
  assert.equal(summarizePlan(row({ ...base, revision: 2, crew: [{ name: 'A', signature: sig(1) }], submitted: { at: '2026-11-24T14:05:00Z', revision: 1 } })).status, 'changed');
});
test('the row carries foreman, task and work area from the plan, and falls back without inventing', () => {
  const s = summarizePlan(row({ jobTitle: 'Bus duct install', location: 'Building 2, level 3', revision: 1 }));
  assert.equal(s.foreman, 'Ann Foreman'); assert.equal(s.task, 'Bus duct install'); assert.equal(s.area, 'Building 2, level 3');
  const bare = summarizePlan(row({}, { owner_name: null, title: '' }));
  assert.equal(bare.task, 'Untitled plan'); assert.equal(bare.area, ''); assert.equal(bare.foreman, ''); assert.equal(bare.risk, null);
});
test('a plan with no data object does not crash the summary', () => {
  assert.equal(summarizePlan({ id: 'x', data: null }).status, 'planning');
});
