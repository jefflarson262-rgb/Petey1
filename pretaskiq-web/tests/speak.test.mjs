// Tests for api/speak.js (the natural-voice function). Run with: npm test
// Uses fake request/response objects and a stand-in for ElevenLabs, so no network, no real key and no real voice are involved.
import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
import { startFakeSupabase, makeJwt } from './helpers/fakeSupabase.mjs';
import handler from '../api/speak.js';
import healthApi from '../api/health.js';

const SECRET = 'xi-test-SECRET-KEY';
const AUDIO = Buffer.from([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4, 5, 6, 7, 8]);   // not a real MP3; the function only passes the bytes along
const realFetch = globalThis.fetch;
let calls, upstreamReply, fake, U;

const fakeRes = () => { const r = { statusCode: 200, headers: {}, body: '' }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.end = (b = '') => { r.body = b; }; return r; };
const call = async (h, req) => { const res = fakeRes(); await h({ headers: {}, ...req }, res); return res; };
const json = (res) => JSON.parse(Buffer.isBuffer(res.body) ? res.body.toString() : res.body);
const post = (body, headers = { 'x-access-code': 'letmein' }) => call(handler, { method: 'POST', headers, body });
const good = { text: 'Got it. Who else will be working below the lift?' };
const SUPABASE_VARS = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

before(async () => {
  fake = await startFakeSupabase();
  U = { ann: fake.addUser('admin@example.com', 'pw-admin'), ok: fake.addUser('ann@example.com', 'pw-ann', { role: 'foreman', approved: true }), pending: fake.addUser('new@example.com', 'pw-new', { role: 'foreman', approved: false }) };
});
after(() => fake.close());

beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = SECRET; process.env.ACCESS_CODE = 'letmein';
  delete process.env.ELEVENLABS_VOICE_ID; delete process.env.ELEVENLABS_MODEL_ID;
  for (const k of SUPABASE_VARS) delete process.env[k];            // most tests run the shared-access-code mode
  calls = [];
  upstreamReply = () => new Response(AUDIO, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.elevenlabs.io')) { calls.push({ url: String(url), init, payload: JSON.parse(init.body) }); return upstreamReply(); }
    return realFetch(url, init);                                    // the Supabase stand-in
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

test('GET says whether the natural voice is set up, and reveals no secret', async () => {
  let res = await call(handler, { method: 'GET' });
  assert.equal(res.statusCode, 200); assert.deepEqual(json(res), { ok: true, configured: true });
  assert.ok(!res.body.includes(SECRET) && !res.body.includes('letmein'));
  delete process.env.ELEVENLABS_API_KEY;
  res = await call(handler, { method: 'GET' });
  assert.deepEqual(json(res), { ok: true, configured: false });
  assert.equal(calls.length, 0);
});

test('other methods are rejected', async () => {
  const res = await call(handler, { method: 'DELETE' });
  assert.equal(res.statusCode, 405); assert.equal(res.headers.allow, 'GET, POST');
});

test('fails closed when the voice service key is not set: the site keeps using the browser voice', async () => {
  delete process.env.ELEVENLABS_API_KEY;
  const res = await post(good);
  assert.equal(res.statusCode, 503); assert.equal(json(res).error, 'speech_not_configured');
  assert.equal(calls.length, 0);
});

test('shared-code mode: a missing or wrong access code gets 401 and never reaches ElevenLabs', async () => {
  assert.equal((await post(good, {})).statusCode, 401);
  assert.equal((await post(good, { 'x-access-code': 'nope' })).statusCode, 401);
  delete process.env.ACCESS_CODE;
  assert.equal((await post(good, { 'x-access-code': 'anything' })).statusCode, 503);   // no code configured: fail closed, not open
  assert.equal(calls.length, 0);
});

test('a valid request goes to ElevenLabs with the key in a header and the audio comes back unchanged', async () => {
  const res = await post(good);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'audio/mpeg');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['content-length'], String(AUDIO.length));
  assert.ok(Buffer.isBuffer(res.body) && res.body.equals(AUDIO));
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal(c.url, 'https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128');
  assert.equal(c.init.method, 'POST'); assert.equal(c.init.headers['xi-api-key'], SECRET);
  assert.deepEqual(c.payload, { text: good.text, model_id: 'eleven_flash_v2_5' });   // only these two fields; nothing about the person or the plan
  assert.ok(!String(res.body).includes(SECRET));
});

test('the voice and the model can be chosen with settings, and the browser cannot choose them', async () => {
  process.env.ELEVENLABS_VOICE_ID = 'abcDEF1234567890'; process.env.ELEVENLABS_MODEL_ID = 'eleven_v4_turbo';
  await post({ ...good, voice_id: 'attacker', voiceId: 'attacker', model_id: 'attacker', xi_api_key: 'attacker' });
  assert.ok(calls[0].url.includes('/v1/text-to-speech/abcDEF1234567890?'));
  assert.deepEqual(calls[0].payload, { text: good.text, model_id: 'eleven_v4_turbo' });
  assert.ok(!JSON.stringify(calls[0]).includes('attacker'));
});

test('a voice ID that is not a plain ID is refused instead of being put into a web address', async () => {
  process.env.ELEVENLABS_VOICE_ID = '../v1/user';
  const res = await post(good);
  assert.equal(res.statusCode, 503); assert.equal(json(res).error, 'speech_misconfigured');
  assert.equal(calls.length, 0);
});

test('the reply is always labelled as audio, even if the provider labels it differently', async () => {
  upstreamReply = () => new Response(AUDIO, { status: 200, headers: { 'content-type': 'application/octet-stream' } });
  assert.equal((await post(good)).headers['content-type'], 'audio/mpeg');
  upstreamReply = () => new Response(AUDIO, { status: 200, headers: { 'content-type': 'audio/wav' } });
  assert.equal((await post(good)).headers['content-type'], 'audio/wav');
});

test('rejects text that is missing, empty, not a string, too long, or not JSON', async () => {
  for (const body of [{}, { text: '' }, { text: '   ' }, { text: 42 }, { text: ['a'] }, null, []]) {
    const res = await post(body);
    assert.equal(res.statusCode, 400, JSON.stringify(body)); assert.equal(json(res).error, 'invalid_text');
  }
  const long = await post({ text: 'a'.repeat(601) });
  assert.equal(long.statusCode, 413); assert.equal(json(long).error, 'text_too_long');
  assert.equal((await post({ text: 'a'.repeat(600) })).statusCode, 200);                       // exactly at the limit is fine
  assert.equal((await post('{not json')).statusCode, 400);
  assert.equal((await post('plain words, not JSON')).statusCode, 400);
  assert.equal(calls.length, 1);                                                               // only the one valid request went upstream
});

test('provider problems become short codes; the provider\'s own message (which can name the account) is never passed on', async () => {
  const cases = [[401, 'speech_provider_auth'], [403, 'speech_provider_auth'], [429, 'speech_busy'], [404, 'speech_provider_request'], [422, 'speech_provider_request'], [500, 'speech_provider_error'], [402, 'speech_provider_error']];
  for (const [status, code] of cases) {
    upstreamReply = () => new Response(JSON.stringify({ detail: { message: 'account jane@secret-company.com is over quota' } }), { status, headers: { 'content-type': 'application/json' } });
    const res = await post(good);
    assert.equal(res.statusCode, 502, String(status)); assert.equal(json(res).error, code, String(status)); assert.equal(json(res).providerStatus, status);
    assert.ok(!res.body.includes('secret-company') && !res.body.includes(SECRET));
  }
});

test('a network failure or an empty answer from the provider is a clean 502', async () => {
  globalThis.fetch = async () => { throw new Error('boom'); };
  let res = await post(good); assert.equal(res.statusCode, 502); assert.equal(json(res).error, 'speech_unreachable');
  globalThis.fetch = async () => new Response(new Uint8Array(0), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  res = await post(good); assert.equal(res.statusCode, 502); assert.equal(json(res).error, 'speech_empty');
});

test('the setup check shows whether the voice key is set, never the key itself', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';                                           // the check's overall "ok" also needs the AI key
  let res = await call(healthApi, { method: 'GET' });
  assert.equal(json(res).settings.ELEVENLABS_API_KEY, true); assert.ok(!res.body.includes(SECRET));
  delete process.env.ELEVENLABS_API_KEY;
  res = await call(healthApi, { method: 'GET' });
  assert.equal(json(res).settings.ELEVENLABS_API_KEY, false);
  assert.equal(json(res).ok, true);                                                            // the natural voice is optional: not having it is not a setup problem
  delete process.env.ANTHROPIC_API_KEY;
});

// ---------- sign-in (Supabase) mode ----------
const signedIn = (user) => ({ authorization: 'Bearer ' + makeJwt(user.id, user.email) });
const supabaseOn = () => { process.env.SUPABASE_URL = fake.url; process.env.SUPABASE_PUBLISHABLE_KEY = fake.publishableKey; process.env.SUPABASE_SECRET_KEY = fake.secretKey; delete process.env.ACCESS_CODE; };

test('sign-in mode: no sign-in is 401, an unapproved account is 403, an approved account gets audio', async () => {
  supabaseOn();
  assert.equal((await post(good, {})).statusCode, 401);
  assert.equal((await post(good, { 'x-access-code': 'letmein' })).statusCode, 401);            // the shared code does not work once accounts are on
  const pending = await post(good, signedIn(U.pending));
  assert.equal(pending.statusCode, 403); assert.equal(json(pending).error, 'not_approved');
  assert.equal(calls.length, 0);
  const res = await post(good, signedIn(U.ok));
  assert.equal(res.statusCode, 200); assert.ok(res.body.equals(AUDIO));
  assert.equal(calls.length, 1);
});

test('sign-in mode: speaking does not use up the person\'s hourly AI allowance', async () => {
  supabaseOn();
  fake.state.tables.ai_usage.length = 0;
  for (let i = 0; i < 5; i++) await post(good, signedIn(U.ok));
  assert.equal(fake.state.tables.ai_usage.length, 0);
});
