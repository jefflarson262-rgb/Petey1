/* ===== Jobs ===================================================================================================
   A folder per job. Construction and safety administrators add scope documents, RFIs, drawing revisions, permits and 811 tickets (the original
   file is kept); everyone in the company can read them. A permit or 811 ticket needs the expiry date typed from the document: it is never guessed.
   Petey can read an uploaded file and draft its title, number and summary; the administrator checks them before saving. */
var jbState = { id: null, job: null, docs: [], canEdit: false, form: null, file: null, busy: false, note: '' };
function jbEl(id) { return document.getElementById(id); }
function jbEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function jbJ() { return window.PreTaskIQJobs; }
function jbDate(d) { try { return new Date(d + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return d; } }
function jbSize(n) { return n >= 1048576 ? (Math.round(n / 104857.6) / 10) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
function jbBack() { var r = (typeof currentRole !== 'undefined') ? currentRole : 'foreman'; if (typeof setRole === 'function') setRole(r === 'safety' || r === 'construction' ? r : 'foreman'); }
function jbExpiryBadge(d) {
  if (d.expiry === 'expired') return '<span class="cadmin-badge revised">Expired ' + jbEsc(jbDate(d.expiresOn)) + '</span>';
  if (d.expiry === 'soon') return '<span class="cadmin-badge open">Expires ' + jbEsc(jbDate(d.expiresOn)) + '</span>';
  if (d.expiresOn) return '<span class="cadmin-badge closed">Good until ' + jbEsc(jbDate(d.expiresOn)) + '</span>';
  return '';
}

/* ---------- the list of jobs ---------- */
async function openJobs() {
  var J = jbJ(); if (!J) return;
  jbEl('jb-back').onclick = jbBack;
  showScreen('jobs'); try { window.scrollTo(0, 0); } catch (e) {}
  if (!J.enabled()) { jbEl('jb-body').innerHTML = '<section class="inf-sec"><p class="inf-hint">Job folders need sign-in, so their documents can be kept safely for your company. Sign-in is not turned on yet.</p></section>'; return; }
  jbEl('jb-body').innerHTML = '<p class="inf-hint">Loading the jobs…</p>';
  await J.refresh(); jbRenderJobs();
}
function jbRenderJobs() {
  var s = jbJ().getSnapshot(), h = '';
  if (s.error) h += '<p class="inf-hint" role="alert">' + jbEsc(s.error) + '</p>';
  if (s.canEdit) h += '<section class="inf-sec"><h3>New job</h3><div class="jb-new"><input id="jb-n-name" placeholder="Job name, for example Tower 2" aria-label="Job name"><input id="jb-n-num" placeholder="Job number (optional)" aria-label="Job number"><input id="jb-n-loc" placeholder="Location (optional)" aria-label="Location"><button type="button" class="btn-primary" data-jb-create>Create job</button></div><div id="jb-n-status" class="voice-status" role="status" aria-live="polite"></div></section>';
  h += '<section class="inf-sec"><h3>Jobs</h3>' + (s.jobs.length ? s.jobs.map(function (j) {
    var bits = [], c = j.counts || {};
    if (j.jobNumber) bits.push('No. ' + jbEsc(j.jobNumber)); if (j.location) bits.push(jbEsc(j.location));
    var counts = ['scope', 'rfi', 'revision', 'permit', 'ticket811'].map(function (k) { return c[k] ? c[k] + ' ' + jbJ().categories()[k].label.toLowerCase() : ''; }).filter(Boolean).join(' · ');
    var flags = (j.expired ? '<span class="cadmin-badge revised">' + j.expired + ' expired</span> ' : '') + (j.soon ? '<span class="cadmin-badge open">' + j.soon + ' expiring soon</span> ' : '') + (j.openRfis ? '<span class="cadmin-badge pending">' + j.openRfis + ' open RFI' + (j.openRfis > 1 ? 's' : '') + '</span> ' : '') + (j.status === 'closed' ? '<span class="cadmin-badge closed">Closed</span>' : '');
    return '<button type="button" class="ir-type jb-job" data-jb-open="' + jbEsc(j.id) + '"><b>' + jbEsc(j.name) + '</b><span>' + (bits.join(' · ') || '&nbsp;') + '</span><span>' + (counts || 'No documents yet') + '</span>' + (flags ? '<span class="jb-flags">' + flags + '</span>' : '') + '</button>';
  }).join('') : '<p class="inf-hint">' + (s.canEdit ? 'No jobs yet. Create the first one above.' : 'No jobs have been set up yet. A Construction Admin sets them up.') + '</p>') + '</section>';
  var box = jbEl('jb-body'); box.innerHTML = h;
  box.onclick = async function (ev) {
    var t = ev.target.closest('button'); if (!t) return;
    if (t.hasAttribute('data-jb-open')) openJob(t.getAttribute('data-jb-open'));
    else if (t.hasAttribute('data-jb-create')) {
      var st = jbEl('jb-n-status'), name = jbEl('jb-n-name').value.trim(); if (!name) { st.textContent = 'Enter a job name.'; return; }
      t.disabled = true; st.textContent = 'Creating…';
      var r = await jbJ().createJob({ name: name, jobNumber: jbEl('jb-n-num').value, location: jbEl('jb-n-loc').value });
      if (!r.ok) { t.disabled = false; st.textContent = r.message; return; }
      openJob(r.job.id);
    }
  };
}

/* ---------- one job folder ---------- */
async function openJob(id) {
  var J = jbJ(); if (!J) return;
  jbState = { id: id, job: null, docs: [], canEdit: false, form: null, file: null, busy: false, note: '' };
  showScreen('job'); try { window.scrollTo(0, 0); } catch (e) {}
  jbEl('jb-job-body').innerHTML = '<p class="inf-hint">Opening the job…</p>';
  await jbReload();
}
async function jbReload() {
  var r = await jbJ().getJob(jbState.id);
  if (!r.ok) { jbEl('jb-job-body').innerHTML = '<p class="inf-hint" role="alert">' + jbEsc(r.message) + '</p>'; return; }
  jbState.job = r.job; jbState.docs = r.documents; jbState.canEdit = r.canEdit; jbRenderJob();
}
function jbRenderJob() {
  var st = jbState, J = jbJ(), job = st.job, cats = J.categories(), h = '';
  jbEl('jb-job-name').textContent = job.name;
  jbEl('jb-job-meta').textContent = [job.jobNumber ? 'Job no. ' + job.jobNumber : '', job.location, job.status === 'closed' ? 'Closed' : ''].filter(Boolean).join(' · ');
  var bad = st.docs.filter(function (d) { return d.expiry === 'expired'; }), soon = st.docs.filter(function (d) { return d.expiry === 'soon'; });
  if (bad.length) h += '<div class="cadmin-alert jb-alert"><div><div class="cadmin-alert-title">Expired: ' + bad.map(function (d) { return jbEsc(d.title); }).join(', ') + '</div><div class="cadmin-alert-sub">Check these before work that depends on them. Petey will mention them when a plan is made for this job.</div></div></div>';
  if (soon.length) h += '<div class="cadmin-alert jb-alert jb-soon"><div><div class="cadmin-alert-title">Expiring soon: ' + soon.map(function (d) { return jbEsc(d.title) + ' (' + jbEsc(jbDate(d.expiresOn)) + ')'; }).join(', ') + '</div></div></div>';
  J.categoryKeys().forEach(function (key) {
    var docs = st.docs.filter(function (d) { return d.category === key; }), c = cats[key];
    h += '<section class="inf-sec"><div class="jb-sec-head"><h3>' + c.label + '</h3>' + (st.canEdit && !(st.form && st.form.category === key && !st.form.id) ? '<button type="button" class="btn-secondary" data-jb-add="' + key + '">+ Add</button>' : '') + '</div>';
    if (st.form && st.form.category === key && !st.form.id) h += jbFormHtml();
    h += docs.length ? docs.map(function (d) {
      if (st.form && st.form.id === d.id) return jbFormHtml();
      var meta = [d.docNumber ? 'No. ' + d.docNumber : '', d.revision ? 'Rev ' + d.revision : '', d.issuedOn ? 'Issued ' + jbDate(d.issuedOn) : ''].filter(Boolean).map(jbEsc).join(' · ');
      return '<div class="jb-doc"><div class="jb-doc-main"><b>' + jbEsc(d.title) + '</b>' + (meta ? '<em>' + meta + '</em>' : '') + (d.summary ? '<p>' + jbEsc(d.summary.length > 260 ? d.summary.slice(0, 260) + '…' : d.summary) + '</p>' : '') + '</div>'
        + '<div class="jb-doc-side">' + (d.status !== 'current' && d.status !== 'active' ? '<span class="cadmin-badge ' + (d.status === 'open' ? 'open' : d.status === 'superseded' ? 'pending' : 'closed') + '">' + jbEsc(d.status.charAt(0).toUpperCase() + d.status.slice(1)) + '</span>' : '') + jbExpiryBadge(d)
        + (d.file ? '<button type="button" class="btn-secondary" data-jb-file="' + jbEsc(d.id) + '">Open original</button>' : '')
        + (st.canEdit ? '<button type="button" class="btn-secondary" data-jb-edit="' + jbEsc(d.id) + '">Edit</button><button type="button" class="btn-secondary" data-jb-del="' + jbEsc(d.id) + '">Remove</button>' : '') + '</div></div>';
    }).join('') : (st.form && st.form.category === key && !st.form.id ? '' : '<p class="inf-hint">' + (st.canEdit ? 'None yet.' : 'Nothing here yet.') + '</p>');
    h += '</section>';
  });
  if (st.canEdit) h += '<section class="inf-sec"><h3>This job</h3><div class="jb-sec-head"><button type="button" class="btn-secondary" data-jb-closejob>' + (job.status === 'closed' ? 'Reopen the job' : 'Mark the job closed') + '</button><button type="button" class="btn-secondary" data-jb-deljob>Remove the job</button></div><div id="jb-job-status" class="voice-status" role="status" aria-live="polite"></div></section>';
  var box = jbEl('jb-job-body'); box.innerHTML = h;
  box.onclick = jbClick;
  var fi = jbEl('jb-f-file'); if (fi) fi.onchange = function () { jbPickFile(this.files && this.files[0]); };
}
function jbFormHtml() {
  var f = jbState.form, c = jbJ().categories()[f.category], h = '';
  h += '<div class="jb-form"><h4>' + (f.id ? 'Edit ' : 'Add ') + c.one.toLowerCase() + '</h4>';
  if (!f.id) h += '<label class="ir-field"><span>The file (PDF, PNG or JPG, up to ' + Math.round(jbJ().maxFileBytes() / 1048576) + ' MB)</span><input type="file" id="jb-f-file" accept="application/pdf,image/png,image/jpeg"></label>'
    + '<button type="button" class="btn-secondary" data-jb-read ' + (jbState.file ? '' : 'disabled') + '>Have Petey read the file</button><span class="inf-hint"> Petey drafts the title, number and summary. You check them.</span>';
  h += '<label class="ir-field"><span>Title</span><input id="jb-f-title" value="' + jbEsc(f.title) + '"></label>';
  h += '<div class="jb-two"><label class="ir-field"><span>' + (f.category === 'rfi' ? 'RFI number' : f.category === 'revision' ? 'Drawing or sheet number' : f.category === 'permit' ? 'Permit number' : f.category === 'ticket811' ? 'Ticket number' : 'Number (optional)') + '</span><input id="jb-f-num" value="' + jbEsc(f.docNumber) + '"></label>'
    + (f.category === 'revision' ? '<label class="ir-field"><span>Revision</span><input id="jb-f-rev" value="' + jbEsc(f.revision) + '"></label>' : '') + '</div>';
  h += '<div class="jb-two"><label class="ir-field"><span>Date issued (optional)</span><input type="date" id="jb-f-issued" value="' + jbEsc(f.issuedOn) + '"></label>'
    + (c.hasExpiry ? '<label class="ir-field"><span>Expires on (copy it from the document)</span><input type="date" id="jb-f-exp" value="' + jbEsc(f.expiresOn) + '"></label>' : '') + '</div>';
  h += '<label class="ir-field"><span>Status</span><select id="jb-f-status">' + c.statuses.map(function (s) { return '<option value="' + s + '"' + (s === f.status ? ' selected' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>'; }).join('') + '</select></label>';
  h += '<label class="ir-field"><span>Summary (what Petey will know about it)</span><textarea id="jb-f-sum" rows="4">' + jbEsc(f.summary) + '</textarea></label>';
  h += '<label class="ir-field"><span>Work it affects (optional)</span><input id="jb-f-aff" value="' + jbEsc(f.affected) + '"></label>';
  h += '<div class="ir-submit-row"><button type="button" class="btn-primary" data-jb-save>' + (f.id ? 'Save changes' : 'Add to the job') + '</button><button type="button" class="btn-secondary" data-jb-cancel>Cancel</button></div>';
  h += '<div id="jb-f-status-msg" class="voice-status" role="status" aria-live="polite">' + jbEsc(jbState.note) + '</div></div>';
  return h;
}
function jbReadForm() {
  var f = jbState.form; if (!f || !jbEl('jb-f-title')) return;
  f.title = jbEl('jb-f-title').value; f.docNumber = jbEl('jb-f-num').value; if (jbEl('jb-f-rev')) f.revision = jbEl('jb-f-rev').value;
  f.issuedOn = jbEl('jb-f-issued').value; if (jbEl('jb-f-exp')) f.expiresOn = jbEl('jb-f-exp').value;
  f.status = jbEl('jb-f-status').value; f.summary = jbEl('jb-f-sum').value; f.affected = jbEl('jb-f-aff').value;
}
function jbNote(msg) { jbState.note = msg || ''; var n = jbEl('jb-f-status-msg'); if (n) n.textContent = jbState.note; }
function jbPickFile(file) {
  var bad = file ? jbJ().checkFile(file) : '';
  jbState.file = bad ? null : (file || null); jbNote(bad);
  var b = document.querySelector('[data-jb-read]'); if (b) b.disabled = !jbState.file;
  if (bad && jbEl('jb-f-file')) jbEl('jb-f-file').value = '';
}
async function jbClick(ev) {
  var t = ev.target.closest('button'); if (!t || t.disabled) return; var st = jbState, J = jbJ();
  if (t.hasAttribute('data-jb-add')) { st.file = null; st.note = ''; var key = t.getAttribute('data-jb-add'); st.form = { id: null, category: key, title: '', docNumber: '', revision: '', issuedOn: '', expiresOn: '', status: J.categories()[key].statuses[0], summary: '', affected: '', details: {} }; jbRenderJob(); return; }
  if (t.hasAttribute('data-jb-edit')) { var d = st.docs.filter(function (x) { return x.id === t.getAttribute('data-jb-edit'); })[0]; if (!d) return; st.file = null; st.note = ''; st.form = { id: d.id, category: d.category, title: d.title, docNumber: d.docNumber, revision: d.revision, issuedOn: d.issuedOn || '', expiresOn: d.expiresOn || '', status: d.status, summary: d.summary, affected: (d.details && d.details.affected_work) || '', details: d.details || {} }; jbRenderJob(); return; }
  if (t.hasAttribute('data-jb-cancel')) { st.form = null; st.file = null; st.note = ''; jbRenderJob(); return; }
  if (t.hasAttribute('data-jb-read')) { jbReadForm(); await jbPetey(t); return; }
  if (t.hasAttribute('data-jb-save')) { jbReadForm(); await jbSave(t); return; }
  if (t.hasAttribute('data-jb-file')) {
    var w = window.open('', '_blank'); t.disabled = true; var r = await J.fileLink(st.id, t.getAttribute('data-jb-file')); t.disabled = false;
    if (r.ok && w) { w.location = r.url; } else { if (w) w.close(); if (r.ok) window.location.href = r.url; else alert(r.message); }
    return;
  }
  if (t.hasAttribute('data-jb-del')) { if (!confirm('Remove this document from the job? The file is kept on record but no longer shown.')) return; var rr = await J.archiveDocument(t.getAttribute('data-jb-del')); if (!rr.ok) { alert(rr.message); return; } await jbReload(); return; }
  var sm = jbEl('jb-job-status');
  if (t.hasAttribute('data-jb-closejob')) { var r2 = await J.updateJob(st.id, { status: st.job.status === 'closed' ? 'active' : 'closed' }); if (!r2.ok) { if (sm) sm.textContent = r2.message; return; } await jbReload(); return; }
  if (t.hasAttribute('data-jb-deljob')) { if (!confirm('Remove this job and its documents from the list? They stay on record but are no longer shown.')) return; var r3 = await J.archiveJob(st.id); if (!r3.ok) { if (sm) sm.textContent = r3.message; return; } openJobs(); return; }
}
async function jbSave(btn) {
  var st = jbState, f = st.form, J = jbJ(); if (!f) return;
  if (!f.title.trim()) { jbNote('Enter a title.'); return; }
  if (J.categories()[f.category].hasExpiry && !f.expiresOn) { jbNote('Enter the expiry date shown on the document. It is not guessed.'); return; }
  btn.disabled = true; jbNote('Saving…');
  var body = { title: f.title, docNumber: f.docNumber, issuedOn: f.issuedOn || null, status: f.status, summary: f.summary, details: Object.assign({}, f.details, { affected_work: f.affected }) };
  if (f.category === 'revision') body.revision = f.revision;
  if (J.categories()[f.category].hasExpiry) body.expiresOn = f.expiresOn;
  var r;
  if (f.id) r = await J.updateDocument(f.id, body);
  else {
    var file = null;
    if (st.file) { jbNote('Uploading the file…'); var up = await J.uploadFile(st.id, st.file); if (!up.ok) { btn.disabled = false; jbNote(up.message); return; } file = up.file; }
    r = await J.addDocument(st.id, Object.assign({ category: f.category }, body, file ? { file: file } : {}));
  }
  if (!r.ok) { btn.disabled = false; jbNote(r.message); return; }
  st.form = null; st.file = null; st.note = ''; await jbReload();
}
// Petey reads the chosen file and drafts the title, number, revision and summary. Dates are never taken from it: the administrator types them.
function jbToBase64(file) { return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(',')[1] || ''); }; fr.onerror = function () { rej(fr.error); }; fr.readAsDataURL(file); }); }
async function jbPetey(btn) {
  var st = jbState, f = st.form, file = st.file; if (!file) return;
  if (file.size > 2500000) { jbNote('That file is too big for Petey to read here. Type the title and summary yourself; the original is still kept.'); return; }
  btn.disabled = true; jbNote('Petey is reading the file…');
  try {
    var data = await jbToBase64(file), c = jbJ().categories()[f.category];
    var block = file.type === 'application/pdf' ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data } } : { type: 'image', source: { type: 'base64', media_type: file.type, data: data } };
    var prompt = 'This file is a ' + c.one.toLowerCase() + ' for a construction job. Read it and respond with ONLY a JSON object (no markdown, no backticks):\n{"title":"short title (max 120 chars)","number":"its RFI, sheet, permit or ticket number if printed on it, else empty string","revision":"revision letter or number if printed, else empty string","summary":"3 to 6 plain sentences a foreman needs: what it says, what it changes or requires, and any limits or conditions. Only what the document states.","affected_work":"the trade, area or work it affects, as stated, else empty string"}\nDo not guess. If something is not on the document, leave it empty.';
    var response = await fetch(window.PRETASKIQ_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ max_tokens: 1200, messages: [{ role: 'user', content: [block, { type: 'text', text: prompt }] }] }) });
    var out = await response.json();
    var text = (out.content || []).map(function (b) { return b.text || ''; }).join('');
    var p = JSON.parse(text.replace(/```json|```/g, '').trim());
    if (p.title && !f.title.trim()) f.title = String(p.title).slice(0, 200);
    if (p.number && !f.docNumber.trim()) f.docNumber = String(p.number).slice(0, 80);
    if (p.revision && !f.revision.trim()) f.revision = String(p.revision).slice(0, 40);
    if (p.summary && !f.summary.trim()) f.summary = String(p.summary).slice(0, 4000);
    if (p.affected_work && !f.affected.trim()) f.affected = String(p.affected_work).slice(0, 400);
    st.note = 'Petey drafted the details. Check them against the document' + (jbJ().categories()[f.category].hasExpiry ? ', and type the expiry date yourself' : '') + '.';
    var keep = st.file; jbRenderJob(); st.file = keep;
    var b = document.querySelector('[data-jb-read]'); if (b) b.disabled = false;
  } catch (e) { btn.disabled = false; jbNote('Petey could not read that file. Type the details yourself; the original is still kept.'); }
}
