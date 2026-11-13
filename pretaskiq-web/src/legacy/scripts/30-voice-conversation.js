/* ============================================================
   Talking with Petey. Added in the Vite port; not part of the original prototype.
   Three things:
     1. A shared Voice helper: Petey speaks (browser text-to-speech) and listens (browser speech recognition).
     2. Planning conversation: the mic starts "voice mode". Petey reads each question aloud, listens for the answer,
        shows what he heard, and sends it after a short pause (typing or tapping cancels the send).
     3. The shift companion screen: a "Tap and talk" button that needs no wake word, and chunked speech for Petey's replies.
   Everything here uses what the browser provides. The voice is whatever voice the person's device offers (or the one chosen in
   Settings), so it sounds different on different devices. A single consistent "narrator" voice would need a cloud voice
   service; Voice.speak is the one place that would change.
   ============================================================ */
(function () {
  var PT = (window.PreTaskIQ = window.PreTaskIQ || {});
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var synth = window.speechSynthesis || null;

  // ---- 1. Voice helper ---------------------------------------------------------------------------
  var speakToken = 0, speakTimer = null, activeListen = null;

  function chosenVoiceName() { try { return typeof selectedVoiceName !== 'undefined' ? selectedVoiceName : null; } catch (e) { return null; } }

  function pickVoice() {
    if (!synth) return null;
    var voices = synth.getVoices() || [];
    var name = chosenVoiceName();
    return (name && voices.filter(function (v) { return v.name === name; })[0])
      || voices.filter(function (v) { return /^en[-_]US/i.test(v.lang) && /natural|neural|online/i.test(v.name); })[0]
      || voices.filter(function (v) { return /^en[-_]US/i.test(v.lang); })[0]
      || voices.filter(function (v) { return /^en/i.test(v.lang); })[0]
      || null;
  }

  // Long utterances can stall in some browsers (Chrome desktop is reported to have trouble past about 14 seconds), so speak sentence by sentence.
  function chunks(text) {
    var clean = String(text || '').replace(/[*#`_]/g, '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    var parts = clean.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [clean];
    var out = [], cur = '';
    parts.forEach(function (s) { if (cur && (cur + s).length > 180) { out.push(cur.trim()); cur = s; } else cur += s; });
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function cancelSpeech() {
    speakToken++; clearTimeout(speakTimer);
    if (synth) { try { synth.cancel(); } catch (e) {} }
  }

  // cb: { onStart(), onEnd(spoke) }. onEnd runs once, also when speech is blocked or unsupported (spoke = false).
  function speak(text, cb) {
    cb = cb || {};
    var list = chunks(text), i = 0, started = false, done = false;
    function finish(spoke) { if (done) return; done = true; clearTimeout(speakTimer); if (cb.onEnd) cb.onEnd(spoke); }
    if (!synth || !list.length) { finish(false); return { cancel: function () {} }; }
    cancelSpeech();
    var token = speakToken;
    function next() {
      if (token !== speakToken) return;
      clearTimeout(speakTimer);
      if (i >= list.length) { finish(true); return; }
      var piece = list[i++];
      var u = new SpeechSynthesisUtterance(piece);
      var v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      u.rate = 1.0; u.pitch = 1.0;
      u.onstart = function () { if (token !== speakToken) return; if (!started) { started = true; if (cb.onStart) cb.onStart(); } };
      u.onend = function () { next(); };
      u.onerror = function (e) { if (token !== speakToken) return; if (e && (e.error === 'canceled' || e.error === 'interrupted')) return; next(); };
      // If the browser never starts (blocked until a tap, no audio), do not hang the conversation.
      speakTimer = setTimeout(function () {
        if (token !== speakToken) return;
        if (!started) { cancelSpeech(); finish(false); } else { try { synth.cancel(); } catch (e) {} next(); }
      }, started ? Math.max(9000, piece.length * 140) : 5000);
      try { synth.speak(u); } catch (e) { finish(false); }
    }
    next();
    return { cancel: function () { if (token === speakToken) { cancelSpeech(); } if (!done) { done = true; clearTimeout(speakTimer); } } };
  }

  // Some phone browsers only allow speech that begins inside a tap. Call this from the tap handler.
  function prime() {
    if (!synth) return;
    try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch (e) {}
  }

  // Listens until the person stops talking. opts: { silenceMs, maxMs, onText(text), onDone(text, reason) }
  // reason: 'ok' | 'no-speech' | 'denied' | 'no-mic' | 'network' | 'unsupported' | 'error' | 'cancelled'
  function listen(opts) {
    stopListening();
    if (!SR) { setTimeout(function () { opts.onDone('', 'unsupported'); }, 0); return { stop: function () {} }; }
    var rec = new SR();
    rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    var finals = '', interim = '', heard = false, finished = false, errCode = '', cancelled = false, quietTimer = null, maxTimer = null, startTimer = null;
    function currentText() { return (finals + (finals ? ' ' : '') + interim).replace(/\s+/g, ' ').trim(); }
    function done() {
      if (finished) return; finished = true;
      clearTimeout(quietTimer); clearTimeout(maxTimer); clearTimeout(startTimer);
      if (activeListen === ctl) activeListen = null;
      var text = (finals.trim() || interim.trim());
      var reason = cancelled ? 'cancelled' : text ? 'ok'
        : (errCode === 'not-allowed' || errCode === 'service-not-allowed') ? 'denied'
        : errCode === 'audio-capture' ? 'no-mic' : errCode === 'network' ? 'network'
        : (errCode && errCode !== 'no-speech' && errCode !== 'aborted') ? 'error' : 'no-speech';
      opts.onDone(text, reason);
    }
    function endSoon() { try { rec.stop(); } catch (e) {} setTimeout(done, 1500); }     // 'end' normally fires first; this is the safety net
    var ctl = { stop: function () { cancelled = true; try { rec.abort(); } catch (e) {} setTimeout(done, 0); }, finish: endSoon };
    rec.onresult = function (ev) {
      heard = true; interim = ''; var f = '';
      for (var i = 0; i < ev.results.length; i++) { var r = ev.results[i]; if (r.isFinal) f += (f ? ' ' : '') + r[0].transcript; else interim += r[0].transcript; }
      finals = f;
      if (opts.onText) opts.onText(currentText());
      clearTimeout(quietTimer); quietTimer = setTimeout(endSoon, opts.silenceMs || 1800);
    };
    rec.onerror = function (ev) { errCode = ev && ev.error || 'error'; };
    rec.onend = function () { done(); };
    try { rec.start(); } catch (e) { errCode = 'error'; setTimeout(done, 0); return ctl; }
    startTimer = setTimeout(function () { if (!heard) endSoon(); }, 9000);              // nothing said at all
    maxTimer = setTimeout(endSoon, opts.maxMs || 60000);
    activeListen = ctl;
    return ctl;
  }
  function stopListening() { if (activeListen) { var c = activeListen; activeListen = null; c.stop(); } }

  PT.voice = { canSpeak: !!synth, canListen: !!SR, speak: speak, cancelSpeech: cancelSpeech, listen: listen, stopListening: stopListening, prime: prime, chunks: chunks };

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
    if (!SR) { cvPhase('paused', problemText('unsupported'), 'problem'); convInputEl.focus(); return; }
    if (convInputEl.disabled) { cvPhase('thinking', 'Petey is thinking…'); return; }   // the next question will start the listening
    cvPhase('listening', 'Listening… say your answer.', 'listening');
    listen({
      silenceMs: 1800,
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
    if (intakeVoice.listening) { stopListening(); return; }              // second tap: done talking
    intakeCancelSend(); prime();
    intakeVoice.wanted = true;                                           // Petey will then talk the plan through aloud
    if (!SR) { setStatus(intakeStatusEl, problemText('unsupported'), 'problem'); intakeUi(); intakeBox.focus(); return; }
    var base = intakeBox.value.trim();
    intakeVoice.listening = true; intakeUi(); setStatus(intakeStatusEl, 'Listening… tell Petey what is planned today.', 'listening');
    listen({
      silenceMs: 2600, maxMs: 90000,
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
  startConversation = function () {
    var useVoice = intakeVoice.wanted;
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
    if (pttListening) { stopListening(); return; }
    if (typeof peteyEnabled !== 'undefined' && peteyEnabled) { addPeteyLogEntry('system', 'Petey is already listening for “Hey Petey”. Say it, or turn that off to use Tap and talk.'); return; }
    prime();
    if (!SR) { addPeteyLogEntry('system', problemText('unsupported')); return; }
    cancelSpeech();
    pttListening = true; ptt.classList.add('listening'); ptt.textContent = 'Listening… tap when done';
    setPeteyState('active');
    listen({
      silenceMs: 1800,
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
