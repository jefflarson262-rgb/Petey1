/* ===== Incident report: the PRELIMINARY report (foreman or safety) ======================================
   Petey interviews the person who is reporting, writes the report up, and the person reviews and edits it.
   On submit it is filed as a preliminary report (PreTaskIQIncidents), the safety inbox is alerted (when sign-in is on), and a Safety Admin
   must complete the full report (35-incident-full.js), which is what creates the Knowledge Base incident.
   Names are never asked for: people are described by role. Nothing here decides whether something is recordable. */
var IR_KINDS = {
  near_miss: { label: 'Near miss', short: 'Near miss' },
  injury:    { label: 'Injury or first aid', short: 'Injury / first aid' },
  damage:    { label: 'Property damage or equipment', short: 'Property damage' }
};
var IR_MAX_ANSWERS = 10;
function irIsSafety() { return typeof currentRole !== 'undefined' && currentRole === 'safety'; }
function irMax() { return irIsSafety() ? IR_MAX_ANSWERS : 6; }
var IR_DONE_PHRASES = ['putting the report together now', 'writing up the report now'];
var irState = { kind: null, messages: [], busy: false, done: false, listening: false, report: null, answers: 0 };

function irEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function irEl(id) { return document.getElementById(id); }
function irClean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); }
function irList(v, max, len) { var a = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(/\n+/) : []); return a.map(function (x) { return irClean(x, len); }).filter(Boolean).slice(0, max); }

function buildIncidentInterviewPrompt(kind) {
  var label = (IR_KINDS[kind] || IR_KINDS.near_miss).label;
  return 'You are Petey, a calm, experienced construction safety companion. Someone on site is making a PRELIMINARY report of a "' + label + '". A safety administrator will complete the in-depth report later, so keep this quick and factual. '
    + 'Interview them so the report can be written up. Ask ONE short question at a time, in plain field language. Do not use markdown, lists or labels.\n\n'
    + 'The report is made after anyone hurt has already been cared for, so do NOT open by asking about how anyone is doing. Cover, in roughly this order, skipping anything they already told you: (1) what happened, in order; (2) when and where on site; '
    + '(3) what work was being done and with what equipment; (4) who was involved, by ROLE only (for example "the electrician", "the spotter"); '
    + (kind === 'injury' ? '(5) the injury: what part of the body, and whether it was handled with first aid on site or sent for medical treatment, plus what was done right away; '
      : kind === 'damage' ? '(5) what was damaged and how badly, and whether anyone was close by; '
      : '(5) how close it came to hurting someone, and what stopped it; ')
    + '(6) what was done right after; (7) conditions that may have mattered (weather, lighting, housekeeping, crowding, procedures, equipment condition).\n\n'
    + 'RULES:\n'
    + '- Never ask for or repeat a name. If a name is given, refer to the person by role from then on.\n'
    + '- Ask only for facts. Do not suggest causes, assign blame, or say what should have been done. Do not guess.\n'
    + '- You do not decide whether something is recordable or reportable. If asked, say that is for their safety professional.\n'
    + '- If they say someone still needs help, tell them to call 911 and their supervisor first, and wait.\n'
    + '- Keep each reply under 40 words. Acknowledge what they said in a few words before the next question.\n'
    + '- Ask no more than ' + irMax() + ' questions in total. When you have enough to write an accurate report (or they say they have nothing more), '
    + 'say one short sentence confirming you have what you need, and end the message with EXACTLY this sentence and no question after it: "Putting the report together now."';
}

function buildIncidentWriteupPrompt(kind, messages) {
  var label = (IR_KINDS[kind] || IR_KINDS.near_miss).label;
  var transcript = messages.map(function (m) { return (m.role === 'user' ? 'REPORTER: ' : 'PETEY: ') + m.content; }).join('\n');
  return 'Write up this "' + label + '" report from the interview below. Use ONLY facts the reporter stated. Never invent details, causes, names, times, heights, distances or injuries. '
    + 'Refer to people by role, never by name. If something was not stated, use an empty string or empty list; never guess. Show no graphic detail.\n\n'
    + 'INTERVIEW:\n"""\n' + transcript.slice(0, 9000) + '\n"""\n\n'
    + 'Respond with ONLY one JSON object (no markdown, no backticks):\n'
    + '{\n'
    + '  "title": "short plain title, max 80 characters",\n'
    + '  "when": "date and time exactly as stated, else empty",\n'
    + '  "location": "where on site, as stated, else empty",\n'
    + '  "work_being_done": "the work and equipment involved, one sentence, else empty",\n'
    + '  "narrative": "what happened, in order, plain language, max 1200 characters",\n'
    + '  "people_involved": ["roles only, up to 6"],\n'
    + '  "injury": "what was hurt and how it was handled, as stated, else empty",\n'
    + '  "damage": "what was damaged, as stated, else empty",\n'
    + '  "immediate_actions": ["what was done right after, up to 5 short phrases"],\n'
    + '  "conditions": ["conditions the reporter said may have mattered, up to 5 short phrases"],\n'
    + '  "unknowns": ["important things the interview did not establish, up to 5 short phrases"]\n'
    + '}';
}

function irAddBubble(role, text) {
  var chat = irEl('ir-chat'); if (!chat) return;
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:flex-end;justify-content:' + (role === 'user' ? 'flex-end' : 'flex-start') + ';';
  if (role !== 'user' && typeof peteyAvatarEl === 'function') row.appendChild(peteyAvatarEl());
  var b = document.createElement('div');
  b.className = 'rca-chat-bubble ' + role; b.style.whiteSpace = 'pre-wrap'; b.textContent = text;
  row.appendChild(b); chat.appendChild(row); chat.scrollTop = chat.scrollHeight;
  try { row.scrollIntoView({ block: 'nearest' }); } catch (e) {}
}

function openIncidentReport() {
  irStopListening();
  irState = { kind: null, messages: [], busy: false, done: false, listening: false, report: null, answers: 0, clientKey: null };
  irEl('ir-chat').innerHTML = ''; irEl('ir-chat').style.display = 'none';
  irEl('ir-input-row').style.display = 'none'; irEl('ir-input').value = '';
  irEl('ir-review').style.display = 'none'; irEl('ir-review').innerHTML = '';
  irEl('ir-done').style.display = 'none'; irEl('ir-done').innerHTML = '';
  irEl('ir-types').style.display = ''; irSetStatus(''); irSetBusy(false);
  var safety = irIsSafety();
  var rl = irEl('ir-role-label'); if (rl) rl.textContent = safety ? 'Safety Admin' : 'Foreman';
  var sub = irEl('ir-sub'); if (sub) sub.textContent = 'A quick preliminary report with Petey. ' + (safety ? 'You will complete the full report afterward.' : 'Your Safety Admin completes the full report afterward.');
  var back = irEl('ir-back'); if (back) back.onclick = function () { setRole(safety ? 'safety' : 'foreman'); };
  if (back) back.innerHTML = safety ? '&#8592; Dashboard' : '&#8592; Back';
  showScreen('incident');
}

function irStart(kind) {
  if (!IR_KINDS[kind]) return;
  irState.kind = kind;
  irEl('ir-types').style.display = 'none';
  irEl('ir-chat').style.display = 'flex'; irEl('ir-input-row').style.display = 'flex';
  var opening = "Thanks for reporting this. In your own words, what happened?";
  irState.messages.push({ role: 'assistant', content: opening });
  irAddBubble('assistant', opening);
  irEl('ir-input').focus();
}

function irSetStatus(text, cls) {
  var el = irEl('ir-voice-status'); if (!el) return;
  el.textContent = text || ''; el.className = 'voice-status' + (text ? ' show' : '') + (cls ? ' ' + cls : '');
}
function irSetBusy(on) {
  irState.busy = on;
  var s = irEl('ir-send'); if (s) s.disabled = on;
  var i = irEl('ir-input'); if (i) i.disabled = on;
  if (!on) { var inp = irEl('ir-input'); if (inp && !irState.done) { try { inp.focus(); } catch (e) {} } }
}

async function irCallClaude(system, messages, maxTokens) {
  var response = await fetch(window.PRETASKIQ_API_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens || 600, system: system, messages: messages })
  });
  var data = await response.json();
  if (data && data.error && !data.content) throw new Error(typeof data.error === 'string' ? data.error : (data.error.message || 'The assistant could not answer.'));
  return (data.content || []).map(function (b) { return b.text || ''; }).join('').trim();
}

function irIsDone(reply) {
  var lower = reply.toLowerCase();
  if (/\?\s*$/.test(reply.trim())) return false;       // a reply that ends with a question is still waiting for an answer
  return IR_DONE_PHRASES.some(function (p) { return lower.indexOf(p) !== -1; });
}

async function irSend() {
  if (irState.busy || irState.done || !irState.kind) return;
  var input = irEl('ir-input'); var text = input ? input.value.trim() : '';
  if (!text) return;
  irStopListening(); irSetStatus('');
  input.value = '';
  irAddBubble('user', text);
  irState.messages.push({ role: 'user', content: text });
  irState.answers++;
  irSetBusy(true);
  var typing = document.createElement('div'); typing.id = 'ir-typing'; typing.className = 'ir-typing'; typing.textContent = 'Petey is thinking…';
  irEl('ir-chat').appendChild(typing);
  try {
    var system = buildIncidentInterviewPrompt(irState.kind);
    if (irState.answers >= irMax()) system += '\n\nYou have asked enough questions. Do not ask another. Confirm you have what you need and end with "Putting the report together now."';
    var reply = await irCallClaude(system, irState.messages, 400);
    typing.remove();
    if (!reply) throw new Error('empty');
    irState.messages.push({ role: 'assistant', content: reply });
    irAddBubble('assistant', reply);
    if (irIsDone(reply) || irState.answers >= irMax() + 1) { irState.done = true; irSetBusy(true); irEl('ir-input-row').style.display = 'none'; await irWriteUp(); return; }
  } catch (e) {
    if (typing.parentNode) typing.remove();
    irState.messages.pop(); irState.answers--; input.value = text;       // let them send it again
    var last = irEl('ir-chat').lastChild; if (last) last.remove();
    irSetStatus('Petey could not answer just now. Check your connection and tap Send again. Your answer is still in the box.', 'problem');
  }
  irSetBusy(false);
}

async function irWriteUp() {
  var chat = irEl('ir-chat');
  var note = document.createElement('div'); note.className = 'ir-typing'; note.textContent = 'Writing up the report…'; chat.appendChild(note);
  try {
    var raw = await irCallClaude('You write careful, factual safety incident reports. You reply with JSON only.', [{ role: 'user', content: buildIncidentWriteupPrompt(irState.kind, irState.messages) }], 1800);
    var parsed = (typeof extractJson === 'function') ? extractJson(raw) : JSON.parse(raw.replace(/```json|```/g, '').trim());
    note.remove();
    irState.report = {
      title: irClean(parsed.title, 80) || (IR_KINDS[irState.kind].short + ' report'),
      when: irClean(parsed.when, 80), location: irClean(parsed.location, 120),
      work: irClean(parsed.work_being_done, 220), narrative: irClean(parsed.narrative, 1400),
      people: irList(parsed.people_involved, 6, 60), injury: irClean(parsed.injury, 240), damage: irClean(parsed.damage, 240),
      actions: irList(parsed.immediate_actions, 5, 160), conditions: irList(parsed.conditions, 5, 160), unknowns: irList(parsed.unknowns, 5, 160)
    };
    irRenderReview();
  } catch (e) {
    note.remove();
    irEl('ir-input-row').style.display = 'flex'; irState.done = false;
    irSetStatus('Petey could not finish the write-up. Tap Send to try again (you can add anything else first).', 'problem');
    irSetBusy(false);
  }
}

function irFieldHtml(label, id, value, rows, hint) {
  var tag = rows ? '<textarea id="' + id + '" rows="' + rows + '">' + irEsc(value) + '</textarea>' : '<input id="' + id + '" type="text" value="' + irEsc(value) + '">';
  return '<label class="ir-field"><span>' + irEsc(label) + '</span>' + tag + (hint ? '<em>' + irEsc(hint) + '</em>' : '') + '</label>';
}
function irListHtml(label, arr) {
  if (!arr || !arr.length) return '';
  return '<div class="ir-list"><span>' + irEsc(label) + '</span><ul>' + arr.map(function (x) { return '<li>' + irEsc(x) + '</li>'; }).join('') + '</ul></div>';
}

function irRenderReview() {
  var r = irState.report, box = irEl('ir-review');
  box.innerHTML = '<div class="ir-review-head"><span class="ir-kind">' + irEsc(IR_KINDS[irState.kind].label) + '</span><h2 class="display">Review the report</h2>'
    + '<p>Petey wrote this from your answers. Fix anything that is wrong, and take out any names or personal details before you submit.</p></div>'
    + irFieldHtml('Title', 'ir-f-title', r.title)
    + '<div class="ir-two">' + irFieldHtml('When', 'ir-f-when', r.when) + irFieldHtml('Where', 'ir-f-where', r.location) + '</div>'
    + irFieldHtml('Work being done', 'ir-f-work', r.work)
    + irFieldHtml('What happened', 'ir-f-narrative', r.narrative, 6)
    + (irState.kind === 'injury' || r.injury ? irFieldHtml('Injury and how it was handled', 'ir-f-injury', r.injury, 2) : '')
    + (irState.kind === 'damage' || r.damage ? irFieldHtml('What was damaged', 'ir-f-damage', r.damage, 2) : '')
    + irListHtml('People involved (roles)', r.people) + irListHtml('Done right after', r.actions) + irListHtml('Conditions that may have mattered', r.conditions)
    + (r.unknowns.length ? '<div class="ir-list ir-unknown"><span>Not established yet</span><ul>' + r.unknowns.map(function (x) { return '<li>' + irEsc(x) + '</li>'; }).join('') + '</ul></div>' : '')
    + '<div class="ir-submit-row"><button type="button" class="btn-primary" id="ir-submit">Submit report</button>'
    + '<button type="button" class="btn-secondary" id="ir-more">Add more with Petey</button></div>'
    + '<div class="ir-submit-note">Submitting files this as a preliminary report. ' + (window.PreTaskIQIncidents && !PreTaskIQIncidents.isLocal() ? 'The safety inbox is alerted, and a full report is due within ' + (PreTaskIQIncidents.getSnapshot().dueHours || 24) + ' hours.' : 'Sign-in is not turned on, so it stays on this device for now and no alert is sent.') + '</div>';
  box.style.display = 'block';
  try { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
  irEl('ir-submit').onclick = irSubmit;
  irEl('ir-more').onclick = function () {
    box.style.display = 'none'; irState.done = false; irState.answers = Math.max(0, irMax() - 3);
    irEl('ir-input-row').style.display = 'flex'; irSetBusy(false);
    var msg = 'What else should be added?'; irState.messages.push({ role: 'assistant', content: msg }); irAddBubble('assistant', msg);
  };
}

function irReadReview() {
  var r = irState.report;
  var g = function (id, max) { var e = irEl(id); return e ? irClean(e.value, max) : ''; };
  r.title = g('ir-f-title', 80) || r.title; r.when = g('ir-f-when', 80); r.location = g('ir-f-where', 120);
  r.work = g('ir-f-work', 220);
  var n = irEl('ir-f-narrative'); r.narrative = n ? n.value.replace(/\s+/g, ' ').trim().slice(0, 1400) : r.narrative;
  if (irEl('ir-f-injury')) r.injury = g('ir-f-injury', 240);
  if (irEl('ir-f-damage')) r.damage = g('ir-f-damage', 240);
  return r;
}

function irKeywords(r) {
  var stop = { the: 1, and: 1, was: 1, with: 1, that: 1, from: 1, were: 1, into: 1, then: 1, they: 1, there: 1, this: 1, have: 1, been: 1 };
  var seen = {}, out = [];
  (r.title + ' ' + r.work + ' ' + r.location).toLowerCase().split(/[^a-z0-9]+/).forEach(function (w) { if (w.length > 3 && !stop[w] && !seen[w]) { seen[w] = 1; out.push(w); } });
  return out.slice(0, 10);
}

function irBuildEntry(r) {
  var kindLabel = IR_KINDS[irState.kind].short;
  var facts = [r.narrative, r.when && ('When: ' + r.when), r.location && ('Where: ' + r.location), r.work && ('Work: ' + r.work),
    r.injury && ('Injury: ' + r.injury), r.damage && ('Damage: ' + r.damage), r.actions.length && ('Done right after: ' + r.actions.join('; ')),
    r.conditions.length && ('Conditions: ' + r.conditions.join('; '))].filter(Boolean).join('\n');
  var summary = r.narrative ? r.narrative.slice(0, 200) : r.title;
  var entry = {
    id: Date.now(), title: r.title, revision: '', scope: '', filename: null, status: 'ready', kbType: 'incident',
    summary: summary, change_description: summary, affected_work: [r.work, r.location].filter(Boolean).join(' · '),
    keywords: irKeywords(r), raw: '',
    hold_question: 'Before you start: a ' + kindLabel.toLowerCase() + ' was reported on similar work' + (r.location ? ' (' + r.location + ')' : '') + '. What is different today?',
    incident_narrative: r.narrative, sourceText: facts.slice(0, 6000),
    incident_kind: kindLabel, incident_when: r.when, location: r.location, injury_summary: r.injury, damage_summary: r.damage,
    people_roles: r.people, immediate_actions: r.actions, contributing_conditions: r.conditions, open_questions: r.unknowns,
    reported_via: 'petey_report', reported_at: new Date().toISOString(),
    root_causes: [], failed_control: '', corrective_actions: [], lessons_learned: []
  };
  try { if (typeof stkyResolveIds === 'function') entry.stkyCategoryIds = stkyResolveIds(entry, {}); } catch (e) {}
  return entry;
}

async function irSubmit() {
  var btn = irEl('ir-submit'); if (!btn || btn.disabled) return;
  var r = irReadReview();
  if (!r.narrative) { irSetStatus('Add what happened before you submit.', 'problem'); try { irEl('ir-f-narrative').focus(); } catch (e) {} return; }
  var I = window.PreTaskIQIncidents;
  if (!I) { irSetStatus('Incident reports are not available right now. Tell your safety team directly.', 'problem'); return; }
  btn.disabled = true; btn.textContent = 'Submitting…';
  if (!irState.clientKey) irState.clientKey = 'ir-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);   // a second tap files the same report, not another
  var res = await I.submitPreliminary({ kind: irState.kind, title: r.title, clientKey: irState.clientKey, data: {
    when: r.when, location: r.location, work: r.work, narrative: r.narrative, people: r.people, injury: r.injury, damage: r.damage,
    actions: r.actions, conditions: r.conditions, unknowns: r.unknowns } });
  if (!res.ok) {
    btn.disabled = false; btn.textContent = 'Submit report';
    irSetStatus('The report was not submitted: ' + (res.message || 'connection problem') + ' Your text is still here. Try again, and tell your safety team directly if it keeps failing.', 'problem');
    return;
  }
  irSetStatus('');
  var note = res.local ? 'Sign-in is not turned on, so this is kept on this device only and no alert was sent. Tell your safety team directly.'
    : res.alerted ? 'The safety inbox has been alerted. A full report is due within ' + (I.getSnapshot().dueHours || 24) + ' hours.'
    : 'The report is saved, but the alert could not be sent. Tell your safety team directly.';
  irEl('ir-review').style.display = 'none';
  var safety = irIsSafety(), done = irEl('ir-done');
  done.innerHTML = '<div class="ir-done-mark" aria-hidden="true">\u2713</div><h2 class="display">Preliminary report submitted</h2>'
    + '<p>' + irEsc(note) + '</p>'
    + '<p>' + (safety ? 'The full report is the next step. It sets up the root cause analysis.' : 'Your Safety Admin will complete the in-depth report. Thank you for reporting.') + '</p>'
    + '<div class="ir-submit-row">'
    + (safety ? '<button type="button" class="btn-primary" id="ir-go-full">Complete the full report</button>' : '')
    + '<button type="button" class="' + (safety ? 'btn-secondary' : 'btn-primary') + '" onclick="openIncidentReport()">Report another</button>'
    + '<button type="button" class="btn-secondary" onclick="setRole(\'' + (safety ? 'safety' : 'foreman') + '\')">' + (safety ? 'Back to dashboard' : 'Done') + '</button></div>';
  done.style.display = 'block';
  var go = irEl('ir-go-full'); if (go) go.onclick = function () { if (typeof openIncidentFull === 'function') openIncidentFull(res.report.id); };
  try { done.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
}

/* ---- voice: say the answer instead of typing it (same listening as the planning screen) ---- */
function irStopListening() {
  if (irState && irState.listening && window.PreTaskIQ && PreTaskIQ.voice) { try { PreTaskIQ.voice.stopListening(); } catch (e) {} }
  if (irState) irState.listening = false; irUiMic();
}
function irUiMic() { var m = irEl('ir-mic'); if (!m) return; m.classList.toggle('listening', !!irState.listening); m.setAttribute('aria-pressed', irState.listening ? 'true' : 'false'); }

(function irWire() {
  document.querySelectorAll('#ir-types .ir-type').forEach(function (b) { b.addEventListener('click', function () { irStart(b.getAttribute('data-kind')); }); });
  var send = irEl('ir-send'); if (send) send.addEventListener('click', irSend);
  var input = irEl('ir-input');
  if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); irSend(); } });
  var mic = irEl('ir-mic');
  if (mic) mic.addEventListener('click', function () {
    var V = window.PreTaskIQ && PreTaskIQ.voice;
    if (irState.listening) { if (V) V.finishListening(); return; }
    if (!V || !V.canListen) { irSetStatus('This browser cannot listen. Type your answer instead.', 'problem'); return; }
    if (irState.busy || irState.done) return;
    try { V.prime(); } catch (e) {}
    var base = input.value.trim();
    irState.listening = true; irUiMic(); irSetStatus('Listening… tap the mic again when you are done.', 'listening');
    V.listen({
      silenceMs: 2600, maxMs: 90000,
      onStage: function (st) { if (st === 'transcribing') irSetStatus('Got it… working out what you said.'); },
      onText: function (t) { input.value = (base ? base + ' ' : '') + t; },
      onDone: function (text, reason) {
        irState.listening = false; irUiMic();
        if (reason === 'cancelled') return;
        if (!text) { irSetStatus(reason === 'no-speech' ? 'I did not hear anything. Tap the mic to try again, or type.' : 'Listening did not work just now. Tap the mic to try again, or type.', 'problem'); return; }
        input.value = (base ? base + ' ' : '') + text;
        irSetStatus('Heard: “' + input.value + '”. Fix it if needed, then tap Send.');
      }
    });
  });
  // leaving the screen stops the microphone
  var prev = showScreen;
  showScreen = function (name) { if (name !== 'incident') irStopListening(); return prev.apply(this, arguments); };
})();
