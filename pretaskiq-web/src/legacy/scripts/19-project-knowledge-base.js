// ── Project Knowledge Base ───────────────────────────────────────────
var projectKnowledgeBase = [];

function initKnowledgeBase() {
  var zone = document.getElementById('kb-upload-zone');
  var fileInput = document.getElementById('kb-file-input');
  var addBtn = document.getElementById('kb-add-btn');

  if (!zone) return;

  // Click to upload
  zone.addEventListener('click', function() { fileInput.click(); });

  // Drag and drop
  zone.addEventListener('dragover', function(e) {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', function() {
    zone.classList.remove('drag-over');
  });
  zone.addEventListener('drop', function(e) {
    e.preventDefault();
    zone.classList.remove('drag-over');
    var file = e.dataTransfer.files[0];
    if (file) handleKbFile(file);
  });

  fileInput.addEventListener('change', function() {
    if (fileInput.files[0]) handleKbFile(fileInput.files[0]);
  });

  // (the Add button's click handler is attached once, in the DOMContentLoaded patch further down)

  renderKbEntries();
}

function handleKbFile(file) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var isImage = file.type.startsWith('image/');
    var isPdf = file.type === 'application/pdf';
    var drawingNum = document.getElementById('kb-drawing-num').value.trim() || file.name.replace(/\.[^.]+$/, '');
    var revision = document.getElementById('kb-revision').value.trim();
    var scope = document.getElementById('kb-scope').value.trim();

    var entry = addKbEntryPending(drawingNum || file.name, revision, scope, file.name);
    if (typeof currentKbType !== 'undefined') entry.kbType = currentKbType;      // (fix) a file added under another tab was being filed as a drawing
    // Check RCA methodology template flag
    var setTemplate = document.getElementById('rca-set-template');
    if (currentKbType === 'rca' && setTemplate && setTemplate.checked) {
      entry.isMethodologyTemplate = true;
    }

    if (isImage) {
      var base64 = e.target.result.split(',')[1];
      parseKbEntryWithAI(entry, null, base64, file.type);
    } else if (isPdf) {
      var base64 = e.target.result.split(',')[1];
      parseKbEntryWithAI(entry, null, base64, 'application/pdf');
    }
  };
  reader.readAsDataURL(file);
}

function addKbEntryFromText(description, drawingNum, revision, scope) {
  var entry = addKbEntryPending(drawingNum || 'Manual entry', revision, scope, null);
  parseKbEntryWithAI(entry, description, null, null);
}

function addKbEntryPending(title, revision, scope, filename) {
  var entry = {
    id: Date.now(),
    title: title,
    revision: revision,
    scope: scope,
    filename: filename,
    status: 'processing',
    summary: '',
    keywords: [],
    change_description: '',
    affected_work: '',
    raw: ''
  };
  projectKnowledgeBase.push(entry);
  renderKbEntries();
  return entry;
}

// What an incident or RCA document says about why it happened and what was done about it. Each list is trimmed and capped, so the model's
// answer (or an administrator's typing) can never grow without limit. Empty means "the document did not say", never a guess.
function kbCleanList(v, max, len) {
  var arr = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(/\n+/) : []);
  return arr.map(function(x) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, len); }).filter(Boolean).slice(0, max);
}
function kbApplyFindings(entry, src) {
  entry.root_causes = kbCleanList(src.root_causes, 4, 160);
  entry.failed_control = String(src.failed_control == null ? '' : src.failed_control).replace(/\s+/g, ' ').trim().slice(0, 200);
  entry.corrective_actions = kbCleanList(src.corrective_actions, 5, 160);
  entry.lessons_learned = kbCleanList(src.lessons_learned, 4, 160);
}

async function parseKbEntryWithAI(entry, textDescription, imageBase64, mediaType) {
  try {
    var messages = [];
    var userContent = [];

    if (imageBase64 && mediaType) {
      if (mediaType === 'application/pdf') {
        userContent.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: imageBase64 }
        });
      } else {
        userContent.push({
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: imageBase64 }
        });
      }
    }

    var prompt = textDescription
      ? 'Extract structured information from this project update description: "' + textDescription + '"'
      : 'Extract structured information from this drawing or document.';

    prompt += '\n\nRespond with ONLY a JSON object (no markdown, no backticks) with these fields:\n'
      + '{\n'
      + '  "drawing_number": "drawing/document number if visible, else null",\n'
      + '  "revision": "revision identifier if visible, else null",\n'
      + '  "change_description": "one sentence describing what changed",\n'
      + '  "affected_work": "what field work is affected — trade, location, scope",\n'
      + '  "keywords": ["array", "of", "5-10", "keywords", "for", "matching"],\n'
      + '  "hold_question": "the confirming question Petey should ask a crew before they start this work"' + (typeof stkyPromptField === 'function' ? stkyPromptField(entry) : '')
      + (entry.kbType === 'incident' ? ',\n  "incident_narrative": "a faithful plain-language account of what happened, in order (max 1500 characters). Use roles, never names. Include only facts the document states; if a detail is not stated, leave it out"'
        + ',\n  "root_causes": ["up to 4 short phrases (max 160 characters each): the causes the document itself gives. Empty array if it gives none; never infer one"]'
        + ',\n  "failed_control": "one short sentence (max 200 characters): the safeguard or control that was missing or failed, as the document states it, else empty string"'
        + ',\n  "corrective_actions": ["up to 5 short phrases (max 160 characters each): the corrective actions or retraining the document lists. Empty array if none"]'
        + ',\n  "lessons_learned": ["up to 4 short phrases (max 160 characters each): the lessons learned the document states. Empty array if none"]' : '') + '\n'
      + '}';

    userContent.push({ type: 'text', text: prompt });
    messages.push({ role: 'user', content: userContent });

    var response = await fetch(window.PRETASKIQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1800,
        messages: messages
      })
    });

    var data = await response.json();
    var text = (data.content || []).map(function(b) { return b.text || ''; }).join('');
    var clean = text.replace(/```json|```/g, '').trim();
    var parsed = JSON.parse(clean);

    entry.status = 'ready';
    entry.change_description = parsed.change_description || '';
    entry.affected_work = parsed.affected_work || '';
    entry.keywords = parsed.keywords || [];
    entry.hold_question = parsed.hold_question || '';
    entry.summary = parsed.change_description || '';
    if (entry.kbType === 'incident') {
      if (typeof parsed.incident_narrative === 'string' && parsed.incident_narrative.trim()) entry.incident_narrative = parsed.incident_narrative.trim().slice(0, 2000);
      kbApplyFindings(entry, parsed);
      if (textDescription) entry.sourceText = String(textDescription).slice(0, 6000);   // the written account, kept so a reenactment can be drafted from it
    }
    if (typeof stkyResolveIds === 'function') entry.stkyCategoryIds = stkyResolveIds(entry, parsed);
    // If marked as methodology template, store the full document text for RCA assistant
    if (entry.isMethodologyTemplate && description) {
      localStorage.setItem('rca_methodology_template', JSON.stringify({
        source: entry.title,
        uploadedAt: new Date().toISOString(),
        description: description,
        structure: parsed.change_description || description
      }));
      console.log('RCA methodology template saved');
    }
    if (parsed.drawing_number && !entry.title.includes(parsed.drawing_number)) {
      entry.title = parsed.drawing_number + (parsed.revision ? ' ' + parsed.revision : '');
    }
    if (parsed.revision && !entry.revision) entry.revision = parsed.revision;
    // No number typed and none found in the document: name the entry from what it says, so it is easy to tell apart in the list
    if (/^(Manual entry|Untitled)$/i.test(entry.title) && entry.change_description) entry.title = entry.change_description.replace(/\s+/g, ' ').slice(0, 60).replace(/\s+\S*$/, '').trim() || entry.title;

  } catch (err) {
    entry.status = 'ready';
    entry.summary = textDescription || 'Uploaded document';
    entry.change_description = textDescription || 'Document uploaded — verify details with crew';
    entry.keywords = entry.scope ? entry.scope.split(' ') : [];
    entry.hold_question = 'Before you start — have you seen the latest update for this scope? There was a change issued recently.';
  }

  // Clear form
  document.getElementById('kb-text-input').value = '';
  document.getElementById('kb-drawing-num').value = '';
  document.getElementById('kb-revision').value = '';
  document.getElementById('kb-scope').value = '';

  renderKbEntries();
  // Keep it: with a signed-in account the entry is saved for the whole company (the screen shows whether it worked).
  if (window.PreTaskIQKb) window.PreTaskIQKb.save(entry); else entry.saveState = 'session';
}

function renderKbEntries() {
  var list = document.getElementById('kb-entries-list');
  if (!list) return;
  if (projectKnowledgeBase.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--slate);text-align:center;padding:8px 0;">No entries yet. Upload a drawing or describe a change above.</div>';
    return;
  }
  list.innerHTML = projectKnowledgeBase.map(function(e) {
    return '<div class="kb-entry-card ' + e.status + '">'
      + '<div class="kb-entry-header">'
      + '<span class="kb-entry-title">' + e.title + (e.revision ? ' — ' + e.revision : '') + '</span>'
      + '<span class="kb-entry-badge ' + e.status + '">' + (e.status === 'processing' ? 'Parsing...' : 'Ready') + '</span>'
      + '</div>'
      + (e.change_description ? '<div style="font-size:13px;color:#444;margin-top:5px;">' + e.change_description + '</div>' : '')
      + (e.affected_work ? '<div class="kb-entry-meta">Affects: ' + e.affected_work + '</div>' : '')
      + (typeof stkyEntryMetaHtml === 'function' ? stkyEntryMetaHtml(e) : '')
      + '</div>';
  }).join('');
}

// Check KB entries when foreman describes work in Petey
function checkKbForMatch(userText) {
  if (projectKnowledgeBase.length === 0) return null;
  var words = userText.toLowerCase().split(/\s+/);
  var best = null;
  var bestScore = 0;
  projectKnowledgeBase.forEach(function(entry) {
    if (entry.status !== 'ready') return;
    var score = 0;
    // Build search text from all available fields — location and trade boost specificity
    var searchParts = [
      (entry.keywords || []).join(' '),
      entry.affected_work || '',
      entry.change_description || '',
      entry.title || '',
      entry.location || '',
      entry.trade || '',
      entry.phase || ''
    ];
    var searchText = searchParts.join(' ').toLowerCase();
    words.forEach(function(w) {
      if (w.length > 3 && searchText.includes(w)) {
        // Weight location and trade matches higher — they reduce false positives
        var isLocationMatch = (entry.location || '').toLowerCase().includes(w);
        var isTradeMatch = (entry.trade || '').toLowerCase().includes(w);
        score += isLocationMatch ? 2 : isTradeMatch ? 1.5 : 1;
      }
    });
    if (score > bestScore) { bestScore = score; best = entry; }
  });
  // Higher threshold when location/trade fields are populated — require better match
  var threshold = (best && (best.location || best.trade)) ? 3 : 2;
  return bestScore >= threshold ? best : null;
}

// Override drawing demo to use real KB entries when available
function runDrawingRevisionDemo() {
  if (projectKnowledgeBase.filter(function(e) { return e.status === 'ready'; }).length > 0) {
    runLiveKbDemo();
  } else {
    runHardcodedDrawingDemo();
  }
}

function runLiveKbDemo() {
  var entry = projectKnowledgeBase.filter(function(e) { return e.status === 'ready'; })[0];
  if (!entry) { runHardcodedDrawingDemo(); return; }

  var workDesc = entry.affected_work || 'the work in your plan';
  var holdQ = entry.hold_question || 'Before you start -- are you working from the latest revision? There was a change issued recently affecting this scope.';

  demoBubble('user', 'Hey Petey, we are about to start ' + workDesc + '.', 300)
  .then(function() { return demoTyping(600); })
  .then(function() {
    removeTyping();
    return demoBubble('assistant', holdQ, 200);
  })
  .then(function() { return demoTyping(900); })
  .then(function() {
    removeTyping();
    var log = document.getElementById('demo-project-log');
    if (!log) { demoBusy = false; return; }
    var card = document.createElement('div');
    card.style.cssText = 'background:#FFF4EE;border:1px solid #F4C09A;border-left:4px solid var(--orange);border-radius:10px;padding:12px 14px;margin-top:10px;';
    card.innerHTML = '<div style="font-size:12px;font-weight:700;color:#7A3510;margin-bottom:4px;">Project document hold point surfaced</div>'
      + '<div style="font-size:13px;color:#7A3510;">' + escapeHtml(entry.title || entry.change_description || 'Matched project KB record') + '</div>'
      + '<button onclick="this.closest(\'div\').nextElementSibling && 0" style="margin-top:8px;background:var(--navy);color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">Notify super</button>';
    log.appendChild(card);
    log.scrollTop = log.scrollHeight;
    demoBusy = false;
  });
}
function drawingRow(label, status, detail, color) {
  return '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.06);">'
    + '<div style="color:rgba(255,255,255,0.9);font-weight:600;">' + label + '</div>'
    + '<div style="text-align:right;"><div style="color:' + color + ';font-weight:700;font-size:12px;">' + status + '</div>'
    + '<div style="color:rgba(255,255,255,0.5);font-size:12px;">' + detail + '</div></div></div>';
}
function runHardcodedDrawingDemo() {
  demoBubble('user', 'Hey Petey, we are about to pull the feeders for the Building 2 data hall. Starting with F-7 through F-12.', 300)
  .then(function() { return demoTyping(600); })
  .then(function() {
    removeTyping();
    return demoBubble('assistant', 'Before you start -- I caught something you need to see. Drawing E-201 was revised yesterday at 2:47 PM. Rev 4 changes the cable routing for feeders F-7 through F-12 in the Building 2 data hall. Are you working off the current set?', 0);
  })
  .then(function() { return new Promise(function(r) { setTimeout(r, 2200); }); })
  .then(function() {
    return demoBubble('user', 'We have the drawings from last week. Same ones we used on phase 1.', 300);
  })
  .then(function() { return demoTyping(600); })
  .then(function() {
    removeTyping();
    return demoBubble('assistant', 'That is the problem -- last week is Rev 3. The routing change in Rev 4 moves F-9 and F-11 from tray run 14-B to 14-C. If you pull to the old routing you will be in the wrong tray and it will have to come out.\n\nI am flagging this to Marcus Webb -- superintendent on record for Building 2. Do not pull F-7 through F-12 until you have Rev 4 in hand and Marcus confirms the routing.', 0);
  })
  .then(function() { return new Promise(function(r) { setTimeout(r, 900); }); })
  .then(function() {
    var log = document.getElementById('petey-log-inner');
    var card = document.createElement('div');
    card.style.cssText = 'background:#0F1E2E;border:1px solid rgba(255,255,255,0.08);border-left:4px solid #F59E0B;border-radius:12px;padding:14px 16px;margin:6px 0;font-size:13px;';
    card.innerHTML = '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#FCD34D;margin-bottom:10px;">Drawing revision detected</div>'
      + drawingRow('E-201', 'Rev 3 -- Rev 4', 'Issued 2025-06-25 14:47', '#FCD34D')
      + drawingRow('Feeders F-9, F-11', 'Routing changed', 'Tray 14-B -- Tray 14-C', '#FB923C')
      + drawingRow('Feeders F-7, F-8, F-10, F-12', 'No change', 'Routing unchanged in Rev 4', 'rgba(255,255,255,0.4)')
      + '<div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.07);display:flex;gap:8px;">'
      + '<button style="flex:1;padding:9px;background:#F59E0B;color:#1A1000;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;">Get Rev 4</button>'
      + '<button style="flex:1;padding:9px;background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.12);border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;">Notify Marcus</button>'
      + '</div>';
    log.appendChild(card);
    log.scrollTop = log.scrollHeight;
    demoBusy = false;
  });
}

document.addEventListener('DOMContentLoaded', function() {
  initKnowledgeBase();

  // Re-init when settings opens (in case DOM wasn't ready)
  var openBtn = document.getElementById('settings-open-btn');
  if (openBtn) {
    openBtn.addEventListener('click', function() {
      setTimeout(function() { initKnowledgeBase(); renderKbEntries(); }, 150);
    });
  }
});
