// Who may use the voice functions (api/speak.js, api/transcribe.js). The same rule as the AI proxy (api/claude.js):
//   Supabase connected -> signed in and approved
//   Supabase not set   -> the shared ACCESS_CODE
import { readConfig } from './config.js';
import { requireUser } from './auth.js';
import { codeMatches } from './code.js';
import { HttpError } from './http.js';

export async function requireVoiceAccess(req) {
  const cfg = readConfig();
  if (cfg.mode === 'misconfigured') throw new HttpError(503, 'supabase_misconfigured', { missing: cfg.missing, problem: cfg.urlProblem });
  if (cfg.mode === 'supabase') { await requireUser(req); return; }
  const accessCode = process.env.ACCESS_CODE;
  if (!accessCode) throw new HttpError(503, 'server_not_configured', { message: 'Set ACCESS_CODE on the server.' });   // fail closed
  if (!codeMatches(req.headers['x-access-code'], accessCode)) throw new HttpError(401, 'invalid_access_code');
}
