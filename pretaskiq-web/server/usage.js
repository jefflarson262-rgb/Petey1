// A simple per-person limit on AI calls, so a lost password cannot quietly run up the Anthropic bill.
import { dbError } from './supabase.js';
import { HttpError } from './http.js';

export const callsPerHour = (env = process.env) => {
  const n = Number(env.AI_CALLS_PER_HOUR);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 150;
};

export async function checkAndRecordAiUse(admin, userId, limit = callsPerHour()) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  // Fetch at most `limit` rows and count them. (A HEAD "count only" request cannot be trusted here: the Supabase client
  // reports a missing table on a HEAD request as success.)
  const { data, error } = await admin.from('ai_usage').select('id').eq('user_id', userId).gte('used_at', since).limit(limit);
  if (error) throw dbError(error);
  if ((data || []).length >= limit) throw new HttpError(429, 'rate_limited', { message: `Limit of ${limit} AI requests per hour reached. Try again later.` });
  const { error: insertError } = await admin.from('ai_usage').insert({ user_id: userId });
  if (insertError) throw dbError(insertError);
}
