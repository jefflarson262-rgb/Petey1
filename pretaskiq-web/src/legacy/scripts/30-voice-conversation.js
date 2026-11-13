/* ============================================================
   Talking with Petey. Added in the Vite port; not part of the original prototype.
   Three things:
     1. A shared Voice helper: Petey speaks (browser text-to-speech) and listens (browser speech recognition).
     2. Planning conversation: the mic starts "voice mode". Petey reads each question aloud, listens for the answer,
        shows what he heard, and sends it after a short pause (typing or tapping cancels the send).
     3. The shift companion screen: a "Tap and talk" button that needs no wake word, and chunked speech for Petey's replies.
   Petey's voice: when the server has the natural-voice service switched on (api/speak.js, ElevenLabs), his words are played from
   that, one or two sentences at a time. If it is not switched on, or anything about it fails, he speaks with the browser's own voice
   (the one saved in Settings, otherwise the most natural-sounding one the device offers), so he never goes silent.
   Listening: iPhones' built-in recognition is unreliable for web pages (words doubled, going deaf after audio plays, not available from a
   Home Screen icon), so on iPhones, when the voice service is on, the page records the answer itself and the server turns it into text
   (api/transcribe.js). Everywhere else, and whenever the service is off or fails, it uses the browser's own recognition.
   ============================================================ */
(function () {
  var PT = (window.PreTaskIQ = window.PreTaskIQ || {});
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var synth = window.speechSynthesis || null;

  // ---- 1. Voice helper ---------------------------------------------------------------------------
  var speakToken = 0, speakTimer = null, activeListen = null;
  var cloudAbort = null, cloudTimer = null, cloudAudio = null, cloudUrl = null;
  var SILENT_WAV = 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

  // The natural-voice service (src/api/speech.js). Null when this page has none; ready() is true only when the server has it switched on.
  function cloudSpeech() { var S = window.PreTaskIQSpeech; return (S && typeof S.ready === 'function' && typeof window.Audio === 'function') ? S : null; }
  function isIOS() { var ua = navigator.userAgent || ''; return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1); }
  // Should this device record the answer and have the server transcribe it? (Decided by src/api/speech.js.)
  function useServerListening() { var S = window.PreTaskIQSpeech; return !!(S && typeof S.listenViaServer === 'function' && S.listenViaServer()); }
  // On iPhones, playing audio is one of the things that reportedly makes the built-in recognition go deaf, so the natural voice is only used
  // there when listening also goes through the server.
  function cloudReady() { var S = cloudSpeech(); return !!(S && S.ready() && (!isIOS() || useServerListening())); }
  function canListenNow() { return !!SR || useServerListening(); }

  // Browser voice: the one picked in Settings, otherwise a male English (US) voice if the device has one (Petey is a man), otherwise the most
  // natural-sounding English (US) voice. (peteyBestVoice is in 18-voice-picker.js: it guesses male voices from their names, because browsers
  // do not say. It is not the old automatic default, which could land on a robotic voice such as "Fred".) Voices the device downloads from the
  // internet ("online", "natural", "neural", "premium", "enhanced") usually sound better than the small built-in ones.
  function savedVoiceName() { return typeof peteyChosenVoiceName === 'function' ? peteyChosenVoiceName() : null; }
  function pickVoice() {
    if (!synth) return null;
    var voices = synth.getVoices() || [];
    var name = savedVoiceName();
    return (name && voices.filter(function (v) { return v.name === name; })[0])
      || (typeof peteyBestVoice === 'function' ? peteyBestVoice(voices) : null)
      || voices.filter(function (v) { return /^en/i.test(v.lang); })[0]
      || null;
  }

  function tidy(text) { return String(text || '').replace(/[*#`_]/g, '').replace(/\s+/g, ' ').trim(); }
  var SENTENCES = /[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g;

  // Letter-by-letter abbreviations that voices tend to read as odd words.
  function speakable(text) {
    return String(text || '')
      .replace(/\bJHA(s?)\b/g, 'J H A$1').replace(/\bPPE\b/g, 'P P E').replace(/\bPTP\b/g, 'P T P').replace(/\bSTKY\b/g, 'S T K Y');
  }

  // Long utterances can stall in some browsers (Chrome desktop is reported to have trouble past about 14 seconds), so speak sentence by sentence.
  function chunks(text) {
    var clean = tidy(text);
    if (!clean) return [];
    var parts = clean.match(SENTENCES) || [clean];
    var out = [], cur = '';
    parts.forEach(function (s) { if (cur && (cur + s).length > 180) { out.push(cur.trim()); cur = s; } else cur += s; });
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  // For the natural voice: the first sentence on its own (so Petey starts quickly), then the rest in pieces of about 260 characters.
  // No piece is longer than 500 (the server accepts 600).
  function cloudChunks(text) {
    var clean = tidy(text);
    if (!clean) return [];
    var parts = clean.match(SENTENCES) || [clean];
    var out = [parts[0].trim()], cur = '';
    parts.slice(1).forEach(function (s) { if (cur && (cur + s).length > 260) { out.push(cur.trim()); cur = s; } else cur += s; });
    if (cur.trim()) out.push(cur.trim());
    var result = [];
    out.forEach(function (piece) {
      while (piece.length > 500) { var cut = piece.lastIndexOf(' ', 400); if (cut < 100) cut = 400; result.push(piece.slice(0, cut).trim()); piece = piece.slice(cut).trim(); }
      if (piece) result.push(piece);
    });
    return result;
  }

  // One audio element is reused, so one tap (see prime) unlocks it for all of Petey's later sentences.
  function ensureAudio() { if (!cloudAudio) { cloudAudio = new window.Audio(); cloudAudio.preload = 'auto'; } return cloudAudio; }
  function releaseUrl() { if (cloudUrl) { try { URL.revokeObjectURL(cloudUrl); } catch (e) {} cloudUrl = null; } }
  function stopCloudAudio() {
    clearTimeout(cloudTimer);
    if (cloudAbort) { try { cloudAbort.abort(); } catch (e) {} cloudAbort = null; }
    if (cloudAudio) { try { cloudAudio.onended = null; cloudAudio.onerror = null; cloudAudio.pause(); } catch (e) {} }
    releaseUrl();
  }

  function cancelSpeech() {
    speakToken++; clearTimeout(speakTimer);
    stopCloudAudio();
    if (synth) { try { synth.cancel(); } catch (e) {} }
  }

  // cb: { onStart(), onEnd(spoke) }. onEnd runs once, also when speech is blocked or unsupported (spoke = false).
  function speak(text, cb) {
    cb = cb || {};
    var spoken = speakable(text);
    if (cloudReady()) { var cl = cloudChunks(spoken); if (cl.length) return speakCloud(cl, cb); }
    return speakBrowser(chunks(spoken), cb);
  }

  // The natural voice. Each piece is fetched from the server as audio; the next piece is fetched while the current one plays.
  // Any trouble (server error, sound that will not play, nothing starting in time) hands the rest over to the browser voice.
  function speakCloud(list, cb) {
    cancelSpeech();
    var token = speakToken, S = cloudSpeech(), ctl = new AbortController(), pending = {}, i = 0, started = false, done = false;
    cloudAbort = ctl;
    function finish(spoke) { if (done) return; done = true; clearTimeout(cloudTimer); releaseUrl(); if (cb.onEnd) cb.onEnd(spoke || started); }
    function load(k) {
      if (k >= list.length || pending[k]) return;
      pending[k] = S.fetchAudio(list[k], ctl.signal);
      pending[k].catch(function () {});                       // handled where it is used; this only stops an "unhandled" warning
    }
    function markStarted() { if (!started) { started = true; if (cb.onStart) cb.onStart(); } }
    // How long a piece of Petey's voice may take once it is playing: about twice as long as speech normally takes (voices run at roughly 70 ms a character).
    function playingMs(k) { return Math.max(12000, list[k].length * 150); }
    function armWatch(k, ms) {
      clearTimeout(cloudTimer);
      cloudTimer = setTimeout(function () {
        if (token !== speakToken) return;
        if (!started) { S.noteUnplayable(); fallBack(); } else play(k + 1);
      }, ms);
    }
    // The sound has started: from here the timer allows the whole piece to play (a long first sentence used to be cut off by the 8-second start timer).
    function playing(k) { if (done || i !== k) return; markStarted(); armWatch(k, playingMs(k)); }
    function fallBack() {
      if (token !== speakToken || done) return;
      stopCloudAudio();
      var rest = list.slice(i).join(' ');
      if (!synth || !rest) { finish(started); return; }
      speakBrowser(chunks(rest), { onStart: markStarted, onEnd: function (spoke) { finish(spoke); } }, token);
    }
    function play(k) {
      if (token !== speakToken || done) return;
      if (k >= list.length) { finish(true); return; }
      i = k; load(k);
      pending[k].then(function (blob) {
        if (token !== speakToken || done) return;
        load(k + 1);                                          // get the next piece while this one plays
        releaseUrl(); cloudUrl = URL.createObjectURL(blob);
        var a = ensureAudio();
        a.onended = function () { if (token !== speakToken) return; clearTimeout(cloudTimer); play(k + 1); };
        a.onerror = function () { if (token !== speakToken) return; S.noteUnplayable(); fallBack(); };
        a.src = cloudUrl;
        // Never hang the conversation on a sound that will not start or finish. Waiting for the sound to START is one timer; once it is
        // playing, the timer is started again for the length of the piece (see playing), so a long sentence is never cut off by the first one.
        armWatch(k, started ? playingMs(k) : 8000);
        var p; try { p = a.play(); } catch (e) { S.noteUnplayable(); fallBack(); return; }
        if (p && typeof p.then === 'function') {
          p.then(function () { if (token === speakToken) playing(k); }, function (e) {
            if (token !== speakToken) return;
            if (e && e.name === 'AbortError') return;         // replaced by the next piece
            if (!(e && e.name === 'NotAllowedError')) S.noteUnplayable();   // blocked until a tap is the browser's rule, not the service's fault
            fallBack();
          });
        } else playing(k);
      }, function (e) {
        if (token !== speakToken) return;
        if (e && e.name === 'AbortError') return;
        fallBack();
      });
    }
    play(0);
    return { cancel: function () { if (token === speakToken) cancelSpeech(); done = true; clearTimeout(cloudTimer); releaseUrl(); } };
  }

  // The browser's own voice. `handoffToken` is passed when the natural voice gave up part-way and this finishes the job.
  function speakBrowser(list, cb, handoffToken) {
    var i = 0, started = false, done = false;
    function finish(spoke) { if (done) return; done = true; clearTimeout(speakTimer); if (cb.onEnd) cb.onEnd(spoke); }
    if (!synth || !list.length) { finish(false); return { cancel: function () {} }; }
    if (handoffToken === undefined) cancelSpeech();
    var token = handoffToken === undefined ? speakToken : handoffToken;
    function next() {
      if (token !== speakToken) return;
      clearTimeout(speakTimer);
      if (i >= list.length) { finish(true); return; }
      var piece = list[i++];
      var u = new SpeechSynthesisUtterance(piece);
      var v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      u.rate = 1.0; u.pitch = 1.0;
      var moved = false;                                      // this piece moves things on once only: a skipped piece may still report "end" later
      function advance() { if (moved || token !== speakToken) return; moved = true; next(); }
      // If the browser never starts (blocked until a tap, no audio), do not hang the conversation. Once the piece HAS started, the timer is
      // started again for the length of the piece: it used to keep the 5-second "never started" timer, which cut off any piece longer than that.
      function watch(ms) {
        clearTimeout(speakTimer);
        speakTimer = setTimeout(function () {
          if (token !== speakToken || moved) return;
          if (!started) { cancelSpeech(); finish(false); } else { try { synth.cancel(); } catch (e) {} advance(); }
        }, ms);
      }
      u.onstart = function () {
        if (token !== speakToken || moved) return;
        if (!started) { started = true; if (cb.onStart) cb.onStart(); }
        watch(Math.max(9000, piece.length * 140));            // about twice as long as speech normally takes
      };
      u.onend = function () { advance(); };
      u.onerror = function (e) { if (token !== speakToken) return; if (e && (e.error === 'canceled' || e.error === 'interrupted')) return; advance(); };
      watch(started ? Math.max(9000, piece.length * 140) : 5000);
      try { synth.speak(u); } catch (e) { finish(false); }
    }
    next();
    return { cancel: function () { if (token === speakToken) { cancelSpeech(); } if (!done) { done = true; clearTimeout(speakTimer); } } };
  }

  // Some phone browsers only allow speech that begins inside a tap. Call this from the tap handler.
  function prime() {
    if (synth) { try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch (e) {} }
    if (cloudReady()) {                                       // the same for the natural voice: play a silent moment so the page may play Petey's audio later
      try { var a = ensureAudio(); a.src = SILENT_WAV; var p = a.play(); if (p && typeof p.catch === 'function') p.catch(function () {}); } catch (e) {}
    }
    if (useServerListening()) { try { var c = audioCtx(); if (c && c.state === 'suspended') c.resume(); } catch (e) {} }   // iPhones only start recording audio that was woken inside a tap
  }

  // Joins what the recognizer returned. iPhone Safari can return overlapping results (a phrase, then the same phrase extended, or the same
  // phrase twice), which doubles words if every result is simply joined.
  function collapse(phrases) {
    var out = [];
    phrases.forEach(function (p) {
      p = String(p || '').replace(/\s+/g, ' ').trim();
      if (!p) return;
      var last = out.length ? out[out.length - 1] : null;
      if (last === null) { out.push(p); return; }
      var lp = last.toLowerCase(), pp = p.toLowerCase();
      if (pp === lp || lp.indexOf(pp) === 0) return;                  // a repeat, or a shorter start of the previous phrase
      if (pp.indexOf(lp) === 0) { out[out.length - 1] = p; return; }   // the previous phrase, extended
      out.push(p);
    });
    return out.join(' ');
  }

  // Listens until the person stops talking. opts: { silenceMs, maxMs, onText(text), onStage(stage), onDone(text, reason) }
  // reason: 'ok' | 'no-speech' | 'denied' | 'no-mic' | 'network' | 'unsupported' | 'error' | 'cancelled'
  // The returned object has stop() (throw it away) and finish() (I am done talking: use what you have).
  function listen(opts) { return useServerListening() ? listenServer(opts) : listenBrowser(opts); }

  // The browser's own recognition.
  function listenBrowser(opts) {
    stopListening();
    if (!SR) { setTimeout(function () { opts.onDone('', 'unsupported'); }, 0); return { stop: function () {}, finish: function () {} }; }
    var ios = isIOS();
    var rec = new SR();
    // iPhone Safari: continuous mode returns overlapping results; a single-answer session behaves better (reported on WebKit's bug tracker).
    rec.lang = 'en-US'; rec.continuous = !ios; rec.interimResults = true; rec.maxAlternatives = 1;
    var finals = '', interim = '', heard = false, finished = false, errCode = '', cancelled = false, quietTimer = null, maxTimer = null, startTimer = null;
    function currentText() { return collapse([finals, interim]); }
    function done() {
      if (finished) return; finished = true;
      clearTimeout(quietTimer); clearTimeout(maxTimer); clearTimeout(startTimer);
      if (activeListen === ctl) activeListen = null;
      var text = currentText();
      var reason = cancelled ? 'cancelled' : text ? 'ok'
        : (errCode === 'not-allowed' || errCode === 'service-not-allowed') ? 'denied'
        : errCode === 'audio-capture' ? 'no-mic' : errCode === 'network' ? 'network'
        : (errCode && errCode !== 'no-speech' && errCode !== 'aborted') ? 'error' : 'no-speech';
      opts.onDone(text, reason);
    }
    function endSoon() { try { rec.stop(); } catch (e) {} setTimeout(done, 1500); }     // 'end' normally fires first; this is the safety net
    var ctl = { stop: function () { cancelled = true; try { rec.abort(); } catch (e) {} setTimeout(done, 0); }, finish: endSoon };
    rec.onresult = function (ev) {
      heard = true;
      var fin = [], inter = [];
      for (var i = 0; i < ev.results.length; i++) { var r = ev.results[i]; (r.isFinal ? fin : inter).push(r[0].transcript); }
      finals = collapse(fin); interim = collapse(inter);
      if (opts.onText) opts.onText(currentText());
      // Elsewhere: stop after a pause. iPhone Safari ends a single-answer session by itself, and reports say cutting a session short with
      // stop() can leave later sessions deaf, so there stop() is only a late safety net.
      clearTimeout(quietTimer); quietTimer = setTimeout(endSoon, ios ? Math.max(opts.silenceMs || 1800, 4500) : (opts.silenceMs || 1800));
    };
    rec.onerror = function (ev) { errCode = ev && ev.error || 'error'; };
    rec.onend = function () { done(); };
    // Reported on WebKit's bug tracker (unconfirmed by Apple): a short utterance before each session helps iPhone recognition start hearing again.
    if (ios && synth) { try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch (e) {} }
    try { rec.start(); } catch (e) { errCode = 'error'; setTimeout(done, 0); return ctl; }
    startTimer = setTimeout(function () { if (!heard) endSoon(); }, 9000);              // nothing said at all
    maxTimer = setTimeout(endSoon, opts.maxMs || 60000);
    activeListen = ctl;
    return ctl;
  }

  // ---- Recording the answer and sending it to the server ----
  var sharedCtx = null;
  function audioCtx() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new AC();
    return sharedCtx;
  }

  // 16 kHz, 16-bit, mono WAV from the recorded pieces (Float32 samples at the device's own rate).
  function encodeWav(parts, inRate) {
    var total = 0; parts.forEach(function (p) { total += p.length; });
    var flat = new Float32Array(total), off = 0; parts.forEach(function (p) { flat.set(p, off); off += p.length; });
    var ratio = inRate / 16000, outLen = Math.floor(total / ratio);
    var bytes = new Uint8Array(44 + outLen * 2), dv = new DataView(bytes.buffer);
    function str(o, t) { for (var k = 0; k < t.length; k++) dv.setUint8(o + k, t.charCodeAt(k)); }
    str(0, 'RIFF'); dv.setUint32(4, 36 + outLen * 2, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true); dv.setUint32(24, 16000, true); dv.setUint32(28, 32000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    str(36, 'data'); dv.setUint32(40, outLen * 2, true);
    for (var i = 0; i < outLen; i++) {                         // average the input samples that fall into each output sample (a simple low-pass)
      var a = Math.floor(i * ratio), b = Math.max(a + 1, Math.floor((i + 1) * ratio)), sum = 0, n = 0;
      for (var j = a; j < b && j < total; j++) { sum += flat[j]; n++; }
      var v = n ? sum / n : 0; v = Math.max(-1, Math.min(1, v));
      dv.setInt16(44 + i * 2, Math.round(v < 0 ? v * 32768 : v * 32767), true);
    }
    return bytes;
  }
  function toBase64(bytes) {
    var out = '', step = 0x8000;
    for (var i = 0; i < bytes.length; i += step) out += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    return btoa(out);
  }

  function listenServer(opts) {
    stopListening();
    var S = window.PreTaskIQSpeech;
    var stage = 'starting', finished = false, heard = false, abort = new AbortController();
    var stream = null, src = null, proc = null, mute = null, startTimer = null;
    var chunks = [], rate = 44100, t = 0, floor = null, loudRun = 0, lastLoud = 0, firstLoudIdx = -1, lastLoudIdx = -1;
    var silenceMs = opts.silenceMs || 1800, maxMs = Math.min(opts.maxMs || 60000, 55000), noSpeechMs = opts.noSpeechMs || 9000;   // 55 s: what the server accepts

    function release() {                                       // let go of the microphone (so the phone's speaker goes back to normal)
      clearTimeout(startTimer);
      try { if (proc) { proc.onaudioprocess = null; proc.disconnect(); } } catch (e) {}
      try { if (src) src.disconnect(); } catch (e) {}
      try { if (mute) mute.disconnect(); } catch (e) {}
      try { if (stream) stream.getTracks().forEach(function (tr) { tr.stop(); }); } catch (e) {}
      proc = src = mute = stream = null;
    }
    function done(text, reason) {
      if (finished) return; finished = true;
      if (activeListen === ctl) activeListen = null;
      try { abort.abort(); } catch (e) {}
      release();
      opts.onDone(text, reason);
    }
    function endTalking() {                                    // I am done talking: send what was recorded
      if (finished || stage !== 'recording') { if (stage === 'starting') done('', 'no-speech'); return; }
      release();
      if (!heard) { done('', 'no-speech'); return; }
      stage = 'transcribing'; if (opts.onStage) { try { opts.onStage('transcribing'); } catch (e) {} }
      var wav;
      try { wav = encodeWav(chunks.slice(Math.max(0, firstLoudIdx - 4), Math.min(chunks.length, lastLoudIdx + 7)), rate); } catch (e) { done('', 'error'); return; }
      chunks = [];
      S.transcribe(toBase64(wav), abort.signal).then(
        function (text) { done(text, text ? 'ok' : 'no-speech'); },
        function (e) { if (e && e.name === 'AbortError') return; done('', 'error'); });
    }
    var ctl = { cloud: true, stop: function () { done('', 'cancelled'); }, finish: endTalking };

    // Which buffers hold speech? A running estimate of the background level (it falls fast, rises slowly, and is capped so constant machinery
    // noise cannot make speech undetectable) sets the bar: speech has to stand clearly above it.
    function onAudio(e) {
      if (stage !== 'recording') return;
      var d = e.inputBuffer.getChannelData(0), n = d.length, sum = 0;
      for (var i = 0; i < n; i++) sum += d[i] * d[i];
      var rms = Math.sqrt(sum / n);
      chunks.push(new Float32Array(d)); t += n / rate * 1000;
      var idx = chunks.length - 1;
      floor = floor === null ? Math.min(rms, 0.02) : (rms < floor ? rms : floor + (rms - floor) * 0.03);
      floor = Math.min(floor, 0.03);
      if (rms > Math.max(0.012, floor * 3)) {
        loudRun++;
        if (loudRun >= 2) { if (!heard) { heard = true; firstLoudIdx = idx - 1; } lastLoud = t; lastLoudIdx = idx; }
      } else loudRun = 0;
      if (heard && t - lastLoud > silenceMs) endTalking();
      else if (!heard && t > noSpeechMs) done('', 'no-speech');
      else if (t > maxMs) endTalking();
    }

    var md = navigator.mediaDevices;
    var ctx = audioCtx();
    if (!md || !ctx) { setTimeout(function () { if (!finished) { finished = true; listenBrowser(opts); } }, 0); return ctl; }
    activeListen = ctl;
    function fallBackToBrowser() {                              // use the browser's own listening instead; the person just sees it listening
      if (finished) return;
      finished = true; if (activeListen === ctl) activeListen = null; try { abort.abort(); } catch (e) {} release();
      listenBrowser(opts);
    }
    md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (s) {
      if (finished) { try { s.getTracks().forEach(function (tr) { tr.stop(); }); } catch (e) {} return; }
      stream = s;
      try {
        try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) {}
        rate = ctx.sampleRate || 44100;
        src = ctx.createMediaStreamSource(s); proc = ctx.createScriptProcessor(4096, 1, 1);
        mute = ctx.createGain(); mute.gain.value = 0;            // the recorder must be connected to the output to run; muted so nothing is heard
        proc.onaudioprocess = onAudio;
        src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
      } catch (e) { fallBackToBrowser(); return; }               // this browser cannot record the way we need: never leave the microphone open or the person waiting
      stage = 'recording';
      // If no sound arrives at all (the phone's audio system was not woken by a tap), do not sit there: use the browser's own listening instead.
      startTimer = setTimeout(function () { if (!chunks.length) fallBackToBrowser(); }, 2500);
    }, function (err) {
      var n = err && err.name;
      done('', (n === 'NotAllowedError' || n === 'SecurityError') ? 'denied' : (n === 'NotFoundError' || n === 'OverconstrainedError') ? 'no-mic' : 'error');
    });
    return ctl;
  }

  function stopListening() { if (activeListen) { var c = activeListen; activeListen = null; c.stop(); } }
  // "I am done talking": use what has been heard so far (as opposed to stopListening, which throws it away).
  function finishListening() { if (activeListen && activeListen.finish) activeListen.finish(); }

  PT.voice = {
    get canSpeak() { return !!synth || cloudReady(); },
    get usedForPlanning() { return voiceUsedForPlan; },
    get naturalVoice() { return cloudReady(); },
    get canListen() { return canListenNow(); }, get listeningViaServer() { return useServerListening(); },
    speak: speak, cancelSpeech: cancelSpeech, listen: listen, stopListening: stopListening, finishListening: finishListening, prime: prime, chunks: chunks, cloudChunks: cloudChunks,
    testing: { encodeWav: encodeWav, collapse: collapse, isIOS: isIOS },
  };

  function problemText(reason) {
    return reason === 'denied' ? 'The microphone is blocked. Allow it for this site in your browser settings, or type instead.'
      : reason === 'no-mic' ? 'No microphone was found. Type instead.'
      : reason === 'network' ? 'Listening needs an internet connection, and it was not available. Type instead.'
      : reason === 'unsupported' ? 'This browser cannot listen. Petey can still read questions aloud; type your answers. Chrome, Edge or Safari can listen.'
      : 'Listening did not work just now. Tap the mic to try again, or type.';
  }
  function setStatus(el, text, cls) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'voice-status' + (text ? ' show' : '') + (cls ? ' ' + cls : '');
  }

  // ---- 2. Planning conversation ------------------------------------------------------------------
  var convMic = document.getElementById('conv-mic');
  var convStatusEl = document.getElementById('conv-voice-status');
  var convInputEl = document.getElementById('conv-input');
  var cv = { on: false, phase: 'off', speak: null, sendTimer: null, quietRetries: 0 };   // phase: off | speaking | listening | sending | thinking | paused

  function cvUi() {
    if (!convMic) return;
    convMic.classList.toggle('on', cv.on);
    convMic.classList.toggle('listening', cv.phase === 'listening');
    convMic.setAttribute('aria-pressed', String(cv.on));
  }
  function cvPhase(phase, text, cls) { cv.phase = phase; cvUi(); setStatus(convStatusEl, text, cls); }
  function cvHalt() {
    cv.on = false; clearTimeout(cv.sendTimer); cv.sendTimer = null;
    if (cv.speak) { cv.speak.cancel(); cv.speak = null; }
    cancelSpeech(); stopListening();
  }
  function cvStop(message, cls) { cvHalt(); cvPhase('off', message || '', cls); }

  function cvSpeak(text) {
    if (!cv.on) return;
    clearTimeout(cv.sendTimer);
    cvPhase('speaking', PT.voice.canSpeak ? 'Petey is speaking… tap the mic to answer now.' : '');
    cv.speak = speak(text, { onEnd: function (spoke) {
      cv.speak = null;
      if (!cv.on) return;
      if (typeof convDone !== 'undefined' && convDone) { cvPhase('off', 'Building your plan…'); return; }
      cvListen();
    } });
  }

  function cvListen() {
    if (!cv.on) return;
    if (!canListenNow()) { cvPhase('paused', problemText('unsupported'), 'problem'); convInputEl.focus(); return; }
    if (convInputEl.disabled) { cvPhase('thinking', 'Petey is thinking…'); return; }   // the next question will start the listening
    cvPhase('listening', useServerListening() ? 'Listening… say your answer, then tap the mic when you are done.' : 'Listening… say your answer.', 'listening');
    listen({
      silenceMs: 1800,
      onStage: function (st) { if (st === 'transcribing' && cv.on) cvPhase('thinking', 'Got it… working out what you said.'); },
      onText: function (t) { convInputEl.value = t; },
      onDone: function (text, reason) {
        if (!cv.on) return;
        if (text) {
          cv.quietRetries = 0;
          convInputEl.value = text;
          cvPhase('sending', 'Heard: “' + text + '”. Sending in a moment. Tap the box to change it.');
          cv.sendTimer = setTimeout(cvSend, 1700);
          return;
        }
        if (reason === 'no-speech' && cv.quietRetries < 1) { cv.quietRetries++; cvListen(); return; }
        if (reason === 'no-speech') { cvPhase('paused', 'I did not hear anything. Tap the mic to talk, or type your answer.'); return; }
        cvStop(problemText(reason), 'problem');
      },
    });
  }

  function cvSend() {
    cv.sendTimer = null;
    var val = convInputEl.value.trim();
    if (!cv.on || !val || convInputEl.disabled || (typeof convDone !== 'undefined' && convDone)) return;
    cvPhase('thinking', 'Petey is thinking…');
    handleConvSend();
  }

  function cvStart() {
    prime();
    cv.on = true; cv.quietRetries = 0;
    var bubbles = document.querySelectorAll('#conv-scroll-inner .bubble.ai');
    var last = bubbles.length ? bubbles[bubbles.length - 1].textContent : '';
    if (last && !convInputEl.disabled) cvSpeak(last); else if (convInputEl.disabled) cvPhase('thinking', 'Petey is thinking…'); else cvListen();
  }

  if (convMic) convMic.addEventListener('click', function () {
    if (!cv.on) return cvStart();
    if (cv.phase === 'speaking') { if (cv.speak) { cv.speak.cancel(); cv.speak = null; } cvListen(); return; }   // answer without waiting for Petey to finish
    if (cv.phase === 'paused') { cv.quietRetries = 0; cvListen(); return; }
    if (cv.phase === 'listening' && activeListen && activeListen.cloud) { finishListening(); return; }   // recorded answer: "I am done talking"
    cvStop('');
  });
  // Typing means "I'll type this one": cancel the pending send and wait.
  if (convInputEl) convInputEl.addEventListener('input', function () {
    if (!cv.on) return;
    clearTimeout(cv.sendTimer); cv.sendTimer = null; stopListening();
    cvPhase('paused', 'Press Send when you are ready. Tap the mic to talk again.');
  });

  // New questions from Petey are read aloud while voice mode is on.
  var origAddBubble = addBubble;
  addBubble = function (role, text) {
    var row = origAddBubble.apply(this, arguments);
    if (role === 'assistant' && cv.on) cvSpeak(text);
    return row;
  };
  // An error in the conversation ends voice mode (the message is on screen).
  var origShowConvError = showConvError;
  showConvError = function (message) { origShowConvError.apply(this, arguments); if (cv.on) cvStop('Something went wrong. Fix it or tap the mic to try again.', 'problem'); };

  // ---- Start from the intake screen: say the day's tasks out loud ---------------------------------
  var intakeBox = document.getElementById('intake-textarea');
  var intakeMic = document.getElementById('intake-mic');
  var intakeStatusEl = document.getElementById('intake-voice-status');
  var intakeSubmitBtn = document.getElementById('intake-submit');
  var intakeVoice = { wanted: false, listening: false, sendTimer: null };

  function intakeUi() {
    if (!intakeMic) return;
    intakeMic.classList.toggle('on', intakeVoice.wanted);
    intakeMic.classList.toggle('listening', intakeVoice.listening);
    intakeMic.setAttribute('aria-pressed', String(intakeVoice.wanted));
    var l = document.getElementById('intake-mic-label'); if (l) l.textContent = intakeVoice.listening ? 'Listening…' : 'Talk to Petey';
  }
  function intakeCancelSend() { clearTimeout(intakeVoice.sendTimer); intakeVoice.sendTimer = null; }
  function intakeFieldChanged() { intakeSubmitBtn.disabled = !intakeBox.value.trim(); }

  if (intakeMic) intakeMic.addEventListener('click', function () {
    if (intakeVoice.listening) { finishListening(); return; }            // second tap: done talking
    intakeCancelSend(); prime();
    intakeVoice.wanted = true;                                           // Petey will then talk the plan through aloud
    if (!canListenNow()) { setStatus(intakeStatusEl, problemText('unsupported'), 'problem'); intakeUi(); intakeBox.focus(); return; }
    var base = intakeBox.value.trim();
    intakeVoice.listening = true; intakeUi(); setStatus(intakeStatusEl, 'Listening… tell Petey what is planned today.', 'listening');
    listen({
      silenceMs: 2600, maxMs: 90000,
      onStage: function (st) { if (st === 'transcribing') setStatus(intakeStatusEl, 'Got it… working out what you said.'); },
      onText: function (t) { intakeBox.value = (base ? base + ' ' : '') + t; intakeFieldChanged(); },
      onDone: function (text, reason) {
        intakeVoice.listening = false; intakeUi();
        if (!text) { setStatus(intakeStatusEl, reason === 'no-speech' ? 'I did not hear anything. Tap Talk to Petey to try again, or type.' : problemText(reason), 'problem'); if (reason !== 'no-speech') intakeVoice.wanted = false; intakeUi(); return; }
        intakeBox.value = (base ? base + ' ' : '') + text; intakeFieldChanged();
        setStatus(intakeStatusEl, 'Heard: “' + intakeBox.value + '”. Starting in a moment. Tap the box to change it.');
        intakeVoice.sendTimer = setTimeout(function () { intakeVoice.sendTimer = null; if (intakeBox.value.trim() && !intakeSubmitBtn.disabled) intakeSubmitBtn.click(); }, 2400);
      },
    });
  });
  if (intakeBox) intakeBox.addEventListener('input', function () { if (intakeVoice.sendTimer) { intakeCancelSend(); setStatus(intakeStatusEl, 'Press Start planning when you are ready.'); } });

  // The conversation starts in voice mode if the person used the mic on the intake screen.
  var origStartConversation = startConversation;
  var voiceUsedForPlan = false;      // did the person plan by voice? (then Petey greets them aloud when the plan is submitted)
  startConversation = function () {
    var useVoice = intakeVoice.wanted;
    voiceUsedForPlan = !!useVoice;
    intakeCancelSend(); intakeVoice.wanted = false; intakeVoice.listening = false; intakeUi(); setStatus(intakeStatusEl, '');
    cvHalt(); cvPhase('off', '');
    if (useVoice) { cv.on = true; cv.quietRetries = 0; cvPhase('thinking', 'Petey is thinking…'); }
    return origStartConversation.apply(this, arguments);
  };

  // Leaving the conversation ends voice mode and silences Petey.
  var origShowScreen = showScreen;
  showScreen = function (name) {
    if (name !== 'conversation' && name !== 'intake') { if (cv.on || cv.phase !== 'off') cvStop(''); else cancelSpeech(); }
    if (name !== 'intake') { intakeCancelSend(); if (intakeVoice.listening) stopListening(); }
    return origShowScreen.apply(this, arguments);
  };

  // ---- 3. Shift companion: tap and talk, and steadier speech -------------------------------------
  var ptt = document.getElementById('petey-ptt');
  var pttListening = false;
  if (ptt) ptt.addEventListener('click', function () {
    if (pttListening) { finishListening(); return; }
    if (typeof peteyEnabled !== 'undefined' && peteyEnabled) { addPeteyLogEntry('system', 'Petey is already listening for “Hey Petey”. Say it, or turn that off to use Tap and talk.'); return; }
    prime();
    if (!canListenNow()) { addPeteyLogEntry('system', problemText('unsupported')); return; }
    cancelSpeech();
    pttListening = true; ptt.classList.add('listening'); ptt.textContent = 'Listening… tap when done';
    setPeteyState('active');
    listen({
      silenceMs: 1800,
      onStage: function (st) { if (st === 'transcribing') ptt.textContent = 'Working out what you said…'; },
      onDone: function (text, reason) {
        pttListening = false; ptt.classList.remove('listening'); ptt.innerHTML = '&#127897; Tap and talk';
        setPeteyState('idle');
        if (text) handlePeteyQuery(text);
        else if (reason !== 'cancelled') addPeteyLogEntry('system', reason === 'no-speech' ? 'I did not hear anything. Tap and talk again.' : problemText(reason));
      },
    });
  });

  // Petey's spoken replies on the companion screen use the same steadier speech, with the same chosen voice.
  speakText = function (text, onDone) {
    speak(text, {
      onStart: function () { setPeteyState('speaking'); },
      onEnd: function () { setPeteyState(peteyEnabled ? 'listening' : 'idle'); if (onDone) onDone(); },
    });
  };
})();
