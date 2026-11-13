// Turns a short recording of a foreman's voice into text, using ElevenLabs speech-to-text ("Scribe").
//
// Why it exists: the voice recognition built into iPhones' Safari is unreliable for web pages (words doubled, going deaf after Petey
// speaks, not working at all from a Home Screen icon). So on iPhones the page records the answer itself and sends it here.
// The key is a secret that costs money, so it lives only here on the server; the browser never talks to ElevenLabs directly.
//
// Settings (environment variables on the host, never in the code): the same ELEVENLABS_API_KEY that switches on the natural voice.
//   ELEVENLABS_STT_MODEL_ID  optional  the speech-to-text model (default below)
//   Who may use it is the same as for /api/claude and /api/speak (see server/gate.js).
//
// What is sent to ElevenLabs: the recording of the person's answer (up to about a minute), nothing else.
//
// Request format used here (ElevenLabs "Speech to text" API reference): POST {base}/v1/speech-to-text, header `xi-api-key`,
// multipart form fields model_id, file, language_code, tag_audio_events; the reply is JSON with the transcript in `text`.
import { requireVoiceAccess } from '../server/gate.js';
import { HttpError, send, readJson, handle } from '../server/http.js';

const UPSTREAM_BASE = (process.env.ELEVENLABS_API_URL || 'https://api.elevenlabs.io').replace(/\/+$/, '');   // override is for tests
const DEFAULT_MODEL_ID = 'scribe_v2';              // the model named in ElevenLabs' own examples
const MAX_BASE64_CHARS = 3_000_000;                // about 68 s of 16 kHz audio; Vercel refuses request bodies over ~4.5 MB
const MIN_WAV_BYTES = 44 + 3200;                   // ElevenLabs' minimum is 100 ms of audio (3200 bytes at 16 kHz, 16-bit)
const MAX_WAV_BYTES = 2_250_000;
const UPSTREAM_TIMEOUT_MS = 30_000;

const looksLikeModelId = (v) => /^[A-Za-z0-9._-]{3,64}$/.test(v);

// Transcripts can carry sound tags such as "(machinery)" or "[noise]". They are not words the person said.
export const cleanTranscript = (t) => String(t || '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();

export default handle(async (req, res) => {
  const key = String(process.env.ELEVENLABS_API_KEY || '').trim();

  if (req.method === 'GET') return send(res, 200, { ok: true, configured: Boolean(key) });   // status for the page; reveals no secrets
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method_not_allowed' }); }

  if (!key) throw new HttpError(503, 'transcription_not_configured');   // fail closed
  await requireVoiceAccess(req);

  const body = await readJson(req);
  const b64 = body && typeof body === 'object' && !Array.isArray(body) && typeof body.audio === 'string' ? body.audio : '';
  if (!b64) throw new HttpError(400, 'invalid_audio');
  if (b64.length > MAX_BASE64_CHARS) throw new HttpError(413, 'audio_too_long');
  const wav = Buffer.from(b64, 'base64');
  const isWav = wav.length >= 12 && wav.toString('latin1', 0, 4) === 'RIFF' && wav.toString('latin1', 8, 12) === 'WAVE';
  if (!isWav || wav.length < MIN_WAV_BYTES) throw new HttpError(400, 'invalid_audio');   // the page always sends WAV; anything else is not ours
  if (wav.length > MAX_WAV_BYTES) throw new HttpError(413, 'audio_too_long');

  const modelId = String(process.env.ELEVENLABS_STT_MODEL_ID || '').trim() || DEFAULT_MODEL_ID;
  if (!looksLikeModelId(modelId)) throw new HttpError(503, 'speech_misconfigured', { message: 'ELEVENLABS_STT_MODEL_ID does not look like a model ID.' });

  const form = new FormData();
  form.append('model_id', modelId);
  form.append('language_code', 'en');            // short answers are often mis-detected when the language is left to guess
  form.append('tag_audio_events', 'false');      // no "(footsteps)" style tags in the text
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'answer.wav');

  let upstream;
  try {
    upstream = await fetch(`${UPSTREAM_BASE}/v1/speech-to-text`, {
      method: 'POST',
      headers: { 'xi-api-key': key },
      body: form,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(502, 'speech_unreachable');
  }

  if (!upstream.ok) {
    // Never pass the provider's own message through: it can name the account. The status is enough to diagnose (see the server log).
    if (process.env.NODE_ENV !== 'test') console.error('[transcribe] ElevenLabs answered', upstream.status);
    const code = upstream.status === 401 || upstream.status === 403 ? 'speech_provider_auth'
      : upstream.status === 429 ? 'speech_busy'
      : upstream.status === 400 || upstream.status === 404 || upstream.status === 422 ? 'speech_provider_request'
      : 'speech_provider_error';
    throw new HttpError(502, code, { providerStatus: upstream.status });
  }

  let json;
  try { json = await upstream.json(); } catch { throw new HttpError(502, 'speech_provider_error', { providerStatus: upstream.status }); }
  return send(res, 200, { ok: true, text: cleanTranscript(json && json.text) });
});
