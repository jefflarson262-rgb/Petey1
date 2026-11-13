// Serverless proxy between the browser and the Anthropic Messages API.
//
// Why it exists: the prototype used to call Anthropic straight from the browser with no key, which only works inside
// Claude. A key placed in browser code is visible to every visitor, so the browser calls THIS function instead, and
// only this function (running on the server) knows the key.
//
// Settings (environment variables on the host, never in the code):
//   ANTHROPIC_API_KEY  required  your Anthropic API key
//   ACCESS_CODE        required  shared code visitors must enter before the AI will answer
//   ANTHROPIC_MODEL    optional  model to use for every request (default below)
//
// Written against plain Node request/response objects so it runs on Vercel, in `npm run dev`, and in the tests.
import { createHash, timingSafeEqual } from 'node:crypto';

const DEFAULT_MODEL = 'claude-sonnet-5-5';
const UPSTREAM_URL = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages'; // override is for tests
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS_CAP = 4096;     // the prototype asks for at most 3000
const MAX_MESSAGES = 80;
const MAX_BODY_CHARS = 3_500_000; // Vercel rejects request bodies over ~4.5 MB before this code runs

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

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
    return send(res, 200, { ok: true, codeRequired: Boolean(process.env.ACCESS_CODE), configured: Boolean(process.env.ANTHROPIC_API_KEY && process.env.ACCESS_CODE) });
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, HEAD, POST'); return send(res, 405, { error: 'method_not_allowed' }); }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const accessCode = process.env.ACCESS_CODE;
  if (!apiKey || !accessCode) return send(res, 503, { error: 'server_not_configured', message: 'Set ANTHROPIC_API_KEY and ACCESS_CODE on the server.' });   // fail closed
  if (!codeMatches(req.headers['x-access-code'], accessCode)) return send(res, 401, { error: 'invalid_access_code' });

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
  const payload = { model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, max_tokens, messages, ...(system ? { system } : {}) };

  let upstream;
  try {
    upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
      body: JSON.stringify(payload),
    });
  } catch {
    return send(res, 502, { error: 'upstream_unreachable' });
  }

  const text = await upstream.text();   // pass Anthropic's answer (or its error message) straight through
  res.statusCode = upstream.status;
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(text);
}
