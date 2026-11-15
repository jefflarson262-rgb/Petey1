// The voice check page: open the site with ?voicecheck=1 on a phone and this panel shows why Petey is (or is not) using the natural voice, tests it
// with one tap, and lists the voices the phone has. It exists because every voice problem otherwise looks the same: Petey quietly falls back to the
// phone's own voice and nobody can tell why. It shows only yes/no facts, status numbers and the error names the site sends, never a key or the
// access code. It adds nothing to the page unless the address asks for it.
const SILENT_WAV = 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

const HINTS = {
  speech_not_configured: 'The site has no ElevenLabs key. In Vercel, add ELEVENLABS_API_KEY and redeploy.',
  speech_provider_auth: 'ElevenLabs rejected the key (wrong key, or the key does not have permission for text to speech).',
  speech_provider_request: 'ElevenLabs did not accept the request. The voice or model may not be available on this plan.',
  speech_busy: 'ElevenLabs says too many requests, or the account is out of credits.',
  speech_unreachable: 'The site could not reach ElevenLabs. Try again in a minute.',
  speech_provider_error: 'ElevenLabs had an error on its own side.',
  speech_empty: 'ElevenLabs answered with no sound.',
  speech_misconfigured: 'ELEVENLABS_VOICE_ID is set to something that is not a voice ID.',
  invalid_access_code: 'The site did not accept the access code (or none has been entered in this tab yet).',
  server_not_configured: 'The site has no ACCESS_CODE set.',
  network: 'The request never reached the site (a network problem).',
};

export function startVoiceCheck(speech) {
  if (document.getElementById('voicecheck')) return;
  const panel = document.createElement('div');
  panel.id = 'voicecheck';
  panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;overflow:auto;background:#fff;color:#111;font:15px/1.45 -apple-system,system-ui,sans-serif;padding:max(16px,env(safe-area-inset-top)) 16px 24px;box-sizing:border-box;word-break:break-word;-webkit-text-size-adjust:100%';

  const el = (tag, css, text, id) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; if (id) e.id = id; return e; };
  const section = (title, id) => { const h = el('div', 'font-weight:700;margin:18px 0 4px', title); const body = el('div', 'margin:0', '', id); panel.append(h, body); return body; };
  const lines = (box, arr) => { box.textContent = ''; arr.forEach((t) => box.appendChild(el('div', 'margin:2px 0', t))); };
  const button = (label, id, onClick) => { const b = el('button', 'display:block;width:100%;min-height:48px;margin:8px 0;padding:10px 14px;font:600 16px -apple-system,system-ui,sans-serif;border:1px solid #888;border-radius:10px;background:#f2f2f2;color:#111', label, id); b.type = 'button'; b.addEventListener('click', onClick); return b; };

  panel.appendChild(el('div', 'font-size:20px;font-weight:700', 'Petey voice check'));
  panel.appendChild(el('div', 'color:#555;margin-top:4px', 'This shows why Petey is using the voice he is. Take a screenshot and send it to the person helping you.'));
  const server = section('1. The site', 'vc-server');
  const code = section('2. Access code in this tab', 'vc-code');
  const app = section('3. What this page will use right now', 'vc-app');
  panel.appendChild(button('Test the natural voice', 'vc-test-natural', testNatural));
  const natural = el('div', 'margin:2px 0 8px', '', 'vc-natural-result'); panel.appendChild(natural);
  const voices = section('4. This phone\'s English voices', 'vc-voices');
  const pick = el('div', 'margin:8px 0 0;font-weight:600', '', 'vc-pick'); panel.appendChild(pick);
  panel.appendChild(button('Test this phone\'s own voice', 'vc-test-phone', testPhone));
  const phone = el('div', 'margin:2px 0 8px', '', 'vc-phone-result'); panel.appendChild(phone);
  panel.appendChild(button('Close', 'vc-close', () => { speechSynthesis_off(); panel.remove(); }));
  document.body.appendChild(panel);

  const synth = () => (typeof window !== 'undefined' && window.speechSynthesis) || null;
  const speechSynthesis_off = () => { const s = synth(); if (s && s.onvoiceschanged === renderVoices) s.onvoiceschanged = null; };
  const englishVoices = () => { const s = synth(); return ((s && s.getVoices && s.getVoices()) || []).filter((v) => /^en/i.test(v.lang || '')); };
  const isMale = (v) => typeof window.peteyVoiceIsMale === 'function' && window.peteyVoiceIsMale(v);
  const backup = () => (typeof window.peteyBestVoice === 'function' ? window.peteyBestVoice(englishVoices()) : null);
  const label = (v) => v.name + ' (' + v.lang + ')';

  function renderVoices() {
    const list = englishVoices();
    lines(voices, list.length ? list.map((v) => label(v) + (isMale(v) ? ' — male guess' : '') + (v.localService === false ? ' — online' : '')) : ['None found yet (some phones list them a moment after the page opens).']);
    const b = backup();
    pick.textContent = b ? 'Back-up voice the app would pick: ' + label(b) : 'Back-up voice the app would pick: none';
  }

  async function renderStatus() {
    const st = speech.state();
    const fresh = await speech.diagnose({ send: false }).then((d) => d.configured, () => null);   // asks the site now, not what the page remembered from when it opened
    lines(server, [fresh === true ? 'The natural voice is switched ON on the site.' : fresh === false ? 'The natural voice is OFF on the site (the ElevenLabs key has not reached it).' : 'Could not reach the site\'s voice service.']);
    lines(code, [st.supabase ? 'Signed-in mode: no access code is used.' : st.haveCredentials ? 'Access code in this tab: entered.' : 'Access code in this tab: not entered yet. The natural voice waits for it; it is asked for the first time Petey needs the AI.']);
    const naturalNow = Boolean(window.PreTaskIQ && window.PreTaskIQ.voice && window.PreTaskIQ.voice.naturalVoice);
    const out = [];
    if (naturalNow) out.push('Speaking: the natural voice.');
    else if (fresh === true && st.configured !== true) out.push('Speaking: this device\'s own voice, because this page opened before the natural voice was switched on. Close this tab and open the site again.');
    else if (st.configured !== true) out.push('Speaking: this device\'s own voice (the natural voice is off on the site).');
    else if (!st.haveCredentials) out.push('Speaking: this device\'s own voice until the access code has been entered in this tab.');
    else if (st.speakRestMs > 0) out.push('Speaking: this device\'s own voice. The natural voice is resting for about ' + Math.ceil(st.speakRestMs / 60000) + ' more minute(s) after an error. Reload the page to clear it.');
    else out.push('Speaking: this device\'s own voice (this phone is set to use it with the current listening setting).');
    out.push(speech.listenViaServer() ? 'Listening: your answer is recorded and the site turns it into text.' : 'Listening: this browser\'s own built-in listening.');
    lines(app, out);
  }

  async function testNatural() {
    // Wake the audio inside the tap, the way the app does, so the browser allows the real sound a moment later.
    const a = new window.Audio();
    try { a.src = SILENT_WAV; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
    lines(natural, ['Asking the site for one short line…']);
    const d = await speech.diagnose();
    if (d.configured === null) return lines(natural, ['Could not reach the site\'s voice service.']);
    if (d.configured === false) return lines(natural, ['The site says the natural voice is OFF, so there is nothing to test.']);
    if (d.error || !d.blob) {
      const out = ['Failed: the site answered ' + d.status + (d.error ? ' ' + d.error : '') + (d.providerStatus ? ' (ElevenLabs said ' + d.providerStatus + ')' : '') + '.'];
      if (HINTS[d.error]) out.push(HINTS[d.error]);
      return lines(natural, out);
    }
    const out = ['Audio received: ' + Math.max(1, Math.round(d.bytes / 1024)) + ' KB (' + (d.type || 'unknown type') + ').'];
    lines(natural, out);
    let url = null;
    try {
      url = URL.createObjectURL(d.blob); a.src = url;
      await a.play();
      out.push('Played. If you heard a man\'s voice (Brian), the natural voice works on this phone.');
    } catch (e) {
      out.push(e && e.name === 'NotAllowedError' ? 'The browser blocked the sound. Tap the button again.' : 'The browser could not play the audio (' + ((e && e.name) || 'error') + ').');
    }
    lines(natural, out);
    setTimeout(() => { try { if (url) URL.revokeObjectURL(url); } catch { /* ignore */ } }, 15000);
  }

  function testPhone() {
    const s = synth();
    if (!s || typeof window.SpeechSynthesisUtterance !== 'function') return lines(phone, ['This browser cannot speak.']);
    const v = backup();
    try {
      s.cancel();
      const u = new window.SpeechSynthesisUtterance('Hey, I\'m Petey. This is this phone\'s own voice.');
      if (v) { u.voice = v; u.lang = v.lang; }
      s.speak(u);
      lines(phone, ['Spoke with: ' + (v ? label(v) : 'the phone\'s default voice') + '. Did it sound like a man with an American accent?']);
    } catch { lines(phone, ['The phone would not speak.']); }
  }

  renderVoices();
  const s = synth(); if (s) s.onvoiceschanged = renderVoices;      // some phones fill the voice list a moment after the page opens
  renderStatus();
  setTimeout(renderVoices, 1200);
}
