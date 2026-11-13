// Reads the Supabase settings from environment variables and decides which sign-in mode the site runs in.
//   all three set   -> 'supabase'      people sign in with an email and password
//   none set        -> 'code'          the earlier shared access code (so the site keeps working before Supabase is connected)
//   some set        -> 'misconfigured' the site refuses to guess; /api/health says which one is missing
//
//   SUPABASE_URL              project URL, like https://abcd1234.supabase.co
//   SUPABASE_PUBLISHABLE_KEY  the "publishable" key (older projects: the "anon" key). Safe to show in the browser.
//   SUPABASE_SECRET_KEY       the "secret" key (older projects: the "service_role" key). Server only. Never in the browser.

const clean = (v) => String(v ?? '').trim();

export function readConfig(env = process.env) {
  const url = clean(env.SUPABASE_URL).replace(/\/+$/, '');
  const publishableKey = clean(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY);
  const secretKey = clean(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY);
  const missing = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!publishableKey) missing.push('SUPABASE_PUBLISHABLE_KEY');
  if (!secretKey) missing.push('SUPABASE_SECRET_KEY');
  let urlProblem = null;
  if (url) {
    try {
      const u = new URL(url);
      const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
      if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) urlProblem = 'SUPABASE_URL must start with https://';
    } catch { urlProblem = 'SUPABASE_URL is not a valid web address'; }
  }
  const mode = missing.length === 3 ? 'code' : missing.length > 0 || urlProblem ? 'misconfigured' : 'supabase';
  return { mode, url, publishableKey, secretKey, missing, urlProblem };
}

// What the browser is allowed to know. The publishable key is designed to be public; the secret key is never included.
export function publicConfig(cfg = readConfig()) {
  if (cfg.mode === 'supabase') return { auth: 'supabase', supabaseUrl: cfg.url, publishableKey: cfg.publishableKey };
  if (cfg.mode === 'misconfigured') return { auth: 'misconfigured', missing: cfg.missing, problem: cfg.urlProblem };
  return { auth: 'code' };
}
