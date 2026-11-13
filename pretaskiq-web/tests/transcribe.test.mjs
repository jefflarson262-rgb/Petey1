// Tests for api/transcribe.js (turns a recording of the foreman's voice into text). Run with: npm test
// Uses fake request/response objects and a stand-in for ElevenLabs, so no network, no real key and no real recording are involved.
import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
import { startFakeSupabase, makeJwt } from './helpers/fakeSupabase.mjs';
import handler, { cleanTranscript } from '../api/transcribe.js';

const SECRET = 'xi-test-SECRET-KEY';
const realFetch = globalThis.fetch;
let calls, upstreamReply, fake, U;

// A real, valid WAV: 16 kHz, 16-bit, mono, silence. `seconds` long.
function wav(seconds = 1) {
  const n = Math.round(16000 * seconds) * 2, b = Buffer.alloc(44 + n);
  b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8, 'latin1'); b.write('fmt ', 12, 'latin1');
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36, 'latin1'); b.writeUInt32LE(n, 40);
  return b;
}
const GOOD_WAV = wav(1);
const good = { audio: GOOD_WAV.toString('base64') };

const fakeRes = () => { const r = { statusCode: 200, headers: {}, body: '' }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.end = (b = '') => { r.body = b; }; return r; };
const call = async (req) => { const res = fakeRes(); await handler({ headers: {}, ...req }, res); return res; };
const json = (res) => JSON.parse(res.body);
const post = (body, headers = { 'x-access-code': 'letmein' }) => call({ method: 'POST', headers, body });
const SUPABASE_VARS = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

before(async () => {
  fake = await startFakeSupabase();
  U = { admin: fake.addUser('admin@example.com', 'pw-admin'), ok: fake.addUser('ann@example.com', 'pw-ann', { role: 'foreman', approved: true }), pending: fake.addUser('new@example.com', 'pw-new', { role: 'foreman', approved: false }) };
});
after(() => fake.close());

beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = SECRET; process.env.ACCESS_CODE = 'letmein'; delete process.env.ELEVENLABS_STT_MODEL_ID;
  for (const k of SUPABASE_VARS) delete process.env[k];
  calls = [];
  upstreamReply = () => new Response(JSON.stringify({ language_code: 'en', text: 'About twelve feet, with a cutoff saw.', words: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.elevenlabs.io')) { calls.push({ url: String(url), init }); return upstreamReply(); }
    return realFetch(url, init);                                    // the Supabase stand-in
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

test('GET says whether transcription is set up, and reveals no secret', async () => {
  let res = await call({ method: 'GET' });
  assert.deepEqual(json(res), { ok: true, configured: true }); assert.ok(!res.body.includes(SECRET));
  delete process.env.ELEVENLABS_API_KEY;
  assert.deepEqual(json(await call({ method: 'GET' })), { ok: true, configured: false });
});

test('other methods are rejected', async () => {
  const res = await call({ method: 'PUT' });
  assert.equal(res.statusCode, 405); assert.equal(res.headers.allow, 'GET, POST');
});

test('fails closed when the voice service key is not set', async () => {
  delete process.env.ELEVENLABS_API_KEY;
  const res = await post(good);
  assert.equal(res.statusCode, 503); assert.equal(json(res).error, 'transcription_not_configured');
  assert.equal(calls.length, 0);
});

test('shared-code mode: a missing or wrong access code gets 401 and the recording never leaves the server', async () => {
  assert.equal((await post(good, {})).statusCode, 401);
  assert.equal((await post(good, { 'x-access-code': 'nope' })).statusCode, 401);
  delete process.env.ACCESS_CODE;
  assert.equal((await post(good, { 'x-access-code': 'anything' })).statusCode, 503);
  assert.equal(calls.length, 0);
});

test('a valid recording goes to ElevenLabs as a form upload with the key in a header, and the text comes back', async () => {
  const res = await post(good);
  assert.equal(res.statusCode, 200); assert.deepEqual(json(res), { ok: true, text: 'About twelve feet, with a cutoff saw.' });
  assert.ok(!res.body.includes(SECRET));
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal(c.url, 'https://api.elevenlabs.io/v1/speech-to-text'); assert.equal(c.init.method, 'POST'); assert.equal(c.init.headers['xi-api-key'], SECRET);
  const form = c.init.body; assert.ok(form instanceof FormData);
  assert.deepEqual([...form.keys()].sort(), ['file', 'language_code', 'model_id', 'tag_audio_events']);   // nothing about the person or the plan
  assert.equal(form.get('model_id'), 'scribe_v2'); assert.equal(form.get('language_code'), 'en'); assert.equal(form.get('tag_audio_events'), 'false');
  const file = form.get('file');
  assert.equal(file.name, 'answer.wav'); assert.equal(file.type, 'audio/wav');
  assert.ok(Buffer.from(await file.arrayBuffer()).equals(GOOD_WAV));                           // the recording arrives byte for byte
});

test('the model can be chosen with a setting; the browser cannot choose the model, language or key', async () => {
  process.env.ELEVENLABS_STT_MODEL_ID = 'scribe_v3';
  await post({ ...good, model_id: 'attacker', language_code: 'xx', api_key: 'attacker', 'xi-api-key': 'attacker' });
  assert.equal(calls[0].init.body.get('model_id'), 'scribe_v3'); assert.equal(calls[0].init.body.get('language_code'), 'en');
  assert.equal(calls[0].init.headers['xi-api-key'], SECRET);
  process.env.ELEVENLABS_STT_MODEL_ID = '../x y';
  const res = await post(good);
  assert.equal(res.statusCode, 503); assert.equal(json(res).error, 'speech_misconfigured'); assert.equal(calls.length, 1);
});

test('sound tags are removed from the text, and a recording of only noise gives empty text', async () => {
  assert.equal(cleanTranscript('(footsteps) Cut bolts [noise] off the structure.'), 'Cut bolts off the structure.');
  assert.equal(cleanTranscript('(machinery)'), ''); assert.equal(cleanTranscript(null), ''); assert.equal(cleanTranscript('  two   spaces '), 'two spaces');
  upstreamReply = () => new Response(JSON.stringify({ text: '(machinery noise)' }), { status: 200, headers: { 'content-type': 'application/json' } });
  const res = await post(good);
  assert.equal(res.statusCode, 200); assert.deepEqual(json(res), { ok: true, text: '' });
});

test('rejects anything that is not a WAV recording of a sensible size', async () => {
  const notWav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('AVI '), Buffer.alloc(4000)]);
  const tooShort = wav(0.05);                                                                   // under the 100 ms ElevenLabs minimum
  const bad = [{}, { audio: '' }, { audio: 42 }, { audio: ['a'] }, null, [], { audio: 'not base64 at all !!!' }, { audio: Buffer.from('hello world, this is text').toString('base64') },
    { audio: notWav.toString('base64') }, { audio: tooShort.toString('base64') }];
  for (const body of bad) { const res = await post(body); assert.equal(res.statusCode, 400, JSON.stringify(body).slice(0, 60)); assert.equal(json(res).error, 'invalid_audio'); }
  const huge = await post({ audio: wav(75).toString('base64') });
  assert.equal(huge.statusCode, 413); assert.equal(json(huge).error, 'audio_too_long');
  assert.equal((await post('{not json')).statusCode, 400);
  assert.equal(calls.length, 0);                                                               // none of these reached ElevenLabs
  assert.equal((await post({ audio: wav(60).toString('base64') })).statusCode, 200);           // a full minute is fine
});

test('provider problems become short codes; the provider\'s own message (which can name the account) is never passed on', async () => {
  const cases = [[401, 'speech_provider_auth'], [403, 'speech_provider_auth'], [429, 'speech_busy'], [400, 'speech_provider_request'], [422, 'speech_provider_request'], [500, 'speech_provider_error'], [402, 'speech_provider_error']];
  for (const [status, code] of cases) {
    upstreamReply = () => new Response(JSON.stringify({ detail: { message: 'account jane@secret-company.com is over quota' } }), { status, headers: { 'content-type': 'application/json' } });
    const res = await post(good);
    assert.equal(res.statusCode, 502, String(status)); assert.equal(json(res).error, code, String(status)); assert.equal(json(res).providerStatus, status);
    assert.ok(!res.body.includes('secret-company') && !res.body.includes(SECRET));
  }
});

test('a network failure or an unreadable answer from the provider is a clean 502', async () => {
  globalThis.fetch = async () => { throw new Error('boom'); };
  let res = await post(good); assert.equal(res.statusCode, 502); assert.equal(json(res).error, 'speech_unreachable');
  globalThis.fetch = async () => new Response('<html>oops</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  res = await post(good); assert.equal(res.statusCode, 502); assert.equal(json(res).error, 'speech_provider_error');
});

// ---------- sign-in (Supabase) mode ----------
const signedIn = (user) => ({ authorization: 'Bearer ' + makeJwt(user.id, user.email) });
const supabaseOn = () => { process.env.SUPABASE_URL = fake.url; process.env.SUPABASE_PUBLISHABLE_KEY = fake.publishableKey; process.env.SUPABASE_SECRET_KEY = fake.secretKey; delete process.env.ACCESS_CODE; };

test('sign-in mode: no sign-in is 401, an unapproved account is 403, an approved account gets text', async () => {
  supabaseOn();
  assert.equal((await post(good, {})).statusCode, 401);
  assert.equal((await post(good, { 'x-access-code': 'letmein' })).statusCode, 401);
  const pending = await post(good, signedIn(U.pending));
  assert.equal(pending.statusCode, 403); assert.equal(json(pending).error, 'not_approved');
  assert.equal(calls.length, 0);
  const res = await post(good, signedIn(U.ok));
  assert.equal(res.statusCode, 200); assert.equal(json(res).text, 'About twelve feet, with a cutoff saw.');
});
