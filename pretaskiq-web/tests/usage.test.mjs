// Tests for per-company usage tracking: what Petey, the spoken voice and transcription use is noted against the person's company,
// the platform owner sees the totals, and noting it can never break the request itself.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.NODE_ENV = 'test';
process.env.PRETASKIQ_SIGN_IN = 'on';
import { startFakeSupabase, makeJwt } from './helpers/fakeSupabase.mjs';

let fake, up, U, B, claudeApi, speakApi, transcribeApi, ownerApi, anthropicBody;
const fakeRes = () => { const r = { statusCode: 200, headers: {}, body: '' }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.end = (b = '') => { r.body = b; }; r.writeHead = (c, h) => { r.statusCode = c; Object.assign(r.headers, h || {}); }; return r; };
const call = async (api, req) => { const res = fakeRes(); await api({ headers: {}, query: {}, ...req }, res); return res; };
const as = (u) => ({ authorization: 'Bearer ' + makeJwt(u.id, u.email) });
const wav = (seconds) => { const rate = 32000, data = Buffer.alloc(Math.round(seconds * rate)), h = Buffer.alloc(44); h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8, 'latin1'); h.write('fmt ', 12, 'latin1'); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(16000, 24); h.writeUInt32LE(rate, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36, 'latin1'); h.writeUInt32LE(data.length, 40); return Buffer.concat([h, data]).toString('base64'); };

before(async () => {
  fake = await startFakeSupabase();
  up = http.createServer((req, res) => { req.resume(); req.on('end', () => {
    if (req.url.includes('/v1/messages')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(anthropicBody)); }
    if (req.url.includes('speech-to-text')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ text: 'hello there' })); }
    res.writeHead(200, { 'content-type': 'audio/mpeg' }); res.end(Buffer.from('ID3fakeaudio'));
  }); });
  await new Promise((r) => up.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${up.address().port}`;
  process.env.ANTHROPIC_API_URL = base + '/v1/messages'; process.env.ELEVENLABS_API_URL = base; process.env.ELEVENLABS_API_KEY = 'el-key'; process.env.ANTHROPIC_API_KEY = 'an-key';
  process.env.SUPABASE_URL = fake.url; process.env.SUPABASE_PUBLISHABLE_KEY = fake.publishableKey; process.env.SUPABASE_SECRET_KEY = fake.secretKey;
  claudeApi = (await import('../api/claude.js')).default; speakApi = (await import('../api/speak.js')).default; transcribeApi = (await import('../api/transcribe.js')).default; ownerApi = (await import('../server/handlers/owner.js')).default;
  const owner = fake.addUser('owner@example.com', 'pw');
  B = { id: crypto.randomUUID(), name: 'Tester: Pat', tier: 'full', seat_limit: 1, status: 'active', created_at: new Date().toISOString() }; fake.state.tables.companies.push(B);
  U = { owner, pat: fake.addUser('pat@t.com', 'pw', { role: 'safety', approved: true, company: B }) };
});
after(async () => { await fake.close(); await new Promise((r) => up.close(r)); });
beforeEach(() => { fake.state.tables.usage_log.length = 0; fake.state.failTable = null; anthropicBody = { content: [{ type: 'text', text: 'Hi' }], stop_reason: 'end_turn', usage: { input_tokens: 1200, output_tokens: 340 } }; });

test('a request to Petey is noted against the company with the token counts Anthropic reported', async () => {
  const r = await call(claudeApi, { method: 'POST', headers: as(U.pat), body: { messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 } });
  assert.equal(r.statusCode, 200);
  const rows = fake.state.tables.usage_log;
  assert.equal(rows.length, 1); assert.equal(rows[0].company_id, B.id); assert.equal(rows[0].user_id, U.pat.id); assert.equal(rows[0].kind, 'ai');
  assert.equal(rows[0].input_tokens, 1200); assert.equal(rows[0].output_tokens, 340);
  anthropicBody = { content: [{ type: 'text', text: 'Hi' }] };                               // no usage block: still noted, counts left empty rather than guessed
  await call(claudeApi, { method: 'POST', headers: as(U.pat), body: { messages: [{ role: 'user', content: 'hi' }] } });
  assert.equal(rows[1].input_tokens, null);
});

test('speech and transcription are noted in characters and seconds, and do not count against the AI rate limit', async () => {
  const before = fake.state.tables.ai_usage.length;
  const s = await call(speakApi, { method: 'POST', headers: as(U.pat), body: { text: 'Twelve feet up on a ladder.' } });
  assert.equal(s.statusCode, 200);
  const t = await call(transcribeApi, { method: 'POST', headers: as(U.pat), body: { audio: wav(2.5) } });
  assert.equal(t.statusCode, 200);
  const rows = fake.state.tables.usage_log;
  assert.deepEqual(rows.map((r) => [r.kind, r.units, r.company_id === B.id]), [['speech', 27, true], ['transcribe', 2.5, true]]);
  assert.equal(fake.state.tables.ai_usage.length, before);
});

test('if the usage table is unavailable the person still gets their answer', async () => {
  fake.state.failTable = 'usage_log';
  const r = await call(claudeApi, { method: 'POST', headers: as(U.pat), body: { messages: [{ role: 'user', content: 'hi' }] } });
  assert.equal(r.statusCode, 200); assert.match(r.body, /"Hi"/);
  const s = await call(speakApi, { method: 'POST', headers: as(U.pat), body: { text: 'Hello.' } });
  assert.equal(s.statusCode, 200);
});

test('the platform owner sees each company\'s last 30 days; nobody else does', async () => {
  await call(claudeApi, { method: 'POST', headers: as(U.pat), body: { messages: [{ role: 'user', content: 'hi' }] } });
  await call(claudeApi, { method: 'POST', headers: as(U.pat), body: { messages: [{ role: 'user', content: 'again' }] } });
  await call(speakApi, { method: 'POST', headers: as(U.pat), body: { text: 'Hello.' } });
  fake.state.tables.usage_log.push({ id: 999, company_id: B.id, kind: 'ai', input_tokens: 5000, output_tokens: 5000, used_at: new Date(Date.now() - 40 * 86400000).toISOString() });   // older than 30 days
  const r = await call(ownerApi, { method: 'GET', headers: as(U.owner) });
  const out = JSON.parse(r.body); const pat = out.companies.find((c) => c.name === 'Tester: Pat'); const mine = out.companies.find((c) => c.id !== B.id);
  assert.equal(out.usageDays, 30); assert.equal(out.usageReady, true);
  assert.deepEqual(pat.usage, { aiRequests: 2, inputTokens: 2400, outputTokens: 680, speechChars: 6, transcribeSeconds: 0 });
  assert.deepEqual(mine.usage, { aiRequests: 0, inputTokens: 0, outputTokens: 0, speechChars: 0, transcribeSeconds: 0 });
  assert.equal((await call(ownerApi, { method: 'GET', headers: as(U.pat) })).statusCode, 403);
});
