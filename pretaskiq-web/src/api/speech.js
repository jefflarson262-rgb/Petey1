import { nativeFetch } from './nativeFetch.js';
import { getStoredCode } from './accessCode.js';
import { getAccessToken, getMode } from '../auth/session.js';

// The voice service (api/speak.js and api/transcribe.js, both ElevenLabs). The voice script (30-voice-conversation.js) uses this through
// window.PreTaskIQSpeech. Everything here fails quietly: if the voice service is not set up, or stops working, Petey keeps talking with the
// browser's own voice and listening with the browser's own recognition.
export const SPEAK_URL = import.meta.env.VITE_SPEAK_URL || '/api/speak';
export const TRANSCRIBE_URL = import.meta.env.VITE_TRANSCRIBE_URL || '/api/transcribe';

let configured = null;          // null = not asked yet, true/false = what the server said
let checking = null;
const REST_MS = 5 * 60 * 1000;  // after repeated trouble a service rests for a few minutes instead of failing on every sentence
const tts = { failures: 0, pausedUntil: 0 };
const stt = { failures: 0, pausedUntil: 0 };

// Asks the server once whether the voice service is switched on. No sign-in needed; the answer is only yes or no.
// (No Accept header on purpose: the local preview server answers a JSON request for a missing page with a 404 that the browser logs as an error.)
function check() {
  if (!checking) {
    checking = nativeFetch(SPEAK_URL, { method: 'GET' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { configured = Boolean(j && j.configured === true); return configured; })
      .catch(() => { configured = false; return false; });
  }
  return checking;
}

function noteFailure(s, status) {
  s.failures += 1;
  if (status === 401 || status === 403 || s.failures >= 2) s.pausedUntil = Date.now() + REST_MS;
}

// ---------- which listening method ----------
// iPhones: the recognition built into Safari is unreliable for web pages (doubled words, going deaf after audio plays, not available from a
// Home Screen icon; see README), so by default iPhones record the answer and the server turns it into text. Elsewhere the browser's own
// recognition is used (it is free and shows words as they are heard). A person can compare the two with ?listen=server or ?listen=browser
// (remembered on that device); ?listen=auto goes back to the default.
const PREF_KEY = 'petey_listen';
function preference() {
  try {
    const q = new URLSearchParams(location.search).get('listen');
    if (q === 'server' || q === 'browser') { localStorage.setItem(PREF_KEY, q); return q; }
    if (q === 'auto') { localStorage.removeItem(PREF_KEY); return 'auto'; }
    const v = localStorage.getItem(PREF_KEY);
    return v === 'server' || v === 'browser' ? v : 'auto';
  } catch { return 'auto'; }
}
// Read ?listen=... as soon as the page loads, so the choice is remembered even if nothing listens before the next visit.
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
const canRecord = () => Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function' && (window.AudioContext || window.webkitAudioContext));

// ---------- natural voice (speaking) ----------
// In the shared-code mode the voice service needs the access code too, and the code is kept only in the tab: a fresh Safari tab has none until the
// first AI call asks for it. Without it a request can only be refused (401), and a refusal puts the service to rest for five minutes, so the whole
// planning conversation would have used the phone's own voice. So until a code is stored the service is simply "not available yet" (no request,
// no resting), and it switches on by itself as soon as the code is typed. A code that IS stored but refused still counts as trouble.
const haveCredentials = () => getMode() === 'supabase' || Boolean(getStoredCode());

// True when the server has the voice service, this tab may use it, and it is not resting after trouble.
const ready = () => configured === true && haveCredentials() && Date.now() >= tts.pausedUntil;

const authHeaders = async () => {
  const headers = { 'content-type': 'application/json' };
  if (getMode() === 'supabase') {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } else {
    const code = getStoredCode();
    if (code) headers['x-access-code'] = code;       // no code dialog here: voice must never interrupt the conversation
  }
  return headers;
};

const abortError = () => new DOMException('Aborted', 'AbortError');

// POSTs JSON to one of the voice functions with a time limit. An abort by the caller (the person interrupted) is not counted as trouble;
// a request that takes too long, or a failed reply, is. `read` turns the reply into the result.
async function callVoice(s, url, payload, signal, timeoutMs, read) {
  if (signal && signal.aborted) throw abortError();
  const headers = await authHeaders();
  const own = new AbortController();
  const timer = setTimeout(() => own.abort(), timeoutMs);
  const relay = () => own.abort();
  if (signal) signal.addEventListener('abort', relay, { once: true });
  try {
    let res;
    try { res = await nativeFetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal: own.signal }); }
    catch (e) {
      if (signal && signal.aborted) throw abortError();
      noteFailure(s, 0); throw new Error(e && e.name === 'AbortError' ? 'voice_timeout' : 'voice_network');
    }
    if (!res.ok) { noteFailure(s, res.status); throw new Error(`voice_${res.status}`); }
    let out;
    try { out = await read(res); }
    catch (e) {
      if (signal && signal.aborted) throw abortError();
      noteFailure(s, 0); throw new Error('voice_body');
    }
    s.failures = 0;
    return out;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', relay);
  }
}

// Returns a Blob of audio for the text, or throws.
function fetchAudio(text, signal) {
  return callVoice(tts, SPEAK_URL, { text }, signal, 25_000, async (res) => {
    const blob = await res.blob();
    if (!blob || !blob.size) throw new Error('empty');
    return blob;
  });
}

// Called by the voice script when audio that was received cannot be played (not a valid sound, or blocked by the browser).
const noteUnplayable = () => noteFailure(tts, 0);

// ---------- listening through the server ----------
// True when this device should record the answer and send it to the server (see the note above).
const listenViaServer = () => {
  if (configured !== true || !haveCredentials() || Date.now() < stt.pausedUntil || !canRecord()) return false;
  const pref = preference();
  return pref === 'server' || (pref === 'auto' && isIOS());
};

// Sends a recording (WAV, as base64) and returns the words, or throws. An empty string means nothing intelligible was said.
function transcribe(wavBase64, signal) {
  return callVoice(stt, TRANSCRIBE_URL, { audio: wavBase64 }, signal, 40_000, async (res) => {
    const j = await res.json();
    if (!j || typeof j.text !== 'string') throw new Error('bad_reply');
    return j.text;
  });
}

// ---------- for the voice check page ----------
// Asks the server whether the natural voice is on and tries one very short line, and reports what came back. It only reports numbers and the error
// NAMES the server itself sends (never the key or the access code), and it does not count as trouble for the resting rules above.
async function diagnose({ send = true } = {}) {
  const out = { configured: null, status: null, error: '', providerStatus: null, providerReason: '', bytes: 0, type: '', blob: null };
  try {
    const r = await nativeFetch(SPEAK_URL, { method: 'GET' });
    const j = r.ok ? await r.json() : null;
    out.configured = Boolean(j && j.configured === true);
  } catch { return out; }                                  // configured stays null: the site could not be reached
  if (!out.configured || !send) return out;                // send:false only asks whether the voice is on; nothing is spoken or billed
  try {
    const res = await nativeFetch(SPEAK_URL, { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ text: 'Voice check.' }) });
    out.status = res.status;
    if (!res.ok) {
      let j = null; try { j = await res.json(); } catch { /* no body */ }
      out.error = j && typeof j.error === 'string' ? j.error : '';
      out.providerStatus = j && Number.isFinite(j.providerStatus) ? j.providerStatus : null;
      out.providerReason = j && typeof j.providerReason === 'string' ? j.providerReason.replace(/[^A-Za-z0-9_]/g, '').slice(0, 60) : '';
      return out;
    }
    const blob = await res.blob();
    out.bytes = blob.size; out.type = blob.type || ''; out.blob = blob;
  } catch { out.status = 0; out.error = 'network'; }
  return out;
}

// What the page believes right now, for the voice check page.
const state = () => ({
  configured, haveCredentials: haveCredentials(), supabase: getMode() === 'supabase',
  speakRestMs: Math.max(0, tts.pausedUntil - Date.now()), listenRestMs: Math.max(0, stt.pausedUntil - Date.now()),
});

preference();

export const speech = { check, ready, fetchAudio, noteUnplayable, listenViaServer, transcribe, isIOS, preference, diagnose, state };
