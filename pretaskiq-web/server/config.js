// Reads the Supabase settings from environment variables and decides which sign-in mode the site runs in.
//   all three set   -> 'supabase'      people sign in with an email and password
//   none set        -> 'code'          the earlier shared access code (so the site keeps working before Supabase is connected)
//   some set        -> 'misconfigured' the site refuses to guess; /api/health says which one is missing
//
// On top of that there is a SIGN-IN SWITCH (below). While it is 'off', the Supabase settings are ignored and the shared access code is used,
// even if all three are filled in on the host. That is how sign-in is turned off for a while without touching the host's settings.
//
//   SUPABASE_URL              project URL, like https://abcd1234.supabase.co
//   SUPABASE_PUBLISHABLE_KEY  the "publishable" key (older projects: the "anon" key). Safe to show in the browser.
//   SUPABASE_SECRET_KEY       the "secret" key (older projects: the "service_role" key). Server only. Never in the browser.

const clean = (v) => String(v ?? '').trim();

// THE SIGN-IN SWITCH (turned on 2026-11-25). 'off' = use the shared access code (ACCESS_CODE) and ignore the Supabase settings. 'on' = people sign in with an email
// and password whenever all three Supabase settings are present. To turn sign-in back on, change this to 'on' (and redeploy), or set
// PRETASKIQ_SIGN_IN=on on the host, which overrides this.
export const SIGN_IN_DEFAULT = 'on';

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
  const asked = clean(env.PRETASKIQ_SIGN_IN).toLowerCase();
  const signIn = asked === 'on' || asked === 'off' ? asked : SIGN_IN_DEFAULT;
  if (signIn === 'off') {
    // Sign-in is switched off: shared access code. (The settings are still reported so /api/health can say they are being ignored.)
    return { mode: 'code', url, publishableKey, secretKey, missing, urlProblem: null, signInOff: true, ignored: missing.length < 3 };
  }
  const mode = missing.length === 3 ? 'code' : missing.length > 0 || urlProblem ? 'misconfigured' : 'supabase';
  return { mode, url, publishableKey, secretKey, missing, urlProblem, signInOff: false, ignored: false };
}

// What the browser is allowed to know. The publishable key is designed to be public; the secret key is never included.
export function publicConfig(cfg = readConfig()) {
  if (cfg.mode === 'supabase') return { auth: 'supabase', supabaseUrl: cfg.url, publishableKey: cfg.publishableKey };
  if (cfg.mode === 'misconfigured') return { auth: 'misconfigured', missing: cfg.missing, problem: cfg.urlProblem };
  return { auth: 'code' };
}
