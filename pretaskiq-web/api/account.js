// One serverless function for the account endpoints (Vercel's free plan allows only 12 functions, so these share one).
// vercel.json rewrites /api/me, /api/company, /api/owner and /api/jobs here with ?area=me|company|owner|jobs.
import me from '../server/handlers/me.js';
import company from '../server/handlers/company.js';
import owner from '../server/handlers/owner.js';
import jobs from '../server/handlers/jobs.js';
import metrics from '../server/handlers/metrics.js';
import { send } from '../server/http.js';

const AREAS = { me, company, owner, jobs, metrics };

export default async function handler(req, res) {
  let area = req.query && req.query.area;
  if (!area) { try { area = new URL(req.url || '', 'http://x').searchParams.get('area'); } catch { /* fall through */ } }
  if (!area) { const m = /\/api\/(me|company|owner|jobs|metrics)(?:[/?]|$)/.exec(req.url || ''); area = m && m[1]; }
  const fn = AREAS[String(area || '')];
  if (!fn) return send(res, 404, { error: 'not_found' });
  return fn(req, res);
}
