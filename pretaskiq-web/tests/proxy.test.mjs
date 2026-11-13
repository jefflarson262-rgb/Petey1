// Tests for api/claude.js. Run with: npm test
// Uses fake request/response objects and a fake upstream, so no network and no real API key are involved.
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/claude.js';

const realFetch = globalThis.fetch;
let upstreamCalls;

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: '', ended: false };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = (b = '') => { res.body = b; res.ended = true; };
  return res;
}
const call = async (req) => { const res = fakeRes(); await handler({ headers: {}, ...req }, res); return res; };
const post = (body, headers = { 'x-access-code': 'letmein' }) => call({ method: 'POST', headers, body });
const good = { messages: [{ role: 'user', content: 'hello' }], max_tokens: 700, system: 'be brief' };

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'sk-test-secret-key';
  process.env.ACCESS_CODE = 'letmein';
  delete process.env.ANTHROPIC_MODEL;
  upstreamCalls = [];
  globalThis.fetch = async (url, init) => {
    upstreamCalls.push({ url, init, payload: JSON.parse(init.body) });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'hi' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

test('HEAD answers 204 without calling Anthropic (the app uses it as an online check)', async () => {
  const res = await call({ method: 'HEAD' });
  assert.equal(res.statusCode, 204); assert.equal(upstreamCalls.length, 0);
});

test('GET reports status but no secrets', async () => {
  const res = await call({ method: 'GET' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true, codeRequired: true, configured: true });
  assert.ok(!res.body.includes('sk-test') && !res.body.includes('letmein'));
});

test('other methods are rejected', async () => {
  const res = await call({ method: 'DELETE' });
  assert.equal(res.statusCode, 405); assert.equal(res.headers.allow, 'GET, HEAD, POST');
});

test('fails closed when the key or the access code is not configured', async () => {
  delete process.env.ACCESS_CODE;
  assert.equal((await post(good)).statusCode, 503);
  process.env.ACCESS_CODE = 'letmein'; delete process.env.ANTHROPIC_API_KEY;
  assert.equal((await post(good)).statusCode, 503);
  assert.equal(upstreamCalls.length, 0);
});

test('wrong or missing access code gets 401 and never reaches Anthropic', async () => {
  assert.equal((await post(good, {})).statusCode, 401);
  assert.equal((await post(good, { 'x-access-code': 'nope' })).statusCode, 401);
  assert.equal((await post(good, { 'x-access-code': 'letmeinX' })).statusCode, 401);
  assert.equal(upstreamCalls.length, 0);
});

test('forwards a valid request with the key in a header and the answer back unchanged', async () => {
  const res = await post(good);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).content[0].text, 'hi');
  const { url, init, payload } = upstreamCalls[0];
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.headers['x-api-key'], 'sk-test-secret-key');
  assert.equal(init.headers['anthropic-version'], '2023-06-01');
  assert.deepEqual(payload, { model: 'claude-sonnet-5-5', max_tokens: 700, messages: good.messages, system: 'be brief' });
  assert.ok(!res.body.includes('sk-test-secret-key'), 'the key must never appear in a response');
});

test('the server picks the model; the browser cannot', async () => {
  await post({ ...good, model: 'some-expensive-model' });
  assert.equal(upstreamCalls[0].payload.model, 'claude-sonnet-5-5');
  process.env.ANTHROPIC_MODEL = 'my-chosen-model';
  await post(good);
  assert.equal(upstreamCalls[1].payload.model, 'my-chosen-model');
});

test('only whitelisted fields go upstream (no tools, no streaming)', async () => {
  await post({ ...good, tools: [{ name: 'x' }], stream: true, temperature: 2, metadata: { a: 1 } });
  assert.deepEqual(Object.keys(upstreamCalls[0].payload).sort(), ['max_tokens', 'messages', 'model', 'system']);
});

test('max_tokens is capped and defaulted', async () => {
  await post({ ...good, max_tokens: 999999 }); assert.equal(upstreamCalls[0].payload.max_tokens, 4096);
  await post({ messages: good.messages }); assert.equal(upstreamCalls[1].payload.max_tokens, 1024);
  await post({ ...good, max_tokens: 'abc' }); assert.equal(upstreamCalls[2].payload.max_tokens, 1024);
});

test('image and document content blocks pass through (drawing and PDF uploads)', async () => {
  const content = [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }, { type: 'text', text: 'read this' }];
  assert.equal((await post({ messages: [{ role: 'user', content }], max_tokens: 1000 })).statusCode, 200);
  assert.deepEqual(upstreamCalls[0].payload.messages[0].content, content);
});

test('rejects malformed bodies', async () => {
  for (const body of [null, [], 'not json', {}, { messages: [] }, { messages: 'x' }, { messages: [{ role: 'system', content: 'x' }] }, { messages: [{ role: 'user', content: 42 }] }, { messages: [{ role: 'user', content: [] }] }, { messages: good.messages, system: { a: 1 } }]) {
    assert.equal((await post(body)).statusCode, 400, JSON.stringify(body));
  }
  assert.equal(upstreamCalls.length, 0);
});

test('a body that is not JSON text is a 400, not a crash', async () => {
  assert.equal((await post('{broken')).statusCode, 400);
});

test("Anthropic's own errors are passed through so the app can show them", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }), { status: 429, headers: { 'content-type': 'application/json' } });
  const res = await post(good);
  assert.equal(res.statusCode, 429); assert.match(res.body, /slow down/);
});

test('a network failure upstream becomes a 502', async () => {
  globalThis.fetch = async () => { throw new Error('boom'); };
  const res = await post(good);
  assert.equal(res.statusCode, 502); assert.ok(!res.body.includes('boom'));
});

test('streamed bodies (local dev server) are read and parsed', async () => {
  const chunks = [Buffer.from(JSON.stringify(good).slice(0, 20)), Buffer.from(JSON.stringify(good).slice(20))];
  const req = { method: 'POST', headers: { 'x-access-code': 'letmein' }, [Symbol.asyncIterator]: async function* () { yield* chunks; } };
  const res = fakeRes(); await handler(req, res);
  assert.equal(res.statusCode, 200);
});
