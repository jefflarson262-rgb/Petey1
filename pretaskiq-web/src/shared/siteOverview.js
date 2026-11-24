// Turns one saved plan into the short summary the Safety Admin "Site Overview" shows.
// Nothing here is invented: every value comes from fields the plan already has (jobTitle, location, taskSteps[].hazards[].riskRating,
// crew[].signature, submitted). Used by api/plans.js (server) and the tests.
//
// status:
//   planning   no crew listed yet, not submitted
//   signing    a crew is listed and not everyone has signed this revision, not submitted
//   ready      everyone has signed this revision, not yet submitted
//   submitted  submitted, and not changed since
//   changed    submitted once, then changed (a newer revision) and not submitted again

const RANK = { low: 1, medium: 2, high: 3 };
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const revOf = (d) => (Number.isInteger(d && d.revision) && d.revision >= 1 ? d.revision : 1);

export function highestRisk(data) {
  let best = 0;
  for (const step of Array.isArray(data && data.taskSteps) ? data.taskSteps : []) {
    for (const h of Array.isArray(step && step.hazards) ? step.hazards : []) {
      const r = RANK[String(h && h.riskRating || '').toLowerCase()] || 0;
      if (r > best) best = r;
    }
  }
  return best === 3 ? 'high' : best === 2 ? 'medium' : best === 1 ? 'low' : null;
}

export function crewCounts(data) {
  const crew = Array.isArray(data && data.crew) ? data.crew : [];
  const rev = revOf(data);
  const signed = crew.filter((p) => p && p.signature && typeof p.signature.d === 'string' && p.signature.d && (Number(p.signature.revision) || 1) >= rev).length;
  return { total: crew.length, signed };
}

export function summarizePlan(row) {
  const data = (row && row.data && typeof row.data === 'object') ? row.data : {};
  const rev = revOf(data);
  const sub = data.submitted && typeof data.submitted === 'object' && data.submitted.at ? data.submitted : null;
  const upToDate = !!sub && (Number(sub.revision) || 1) >= rev;
  const crew = crewCounts(data);
  let status;
  if (upToDate) status = 'submitted';
  else if (sub) status = 'changed';
  else if (crew.total > 0 && crew.signed === crew.total) status = 'ready';
  else if (crew.total > 0) status = 'signing';
  else status = 'planning';
  return {
    id: row.id,
    task: text(data.jobTitle, 200) || text(row.title, 200) || 'Untitled plan',
    area: text(data.location, 200),
    foreman: text(row.owner_name, 120),
    revision: rev,
    status,
    risk: highestRisk(data),
    crew,
    submitted_at: sub ? text(String(sub.at), 40) : null,
    updated_at: row.updated_at || null,
  };
}

// "Done today" = submitted and not changed since.
export const isDone = (s) => s.status === 'submitted';
