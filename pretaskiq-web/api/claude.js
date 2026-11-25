// Serverless proxy between the browser and the Anthropic Messages API.
//
// Why it exists: the prototype used to call Anthropic straight from the browser with no key, which only works inside
// Claude. A key placed in browser code is visible to every visitor, so the browser calls THIS function instead, and
// only this function (running on the server) knows the key.
//
// Settings (environment variables on the host, never in the code):
//   ANTHROPIC_API_KEY  required  your Anthropic API key
//   ANTHROPIC_MODEL    optional  model to use for every request (default below)
//   Who may use it depends on the sign-in mode (see server/config.js):
//     Supabase connected -> people must be signed in and approved; each person is limited to AI_CALLS_PER_HOUR (default 150)
//     Supabase not set   -> ACCESS_CODE is required: a shared code visitors enter before the AI will answer
//
// Written against plain Node request/response objects so it runs on Vercel, in `npm run dev`, and in the tests.
import { createHash, timingSafeEqual } from 'node:crypto';
import { readConfig } from '../server/config.js';
import { requireUser } from '../server/auth.js';
import { checkAndRecordAiUse, recordUsage } from '../server/usage.js';
import { HttpError } from '../server/http.js';

const DEFAULT_MODEL = 'claude-sonnet-5-5';
const UPSTREAM_URL = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages'; // override is for tests
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS_CAP = 8192;     // the prototype asks for at most 6000. Sonnet 5.5's tokenizer produces about 30% more tokens for the same text than Sonnet 4.6's did.
const MAX_MESSAGES = 80;
const MAX_BODY_CHARS = 3_500_000; // Vercel rejects request bodies over ~4.5 MB before this code runs

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

// Claude Sonnet 5.5 "thinks" before it answers unless told not to, and the thinking counts against max_tokens (Anthropic's docs:
// "max_tokens ... includes all thinking Claude generates in the current turn, is enforced as a strict limit"). The prototype asks for
// short replies (700 tokens for the planning interview, 400 for Petey), so with thinking on the allowance was used up before or part
// way through the visible answer: cut-off sentences and empty bubbles. "between_tools" is the lowest thinking setting the docs name for
// this model (it rejects { type: "disabled" } with a 400). Other models are left alone: they either do not think by default or take other settings.
const thinkingFor = (model) => (/^claude-sonnet-5-5($|-)/.test(model) ? { type: 'between_tools' } : undefined);

const digest = (v) => createHash('sha256').update(String(v)).digest();
const codeMatches = (given, expected) => Boolean(given) && timingSafeEqual(digest(given), digest(expected));

async function readJson(req) {
  if (req.body !== undefined && req.body !== null) {            // Vercel has already parsed it
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  let text = '';                                                  // plain Node (dev server): read the stream
  for await (const chunk of req) {
    text += chunk;
    if (text.length > MAX_BODY_CHARS) throw Object.assign(new Error('too_large'), { code: 'too_large' });
  }
  return JSON.parse(text);
}

const validContent = (c) => typeof c === 'string' || (Array.isArray(c) && c.length > 0 && c.every((b) => b && typeof b === 'object' && typeof b.type === 'string'));

export default async function handler(req, res) {
  if (req.method === 'HEAD') { res.statusCode = 204; res.setHeader('Cache-Control', 'no-store'); res.end(); return; }   // the app's "am I online" check
  if (req.method === 'GET') {                                                                                         // status for the page; reveals no secrets
    const cfg = readConfig();
    if (cfg.mode === 'supabase') return send(res, 200, { ok: true, mode: 'supabase', signInRequired: true, configured: Boolean(process.env.ANTHROPIC_API_KEY) });
    return send(res, 200, { ok: true, mode: cfg.mode, codeRequired: Boolean(process.env.ACCESS_CODE), configured: cfg.mode === 'code' && Boolean(process.env.ANTHROPIC_API_KEY && process.env.ACCESS_CODE) });
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, HEAD, POST'); return send(res, 405, { error: 'method_not_allowed' }); }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const cfg = readConfig();
  if (!apiKey) return send(res, 503, { error: 'server_not_configured', message: 'Set ANTHROPIC_API_KEY on the server.' });   // fail closed
  if (cfg.mode === 'misconfigured') return send(res, 503, { error: 'supabase_misconfigured', missing: cfg.missing, problem: cfg.urlProblem });

  let me = null;
  if (cfg.mode === 'supabase') {
    try {
      me = await requireUser(req);                              // signed in and approved?
      await checkAndRecordAiUse(me.admin, me.user.id);                // within this person's hourly limit?
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.error, ...e.extra });
      return send(res, 500, { error: 'server_error' });
    }
  } else {
    const accessCode = process.env.ACCESS_CODE;
    if (!accessCode) return send(res, 503, { error: 'server_not_configured', message: 'Set ACCESS_CODE on the server.' });   // fail closed
    if (!codeMatches(req.headers['x-access-code'], accessCode)) return send(res, 401, { error: 'invalid_access_code' });
  }

  let body;
  try { body = await readJson(req); } catch (e) {
    return send(res, e.code === 'too_large' ? 413 : 400, { error: e.code === 'too_large' ? 'request_too_large' : 'invalid_json' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { error: 'invalid_body' });

  const { messages, system } = body;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return send(res, 400, { error: 'invalid_messages' });
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || !validContent(m.content)) return send(res, 400, { error: 'invalid_messages' });
  }
  if (system !== undefined && typeof system !== 'string') return send(res, 400, { error: 'invalid_system' });

  const requested = Number(body.max_tokens);
  const max_tokens = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), MAX_TOKENS_CAP) : 1024;

  // Only these fields go upstream. The model is chosen here, not by the browser, and tools/streaming are not passed through.
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const thinking = thinkingFor(model);
  const payload = { model, max_tokens, messages, ...(system ? { system } : {}), ...(thinking ? { thinking } : {}) };

  const callUpstream = (p) => fetch(UPSTREAM_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    body: JSON.stringify(p),
  });

  let upstream, text;
  try {
    upstream = await callUpstream(payload);
    text = await upstream.text();
    // Safety net: if Anthropic rejects the thinking setting itself (for example the docs and the live service disagree), answer without it
    // rather than taking the whole app down. Replies may then be cut short again; the app says so instead of showing broken text.
    if (upstream.status === 400 && payload.thinking && /thinking/i.test(text)) {
      const { thinking: _dropped, ...withoutThinking } = payload;
      upstream = await callUpstream(withoutThinking);
      text = await upstream.text();
    }
  } catch {
    return send(res, 502, { error: 'upstream_unreachable' });
  }

  // Note what this request used (Anthropic reports the token counts in its answer), so each company's cost can be worked out later.
  if (me && upstream.ok) { let u = null; try { u = JSON.parse(text).usage; } catch { u = null; } await recordUsage(me, 'ai', { inputTokens: u && u.input_tokens, outputTokens: u && u.output_tokens }); }

  // pass Anthropic's answer (or its error message) straight through
  res.statusCode = upstream.status;
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(text);
}
