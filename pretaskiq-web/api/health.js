// A setup check you can open in a browser: /api/health. Shows true/false and short hints, never any secret value.
import { readConfig } from '../server/config.js';
import { adminClient, describeDbError } from '../server/supabase.js';
import { send, handle } from '../server/http.js';

const TABLES = ['profiles', 'plans', 'plan_revisions', 'ai_usage'];

export default handle(async (req, res) => {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(res, 405, { error: 'method_not_allowed' }); }
  const cfg = readConfig();
  const out = {
    ok: true,
    mode: cfg.mode,
    settings: {
      ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
      SUPABASE_URL: Boolean(cfg.url),
      SUPABASE_PUBLISHABLE_KEY: Boolean(cfg.publishableKey),
      SUPABASE_SECRET_KEY: Boolean(cfg.secretKey),
      ACCESS_CODE: Boolean(process.env.ACCESS_CODE),
    },
  };
  if (cfg.urlProblem) out.problem = cfg.urlProblem;
  if (cfg.mode === 'supabase') {
    const admin = adminClient(cfg);
    out.tables = {};
    for (const t of TABLES) {
      try {
        const { error } = await admin.from(t).select('id').limit(1);   // a normal read, not HEAD: a missing table must show as an error
        out.tables[t] = error ? describeDbError(error).hint : 'ok';
      } catch (e) {
        out.tables[t] = describeDbError(e).hint;
      }
    }
    out.ok = Object.values(out.tables).every((v) => v === 'ok');
    try {
      const { data, error } = await admin.from('profiles').select('id').eq('approved', true).limit(1);
      if (!error) out.hasApprovedUser = (data || []).length > 0;
    } catch { /* leave unset */ }
  } else {
    out.ok = cfg.mode === 'code' ? Boolean(process.env.ANTHROPIC_API_KEY && process.env.ACCESS_CODE) : false;
  }
  return send(res, 200, out);
});
