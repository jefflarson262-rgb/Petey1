// Supabase clients for the server. Created on first use and reused between requests.
import { createClient } from '@supabase/supabase-js';
import { HttpError } from './http.js';

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const cache = new Map();
const get = (kind, url, key) => {
  const id = `${kind}|${url}|${key}`;
  if (!cache.has(id)) cache.set(id, createClient(url, key, options));
  return cache.get(id);
};

// Uses the SECRET key: it bypasses row-level security, so every function that uses it must check who is asking first.
export const adminClient = (cfg) => get('admin', cfg.url, cfg.secretKey);
// Uses the PUBLISHABLE key: only used to ask Supabase "is this sign-in token real, and whose is it?"
export const authClient = (cfg) => get('auth', cfg.url, cfg.publishableKey);

// Turns a Supabase error into a short, non-secret hint that a person can act on.
export function describeDbError(error) {
  const code = error && error.code ? String(error.code) : '';
  const msg = String((error && error.message) || '');
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200') return { hint: 'tables_missing', code };
  if (code === '42501' || /permission denied/i.test(msg)) return { hint: 'permission_denied', code };
  if (/invalid api key|jwt|apikey/i.test(msg)) return { hint: 'key_rejected', code };
  if (!code && /fetch failed|ECONN|ENOTFOUND|network|timeout/i.test(msg)) return { hint: 'unreachable', code };
  return { hint: 'unknown', code };
}
export const dbError = (error) => new HttpError(503, 'database_error', describeDbError(error));
