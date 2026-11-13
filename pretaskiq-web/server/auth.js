// Works out who is calling an API function: checks the sign-in token with Supabase, then looks up that person's profile.
import { readConfig } from './config.js';
import { adminClient, authClient, dbError } from './supabase.js';
import { HttpError } from './http.js';

export const ROLES = ['foreman', 'safety', 'construction'];

export function requireSupabaseMode(cfg = readConfig()) {
  if (cfg.mode === 'misconfigured') throw new HttpError(503, 'supabase_misconfigured', { missing: cfg.missing, problem: cfg.urlProblem });
  if (cfg.mode !== 'supabase') throw new HttpError(503, 'supabase_not_configured');
  return cfg;
}

// Returns { cfg, user, profile, admin }. Throws 401 (not signed in), 403 (signed in but not approved / wrong role).
export async function requireUser(req, { roles } = {}) {
  const cfg = requireSupabaseMode();
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
  if (!match) throw new HttpError(401, 'not_signed_in');

  let user;
  try {
    const { data, error } = await authClient(cfg).auth.getUser(match[1].trim());
    if (error || !data || !data.user) throw new HttpError(401, 'invalid_session');
    user = data.user;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(401, 'invalid_session');
  }

  const admin = adminClient(cfg);
  const { data: profile, error } = await admin.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw dbError(error);
  if (!profile || !profile.approved) throw new HttpError(403, 'not_approved');
  if (roles && !roles.includes(profile.role)) throw new HttpError(403, 'wrong_role');
  return { cfg, user, profile, admin };
}
