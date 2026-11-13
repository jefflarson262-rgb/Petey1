/* ============================================================
   Crew sign-off: who is on the crew today, and each person's signature, drawn with a finger (or a mouse).
   Added in the Vite port; not part of the original prototype. Runs after the persistence bridge (29) and the voice script (30).

   The foreman types the names (or taps the mic and says them). Each name gets a row; "Sign" opens a pad to sign on.
   Submitting the plan (32-submit-plan.js) needs every person on the list to have signed THIS revision of the plan:
   if the plan is changed afterwards (a hand edit, or Petey's mid-shift update) the crew has to sign again.

   Stored inside the plan itself, so it is saved with the plan and comes back when the plan is opened from "My plans":
     activeJHA.crew = [ { id, name, signature: null | { d, vb, at, revision } } ]
   `d` is the handwriting as a short drawing path (a few KB, not a picture file), `vb` the box it fits in, `at` when, `revision` which
   revision of the plan was signed. The AI is never given the signatures (see jhaForAI in 13-phase6-petey-voice.js).
   ============================================================ */
(function () {
  var PT = (window.PreTaskIQ = window.PreTaskIQ || {});
  var MAX_CREW = 25, MAX_NAME = 60, MAX_POINTS = 1500, MAX_PATH_CHARS = 8000, MIN_INK = 40;
  var VB_W = 500, VB_H = 160;                                 // the signature pad is always this shape; the stored path uses these units
  var $ = function (id) { return document.getElementById(id); };
  var plan = function () { return typeof activeJHA !== 'undefined' ? activeJHA : null; };
  var revOf = function (j) { return (j && j.revision) || 1; };
  var listening = false;                                      // dictating names
  var pendingRemove = null;                                   // a signed person whose remove button was tapped once
  var pad = null;                                             // the open signature pad

  // ---- names ---------------------------------------------------------------------------------------
  // "Luis Ortega, Dave and Mike Smith" -> ["Luis Ortega", "Dave", "Mike Smith"]. Also copes with a lead-in such as "the crew is ...".
  function parseNames(text) {
    var t = String(text || '').replace(/[‘’]/g, "'");
    t = t.replace(/^\s*(?:(?:the\s+)?crew(?:\s+(?:is|are|today))*|names?(?:\s+(?:is|are))?|(?:today\s+)?we\s+have|we(?:'ve| have)\s+got|(?:present|here)(?:\s+today)?(?:\s+(?:is|are))?)\b[\s:,\-]*/i, '');
    return t.split(/\s*(?:,|;|\n|&|\band\b|\bplus\b)\s*/i)
      .map(function (n) { return n.replace(/^(?:also|and)\s+/i, '').replace(/[.!?]+$/, '').replace(/\s+/g, ' ').trim(); })
      .filter(function (n) { return /[A-Za-zÀ-ɏ]/.test(n); })
      .map(function (n) { n = n.slice(0, MAX_NAME); return n === n.toLowerCase() ? n.replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }) : n; });   // dictation often gives all lower case
  }

  function newId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // ---- who has signed ------------------------------------------------------------------------------
  function validPath(d) { return typeof d === 'string' && d.length > 0 && d.length <= MAX_PATH_CHARS && /^[ML0-9., -]+$/.test(d); }   // only drawing commands: safe to put in the page
  function validBox(vb) { return typeof vb === 'string' && /^-?\d+(\.\d+)? -?\d+(\.\d+)? \d+(\.\d+)? \d+(\.\d+)?$/.test(vb) ? vb : '0 0 ' + VB_W + ' ' + VB_H; }
  function signedNow(p, j) { return !!(p && p.signature && validPath(p.signature.d) && (p.signature.revision || 1) >= revOf(j)); }

  // { total, signed, waiting: [names], ok } ok = at least one person, and everyone has signed this revision
  function status(j) {
    var crew = (j && Array.isArray(j.crew)) ? j.crew : [];
    var waiting = crew.filter(function (p) { return !signedNow(p, j); }).map(function (p) { return p.name; });
    return { total: crew.length, signed: crew.length - waiting.length, waiting: waiting, ok: crew.length > 0 && waiting.length === 0 };
  }

  // ---- drawing the section -------------------------------------------------------------------------
  function sigSvg(sig, name, faded) {
    return '<svg class="crew-sig-img' + (faded ? ' is-old' : '') + '" viewBox="' + validBox(sig.vb) + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Signature of ' + escapeHtml(name) + '">'
      + '<path d="' + sig.d + '" fill="none" stroke="#0F1E2E" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function timeText(iso) { try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }

  function rowHtml(p, j, editable) {
    var has = p.signature && validPath(p.signature.d), now = signedNow(p, j), right = '';
    if (now) {
      right = sigSvg(p.signature, p.name) + '<div class="crew-when">Signed ' + escapeHtml(timeText(p.signature.at)) + '</div>';
    } else if (has) {
      right = sigSvg(p.signature, p.name, true) + '<div class="crew-stale">Signed Rev ' + escapeHtml(String(p.signature.revision || 1)) + '. The plan changed, so ' + (editable ? 'sign again.' : 'this needs a new signature.') + '</div>'
        + (editable ? '<button type="button" class="btn-primary crew-sign-btn" data-crew-sign="' + escapeHtml(p.id) + '">✍️ Sign again</button>' : '');
    } else {
      right = editable ? '<button type="button" class="btn-primary crew-sign-btn" data-crew-sign="' + escapeHtml(p.id) + '">✍️ Sign</button>' : '<div class="crew-stale">Not signed</div>';
    }
    var canRemove = editable && !j.submitted;                              // once the plan is submitted the list is a record: people can be added, not removed
    var rm = canRemove ? '<button type="button" class="crew-remove" data-crew-remove="' + escapeHtml(p.id) + '" aria-label="Remove ' + escapeHtml(p.name) + ' from the crew">'
      + (pendingRemove === p.id ? 'Tap again to remove and delete the signature' : '✕') + '</button>' : '';
    return '<li class="crew-row' + (now ? ' is-signed' : '') + '"><div class="crew-name">' + escapeHtml(p.name) + '</div><div class="crew-right">' + right + '</div>' + rm + '</li>';
  }

  function renderList(j) {
    var list = $('crew-list'), sum = $('crew-summary');
    if (!list || !sum) return;
    var editable = !PT.readOnlyPlan, crew = (j && Array.isArray(j.crew)) ? j.crew : [], st = status(j);
    list.innerHTML = crew.map(function (p) { return rowHtml(p, j, editable); }).join('');
    if (!crew.length) sum.textContent = editable ? 'No one added yet. Add everyone on the crew, then each person signs.' : 'No crew was recorded for this plan.';
    else if (st.ok) sum.textContent = '✓ Everyone has signed (' + st.signed + ' of ' + st.total + ').';
    else sum.textContent = st.signed + ' of ' + st.total + ' have signed. Waiting for: ' + st.waiting.join(', ') + '.';
    sum.className = 'crew-summary' + (st.ok ? ' is-ok' : '');
  }

  function canDictate() { return !!(PT.voice && PT.voice.canListen); }

  function renderAddBar(j) {
    var bar = $('crew-addbar');
    if (!bar) return;
    if (PT.readOnlyPlan || !j) { bar.innerHTML = ''; return; }
    bar.innerHTML = '<label class="crew-label" for="crew-input">Who is on the crew today? <span>Include yourself.</span></label>'
      + '<div class="crew-add-row"><input id="crew-input" class="crew-input" type="text" autocomplete="off" autocapitalize="words" enterkeyhint="done" maxlength="400" placeholder="Type names, separated by commas">'
      + '<button id="crew-add" class="btn-secondary" type="button">Add</button>'
      + (canDictate() ? '<button id="crew-mic" class="btn-secondary" type="button">🎙️ Say the names</button>' : '') + '</div>'
      + '<div id="crew-status" class="crew-status" aria-live="polite"></div>';
  }

  function setStatus(text) { var el = $('crew-status'); if (el) el.textContent = text || ''; }
  function setMsg(text) { var el = $('crew-msg'); if (el) el.textContent = text || ''; }

  // Builds the section (once per drawing of the document; the original blank signature lines are replaced).
  function build() {
    var host = $('signoff-rows'), j = plan();
    if (!host || !j) return;
    pendingRemove = null;
    host.innerHTML = '<div id="crew-addbar" class="crew-add"></div><ul id="crew-list" class="crew-list"></ul><div id="crew-summary" class="crew-summary"></div><div id="crew-msg" class="crew-msg" role="alert"></div>';
    host.classList.add('crew-signoff');
    bind(host);
    renderAddBar(j); renderList(j);
  }

  function bind(host) {
    host.addEventListener('click', function (e) {
      var t = e.target, b;
      if (!t || !t.closest) return;
      if (t.closest('#crew-add')) return addFromInput();
      if (t.closest('#crew-mic')) return dictate();
      if ((b = t.closest('[data-crew-sign]'))) return openPad(b.getAttribute('data-crew-sign'));
      if ((b = t.closest('[data-crew-remove]'))) return removePerson(b.getAttribute('data-crew-remove'));
    });
    host.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.id === 'crew-input') { e.preventDefault(); addFromInput(); }
    });
  }

  // ---- changing the list ---------------------------------------------------------------------------
  function changed() {
    pendingRemove = null;
    renderList(plan());
    if (PT.refreshSubmitUi) PT.refreshSubmitUi();
    if (PT.saveCrew) PT.saveCrew();
  }

  function addNames(names) {
    var j = plan();
    if (!j || PT.readOnlyPlan) return [];
    if (!Array.isArray(j.crew)) j.crew = [];
    var added = [];
    names.forEach(function (n) { if (j.crew.length < MAX_CREW) { j.crew.push({ id: newId(), name: n, signature: null }); added.push(n); } });
    if (added.length) { setMsg(''); changed(); }
    return added;
  }

  function addFromInput() {
    var input = $('crew-input');
    if (!input) return;
    var names = parseNames(input.value);
    if (!names.length) { setStatus('Type a name first.'); return; }
    var added = addNames(names);
    if (added.length < names.length) setStatus('A crew list holds up to ' + MAX_CREW + ' people.');
    else setStatus('');
    input.value = '';
    input.focus();
  }

  function removePerson(id) {
    var j = plan();
    if (!j || PT.readOnlyPlan || j.submitted || !Array.isArray(j.crew)) return;
    var i = j.crew.findIndex(function (p) { return p.id === id; });
    if (i < 0) return;
    if (j.crew[i].signature && pendingRemove !== id) {            // a signature is lost with the person: ask once
      pendingRemove = id; renderList(j);
      setTimeout(function () { if (pendingRemove === id) { pendingRemove = null; renderList(plan()); } }, 4000);
      return;
    }
    j.crew.splice(i, 1); pendingRemove = null; changed();
  }

  // ---- saying the names ----------------------------------------------------------------------------
  function micUi(state) {
    var b = $('crew-mic');
    if (!b) return;
    b.textContent = state === 'listening' ? 'Listening… tap when done' : state === 'working' ? 'Working out what you said…' : '🎙️ Say the names';
    b.classList.toggle('listening', state === 'listening');
  }
  function reasonText(reason) {
    if (reason === 'no-speech') return 'I did not hear anything. Tap the mic and try again, or type the names.';
    if (reason === 'denied') return 'The microphone is blocked. Allow it in the browser settings, or type the names.';
    if (reason === 'no-mic') return 'No microphone was found. Type the names instead.';
    return 'Could not listen just now. Type the names instead.';
  }

  function dictate() {
    var v = PT.voice;
    if (!v || !v.canListen) { setStatus('Listening is not available on this device. Type the names instead.'); return; }
    if (listening) { v.finishListening(); return; }
    try { v.prime(); } catch (e) { /* not fatal */ }
    listening = true; micUi('listening'); setStatus('Say the names of everyone on the crew, then tap again.');
    v.listen({
      silenceMs: 2200, maxMs: 30000,
      onStage: function (st) { if (st === 'transcribing') micUi('working'); },
      onDone: function (text, reason) {
        listening = false; micUi('idle');
        if (text) {
          var added = addNames(parseNames(text));
          setStatus(added.length ? 'Added: ' + added.join(', ') + '. Check the spelling.' : 'I heard “' + text + '” but could not find names in it. Type them instead.');
        } else if (reason !== 'cancelled') setStatus(reasonText(reason));
      },
    });
  }

  function stopDictating() {
    if (listening) { listening = false; try { PT.voice.stopListening(); } catch (e) { /* not fatal */ } micUi('idle'); }
  }

  // ---- the signature pad ---------------------------------------------------------------------------
  function closePad() {
    if (!pad) return;
    var p = pad; pad = null;
    document.body.style.overflow = p.bodyOverflow;
    document.removeEventListener('keydown', p.onKey, true);
    if (p.el.parentNode) p.el.parentNode.removeChild(p.el);
    var btn = document.querySelector('[data-crew-sign="' + p.personId + '"]');
    if (btn && btn.focus) btn.focus();
  }

  function openPad(personId) {
    var j = plan();
    if (!j || PT.readOnlyPlan || pad) return;
    var person = (j.crew || []).find(function (p) { return p.id === personId; });
    if (!person) return;
    stopDictating();

    var el = document.createElement('div');
    el.className = 'sig-overlay'; el.id = 'sig-overlay';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'sig-title');
    el.innerHTML = '<div class="sig-card">'
      + '<div id="sig-title" class="sig-title">' + escapeHtml(person.name) + ', sign here</div>'
      + '<div class="sig-sub">Use your finger. By signing you confirm you reviewed this hazard analysis (Rev ' + revOf(j) + ') and will stop work and tell your supervisor if conditions change.</div>'
      + '<div class="sig-wrap"><canvas id="sig-canvas" aria-label="Signature pad: draw your signature"></canvas><div class="sig-line"><span>✕</span></div></div>'
      + '<div class="sig-actions"><button id="sig-cancel" class="btn-secondary" type="button">Cancel</button><button id="sig-clear" class="btn-secondary" type="button">Clear</button>'
      + '<button id="sig-save" class="btn-primary" type="button" disabled>Save signature</button></div></div>';
    document.body.appendChild(el);

    var canvas = $('sig-canvas'), wrap = canvas.parentNode;
    var cssW = Math.max(220, Math.min(520, wrap.clientWidth || 320)), cssH = Math.round(cssW * VB_H / VB_W);
    var dpr = Math.min(window.devicePixelRatio || 1, 2), k = cssW / VB_W;
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);                    // draw in the stored units (500 x 160)
    ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0F1E2E';

    var strokes = [], current = null, points = 0, ink = 0, drawing = false;
    var saveBtn = $('sig-save');
    var at = function (e) {
      var r = canvas.getBoundingClientRect();
      var x = (e.clientX - r.left) * VB_W / r.width, y = (e.clientY - r.top) * VB_H / r.height;
      return [Math.round(Math.max(0, Math.min(VB_W, x)) * 10) / 10, Math.round(Math.max(0, Math.min(VB_H, y)) * 10) / 10];    // a finger that slides off the pad stays on its edge
    };
    canvas.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
      if (points >= MAX_POINTS) return;
      drawing = true; current = [at(e)]; strokes.push(current); points++;
      ctx.beginPath(); ctx.moveTo(current[0][0], current[0][1]); ctx.lineTo(current[0][0] + 0.01, current[0][1]); ctx.stroke();   // a tap leaves a dot
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drawing || !current) return;
      e.preventDefault();
      var p = at(e), last = current[current.length - 1];
      var dx = p[0] - last[0], dy = p[1] - last[1], d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1.5 || points >= MAX_POINTS) return;                    // skip tiny moves: keeps the stored drawing small
      current.push(p); points++; ink += d;
      ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
      if (ink >= MIN_INK) saveBtn.disabled = false;
    });
    var up = function (e) { if (e && e.cancelable) e.preventDefault(); drawing = false; current = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
    canvas.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });       // keep the page from scrolling under the finger (older iOS)

    $('sig-clear').addEventListener('click', function () {
      strokes = []; current = null; points = 0; ink = 0; drawing = false; saveBtn.disabled = true;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore();
    });
    $('sig-cancel').addEventListener('click', closePad);
    el.addEventListener('click', function (e) { if (e.target === el) closePad(); });
    saveBtn.addEventListener('click', function () {
      if (ink < MIN_INK) return;
      var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      var d = strokes.map(function (s) {
        return s.map(function (p, i) {
          if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
          return (i === 0 ? 'M' : 'L') + p[0] + ' ' + p[1];
        }).join('');
      }).join('');
      if (d.length > MAX_PATH_CHARS) return;
      var pad4 = 6, x = Math.max(0, minX - pad4), y = Math.max(0, minY - pad4);
      var w = Math.max(40, Math.min(VB_W, maxX + pad4) - x), h = Math.max(20, Math.min(VB_H, maxY + pad4) - y);
      var jj = plan(), who = jj && (jj.crew || []).find(function (p) { return p.id === personId; });
      if (who) {
        who.signature = { d: d, vb: [x, y, w, h].map(function (n) { return Math.round(n * 10) / 10; }).join(' '), at: new Date().toISOString(), revision: revOf(jj) };
        setMsg('');
      }
      closePad();
      if (who) changed();
    });
    var onKey = function (e) { if (e.key === 'Escape') { e.stopPropagation(); closePad(); } };
    document.addEventListener('keydown', onKey, true);
    pad = { el: el, personId: personId, onKey: onKey, bodyOverflow: document.body.style.overflow };
    document.body.style.overflow = 'hidden';
    var title = $('sig-title'); if (title && title.focus) { title.tabIndex = -1; title.focus(); }
  }

  // ---- for the Submit button -----------------------------------------------------------------------
  // True when the crew has signed. Otherwise says what is missing, brings the section into view, and returns false.
  function requireAll() {
    var j = plan(), st = status(j);
    if (st.ok) { setMsg(''); return true; }
    setMsg(st.total === 0
      ? 'Add the people on the crew and have each person sign before you submit.'
      : 'Everyone on the crew has to sign before you submit. Still waiting for: ' + st.waiting.join(', ') + '.');
    var host = $('signoff-rows');
    if (host && host.scrollIntoView) host.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }

  // ---- wiring --------------------------------------------------------------------------------------
  var origRender = renderDocument;
  renderDocument = function () { var r = origRender.apply(this, arguments); build(); return r; };

  var origBump = bumpRevisionForEdit;
  bumpRevisionForEdit = function () { var r = origBump.apply(this, arguments); renderList(plan()); return r; };    // signatures from before the edit now show as "sign again"

  var origUpdate = updateActiveJHAFromReport;
  updateActiveJHAFromReport = async function () {
    var before = plan();
    var r = await origUpdate.apply(this, arguments);
    if (plan() !== before) renderList(plan());
    return r;
  };

  var origShow = showScreen;
  showScreen = function (name) {
    if (name !== 'document') { stopDictating(); closePad(); }
    return origShow.apply(this, arguments);
  };

  PT.crew = { status: status, parseNames: parseNames, requireAll: requireAll, addNames: addNames, MAX_CREW: MAX_CREW };
  PT.refreshCrew = function () { var j = plan(); renderAddBar(j); renderList(j); };
})();
