// Works out who is calling an API function: checks the sign-in token with Supabase, then looks up that person's profile.
import { readConfig } from './config.js';
import { adminClient, authClient, dbError } from './supabase.js';
import { HttpError } from './http.js';
import { companyDb } from './company.js';
import { featuresFor } from '../src/shared/licensing.js';

export const ROLES = ['foreman', 'safety', 'construction'];

export function requireSupabaseMode(cfg = readConfig()) {
  if (cfg.mode === 'misconfigured') throw new HttpError(503, 'supabase_misconfigured', { missing: cfg.missing, problem: cfg.urlProblem });
  if (cfg.mode !== 'supabase') throw new HttpError(503, 'supabase_not_configured');
  return cfg;
}

// Returns { cfg, user, profile, admin }. Throws 401 (not signed in), 403 (signed in but not approved / wrong role).
// Options: roles (allowed roles), feature (a licensed feature this endpoint needs), allowInactive (let a suspended company through, for /api/me and the owner tools).
export async function requireUser(req, { roles, feature, allowInactive } = {}) {
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
  if (!profile.company_id) throw new HttpError(403, 'no_company');
  const { data: company, error: ce } = await admin.from('companies').select('*').eq('id', profile.company_id).maybeSingle();
  if (ce) throw dbError(ce);
  if (!company) throw new HttpError(403, 'no_company');
  if (company.status !== 'active' && !allowInactive) throw new HttpError(403, 'license_inactive');
  const features = featuresFor(company.tier);
  if (feature && !features.includes(feature)) throw new HttpError(403, 'feature_not_licensed', { feature });
  return { cfg, user, profile, admin, company, features, isOwner: !!profile.is_owner, db: companyDb(admin, company.id) };
}
