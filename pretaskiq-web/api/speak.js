// Turns Petey's words into natural-sounding speech, using ElevenLabs.
//
// Why it exists: the voices built into a browser sound different (and often robotic) on every device. A voice service sounds
// the same everywhere. The service's key is a secret that costs money, so it lives only here, on the server; the browser asks THIS
// function for audio, the same way it asks /api/claude for Petey's words.
//
// Settings (environment variables on the host, never in the code):
//   ELEVENLABS_API_KEY   required to turn the natural voice on. Without it the site keeps using the browser's own voice.
//   ELEVENLABS_VOICE_ID  optional  which voice to use (default below). Copy the ID of a voice from your ElevenLabs account.
//   ELEVENLABS_MODEL_ID  optional  the speech model (default below). `eleven_v4_turbo` is another low-latency choice in their docs.
//   Who may use it is the same as for /api/claude: signed-in, approved people (Supabase mode) or people with the shared ACCESS_CODE.
//
// What is sent to ElevenLabs: the text Petey is about to say, and nothing else. No names, no plan data, no account details.
//
// Request format used here (ElevenLabs "Create speech" API reference): POST {base}/v1/text-to-speech/{voice_id}?output_format=...
//   header `xi-api-key`; JSON body { text, model_id }; the reply body is the audio.
import { requireVoiceAccess } from '../server/gate.js';
import { HttpError, send, readJson, handle } from '../server/http.js';

const UPSTREAM_BASE = (process.env.ELEVENLABS_API_URL || 'https://api.elevenlabs.io').replace(/\/+$/, '');   // override is for tests
// "Brian": a male, American-accent ("deep") voice, listed on ElevenLabs' "Default Voices" page (elevenlabs.io/docs/voices/default-voices); the ID agrees
// with a second list (wavespeed.ai). Chosen because the owner asked for a male voice with an American accent; nobody has heard it yet. That it is
// available on every account and plan is NOT verified here: if it is not, requests fail and the site falls back to the browser voice.
// ELEVENLABS_VOICE_ID overrides this. (The earlier default, "George" JBFqnCBsd6RMkjVDRZzb, is male with a British accent.)
const DEFAULT_VOICE_ID = 'nPczCjzI2devNBz1zQrb';
const DEFAULT_MODEL_ID = 'eleven_flash_v2_5';      // named in ElevenLabs' model list as a ~100 ms, real-time model that supports English
const OUTPUT_FORMAT = 'mp3_44100_128';             // the documented default; higher bit rates need a higher plan
const MAX_CHARS = 600;                             // the browser sends one or two sentences at a time (about 260 characters)
const UPSTREAM_TIMEOUT_MS = 20_000;

const looksLikeVoiceId = (v) => /^[A-Za-z0-9_-]{8,64}$/.test(v);

export default handle(async (req, res) => {
  const key = String(process.env.ELEVENLABS_API_KEY || '').trim();

  if (req.method === 'GET') {                                         // status for the page; reveals no secrets
    return send(res, 200, { ok: true, configured: Boolean(key) });
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method_not_allowed' }); }

  if (!key) throw new HttpError(503, 'speech_not_configured');         // fail closed
  await requireVoiceAccess(req);

  const body = await readJson(req);
  const text = body && typeof body === 'object' && !Array.isArray(body) && typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) throw new HttpError(400, 'invalid_text');
  if (text.length > MAX_CHARS) throw new HttpError(413, 'text_too_long', { max: MAX_CHARS });

  const voiceId = String(process.env.ELEVENLABS_VOICE_ID || '').trim() || DEFAULT_VOICE_ID;
  const modelId = String(process.env.ELEVENLABS_MODEL_ID || '').trim() || DEFAULT_MODEL_ID;
  if (!looksLikeVoiceId(voiceId)) throw new HttpError(503, 'speech_misconfigured', { message: 'ELEVENLABS_VOICE_ID does not look like a voice ID.' });

  let upstream;
  try {
    upstream = await fetch(`${UPSTREAM_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'xi-api-key': key },
      body: JSON.stringify({ text, model_id: modelId }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(502, 'speech_unreachable');
  }

  if (!upstream.ok) {
    // Never pass the provider's own message through: it can name the account. The status is enough to diagnose (see the server log).
    if (process.env.NODE_ENV !== 'test') console.error('[speak] ElevenLabs answered', upstream.status);
    const code = upstream.status === 401 || upstream.status === 403 ? 'speech_provider_auth'
      : upstream.status === 429 ? 'speech_busy'
      : upstream.status === 400 || upstream.status === 404 || upstream.status === 422 ? 'speech_provider_request'
      : 'speech_provider_error';
    let providerReason = '';                                          // ElevenLabs' short error label (e.g. "voice_not_found"); letters, digits and underscores only
    try { const j = await upstream.json(); const d = j && j.detail; const raw = d && typeof d === 'object' ? (d.status || d.code || '') : ''; providerReason = String(raw).replace(/[^A-Za-z0-9_]/g, '').slice(0, 60); } catch { /* no readable reason */ }
    throw new HttpError(502, code, { providerStatus: upstream.status, providerReason });
  }

  const audio = Buffer.from(await upstream.arrayBuffer());
  if (!audio.length) throw new HttpError(502, 'speech_empty');
  const type = String(upstream.headers.get('content-type') || '');
  res.statusCode = 200;
  res.setHeader('Content-Type', type.toLowerCase().startsWith('audio/') ? type : 'audio/mpeg');
  res.setHeader('Content-Length', String(audio.length));
  res.setHeader('Cache-Control', 'no-store');
  res.end(audio);
});
