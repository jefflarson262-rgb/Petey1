/* ===== Safety audits =========================================================================================
   Safety Admin builds templates (by hand, from a starter, drafted by Petey from a topic, or copied from an uploaded PDF). Anyone approved runs an audit:
   each item is Pass / Fail / N/A, a Fail needs a comment, and photos can be taken or uploaded. The rules live in src/shared/audit.js (the server enforces them too). */
var auState = { tpl: null, answers: {}, edit: null, location: '', busy: false, key: null };
var AU_STARTERS = [
  { title: 'General site housekeeping', items: ['Walkways and access routes are clear of materials and debris', 'Materials are stacked and stored so they cannot fall or tip', 'Waste containers are not overflowing and debris is removed regularly', 'Cords and hoses are off walking paths or protected', 'Lighting is adequate in work areas and walkways', 'Exits and emergency routes are unobstructed', 'Fire extinguishers are accessible and not blocked'] },
  { title: 'Ladder use', items: ['The ladder was inspected before use and has no visible damage', 'The ladder is the right type and rating for the task and the person using it', 'The ladder is set on a firm, level surface', 'The ladder is set at a safe angle and extends above the landing when used for access', 'The ladder is secured or held while in use', 'The person keeps three points of contact when climbing'] },
  { title: 'Hand and power tools', items: ['Tools were inspected before use and are in good condition', 'Guards are in place and working', 'Cords and plugs are undamaged', 'Power is protected as the site rules require (for example GFCI)', 'Each tool is the right one for the job and used as intended', 'Required PPE is worn by the person using the tool', 'Tools are stored properly when not in use'] }
];
function auEl(id) { return document.getElementById(id); }
function auEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function auA() { return window.PreTaskIQAudits; }
function auIsSafety() { return typeof currentRole !== 'undefined' && currentRole === 'safety'; }
function auPct(v) { return v == null ? '–' : (Math.round(v * 10) / 10) + '%'; }
function auWhen(iso) { try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }

/* ---------- home: run an audit, history, (safety) manage templates ---------- */
async function openAuditHome() {
  var A = auA(); await Promise.all([A.refreshTemplates(), A.refreshAudits()]);
  var rl = auEl('au-home-role'); if (rl) rl.textContent = auIsSafety() ? 'Safety Admin' : 'Foreman';
  auEl('au-home-back').onclick = function () { setRole(auIsSafety() ? 'safety' : 'foreman'); };
  auRenderHome(); showScreen('audit-home'); try { window.scrollTo(0, 0); } catch (e) {}
}
function auRenderHome() {
  var A = auA(), snap = A.getSnapshot(), safety = auIsSafety(), h = '';
  h += '<section class="inf-sec"><h3>Run an audit</h3>' + (snap.templates.length ? snap.templates.map(function (t) {
    return '<div class="au-tpl"><button type="button" class="ir-type" data-au-run="' + auEsc(t.id) + '"><b>' + auEsc(t.title) + '</b><span>' + t.items.length + ' items' + (t.description ? ' · ' + auEsc(t.description) : '') + '</span></button>'
      + (safety ? '<div class="au-tpl-actions"><button type="button" class="btn-secondary" data-au-edit="' + auEsc(t.id) + '">Edit</button><button type="button" class="btn-secondary" data-au-del="' + auEsc(t.id) + '">Remove</button></div>' : '') + '</div>';
  }).join('') : '<p class="inf-hint">' + (safety ? 'No audit templates yet. Create one below.' : 'No audit templates yet. A Safety Admin needs to create one.') + '</p>') + '</section>';
  if (safety) h += '<section class="inf-sec"><h3>Customize</h3><p class="inf-hint">Build a template for any kind of task: by hand, from a starter, drafted by Petey from a topic, or copied from a checklist PDF.</p><button type="button" class="btn-primary" data-au-new>New template</button></section>';
  h += '<section class="inf-sec"><h3>' + (safety ? 'Recent audits' : 'My recent audits') + '</h3>' + (snap.audits.length ? snap.audits.slice(0, 25).map(function (a) {
    return '<button type="button" class="au-hist" data-au-view="' + auEsc(a.id) + '"><span><b>' + auEsc(a.template_title) + '</b><em>' + auEsc(auWhen(a.created_at)) + (a.location ? ' · ' + auEsc(a.location) : '') + '</em></span>'
      + '<span class="au-hist-r">' + (a.fail_count ? '<i class="au-fail">' + a.fail_count + ' failed</i>' : '<i class="au-ok">No fails</i>') + '<b>' + auPct(a.score == null ? null : Number(a.score)) + '</b></span></button>';
  }).join('') : '<p class="inf-hint">No audits yet.</p>') + (A.isLocal() ? '<p class="inf-hint">Sign-in is not turned on, so audits stay on this device only.</p>' : '') + '</section>';
  var box = auEl('au-home-body'); box.innerHTML = h;
  box.onclick = async function (ev) {
    var t = ev.target.closest('button'); if (!t) return;
    if (t.hasAttribute('data-au-run')) auStartRun(t.getAttribute('data-au-run'));
    else if (t.hasAttribute('data-au-edit')) auOpenEdit(t.getAttribute('data-au-edit'));
    else if (t.hasAttribute('data-au-new')) auOpenEdit(null);
    else if (t.hasAttribute('data-au-view')) auOpenView(t.getAttribute('data-au-view'));
    else if (t.hasAttribute('data-au-del')) { if (!confirm('Remove this template? Past audits keep their results.')) return; var r = await A.archiveTemplate(t.getAttribute('data-au-del')); if (!r.ok) alert(r.message); auRenderHome(); }
  };
}

/* ---------- template editor ---------- */
function auOpenEdit(id) {
  var A = auA(), t = id && A.getSnapshot().templates.filter(function (x) { return x.id === id; })[0];
  auState.edit = t ? { id: t.id, title: t.title, description: t.description || '', items: t.items.map(function (i) { return { text: i.text, section: i.section || '' }; }), note: '' } : { id: null, title: '', description: '', items: [{ text: '', section: '' }], note: '' };
  auRenderEdit(); showScreen('audit-edit'); try { window.scrollTo(0, 0); } catch (e) {}
}
function auReadEdit() {
  var e = auState.edit, box = auEl('au-edit-body'); if (!e || !box) return;
  var ti = box.querySelector('#au-e-title'); if (ti) { e.title = ti.value; e.description = box.querySelector('#au-e-desc').value; }
  e.items = Array.prototype.map.call(box.querySelectorAll('.au-e-item'), function (row) { return { text: row.querySelector('[data-au-t]').value, section: row.querySelector('[data-au-s]').value }; });
}
function auRenderEdit() {
  var e = auState.edit, h = '';
  h += '<section class="inf-sec"><label class="ir-field"><span>Template name</span><input id="au-e-title" value="' + auEsc(e.title) + '" placeholder="For example: Scaffold inspection"></label>'
    + '<label class="ir-field"><span>Short description (optional)</span><input id="au-e-desc" value="' + auEsc(e.description) + '"></label></section>';
  h += '<section class="inf-sec"><h3>Items</h3><p class="inf-hint">One thing to check per line, written so that Pass means it is right.</p><div id="au-e-items">' + e.items.map(function (it, i) {
    return '<div class="au-e-item"><div class="inf-row"><span class="au-num">' + (i + 1) + '</span><input class="inf-what" data-au-t value="' + auEsc(it.text) + '" placeholder="Item" aria-label="Item ' + (i + 1) + '">'
      + '<button type="button" class="inf-x" data-au-up="' + i + '" aria-label="Move up">&uarr;</button><button type="button" class="inf-x" data-au-dn="' + i + '" aria-label="Move down">&darr;</button><button type="button" class="inf-x" data-au-rm="' + i + '" aria-label="Remove">&times;</button></div>'
      + '<input class="inf-note au-sec-in" data-au-s value="' + auEsc(it.section) + '" placeholder="Section (optional)" aria-label="Section"></div>';
  }).join('') + '</div><button type="button" class="btn-secondary inf-add" data-au-add>+ Add item</button></section>';
  h += '<section class="inf-sec"><h3>Get a head start</h3>'
    + '<p class="inf-hint">Starters are general. Check them against your own standards before using them.</p><div class="au-chips">' + AU_STARTERS.map(function (s, i) { return '<button type="button" class="btn-secondary" data-au-starter="' + i + '">' + auEsc(s.title) + '</button>'; }).join('') + '</div>'
    + '<label class="ir-field" style="margin-top:12px;"><span>Have Petey draft items from a topic</span><input id="au-topic" placeholder="For example: confined space entry, forklift pre-use"></label><button type="button" class="btn-secondary" data-au-draft>Draft with Petey</button>'
    + '<p class="inf-hint" style="margin-top:12px;">Or copy the items from a checklist you already have (PDF). Petey copies them as written.</p><input type="file" id="au-file" accept="application/pdf" style="display:none"><button type="button" class="btn-secondary" data-au-import>Choose PDF</button>'
    + '<div id="au-e-status" class="voice-status" role="status" aria-live="polite">' + (e.note ? '' : '') + '</div></section>';
  h += '<div class="ir-submit-row"><button type="button" class="btn-primary" data-au-save>Save template</button><button type="button" class="btn-secondary" onclick="openAuditHome()">Cancel</button></div>';
  var box = auEl('au-edit-body'); box.innerHTML = h;
  if (e.note) auEditStatus(e.note);
  auEl('au-file').onchange = function () { if (this.files && this.files[0]) auImportPdf(this.files[0]); };
  box.onclick = async function (ev) {
    var t = ev.target.closest('button'); if (!t) return; var e2 = auState.edit;
    if (t.hasAttribute('data-au-add')) { auReadEdit(); e2.items.push({ text: '', section: '' }); auRenderEdit(); var ins = auEl('au-e-items').querySelectorAll('[data-au-t]'); ins[ins.length - 1].focus(); return; }
    if (t.hasAttribute('data-au-rm')) { auReadEdit(); e2.items.splice(Number(t.getAttribute('data-au-rm')), 1); if (!e2.items.length) e2.items.push({ text: '', section: '' }); auRenderEdit(); return; }
    if (t.hasAttribute('data-au-up') || t.hasAttribute('data-au-dn')) { auReadEdit(); var up = t.hasAttribute('data-au-up'), i = Number(t.getAttribute(up ? 'data-au-up' : 'data-au-dn')), j = up ? i - 1 : i + 1; if (j >= 0 && j < e2.items.length) { var tmp = e2.items[i]; e2.items[i] = e2.items[j]; e2.items[j] = tmp; auRenderEdit(); } return; }
    if (t.hasAttribute('data-au-starter')) { auReadEdit(); var s = AU_STARTERS[Number(t.getAttribute('data-au-starter'))]; if (e2.items.some(function (x) { return x.text.trim(); }) && !confirm('Replace the items you have typed with this starter?')) return; if (!e2.title.trim()) e2.title = s.title; e2.items = s.items.map(function (x) { return { text: x, section: '' }; }); e2.note = 'Starter loaded. Check every item against your own standards before you save.'; auRenderEdit(); return; }
    if (t.hasAttribute('data-au-draft')) { auReadEdit(); auDraftFromTopic(); return; }
    if (t.hasAttribute('data-au-import')) { auEl('au-file').click(); return; }
    if (t.hasAttribute('data-au-save')) { auReadEdit(); var res = await auA().saveTemplate({ id: e2.id, title: e2.title, description: e2.description, items: e2.items }); if (!res.ok) { auEditStatus(res.message, true); return; } openAuditHome(); }
  };
}
function auEditStatus(text, problem) { var el = auEl('au-e-status'); if (!el) return; el.textContent = text || ''; el.className = 'voice-status' + (text ? ' show' : '') + (problem ? ' problem' : ''); }
function auPetey(system, content, max) {
  return fetch(window.PRETASKIQ_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: max || 1800, system: system, messages: [{ role: 'user', content: content }] }) })
    .then(function (r) { if (!r.ok) throw new Error('Petey could not answer (' + r.status + ').'); return r.json(); })
    .then(function (d) { var raw = (d.content || []).map(function (b) { return b.text || ''; }).join(''); return (typeof extractJson === 'function') ? extractJson(raw) : JSON.parse(raw.replace(/```json|```/g, '').trim()); });
}
async function auDraftFromTopic() {
  var topic = (auEl('au-topic').value || '').trim().slice(0, 120); if (!topic) { auEditStatus('Type a topic first.', true); return; }
  if (auState.busy) return; auState.busy = true; auEditStatus('Petey is drafting…');
  try {
    var j = await auPetey('You write careful, practical construction safety audit checklists. You reply with JSON only.', 'Draft a pass/fail safety audit checklist for this task or topic: "' + topic + '".\n\nRules: 8 to 14 items. Each item is ONE observable thing a person can check by looking, phrased so that Pass means it is right. Plain field language. Do NOT quote regulation numbers, measurements or limits unless you are certain they are correct; if unsure, phrase it generally (for example "as required by the site plan"). Do not invent site-specific facts.\n\nRespond with ONLY: { "title": "short name", "items": [ { "text": "...", "section": "optional short group name or empty" } ] }', 1500);
    var items = (j.items || []).map(function (x) { return { text: String(x.text || ''), section: String(x.section || '') }; }).filter(function (x) { return x.text.trim(); });
    if (!items.length) throw new Error('Petey did not come back with items. Try a clearer topic.');
    var e = auState.edit; if (!e.title.trim()) e.title = String(j.title || topic).slice(0, 100);
    var have = e.items.filter(function (x) { return x.text.trim(); }); e.items = have.concat(items); e.note = 'Petey drafted ' + items.length + ' items. This is a draft: read every item and fix anything that does not match your standards before saving.'; auRenderEdit();
  } catch (err) { auEditStatus((err && err.message) || 'Petey could not draft that. Try again.', true); }
  auState.busy = false;
}
async function auImportPdf(file) {
  if (auState.busy) return; if (file.type !== 'application/pdf') { auEditStatus('Please choose a PDF.', true); return; } if (file.size > 8 * 1024 * 1024) { auEditStatus('That file is over 8 MB.', true); return; }
  auState.busy = true; auEditStatus('Petey is reading the checklist…');
  try {
    var b64 = await rcaFileToBase64(file);
    var r = await fetch(window.PRETASKIQ_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 3000, messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }, { type: 'text', text: 'Copy this inspection or audit checklist into JSON. Use ONLY what the document says. Copy each item\'s wording faithfully (fix line-break spacing only). Never add, merge, reword or invent items. Respond with ONLY: { "title": "document title or topic", "items": [ { "text": "item as written", "section": "heading it appears under, or empty" } ] }' }] }] }) });
    if (!r.ok) throw new Error('The file could not be read (' + r.status + ').');
    var d = await r.json(); var raw = (d.content || []).map(function (b) { return b.text || ''; }).join(''); var j = (typeof extractJson === 'function') ? extractJson(raw) : JSON.parse(raw.replace(/```json|```/g, '').trim());
    var items = (j.items || []).map(function (x) { return { text: String(x.text || ''), section: String(x.section || '') }; }).filter(function (x) { return x.text.trim(); });
    if (!items.length) throw new Error('I could not find checklist items in that file.');
    auReadEdit(); var e = auState.edit; if (!e.title.trim()) e.title = String(j.title || '').slice(0, 100);
    e.items = e.items.filter(function (x) { return x.text.trim(); }).concat(items); e.note = items.length + ' items copied from ' + file.name + '. Check them against your document before saving.'; auRenderEdit();
  } catch (err) { auEditStatus((err && err.message) || 'Petey could not read that file.', true); }
  auState.busy = false;
}

/* ---------- run an audit ---------- */
function auStartRun(id) {
  var t = auA().getSnapshot().templates.filter(function (x) { return x.id === id; })[0]; if (!t) return;
  auState = { tpl: t, answers: {}, edit: null, location: '', busy: false, key: null };
  var title = auEl('au-run-title'); if (title) title.textContent = t.title;
  auRenderRun(); showScreen('audit-run'); try { window.scrollTo(0, 0); } catch (e) {}
}
function auAns(id) { return auState.answers[id] || (auState.answers[id] = { result: '', comment: '', photos: [] }); }
function auRenderRun(missingIds) {
  var t = auState.tpl, A = auA(), h = '', lastSection = null, done = 0;
  var miss = missingIds || {};
  h += '<label class="ir-field"><span>Where (optional)</span><input id="au-loc" value="' + auEsc(auState.location) + '" placeholder="Area or building"></label>';
  t.items.forEach(function (it, i) {
    var a = auAns(it.id); if (a.result) done++;
    if (it.section && it.section !== lastSection) { h += '<h3 class="au-sec-h">' + auEsc(it.section) + '</h3>'; lastSection = it.section; }
    h += '<div class="inf-sec au-item' + (miss[it.id] ? ' au-miss' : '') + '" data-au-item="' + auEsc(it.id) + '"><div class="pr-ctl"><span class="au-num">' + (i + 1) + '</span> ' + auEsc(it.text) + '</div>'
      + '<div class="inf-seg pr-seg" role="radiogroup">' + [['pass', 'Pass'], ['fail', 'Fail'], ['na', 'N/A']].map(function (s) { return '<button type="button" class="inf-seg-btn au-' + s[0] + (a.result === s[0] ? ' on' : '') + '" data-au-r="' + s[0] + '" role="radio" aria-checked="' + (a.result === s[0]) + '">' + s[1] + '</button>'; }).join('') + '</div>'
      + (a.result === 'fail' ? '<label class="ir-field au-cm"><span>What is wrong? (required)</span><textarea rows="2" data-au-c placeholder="Describe what you found">' + auEsc(a.comment) + '</textarea></label>' : '')
      + (a.result ? '<div class="au-photos">' + a.photos.map(function (p, k) { return '<span class="au-thumb"><img src="' + p + '" alt="Photo ' + (k + 1) + '"><button type="button" data-au-rmp="' + k + '" aria-label="Remove photo">&times;</button></span>'; }).join('')
        + (a.photos.length < A.MAX_PHOTOS_PER_ITEM ? '<label class="au-add-photo"><input type="file" accept="image/*" capture="environment" data-au-photo style="display:none">&#128247; Take photo</label><label class="au-add-photo"><input type="file" accept="image/*" multiple data-au-photo style="display:none">&#128193; Upload</label>' : '') + '</div>' : '')
      + '</div>';
  });
  h += '<div id="au-run-missing" class="ir-list ir-unknown" style="display:none;"></div><div id="au-run-status" class="voice-status" role="status" aria-live="polite"></div>'
    + '<div class="ir-submit-row"><button type="button" class="btn-primary" data-au-submit>Submit audit</button></div>'
    + '<div class="ir-submit-note">' + done + ' of ' + t.items.length + ' answered. A failed item needs a comment.' + (A.isLocal() ? ' Sign-in is not turned on, so this stays on this device only.' : '') + '</div>';
  var box = auEl('au-run-body'); box.innerHTML = h;
  var loc = auEl('au-loc'); if (loc) loc.oninput = function () { auState.location = loc.value; };
  box.oninput = function (ev) { var ta = ev.target.closest('[data-au-c]'); if (ta) auAns(ta.closest('[data-au-item]').getAttribute('data-au-item')).comment = ta.value; };
  box.onchange = function (ev) { var inp = ev.target.closest('[data-au-photo]'); if (inp && inp.files && inp.files.length) auAddPhotos(inp.closest('[data-au-item]').getAttribute('data-au-item'), Array.prototype.slice.call(inp.files)); };
  box.onclick = function (ev) {
    var t2 = ev.target.closest('button'); if (!t2) return; var item = t2.closest('[data-au-item]'), y = window.scrollY;
    if (t2.hasAttribute('data-au-r') && item) { auAns(item.getAttribute('data-au-item')).result = t2.getAttribute('data-au-r'); auRenderRun(); try { window.scrollTo(0, y); } catch (e) {} }
    else if (t2.hasAttribute('data-au-rmp') && item) { auAns(item.getAttribute('data-au-item')).photos.splice(Number(t2.getAttribute('data-au-rmp')), 1); auRenderRun(); try { window.scrollTo(0, y); } catch (e) {} }
    else if (t2.hasAttribute('data-au-submit')) auSubmit();
  };
}
function auCompress(file) {
  return new Promise(function (resolve) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
    img.onload = function () {
      try {
        var max = 1024, scale = Math.min(1, max / Math.max(img.width, img.height)), w = Math.round(img.width * scale), h = Math.round(img.height * scale), q = 0.7, out = null;
        for (var tries = 0; tries < 8; tries++) {
          var c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
          out = c.toDataURL('image/jpeg', q);
          if (out.length <= auA().MAX_PHOTO_CHARS) break;
          if (q > 0.45) q -= 0.1; else { w = Math.round(w * 0.8); h = Math.round(h * 0.8); }
          out = null;
        }
        URL.revokeObjectURL(url); resolve(out);
      } catch (e) { URL.revokeObjectURL(url); resolve(null); }
    };
    img.src = url;
  });
}
async function auAddPhotos(itemId, files) {
  var A = auA(), a = auAns(itemId), st = auEl('au-run-status'), bad = 0, y = window.scrollY;
  for (var i = 0; i < files.length && a.photos.length < A.MAX_PHOTOS_PER_ITEM; i++) { if (!/^image\//.test(files[i].type)) { bad++; continue; } var p = await auCompress(files[i]); if (p) a.photos.push(p); else bad++; }
  auRenderRun(); try { window.scrollTo(0, y); } catch (e) {}
  if (bad) { var s2 = auEl('au-run-status'); if (s2) { s2.textContent = bad + ' photo' + (bad === 1 ? '' : 's') + ' could not be added (not a usable picture).'; s2.className = 'voice-status show problem'; } }
}
async function auSubmit() {
  if (auState.busy) return; var A = auA(), t = auState.tpl, btn = document.querySelector('[data-au-submit]');
  var answers = t.items.map(function (it) { var a = auAns(it.id); return { id: it.id, result: a.result, comment: a.comment, photos: a.photos }; });
  var check = A.checkAudit(t, answers), box = auEl('au-run-missing');
  if (!check.ok) {
    var ids = {}; t.items.forEach(function (it, i) { var a = answers[i]; if (!a.result || (a.result === 'fail' && a.comment.trim().length < A.MIN_FAIL_COMMENT)) ids[it.id] = true; });
    auRenderRun(ids); box = auEl('au-run-missing'); box.innerHTML = '<span>Still needed</span><ul>' + check.missing.map(function (m) { return '<li>' + auEsc(m) + '</li>'; }).join('') + '</ul>'; box.style.display = 'block';
    try { var first = document.querySelector('.au-miss'); (first || box).scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} return;
  }
  auState.busy = true; if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
  if (!auState.key) auState.key = 'au-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  var res = await A.submitAudit({ templateId: t.id, location: auState.location, answers: answers, clientKey: auState.key });
  auState.busy = false;
  if (!res.ok) { if (btn) { btn.disabled = false; btn.textContent = 'Submit audit'; } var st = auEl('au-run-status'); st.textContent = 'Not saved: ' + res.message + ' Your answers are still here.'; st.className = 'voice-status show problem'; return; }
  var c = check.counts;
  auEl('au-run-body').innerHTML = '<div class="ir-done"><div class="ir-done-mark" aria-hidden="true">✓</div><h2 class="display">Audit submitted</h2>'
    + '<div class="pr-scores"><div><b>' + auPct(check.score) + '</b><span>Score</span></div><div><b>' + c.pass + '</b><span>Passed</span></div><div><b>' + c.fail + '</b><span>Failed</span></div></div>'
    + (res.local ? '<p>Sign-in is not turned on, so this stays on this device only.</p>' : '')
    + '<div class="ir-submit-row"><button type="button" class="btn-primary" onclick="auOpenView(\'' + auEsc(res.audit.id) + '\')">View results</button><button type="button" class="btn-secondary" onclick="openAuditHome()">Back to audits</button></div></div>';
  try { window.scrollTo(0, 0); } catch (e) {}
}

/* ---------- view one audit ---------- */
async function auOpenView(id) {
  var r = await auA().getAudit(id); if (!r.ok) { alert(r.message); return; }
  var a = r.audit, answers = a.answers || [], failed = answers.filter(function (x) { return x.result === 'fail'; }), rest = answers.filter(function (x) { return x.result !== 'fail'; });
  var card = function (x) { return '<div class="inf-sec au-res-' + x.result + '"><div class="pr-ctl"><span class="au-badge ' + x.result + '">' + (x.result === 'pass' ? 'Pass' : x.result === 'fail' ? 'Fail' : 'N/A') + '</span> ' + auEsc(x.text) + '</div>'
    + (x.comment ? '<p class="au-comment">' + auEsc(x.comment) + '</p>' : '') + ((x.photos || []).length ? '<div class="au-photos">' + x.photos.map(function (p, k) { return '<a class="au-thumb" href="' + p + '" target="_blank" rel="noopener"><img src="' + p + '" alt="Photo ' + (k + 1) + '"></a>'; }).join('') + '</div>' : '') + '</div>'; };
  auEl('au-view-body').innerHTML = '<div class="inf-top"><span class="ir-kind">' + auEsc(a.template_title) + '</span><h2 class="display">' + auPct(a.score == null ? null : Number(a.score)) + ' passed</h2>'
    + '<p class="inf-hint">' + auEsc(auWhen(a.created_at)) + (a.location ? ' · ' + auEsc(a.location) : '') + (a.created_by_name ? ' · ' + auEsc(a.created_by_name) : '') + '</p></div>'
    + '<div class="pr-scores"><div><b>' + a.pass_count + '</b><span>Passed</span></div><div><b>' + a.fail_count + '</b><span>Failed</span></div><div><b>' + a.na_count + '</b><span>N/A</span></div></div>'
    + (failed.length ? '<h3 class="au-sec-h">Failed items</h3>' + failed.map(card).join('') : '<p class="inf-hint">No failed items.</p>')
    + (rest.length ? '<h3 class="au-sec-h">Other items</h3>' + rest.map(card).join('') : '');
  showScreen('audit-view'); try { window.scrollTo(0, 0); } catch (e) {}
}
