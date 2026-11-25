import { clearStoredCode, getStoredCode, requestAccessCode, storeCode } from './accessCode.js';
import { nativeFetch } from './nativeFetch.js';
import { getAccessToken, getMode, handleSessionExpired } from '../auth/session.js';

// Where the prototype sends its AI requests. Default: our own serverless function on the same site.
export const API_URL = import.meta.env.VITE_API_URL || '/api/claude';

const sameUrl = (a, b) => new URL(a, location.href).href === new URL(b, location.href).href;

// Plain-language versions of the error codes our own server functions send back.
export function friendlyMessage(status, code, body) {
  switch (code) {
    case 'rate_limited': return (body && body.message) || 'You have used Petey a lot this hour. Wait a while, then try again.';
    case 'not_signed_in':
    case 'invalid_session': return 'Your session ended. Sign in again, then repeat that.';
    case 'not_approved': return 'Your account has not been approved yet. Ask your administrator to approve it.';
    case 'license_inactive': return 'Your company license is not active. Contact your administrator.';
    case 'feature_not_licensed': return 'That feature is not part of your company license.';
    case 'no_company': return 'Your account is not attached to a company yet. Contact your administrator.';
    case 'seat_limit_reached': return 'Your license has no free seats. Switch someone off, or ask to add seats.';
    case 'email_in_use': return 'That email already has an account.';
    case 'invalid_email': return 'That email address does not look right.';
    case 'invalid_role': return 'Pick a valid role.';
    case 'cannot_deactivate_self': return 'You cannot switch off your own access.';
    case 'cannot_suspend_own_company': return 'You cannot suspend your own company.';
    case 'owner_only': return 'Only the platform owner can do that.';
    case 'account_create_failed': return 'The account could not be created. Try again.';
    case 'name_required': return 'Enter a company name.';
    case 'invalid_tier': return 'Pick a tier.';
    case 'invalid_seat_limit': return 'Seats must be a whole number of 1 or more (or blank for no limit).';
    case 'admin_required': return 'Enter the first administrator\'s email.';
    case 'wrong_role': return 'Your account is not allowed to do that.';
    case 'read_only': return 'You can read this plan but not change it, so your change was not saved.';
    case 'plan_not_found': return 'That plan could not be found.';
    case 'plan_too_large': return 'This plan is too large to save.';
    case 'job_not_found': return 'That job could not be found. It may have been removed.';
    case 'document_not_found': return 'That document could not be found. It may have been removed.';
    case 'file_not_found': return 'The original file could not be found.';
    case 'title_required': return 'Enter a title.';
    case 'expiry_required': return 'Enter the expiry date shown on the document.';
    case 'expiry_not_allowed': return 'Only permits and 811 tickets have an expiry date.';
    case 'invalid_date': return 'That date does not look right.';
    case 'invalid_file_type': return 'Only PDF, PNG or JPG files can be kept.';
    case 'file_too_large': return 'That file is too large.';
    case 'file_missing': return 'The file did not finish uploading. Try again.';
    case 'invalid_file': return 'That file could not be attached. Try again.';
    case 'storage_unavailable': return 'File storage is not ready. Ask your administrator to check the Supabase setup (the job-files bucket).';
    case 'supabase_misconfigured': return 'Sign-in is not set up correctly on the server. Open /api/health to see what is missing.';
    case 'database_error': return `The plan database is not ready${body && body.hint ? ` (${String(body.hint).replace(/_/g, ' ')})` : ''}. Open /api/health to see what to fix.`;
    case 'server_not_configured': return 'The server is missing a setting (the Anthropic key). Open /api/health to check.';
    default: return `Something went wrong (${status}). Try again.`;
  }
}

export class ApiError extends Error {
  constructor(status, code, message, body) { super(message); this.status = status; this.code = code; this.body = body || null; }
}

// Calls one of our own JSON endpoints (/api/plans, ...) as the signed-in person. Throws ApiError with a message fit to show.
export async function apiJson(path, { method = 'GET', body } = {}) {
  const token = await getAccessToken();
  const headers = { accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res;
  try { res = await nativeFetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new ApiError(0, 'network', 'Could not reach the server. Check your connection and try again.'); }
  let json = null; try { json = await res.json(); } catch { /* not json */ }
  if (res.ok) return json;
  const code = json && typeof json.error === 'string' ? json.error : 'error';
  if (res.status === 401) handleSessionExpired();
  throw new ApiError(res.status, code, friendlyMessage(res.status, code, json), json);
}

// The prototype prints "API error <status>: <body>" in the chat when a request fails. For a missing or wrong access
// code, swap the raw server reply for a sentence a foreman can act on.
const textResponse = (text, status) => new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
const codeProblem = (wrong) => textResponse(
  wrong ? 'That access code was not accepted. Send your message again to try another code.'
        : 'An access code is needed for live AI answers. Send your message again to enter it.', 401);

// Signed-in mode: send the person's token; turn our own error codes into plain sentences. Anthropic's own errors
// (whose "error" is an object, not a string) pass through untouched.
async function accountFetch(input, init) {
  if ((init.method || 'GET').toUpperCase() !== 'POST') return nativeFetch(input, init);
  const token = await getAccessToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await nativeFetch(input, { ...init, headers });
  if (res.ok) return res;
  let body = null; try { body = await res.clone().json(); } catch { /* not json */ }
  if (!body || typeof body.error !== 'string') return res;
  if (res.status === 401) handleSessionExpired();
  return textResponse(friendlyMessage(res.status, body.error, body), res.status);
}

// Shared-code mode (no Supabase on the server): the access code rides along, and a 401 on a POST opens the code dialog once and retries.
async function codeFetch(input, init) {
  const method = (init.method || 'GET').toUpperCase();
  const send = (code) => {
    const headers = new Headers(init.headers || {});
    if (code) headers.set('x-access-code', code);
    return nativeFetch(input, { ...init, headers });
  };
  let response = await send(getStoredCode());
  if (response.status === 401 && method === 'POST') {
    const stored = getStoredCode();
    if (stored) clearStoredCode();                         // the saved code stopped working
    const code = await requestAccessCode({ wrong: Boolean(stored) });
    if (!code) return codeProblem(false);                  // cancelled
    response = await send(code);
    if (response.status === 401) return codeProblem(true); // typed a wrong code
    storeCode(code);
  }
  return response;
}

// The prototype's scripts call fetch() directly (they read window.PRETASKIQ_API_URL). Rather than edit all five call
// sites, wrap fetch once. Only requests to the AI proxy are touched.
export function installApiClient() {
  window.PRETASKIQ_API_URL = API_URL;
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!sameUrl(url, API_URL)) return nativeFetch(input, init);
    return getMode() === 'supabase' ? accountFetch(input, init) : codeFetch(input, init);
  };
}
