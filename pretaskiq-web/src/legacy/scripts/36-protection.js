/* ===== Protection observations ===============================================================================
   For a work category, check every required control and score it AS FOUND (applies / present / works today).
   Safety Admin imports a checklist (Petey reads an uploaded PDF), reviews and approves it; then anyone can record an observation.
   Results are aggregates only: no names, no ranking of people. All maths lives in src/shared/protection.js. */
var prState = { category: null, answers: {}, setupBusy: false };
var PR_STATES = [['na', 'N/A'], ['missing', 'Not there'], ['not_working', 'Not working'], ['in_place', 'In place']];

function prEl(id) { return document.getElementById(id); }
function prEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function prP() { return window.PreTaskIQProtection; }
function prIsSafety() { return typeof currentRole !== 'undefined' && currentRole === 'safety'; }
function prBack() { setRole(prIsSafety() ? 'safety' : 'foreman'); }
function prPct(v) { return v == null ? '–' : (Math.round(v * 10) / 10) + '%'; }

/* ---------- record an observation ---------- */
async function openProtectionObserve() {
  prState = { category: null, answers: {}, setupBusy: false };
  await prP().refreshChecklists();
  var rl = prEl('pr-obs-role'); if (rl) rl.textContent = prIsSafety() ? 'Safety Admin' : 'Foreman';
  prEl('pr-obs-back').onclick = prBack;
  prRenderPick(); showScreen('protection-observe'); try { window.scrollTo(0, 0); } catch (e) {}
}

function prRenderPick() {
  var list = prP().approvedList(), box = prEl('pr-obs-body');
  if (!list.length) {
    box.innerHTML = '<div class="inf-sec"><h3>No checklists are approved yet</h3><p class="inf-hint">A Safety Admin needs to import the required controls and approve them first.</p>'
      + (prIsSafety() ? '<button type="button" class="btn-primary" onclick="openProtectionSetup()">Set up checklists</button>' : '') + '</div>';
    return;
  }
  box.innerHTML = '<div class="ir-types-label">What work are you observing?</div><div class="ir-types">' + list.map(function (c) {
    return '<button type="button" class="ir-type" data-pr-cat="' + prEsc(c.category) + '"><b>' + prEsc(c.label) + '</b><span>' + c.controls.length + ' controls to check</span></button>';
  }).join('') + '</div>';
  box.onclick = function (ev) { var b = ev.target.closest('[data-pr-cat]'); if (b) prStartObs(b.getAttribute('data-pr-cat')); };
}

function prStartObs(category) { prState.category = category; prState.answers = {}; prRenderForm(); try { window.scrollTo(0, 0); } catch (e) {} }

function prAnswerOf(id) { return prState.answers[id] || null; }
function prToRaw(r) { return { applies: r !== 'na', present: r === 'in_place' || r === 'not_working', works: r === 'in_place' }; }

function prRenderForm() {
  var P = prP(), cl = P.approvedFor(prState.category), box = prEl('pr-obs-body'); if (!cl) { prRenderPick(); return; }
  var section = function (kind, title, sub) {
    var items = cl.controls.filter(function (c) { return c.kind === kind; }); if (!items.length) return '';
    return '<section class="inf-sec"><h3>' + title + '</h3><p class="inf-hint">' + sub + '</p>' + items.map(function (c) {
      var cur = prAnswerOf(c.id);
      return '<div class="inf-item"><div class="pr-ctl">' + prEsc(c.text) + '</div><div class="inf-seg pr-seg" role="radiogroup">' + PR_STATES.map(function (s) {
        return '<button type="button" class="inf-seg-btn pr-' + s[0] + (cur === s[0] ? ' on' : '') + '" data-pr-c="' + prEsc(c.id) + '" data-pr-v="' + s[0] + '" role="radio" aria-checked="' + (cur === s[0]) + '">' + s[1] + '</button>';
      }).join('') + '</div></div>';
    }).join('') + '</section>';
  };
  var left = cl.controls.filter(function (c) { return !prAnswerOf(c.id); }).length;
  box.innerHTML = '<div class="inf-top"><span class="ir-kind">' + prEsc(cl.label) + '</span></div>'
    + '<p class="inf-hint">Score what you find. <b>In place</b> = it is there and works today. <b>Not working</b> = it is there but does not work. <b>Not there</b> = missing. <b>N/A</b> = does not apply to this work. Fixing it does not change the score.</p>'
    + section('prevention', 'Preventive controls', 'Do these keep the energy from being released?')
    + section('mitigation', 'Mitigative controls', 'Do these lessen the harm if the energy is released?')
    + '<div id="pr-obs-status" class="voice-status" role="status" aria-live="polite"></div>'
    + '<div class="ir-submit-row"><button type="button" class="btn-primary" id="pr-obs-submit"' + (left ? ' disabled' : '') + '>Submit observation</button>'
    + '<button type="button" class="btn-secondary" id="pr-obs-change">Change work type</button></div>'
    + '<div class="ir-submit-note">' + (left ? left + ' control' + (left === 1 ? '' : 's') + ' still to check.' : 'All controls checked.') + ' No names are recorded.'
    + (P.isLocal() ? ' Sign-in is not turned on, so this stays on this device only.' : '') + '</div>';
  box.onclick = function (ev) {
    var t = ev.target.closest('button'); if (!t) return;
    if (t.hasAttribute('data-pr-c')) { prState.answers[t.getAttribute('data-pr-c')] = t.getAttribute('data-pr-v'); var y = window.scrollY; prRenderForm(); try { window.scrollTo(0, y); } catch (e) {} }
    else if (t.id === 'pr-obs-change') prStartPickAgain();
    else if (t.id === 'pr-obs-submit') prSubmitObs();
  };
}
function prStartPickAgain() { prState.category = null; prState.answers = {}; prRenderPick(); }

async function prSubmitObs() {
  var btn = prEl('pr-obs-submit'); if (!btn || btn.disabled) return; var P = prP(), cl = P.approvedFor(prState.category);
  btn.disabled = true; btn.textContent = 'Submitting…';
  if (!prState.key) prState.key = 'po-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  var answers = cl.controls.map(function (c) { var r = prToRaw(prState.answers[c.id] || 'na'); return { id: c.id, applies: r.applies, present: r.present, works: r.works }; });
  var res = await P.submitObservation({ category: prState.category, answers: answers, clientKey: prState.key });
  if (!res.ok) { btn.disabled = false; btn.textContent = 'Submit observation'; var st = prEl('pr-obs-status'); if (st) { st.textContent = 'Not saved: ' + res.message + ' Your answers are still here. Try again.'; st.className = 'voice-status show problem'; } return; }
  var s = res.score, gaps = cl.controls.filter(function (c) { var a = prState.answers[c.id]; return a === 'missing' || a === 'not_working'; });
  prEl('pr-obs-body').innerHTML = '<div class="ir-done"><div class="ir-done-mark" aria-hidden="true">✓</div><h2 class="display">Observation recorded</h2>'
    + '<div class="pr-scores"><div><b>' + prPct(s.prevention) + '</b><span>Prevention</span></div><div><b>' + prPct(s.mitigation) + '</b><span>Mitigation</span></div><div><b>' + prPct(s.protection) + '</b><span>Protection</span></div></div>'
    + '<p>Scored as found: ' + s.inPlace + ' of ' + s.required + ' required controls in place' + (s.naCount ? ' (' + s.naCount + ' not applicable)' : '') + '.</p>'
    + (gaps.length ? '<div class="ir-list ir-unknown" style="text-align:left;"><span>To follow up</span><ul>' + gaps.map(function (c) { return '<li>' + prEsc(c.text) + '</li>'; }).join('') + '</ul></div>' : '')
    + (res.local ? '<p>Sign-in is not turned on, so this stays on this device only.</p>' : '')
    + '<div class="ir-submit-row"><button type="button" class="btn-primary" onclick="openProtectionObserve()">Record another</button><button type="button" class="btn-secondary" onclick="prBack()">Done</button></div></div>';
  try { window.scrollTo(0, 0); } catch (e) {}
}

/* ---------- results (Safety) ---------- */
async function openProtectionResults() {
  var P = prP(); await P.refreshChecklists(); await P.refreshSummary(); prRenderResults(); showScreen('protection-results'); try { window.scrollTo(0, 0); } catch (e) {}
}
function prBar(v, cls) { return '<div class="pr-bar"><i class="' + cls + '" style="width:' + (v == null ? 0 : Math.max(2, Math.min(100, v))) + '%"></i><em>' + prPct(v) + '</em></div>'; }
function prRenderResults() {
  var P = prP(), snap = P.getSnapshot(), s = snap.summary, box = prEl('pr-res-body');
  if (!s || !s.observations) { box.innerHTML = '<div class="inf-sec"><h3>No observations yet</h3><p class="inf-hint">Results appear here after the first observation is recorded.</p><button type="button" class="btn-primary" onclick="openProtectionObserve()">Record an observation</button></div>'; return; }
  var controlText = function (cat, id) { var all = snap.checklists.filter(function (c) { return c.category === cat; }); for (var i = 0; i < all.length; i++) { var m = all[i].controls.filter(function (c) { return c.id === id; })[0]; if (m) return m.text; } return id; };
  var h = '<div class="pr-kpis"><div><b>' + s.observations + '</b><span>observations</span></div><div><b>' + (s.naRate == null ? '–' : prPct(s.naRate)) + '</b><span>N/A checks, review whether they really do not apply</span></div></div>';
  if (P.isLocal()) h += '<p class="inf-hint">Sign-in is not turned on, so these results cover this browser only.</p>';
  h += '<section class="inf-sec"><h3>Protection by work category</h3><p class="inf-hint">Average of the as-found scores. A low score belongs to the system, not to a crew.</p>'
    + s.categories.map(function (c) { return '<div class="pr-cat"><div class="pr-cat-h"><b>' + prEsc(P.labelFor(c.id)) + '</b><span>' + c.n + ' observation' + (c.n === 1 ? '' : 's') + '</span></div>'
      + '<div class="pr-row"><span>Prevention</span>' + prBar(c.prevention, 'prev') + '</div><div class="pr-row"><span>Mitigation</span>' + prBar(c.mitigation, 'mit') + '</div><div class="pr-row"><span>Protection</span>' + prBar(c.protection, 'pro') + '</div></div>'; }).join('') + '</section>';
  h += '<section class="inf-sec"><h3>Most-missed controls</h3><p class="inf-hint">How often each control was not in place when it applied. Ask what is getting in the way.</p>'
    + s.controlGaps.filter(function (g) { return g.gapRate > 0; }).slice(0, 10).map(function (g) {
      return '<div class="pr-gap"><div><span class="pr-kind ' + g.kind + '">' + (g.kind === 'mitigation' ? 'M' : 'P') + '</span> ' + prEsc(controlText(g.category, g.id)) + '<em>' + prEsc(P.labelFor(g.category)) + ' · ' + g.notInPlace + ' of ' + g.required + '</em></div><b>' + prPct(g.gapRate) + '</b></div>';
    }).join('') || '<p class="inf-hint">No control has been missing so far.</p>';
  h += '</section><section class="inf-sec"><h3>Monthly trend</h3><p class="inf-hint">Early scores often fall as observers get more honest, which is not protection getting worse. Wait for several months of data before comparing anything.</p>'
    + '<div class="pr-trend"><div class="pr-trend-h"><span>Month</span><span>Obs</span><span>Prevention</span><span>Mitigation</span><span>Protection</span></div>' + s.trend.map(function (t) { return '<div><span>' + prEsc(t.month) + '</span><span>' + t.n + '</span><span>' + prPct(t.prevention) + '</span><span>' + prPct(t.mitigation) + '</span><span>' + prPct(t.protection) + '</span></div>'; }).join('') + '</div></section>';
  h += '<div class="ir-submit-note">Never use these results to rank or discipline people. No names are recorded.</div>';
  box.innerHTML = h;
}

/* ---------- checklist setup (Safety Admin): import, review, approve ---------- */
async function openProtectionSetup() { await prP().refreshChecklists(); prRenderSetup(); showScreen('protection-setup'); try { window.scrollTo(0, 0); } catch (e) {} }

function prControlRow(c, i) {
  return '<div class="inf-row"><select data-pc="kind" aria-label="Kind"><option value="prevention"' + (c.kind === 'prevention' ? ' selected' : '') + '>Preventive</option><option value="mitigation"' + (c.kind === 'mitigation' ? ' selected' : '') + '>Mitigative</option></select>'
    + '<input class="inf-what" data-pc="text" value="' + prEsc(c.text) + '" aria-label="Control"><button type="button" class="inf-x" data-pr-del="' + i + '" aria-label="Remove control">&times;</button></div>';
}
function prRenderSetup() {
  var P = prP(), box = prEl('pr-setup-body'), drafts = P.draftList(), live = P.approvedList();
  var h = '<section class="inf-sec"><h3>Import a checklist</h3><p class="inf-hint">Choose a PDF that lists the required controls for each work category. Petey copies the controls into drafts. You review every one, then approve. Nothing is used by crews until you approve it.</p>'
    + '<input type="file" id="pr-file" accept="application/pdf" style="display:none"><button type="button" class="btn-primary" id="pr-import">Choose PDF</button>'
    + '<div id="pr-import-status" class="voice-status" role="status" aria-live="polite"></div></section>';
  h += '<section class="inf-sec"><h3>Drafts to review (' + drafts.length + ')</h3>' + (drafts.length ? drafts.map(function (d) {
    return '<div class="pr-draft" data-draft="' + prEsc(d.id) + '" data-cat="' + prEsc(d.category) + '"><label class="ir-field"><span>Work category</span><input data-pc="label" value="' + prEsc(d.label) + '"></label>'
      + '<div class="pr-controls">' + d.controls.map(prControlRow).join('') + '</div><button type="button" class="btn-secondary inf-add" data-pr-add>+ Add control</button>'
      + '<p class="inf-hint">' + prEsc(d.source_note || '') + ' Check each control against your source document before approving.</p>'
      + '<div class="ir-submit-row"><button type="button" class="btn-secondary" data-pr-save>Save edits</button><button type="button" class="btn-primary" data-pr-approve>Approve</button><button type="button" class="btn-secondary" data-pr-discard>Discard</button></div></div>';
  }).join('') : '<p class="inf-hint">No drafts waiting.</p>') + '</section>';
  h += '<section class="inf-sec"><h3>Approved checklists (' + live.length + ')</h3>' + (live.length ? live.map(function (c) {
    return '<div class="pr-live"><b>' + prEsc(c.label) + '</b><span>' + c.controls.filter(function (x) { return x.kind === 'prevention'; }).length + ' preventive · ' + c.controls.filter(function (x) { return x.kind === 'mitigation'; }).length + ' mitigative</span></div>';
  }).join('') : '<p class="inf-hint">None yet.</p>') + '</section>';
  box.innerHTML = h;
  prEl('pr-import').onclick = function () { prEl('pr-file').click(); };
  prEl('pr-file').onchange = function () { if (this.files && this.files[0]) prImport(this.files[0]); };
  box.onclick = async function (ev) {
    var t = ev.target.closest('button'); if (!t) return; var card = t.closest('.pr-draft');
    if (t.hasAttribute('data-pr-del') && card) { var rows = card.querySelectorAll('.pr-controls .inf-row'); if (rows[Number(t.getAttribute('data-pr-del'))]) rows[Number(t.getAttribute('data-pr-del'))].remove(); return; }
    if (t.hasAttribute('data-pr-add') && card) { var wrap = card.querySelector('.pr-controls'); wrap.insertAdjacentHTML('beforeend', prControlRow({ kind: 'prevention', text: '' }, wrap.children.length)); var inp = wrap.lastElementChild.querySelector('[data-pc=text]'); if (inp) inp.focus(); return; }
    if (!card) return;
    var id = card.getAttribute('data-draft');
    if (t.hasAttribute('data-pr-discard')) { if (!confirm('Discard this draft?')) return; var d = await P.decide(id, 'discard'); if (!d.ok) alert(d.message); prRenderSetup(); return; }
    var saved = await prSaveDraft(card); if (!saved.ok) { alert(saved.message); return; }
    if (t.hasAttribute('data-pr-approve')) { var a = await P.decide(saved.checklist.id, 'approve'); if (!a.ok) { alert(a.message); return; } }
    prRenderSetup();
  };
}
function prSaveDraft(card) {
  var controls = Array.prototype.map.call(card.querySelectorAll('.pr-controls .inf-row'), function (row, i) { return { id: 'c' + (i + 1), kind: row.querySelector('[data-pc=kind]').value, text: row.querySelector('[data-pc=text]').value }; }).filter(function (c) { return c.text.trim(); });
  return prP().saveDraft({ category: card.getAttribute('data-cat'), label: card.querySelector('[data-pc=label]').value, controls: controls, sourceNote: 'Imported from an uploaded document.' });
}

function prImportPrompt() {
  return 'This PDF lists, for each work category (an "unwanted event"), the controls that must be in place. Copy them into JSON. Use ONLY what the document says: copy each control\'s wording faithfully (you may fix line-break spacing only). '
    + 'Never add, merge, reword or invent controls or categories. "Preventive" controls are those under the preventive heading; "mitigative" controls are those under the mitigative heading.\n\n'
    + 'Respond with ONLY one JSON object (no markdown):\n{ "checklists": [ { "label": "category name as written, in sentence case", "controls": [ { "kind": "prevention" or "mitigation", "text": "the control, as written" } ] } ] }';
}
async function prImport(file) {
  var st = prEl('pr-import-status'); var say = function (t, cls) { st.textContent = t; st.className = 'voice-status show' + (cls ? ' ' + cls : ''); };
  if (prState.setupBusy) return; if (file.type !== 'application/pdf') { say('Please choose a PDF.', 'problem'); return; }
  if (file.size > 8 * 1024 * 1024) { say('That file is over 8 MB. Choose a smaller copy.', 'problem'); return; }
  prState.setupBusy = true; say('Petey is reading the checklists…');
  try {
    var b64 = await rcaFileToBase64(file);
    var response = await fetch(window.PRETASKIQ_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }, { type: 'text', text: prImportPrompt() }] }] }) });
    if (!response.ok) throw new Error('The file could not be read (' + response.status + ').');
    var data = await response.json(); var raw = (data.content || []).map(function (b) { return b.text || ''; }).join('');
    var j = (typeof extractJson === 'function') ? extractJson(raw) : JSON.parse(raw.replace(/```json|```/g, '').trim());
    var lists = (j && Array.isArray(j.checklists)) ? j.checklists : []; var n = 0, skipped = [];
    for (var i = 0; i < lists.length; i++) {
      var cat = String(lists[i].label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
      var controls = (lists[i].controls || []).map(function (c, k) { return { id: 'c' + (k + 1), kind: c.kind === 'mitigation' ? 'mitigation' : 'prevention', text: c.text }; });
      var r = await prP().saveDraft({ category: cat, label: lists[i].label, controls: controls, sourceNote: 'Imported from ' + file.name + '.' });
      if (r.ok) n++; else skipped.push(lists[i].label || 'unnamed');
    }
    if (!n) throw new Error('I could not find any control checklists in that file.');
    await prP().refreshChecklists(); prRenderSetup();
    var s2 = prEl('pr-import-status'); s2.textContent = n + ' draft checklist' + (n === 1 ? '' : 's') + ' imported. Review each one against your document, then approve.' + (skipped.length ? ' Could not import: ' + skipped.join(', ') + '.' : ''); s2.className = 'voice-status show';
  } catch (e) { say((e && e.message) || 'Petey could not read that file. Try again.', 'problem'); }
  prState.setupBusy = false;
}
