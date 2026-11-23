/* ===== Full incident report (Safety Admin) ==================================================================
   The in-depth report that follows a preliminary report. It collects what the root cause analysis needs: a timeline, an evidence checklist,
   witnesses to interview, contributing-factor leads, interim controls and who to notify. Completing it creates the Knowledge Base incident
   and can hand everything to the RCA assistant. The completeness rules are the same ones the server enforces (src/shared/incidentFull.js).
   Nothing here decides whether something is recordable or reportable, or what the cause was. */
var infState = { id: null, report: null, full: null, kbEntry: null, busy: false };
var INF_EVIDENCE_STATES = [['pending', 'Not yet'], ['collected', 'Collected'], ['not_available', 'Not available']];
var INF_NOTIFY_STATES = [['pending', 'Choose'], ['done', 'Done'], ['to_do', 'To do'], ['not_needed', 'Not needed']];

function infEl(id) { return document.getElementById(id); }
function infEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function infKindLabel(k) { var K = window.PreTaskIQIncidents && PreTaskIQIncidents.KINDS; return (K && K[k]) || 'Incident'; }

async function openIncidentFull(id) {
  var I = window.PreTaskIQIncidents; if (!I) return;
  await I.refresh();
  var r = I.getSnapshot().reports.filter(function (x) { return x.id === id; })[0];
  if (!r) { alert('That report could not be found. Go back to the dashboard and try again.'); return; }
  infState = { id: id, report: r, full: I.validateFull(r.full_report || {}).full, kbEntry: null, busy: false };
  infRender(); showScreen('incident-full');
  try { window.scrollTo(0, 0); } catch (e) {}
}

function infSection(title, hint, body) {
  return '<section class="inf-sec"><h3>' + infEsc(title) + '</h3>' + (hint ? '<p class="inf-hint">' + infEsc(hint) + '</p>' : '') + body + '</section>';
}
function infSeg(name, states, value) {
  return '<div class="inf-seg" role="radiogroup">' + states.map(function (s) {
    return '<button type="button" class="inf-seg-btn' + (s[0] === value ? ' on' : '') + '" data-seg="' + name + '" data-v="' + s[0] + '" role="radio" aria-checked="' + (s[0] === value) + '">' + s[1] + '</button>';
  }).join('') + '</div>';
}

function infRender() {
  var r = infState.report, f = infState.full, I = window.PreTaskIQIncidents, d = r.data || {};
  var done = r.status === 'complete', dis = done ? '' : '';
  var h = '';
  var overdue = I.isOverdue(r);
  h += '<div class="inf-top"><span class="ir-kind">' + infEsc(infKindLabel(r.kind)) + '</span>'
    + (done ? '<span class="inf-badge ok">Complete</span>' : '<span class="inf-badge' + (overdue ? ' late' : '') + '">' + (overdue ? 'Overdue' : 'Due ' + infEsc(new Date(r.due_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))) + '</span>')
    + '<h2 class="display">' + infEsc(r.title) + '</h2></div>';
  h += '<section class="inf-sec inf-prelim"><h3>Preliminary report</h3>'
    + '<p>' + infEsc(d.narrative || '') + '</p>'
    + '<div class="inf-facts">' + [['When', d.when], ['Where', d.location], ['Work', d.work], ['Injury', d.injury], ['Damage', d.damage], ['Reported by', r.reported_by_name || (r.reporter_role ? 'a ' + r.reporter_role : '')]]
      .filter(function (x) { return x[1]; }).map(function (x) { return '<div><b>' + x[0] + '</b> ' + infEsc(x[1]) + '</div>'; }).join('') + '</div>'
    + [['People involved', d.people], ['Done right after', d.actions], ['Conditions', d.conditions], ['Not established', d.unknowns]].filter(function (x) { return x[1] && x[1].length; })
      .map(function (x) { return '<div class="ir-list"><span>' + x[0] + '</span><ul>' + x[1].map(function (t) { return '<li>' + infEsc(t) + '</li>'; }).join('') + '</ul></div>'; }).join('')
    + '</section>';

  // 1. Timeline
  h += infSection('1. Timeline', 'Events in order, from the lead-up to the response. Facts only.',
    '<div id="inf-timeline">' + (f.timeline.length ? f.timeline : [{ when: '', what: '' }]).map(function (t, i) {
      return '<div class="inf-row"><input class="inf-when" data-tl="when" value="' + infEsc(t.when) + '" placeholder="Time" aria-label="Time">'
        + '<input class="inf-what" data-tl="what" value="' + infEsc(t.what) + '" placeholder="What happened" aria-label="What happened">'
        + '<button type="button" class="inf-x" data-del="tl" data-i="' + i + '" aria-label="Remove event">&times;</button></div>';
    }).join('') + '</div><button type="button" class="btn-secondary inf-add" data-add="tl">+ Add event</button>');

  // 2. Evidence
  h += infSection('2. Evidence checklist', 'Mark each item Collected or Not available. Preserve it before the scene or records change.',
    f.evidence.map(function (e) {
      return '<div class="inf-item" data-ev="' + e.id + '"><div class="inf-item-top"><span>' + infEsc(e.label) + '</span>' + infSeg('ev:' + e.id, INF_EVIDENCE_STATES, e.status) + '</div>'
        + '<input class="inf-note" data-evnote="' + e.id + '" value="' + infEsc(e.note) + '" placeholder="Where it is kept, or why not available (optional)"></div>';
    }).join(''));

  // 3. Witnesses
  h += infSection('3. Witnesses to interview', 'Use roles, not names (for example "the spotter"). Names stay in the formal statement.',
    '<div id="inf-witnesses">' + f.witnesses.map(function (w, i) {
      return '<div class="inf-row"><input class="inf-when" data-w="role" value="' + infEsc(w.role) + '" placeholder="Role" aria-label="Role">'
        + '<select data-w="status" aria-label="Status"><option value="to_interview"' + (w.status === 'to_interview' ? ' selected' : '') + '>To interview</option><option value="interviewed"' + (w.status === 'interviewed' ? ' selected' : '') + '>Interviewed</option></select>'
        + '<input class="inf-what" data-w="note" value="' + infEsc(w.note) + '" placeholder="Note (optional)" aria-label="Note">'
        + '<button type="button" class="inf-x" data-del="w" data-i="' + i + '" aria-label="Remove witness">&times;</button></div>';
    }).join('') + '</div><button type="button" class="btn-secondary inf-add" data-add="w">+ Add witness</button>'
    + '<label class="inf-check"><input type="checkbox" id="inf-no-witness"' + (f.witnessesNone ? ' checked' : '') + '> There were no witnesses</label>');

  // 4. Contributing factors
  h += infSection('4. Contributing factors', 'Leads for the RCA to test, not conclusions. Write what was observed, not who is to blame.',
    window.PreTaskIQIncidents.FACTOR_CATEGORIES.map(function (c) {
      return '<label class="ir-field"><span>' + infEsc(c.label) + '</span><textarea rows="2" data-factor="' + c.id + '" placeholder="' + infEsc(c.hint) + '">' + infEsc(f.factors[c.id]) + '</textarea></label>';
    }).join('') + '<label class="inf-check"><input type="checkbox" id="inf-no-factors"' + (f.factorsNone ? ' checked' : '') + '> No leads are known yet</label>');

  // 5. Interim controls and notifications
  h += infSection('5. Interim controls and who to notify', 'What is in place right now to keep others safe until the RCA is finished.',
    '<div id="inf-interim">' + (f.interim.length ? f.interim : ['']).map(function (x, i) {
      return '<div class="inf-row"><input class="inf-what" data-im value="' + infEsc(x) + '" placeholder="For example: ladder tagged out, area barricaded" aria-label="Interim control"><button type="button" class="inf-x" data-del="im" data-i="' + i + '" aria-label="Remove">&times;</button></div>';
    }).join('') + '</div><button type="button" class="btn-secondary inf-add" data-add="im">+ Add control</button>'
    + '<label class="ir-field" style="margin-top:10px;"><span>If none were needed, say why</span><input id="inf-interim-none" value="' + infEsc(f.interimNone) + '"></label>'
    + '<div class="inf-item"><div class="inf-item-top"><span>Was the area secured?</span>' + infSeg('secured', [['yes', 'Yes'], ['no', 'No'], ['na', 'Not applicable']], f.areaSecured) + '</div></div>'
    + '<p class="inf-hint" style="margin-top:12px;">Notification reminders only. Your safety professional decides what is required and by when.</p>'
    + f.notify.map(function (n) {
      return '<div class="inf-item"><div class="inf-item-top"><span>' + infEsc(n.label) + '</span>' + infSeg('nt:' + n.id, INF_NOTIFY_STATES, n.status) + '</div></div>';
    }).join(''));

  h += infSection('Anything else', '', '<label class="ir-field"><textarea id="inf-notes" rows="3" placeholder="Notes for the investigation (optional)">' + infEsc(f.notes) + '</textarea></label>');

  h += '<div id="inf-missing" class="ir-list ir-unknown" style="display:none;"></div><div id="inf-status" class="voice-status" role="status" aria-live="polite"></div>'
    + '<div class="ir-submit-row">'
    + '<button type="button" class="btn-secondary" id="inf-save">Save progress</button>'
    + '<button type="button" class="btn-primary" id="inf-complete">' + (done ? 'Save changes' : 'Complete full report') + '</button>'
    + (done ? '<button type="button" class="btn-primary" id="inf-rca">Start the RCA with this report</button>' : '') + '</div>'
    + '<div class="ir-submit-note">' + (done ? 'This report is complete and saved to the Knowledge Base as an incident.' : 'Completing the report saves it to the Knowledge Base as an incident and closes the open item on your dashboard.') + '</div>';
  infEl('inf-body').innerHTML = h;
  infWire();
}

// Read everything on the screen back into infState.full
function infRead() {
  var f = infState.full, q = function (sel) { return Array.prototype.slice.call(infEl('inf-body').querySelectorAll(sel)); };
  f.timeline = q('#inf-timeline .inf-row').map(function (row) { return { when: row.querySelector('[data-tl=when]').value, what: row.querySelector('[data-tl=what]').value }; }).filter(function (t) { return t.what.trim(); });
  f.evidence.forEach(function (e) { var n = infEl('inf-body').querySelector('[data-evnote="' + e.id + '"]'); if (n) e.note = n.value; });
  f.witnesses = q('#inf-witnesses .inf-row').map(function (row) { return { role: row.querySelector('[data-w=role]').value, status: row.querySelector('[data-w=status]').value, note: row.querySelector('[data-w=note]').value }; }).filter(function (w) { return w.role.trim(); });
  f.witnessesNone = infEl('inf-no-witness').checked;
  q('[data-factor]').forEach(function (t) { f.factors[t.getAttribute('data-factor')] = t.value; });
  f.factorsNone = infEl('inf-no-factors').checked;
  f.interim = q('#inf-interim [data-im]').map(function (i) { return i.value; }).filter(function (x) { return x.trim(); });
  f.interimNone = infEl('inf-interim-none').value;
  f.notes = infEl('inf-notes').value;
  return f;
}

function infSetStatus(text, cls) { var el = infEl('inf-status'); if (!el) return; el.textContent = text || ''; el.className = 'voice-status' + (text ? ' show' : '') + (cls ? ' ' + cls : ''); }
function infShowMissing(list) {
  var m = infEl('inf-missing'); if (!m) return;
  if (!list || !list.length) { m.style.display = 'none'; m.innerHTML = ''; return; }
  m.innerHTML = '<span>Still needed before it can be completed</span><ul>' + list.map(function (x) { return '<li>' + infEsc(x) + '</li>'; }).join('') + '</ul>';
  m.style.display = 'block'; try { m.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
}

function infWire() {
  var body = infEl('inf-body');
  body.onclick = function (ev) {
    var t = ev.target.closest('button'); if (!t) return;
    var f = infState.full;
    if (t.hasAttribute('data-seg')) {
      infRead(); var key = t.getAttribute('data-seg'), v = t.getAttribute('data-v');
      if (key === 'secured') f.areaSecured = v;
      else { var p = key.split(':'), list = p[0] === 'ev' ? f.evidence : f.notify; list.forEach(function (x) { if (x.id === p[1]) x.status = v; }); }
      infRender(); return;
    }
    if (t.hasAttribute('data-add')) { infRead(); var a = t.getAttribute('data-add'); if (a === 'tl') f.timeline.push({ when: '', what: ' ' }); else if (a === 'w') f.witnesses.push({ role: ' ', status: 'to_interview', note: '' }); else f.interim.push(' '); infRender(); infFocusLast(a); return; }
    if (t.hasAttribute('data-del')) { infRead(); var k = t.getAttribute('data-del'), i = Number(t.getAttribute('data-i')); (k === 'tl' ? f.timeline : k === 'w' ? f.witnesses : f.interim).splice(i, 1); infRender(); return; }
    if (t.id === 'inf-save') infSave(false);
    else if (t.id === 'inf-complete') infSave(true);
    else if (t.id === 'inf-rca') infStartRca();
  };
}
function infFocusLast(kind) {
  var sel = kind === 'tl' ? '#inf-timeline .inf-row:last-child .inf-what' : kind === 'w' ? '#inf-witnesses .inf-row:last-child .inf-when' : '#inf-interim .inf-row:last-child .inf-what';
  var el = infEl('inf-body').querySelector(sel); if (el) { el.value = ''; try { el.focus(); } catch (e) {} }
}

async function infSave(complete) {
  if (infState.busy) return; var I = window.PreTaskIQIncidents;
  var full = infRead(), v = I.validateFull(full);
  if (complete && !v.ok) { infShowMissing(v.missing); infSetStatus('Not complete yet. See what is still needed below.', 'problem'); return; }
  infShowMissing([]); infState.busy = true; infSetStatus(complete ? 'Completing…' : 'Saving…');
  var kbId;
  if (complete) {
    if (!infState.kbEntry) { infState.kbEntry = infBuildEntry(infState.report, v.full); if (typeof projectKnowledgeBase !== 'undefined') projectKnowledgeBase.push(infState.kbEntry); }
    else Object.assign(infState.kbEntry, infBuildEntry(infState.report, v.full), { id: infState.kbEntry.id, dbId: infState.kbEntry.dbId });
    try { if (window.PreTaskIQKb) await window.PreTaskIQKb.save(infState.kbEntry); } catch (e) {}
    if (typeof renderKbEntries === 'function') renderKbEntries();
    kbId = infState.kbEntry.dbId;
  }
  var res = await I.saveFull(infState.id, complete ? 'complete' : 'save_full', full, kbId);
  infState.busy = false;
  if (!res.ok) { infSetStatus('Not saved: ' + (res.message || 'connection problem') + ' Your entries are still on this screen. Try again.', 'problem'); if (res.missing && res.missing.length) infShowMissing(res.missing); return; }
  infState.report = res.report; infState.full = I.validateFull(res.report.full_report || {}).full;
  if (complete) {
    var kb = infState.kbEntry && infState.kbEntry.saveState;
    infRender();
    infSetStatus('Full report complete.' + (kb === 'failed' ? ' It could not be saved to the company Knowledge Base, so it is kept on this device only. Keep this page open and tell your team.' : ''), kb === 'failed' ? 'problem' : '');
    try { window.scrollTo(0, 0); } catch (e) {}
  } else infSetStatus('Saved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '.');
}

function infBuildEntry(r, f) {
  var d = r.data || {}, kind = infKindLabel(r.kind);
  var tl = f.timeline.map(function (t) { return (t.when ? t.when + ': ' : '') + t.what; });
  var leads = window.PreTaskIQIncidents.FACTOR_CATEGORIES.filter(function (c) { return f.factors[c.id]; }).map(function (c) { return c.label + ': ' + f.factors[c.id]; });
  var facts = [d.narrative, d.when && ('When: ' + d.when), d.location && ('Where: ' + d.location), d.work && ('Work: ' + d.work), d.injury && ('Injury: ' + d.injury), d.damage && ('Damage: ' + d.damage),
    tl.length && ('Timeline: ' + tl.join(' | ')), leads.length && ('Contributing factor leads: ' + leads.join(' | ')), f.interim.length && ('Interim controls: ' + f.interim.join('; '))].filter(Boolean).join('\n');
  var summary = d.narrative ? d.narrative.slice(0, 200) : r.title;
  var entry = {
    id: Date.now(), title: r.title, revision: '', scope: '', filename: null, status: 'ready', kbType: 'incident',
    summary: summary, change_description: summary, affected_work: [d.work, d.location].filter(Boolean).join(' · '),
    keywords: (typeof irKeywords === 'function') ? irKeywords({ title: r.title, work: d.work || '', location: d.location || '' }) : [], raw: '',
    hold_question: 'Before you start: a ' + kind.toLowerCase() + ' was reported on similar work' + (d.location ? ' (' + d.location + ')' : '') + '. What is different today?',
    incident_narrative: d.narrative || '', sourceText: facts.slice(0, 6000),
    incident_kind: kind, incident_when: d.when || '', location: d.location || '', injury_summary: d.injury || '', damage_summary: d.damage || '',
    people_roles: d.people || [], immediate_actions: d.actions || [], contributing_conditions: d.conditions || [], open_questions: d.unknowns || [],
    timeline: tl, interim_controls: f.interim, contributing_factor_leads: leads,
    reported_via: 'petey_report', reported_at: r.created_at, full_report_completed_at: new Date().toISOString(),
    root_causes: [], failed_control: '', corrective_actions: [], lessons_learned: []
  };
  try { if (typeof stkyResolveIds === 'function') entry.stkyCategoryIds = stkyResolveIds(entry, {}); } catch (e) {}
  return entry;
}

// Hand the whole report to the RCA assistant as its starting point
async function infStartRca() {
  var r = infState.report, f = infState.full, d = r.data || {};
  var L = ["I'm starting a root cause analysis from our completed incident report (roles only, no names):", ''];
  var add = function (label, val) { if (val && (!Array.isArray(val) || val.length)) L.push(label + ': ' + (Array.isArray(val) ? val.join('; ') : val)); };
  add('Type', infKindLabel(r.kind)); add('What happened', d.narrative); add('When', d.when); add('Where', d.location); add('Work being done', d.work);
  add('Injury', d.injury); add('Damage', d.damage); add('Roles involved', d.people);
  add('Timeline', f.timeline.map(function (t) { return (t.when ? t.when + ' ' : '') + t.what; }));
  add('Evidence collected', f.evidence.filter(function (e) { return e.status === 'collected'; }).map(function (e) { return e.label; }));
  add('Evidence not available', f.evidence.filter(function (e) { return e.status === 'not_available'; }).map(function (e) { return e.label; }));
  add('Witnesses', f.witnesses.map(function (w) { return w.role + ' (' + (w.status === 'interviewed' ? 'interviewed' : 'to interview') + ')'; }));
  add('Contributing factor leads', window.PreTaskIQIncidents.FACTOR_CATEGORIES.filter(function (c) { return f.factors[c.id]; }).map(function (c) { return c.label + ': ' + f.factors[c.id]; }));
  add('Interim controls', f.interim.length ? f.interim : f.interimNone);
  var text = L.join('\n').slice(0, 7000);
  openRCAAssistant();
  var up = document.getElementById('rca-upload-row'); if (up) up.style.display = 'none';
  var input = document.getElementById('rca-input'); if (input) input.value = text;
  showScreen('rca');
  if (typeof sendRCAMessage === 'function') await sendRCAMessage();
}

/* ---- Safety dashboard: open reports that still need the full report ---- */
function renderAdminIncidents(refresh) {
  var box = infEl('admin-incidents'), I = window.PreTaskIQIncidents; if (!box || !I) return;
  if (refresh) { I.refresh().then(function () { renderAdminIncidents(false); }); }
  var snap = I.getSnapshot(), open = I.openReports(snap).slice().sort(function (a, b) { return new Date(a.due_at) - new Date(b.due_at); });
  if (!open.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  var late = open.filter(function (r) { return I.isOverdue(r); }).length;
  box.style.display = '';
  box.className = 'admin-card inc-card' + (late ? ' inc-late' : '');
  box.innerHTML = '<div class="admin-card-label">Incident reports needing a full report</div>'
    + '<div class="inc-summary"><span class="inc-num">' + open.length + '</span> open' + (late ? ' <span class="inc-late-pill">' + late + ' overdue</span>' : '') + '</div>'
    + '<div class="inc-list">' + open.map(function (r) {
      var over = I.isOverdue(r);
      return '<button type="button" class="inc-row' + (over ? ' over' : '') + '" data-inc="' + infEsc(r.id) + '"><span class="inc-title">' + infEsc(r.title) + '</span>'
        + '<span class="inc-meta">' + infEsc(infKindLabel(r.kind)) + ' · needs full report · ' + infEsc(I.ageText(r.created_at)) + ' ago' + (over ? ' · OVERDUE' : '') + '</span></button>';
    }).join('') + '</div>';
  box.onclick = function (ev) { var b = ev.target.closest('[data-inc]'); if (b) openIncidentFull(b.getAttribute('data-inc')); };
}
(function () {
  if (window.PreTaskIQIncidents) PreTaskIQIncidents.subscribe(function () {
    var a = infEl('screen-admin'); if (a && a.style.display !== 'none') renderAdminIncidents(false);
  });
  setInterval(function () { var a = infEl('screen-admin'); if (a && a.style.display !== 'none' && !document.hidden && window.PreTaskIQIncidents) PreTaskIQIncidents.refresh(); }, 60000);
})();
