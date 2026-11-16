var currentKbType = 'drawings';

var KB_TYPE_CONFIG = {
  drawings: {
    desc: 'Upload revised drawings or plans. The more specific your tagging, the more accurately Petey intercepts the right crew before the right task.',
    placeholder: 'e.g. Drawing E-201 Rev 4 -- feeders F-9 and F-11 rerouted from tray 14-B to 14-C. Issued 2025-06-25.',
    fields: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'      + '<div><div class="settings-field-label">Drawing / document number</div><input id="kb-drawing-num" type="text" class="settings-input" placeholder="e.g. E-201"></div>'      + '<div><div class="settings-field-label">Revision</div><input id="kb-revision" type="text" class="settings-input" placeholder="e.g. Rev 4"></div>'      + '</div>'      + '<div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">'      + '<div><div class="settings-field-label">Location / area</div><input id="kb-location" type="text" class="settings-input" placeholder="e.g. Building 2, Data Hall, Bore sta. 14+50"></div>'      + '<div><div class="settings-field-label">Trade / work type</div><input id="kb-trade" type="text" class="settings-input" placeholder="e.g. Electrical, Directional Drilling, Telecom"></div>'      + '</div>'      + '<div style="margin-top:8px;"><div class="settings-field-label">Specific work elements affected</div><input id="kb-scope" type="text" class="settings-input" placeholder="e.g. Cable tray 14-C, Feeders F-9 and F-11, Primary conduit run"></div>'      + '<div style="margin-top:8px;"><div class="settings-field-label">Work phase (optional)</div><input id="kb-phase" type="text" class="settings-input" placeholder="e.g. Rough-in, Termination, Install, Bore, Pull"></div>'      + '<div style="margin-top:10px;background:#FFF4EE;border-radius:8px;padding:8px 10px;font-size:11px;color:#9A5530;line-height:1.5;"><strong>Tip:</strong> More specific = more accurate. Building 2 / Electrical / Feeder F-9 catches the right crew. Electrical work may catch too many. Platform integration (coming soon) will populate these fields automatically.</div>'  },
  incident: {
    desc: 'Upload incident reports. Petey will reference these when crews describe similar conditions, surfacing lessons learned in context.',
    placeholder: 'e.g. INC-301 Aug 2025 -- panel-level lockout applied but individual locks not used. Crew of 3 exposed. No injury. Retraining issued.',
    fields: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
      + '<div><div class="settings-field-label">Incident ID</div><input id="kb-drawing-num" type="text" class="settings-input" placeholder="e.g. INC-301"></div>'
      + '<div><div class="settings-field-label">Date</div><input id="kb-revision" type="text" class="settings-input" placeholder="e.g. Aug 2025"></div>'
      + '</div>'
      + '<div style="margin-top:8px;"><div class="settings-field-label">Trade / scope affected</div><input id="kb-scope" type="text" class="settings-input" placeholder="e.g. Electrical -- LOTO"></div>'
      + '<div style="margin-top:8px;"><div class="settings-field-label">STKY category (optional)</div><select id="kb-stky" class="settings-input"></select></div>'
      + '<details class="stky-ref" style="margin-top:10px;"><summary>The 8 STKY categories Petey uses</summary><div id="kb-stky-ref"></div></details>'
  },
  rca: {
    desc: 'Upload completed RCA documents. Petey will surface corrective actions when crews describe similar conditions. You can also upload example RCAs to set your preferred methodology — the RCA assistant will replicate that structure.',
    placeholder: 'e.g. RCA-PDC-001 -- phase cables crossed during load bank test. Root cause: single-person verification. Corrective action: two-person phase check required.',
    fields: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'      + '<div><div class="settings-field-label">RCA ID</div><input id="kb-drawing-num" type="text" class="settings-input" placeholder="e.g. RCA-PDC-001"></div>'      + '<div><div class="settings-field-label">Linked incident</div><input id="kb-revision" type="text" class="settings-input" placeholder="e.g. INC-243"></div>'      + '</div>'      + '<div style="margin-top:8px;"><div class="settings-field-label">Scope / trade</div><input id="kb-scope" type="text" class="settings-input" placeholder="e.g. Electrical -- energized work"></div>'      + '<div style="margin-top:10px;background:#F0F8FF;border:1px solid #BFDBFE;border-radius:8px;padding:10px 12px;">'      + '<div style="font-size:12px;font-weight:700;color:#1E40AF;margin-bottom:4px;">Set as methodology template</div>'      + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:#444;">'      + '<input type="checkbox" id="rca-set-template" style="accent-color:var(--orange);"> '      + 'Use this document as my preferred RCA template. The RCA assistant will replicate this structure and section layout for future RCAs.</label>'      + '</div>'  },
  policy: {
    desc: 'Upload company safety, quality, or operational policies. Petey will cite these when crews ask questions or when a policy applies to the task at hand.',
    placeholder: 'e.g. POL-FALL-002 -- Fall protection required at 6 ft or higher. PFAS anchors must support 5,000 lbs per person.',
    fields: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
      + '<div><div class="settings-field-label">Policy number</div><input id="kb-drawing-num" type="text" class="settings-input" placeholder="e.g. POL-FALL-002"></div>'
      + '<div><div class="settings-field-label">Effective date</div><input id="kb-revision" type="text" class="settings-input" placeholder="e.g. Jan 2025"></div>'
      + '</div>'
      + '<div style="margin-top:8px;"><div class="settings-field-label">Topic / trade</div><input id="kb-scope" type="text" class="settings-input" placeholder="e.g. Fall protection -- all trades"></div>'
  },
  procedure: {
    desc: 'Upload step-by-step work procedures. Petey can track crew progress through these in real time and flag if steps are done out of sequence.',
    placeholder: 'e.g. PROC-LOTO-001 -- Lockout/Tagout. Steps: 1. Verify the signed Method of Procedure (MOP) 2. Confirm the Energy Isolation Permit (EIP) 3. Notify personnel 4. Identify energy sources 5. Shut down 6. Isolate 7. Apply locks 8. Relieve stored energy 9. Verify zero energy (Live-Dead-Live).',
    fields: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
      + '<div><div class="settings-field-label">Procedure ID</div><input id="kb-drawing-num" type="text" class="settings-input" placeholder="e.g. PROC-LOTO-001"></div>'
      + '<div><div class="settings-field-label">Revision</div><input id="kb-revision" type="text" class="settings-input" placeholder="e.g. Rev 2"></div>'
      + '</div>'
      + '<div style="margin-top:8px;"><div class="settings-field-label">Trade / task type</div><input id="kb-scope" type="text" class="settings-input" placeholder="e.g. Electrical -- lockout/tagout"></div>'
  }
};

function switchKbTab(type) {
  currentKbType = type;
  var tabs = document.querySelectorAll('.kb-type-tab');
  tabs.forEach(function(t) {
    t.classList.toggle('active', t.dataset.type === type);
  });
  var cfg = KB_TYPE_CONFIG[type];
  var desc = document.getElementById('kb-type-desc');
  if (desc) desc.textContent = cfg.desc;
  var textInput = document.getElementById('kb-text-input');
  if (textInput) textInput.placeholder = cfg.placeholder;
  var fields = document.getElementById('kb-dynamic-fields');
  if (fields) fields.innerHTML = cfg.fields;
  var _ks = document.getElementById('kb-stky'); if (_ks && typeof stkyOptionsHtml === 'function') _ks.innerHTML = '<option value="">Let Petey suggest</option>' + stkyOptionsHtml();
  var _kr = document.getElementById('kb-stky-ref'); if (_kr && typeof stkyReferenceHtml === 'function') _kr.innerHTML = stkyReferenceHtml();
}

// Update openSettingsToKb to accept type
function openSettingsToKb(type) {
  openSettingsModal();
  setTimeout(function() {
    if (type) switchKbTab(type);
    var zone = document.getElementById('kb-upload-zone');
    if (zone) zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 200);
}

// Override addKbEntryFromText to tag entries with type
var _origAddKbEntryFromText = addKbEntryFromText;
function addKbEntryFromText(description, drawingNum, revision, scope) {
  var entry = addKbEntryPending(drawingNum || 'Manual entry', revision, scope, null);
  entry.kbType = currentKbType;
  // Check if this RCA is being set as a methodology template
  var setTemplate = document.getElementById('rca-set-template');
  if (currentKbType === 'rca' && setTemplate && setTemplate.checked) {
    entry.isMethodologyTemplate = true;
  }
  parseKbEntryWithAI(entry, description, null, null);
}

// Patch kb-add-btn to read from dynamic fields
document.addEventListener('DOMContentLoaded', function() {
  // Init first tab
  switchKbTab('drawings');

  // Re-init tabs when settings opens
  var openBtn = document.getElementById('settings-open-btn');
  if (openBtn) {
    openBtn.addEventListener('click', function() {
      setTimeout(function() { switchKbTab(currentKbType); }, 150);
    });
  }

  // Patch add button to read from dynamic fields
  var addBtn = document.getElementById('kb-add-btn');
  if (addBtn) {
    addBtn.onclick = function() {
      var text = document.getElementById('kb-text-input').value.trim();
      var drawingNum = (document.getElementById('kb-drawing-num') || {}).value || '';
      var revision = (document.getElementById('kb-revision') || {}).value || '';
      var scope = (document.getElementById('kb-scope') || {}).value || '';
      var location = (document.getElementById('kb-location') || {}).value || '';
      var trade = (document.getElementById('kb-trade') || {}).value || '';
      var phase = (document.getElementById('kb-phase') || {}).value || '';
      drawingNum = drawingNum.trim();
      revision = revision.trim();
      scope = scope.trim();
      location = location.trim();
      trade = trade.trim();
      phase = phase.trim();

      if (!text && !drawingNum) {
        alert('Please enter a description or document number.');
        return;
      }
      // Build rich description from structured fields
      var structuredContext = [
        drawingNum ? 'Drawing: ' + drawingNum + (revision ? ' ' + revision : '') : '',
        location ? 'Location: ' + location : '',
        trade ? 'Trade/Work type: ' + trade : '',
        scope ? 'Work elements affected: ' + scope : '',
        phase ? 'Work phase: ' + phase : '',
        text ? 'Description: ' + text : ''
      ].filter(Boolean).join('. ');

      var entry = addKbEntryPending(drawingNum || 'Manual entry', revision, scope || location, null);
      entry.kbType = currentKbType;
      var _setTpl = document.getElementById('rca-set-template');
      if (currentKbType === 'rca' && _setTpl && _setTpl.checked) entry.isMethodologyTemplate = true;
      entry.location = location;
      entry.trade = trade;
      entry.phase = phase;
      var _stkyVal = (document.getElementById('kb-stky') || {}).value || '';
      if (_stkyVal) { entry.stkyCategoryIds = [_stkyVal]; entry.stkyManual = true; }
      parseKbEntryWithAI(entry, structuredContext, null, null);
    };
  }
});

// Update renderKbEntries to show type badge
var _origRenderKbEntries = renderKbEntries;
function renderKbEntries() {
  var list = document.getElementById('kb-entries-list');
  if (!list) return;
  if (projectKnowledgeBase.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--slate);text-align:center;padding:8px 0;">No entries yet.</div>';
    return;
  }
  var typeIcons = { drawings: '📐', incident: '⚠️', rca: '🔍', policy: '📋', procedure: '📝' };
  var KB = window.PreTaskIQKb;
  var e2 = escapeHtml;
  var safeId = function(v) { return String(v).replace(/[^A-Za-z0-9_-]/g, ''); };      // ids go inside an onclick attribute: letters, digits, dash only
  list.innerHTML = projectKnowledgeBase.map(function(e) {
    var icon = typeIcons[e.kbType] || '📄';
    // Where the entry is kept: saved for the whole company, being saved, not saved (with a retry), or only in this tab (nobody signed in)
    var keep = e.status === 'processing' ? ''
      : e.saveState === 'saved' ? '<div class="kb-entry-meta">Saved for everyone' + (e.savedBy ? ' · added by ' + e2(e.savedBy) : '') + '</div>'
      : e.saveState === 'saving' ? '<div class="kb-entry-meta">Saving…</div>'
      : e.saveState === 'failed' ? '<div class="kb-entry-meta" style="color:#C62F2A;font-weight:700;">NOT saved (' + e2(e.saveError || 'no connection') + '). It will be lost if you close this page. <a href="#" onclick="PreTaskIQKb.retry(\'' + safeId(e.id) + '\'); return false;">Try again</a></div>'
      : '<div class="kb-entry-meta">Kept in this tab only. Sign in to save it for everyone.</div>';
    var rm = e.dbId && KB && KB.mayEdit(e) ? ' <a href="#" class="kb-remove" onclick="kbRemoveEntry(\'' + safeId(e.dbId) + '\'); return false;">Remove</a>' : '';
    // Incident reenactment: a Safety Admin drafts, reviews and approves it; only an approved one is ever shown to crews.
    var rx = '';
    if (e.kbType === 'incident' && e.status === 'ready' && e.dbId && e.saveState === 'saved') {
      var RU = window.PreTaskIQReenactUI, canRx = !!(RU && KB && KB.mayEdit(e));
      var live = e.reenactment && e.reenactment.status === 'approved';
      if (live) {
        rx = '<div class="kb-entry-meta">🎬 Reenactment approved' + (e.reenactment.approvedBy ? ' by ' + e2(e.reenactment.approvedBy) : '') + ' · crews can watch it '
          + '<a href="#" onclick="openReenactment(\'' + safeId(e.dbId) + '\'); return false;">Watch</a>'
          + (canRx ? ' · <a href="#" onclick="PreTaskIQReenactUI.openFor(\'' + safeId(e.dbId) + '\'); return false;">Edit</a>' : '') + '</div>';
      } else if (canRx) {
        rx = '<div class="kb-entry-meta"><a href="#" onclick="PreTaskIQReenactUI.openFor(\'' + safeId(e.dbId) + '\'); return false;">🎬 Create reenactment</a> (you review it before crews see it)</div>';
      }
    }
    return '<div class="kb-entry-card ' + e.status + '">'
      + '<div class="kb-entry-header">'
      + '<span style="font-size:14px;">' + icon + '</span>'
      + '<span class="kb-entry-title">' + e2(e.title || '') + (e.revision ? ' -- ' + e2(e.revision) : '') + '</span>'
      + '<span class="kb-entry-badge ' + e.status + '">' + (e.status === 'processing' ? 'Parsing...' : 'Ready') + '</span>'
      + '</div>'
      + (e.change_description ? '<div style="font-size:13px;color:#444;margin-top:5px;">' + e2(e.change_description) + '</div>' : '')
      + (e.affected_work ? '<div class="kb-entry-meta">Affects: ' + e2(e.affected_work) + '</div>' : '')
      + (typeof stkyEntryMetaHtml === 'function' ? stkyEntryMetaHtml(e) : '')
      + keep + rx + rm
      + '</div>';
  }).join('');
}

function kbRemoveEntry(dbId) {
  if (!window.PreTaskIQKb) return;
  if (!confirm('Remove this entry for everyone? Petey will stop using it. (It is kept in the database, so an administrator can still recover it.)')) return;
  window.PreTaskIQKb.remove(dbId).then(function(r) { if (!r.ok) alert('Could not remove it: ' + r.message); });
}
