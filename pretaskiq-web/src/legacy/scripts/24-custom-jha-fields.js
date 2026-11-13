// ── Custom JHA Template Fields ───────────────────────────────────────
var customJHAFields = [];
var jhaDocName = '';

function addCustomJHAField() {
  var id = Date.now();
  customJHAFields.push({ id: id, label: '', placeholder: '', required: false });
  renderCustomJHAFields();
}

function removeCustomJHAField(id) {
  customJHAFields = customJHAFields.filter(function(f) { return f.id !== id; });
  renderCustomJHAFields();
  updateCustomJHAPreview();
}

function renderCustomJHAFields() {
  var list = document.getElementById('custom-jha-fields-list');
  if (!list) return;
  if (customJHAFields.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--slate);font-style:italic;padding:4px 0;">No custom fields added yet.</div>';
    updateCustomJHAPreview();
    return;
  }
  list.innerHTML = customJHAFields.map(function(f) {
    return '<div style="display:flex;gap:8px;align-items:center;">'
      + '<input type="text" class="settings-input" placeholder="Field name (e.g. Work Order #)" style="flex:1;" '
      + 'value="' + (f.label || '') + '" '
      + 'oninput="updateCustomFieldLabel(' + f.id + ', this.value)">'
      + '<input type="text" class="settings-input" placeholder="Default value or leave blank" style="flex:1;" '
      + 'value="' + (f.placeholder || '') + '" '
      + 'oninput="updateCustomFieldPlaceholder(' + f.id + ', this.value)">'
      + '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--slate);white-space:nowrap;cursor:pointer;">'
      + '<input type="checkbox" ' + (f.required ? 'checked' : '') + ' '
      + 'onchange="updateCustomFieldRequired(' + f.id + ', this.checked)" style="accent-color:var(--orange);"> Required</label>'
      + '<button onclick="removeCustomJHAField(' + f.id + ')" style="background:none;border:none;color:#999;cursor:pointer;font-size:16px;padding:0 4px;">×</button>'
      + '</div>';
  }).join('');
  updateCustomJHAPreview();
}

function updateCustomFieldLabel(id, val) {
  var f = customJHAFields.find(function(f) { return f.id === id; });
  if (f) f.label = val;
  updateCustomJHAPreview();
}
function updateCustomFieldPlaceholder(id, val) {
  var f = customJHAFields.find(function(f) { return f.id === id; });
  if (f) f.placeholder = val;
}
function updateCustomFieldRequired(id, val) {
  var f = customJHAFields.find(function(f) { return f.id === id; });
  if (f) f.required = val;
}

function updateCustomJHAPreview() {
  var preview = document.getElementById('custom-jha-preview');
  var inner = document.getElementById('custom-jha-preview-inner');
  if (!preview || !inner) return;
  var named = customJHAFields.filter(function(f) { return f.label.trim(); });
  if (named.length === 0) {
    preview.style.display = 'none';
    return;
  }
  preview.style.display = 'block';
  inner.innerHTML = named.map(function(f) {
    return '<div style="display:flex;gap:8px;">'
      + '<span style="font-weight:700;color:var(--navy);min-width:160px;">' + f.label + (f.required ? ' *' : '') + ':</span>'
      + '<span style="color:var(--slate);">' + (f.placeholder || '___________________') + '</span>'
      + '</div>';
  }).join('');
}

// Save and restore custom fields
function saveCustomJHASettings() {
  var docNameEl = document.getElementById('jha-doc-name');
  if (docNameEl) jhaDocName = docNameEl.value.trim();
  localStorage.setItem('custom_jha_fields', JSON.stringify(customJHAFields));
  localStorage.setItem('jha_doc_name', jhaDocName);

  // Collect signature preferences
  var sigs = {
    foreman: document.getElementById('sig-foreman') ? document.getElementById('sig-foreman').checked : true,
    crew: document.getElementById('sig-crew') ? document.getElementById('sig-crew').checked : false,
    super: document.getElementById('sig-super') ? document.getElementById('sig-super').checked : false,
    safety: document.getElementById('sig-safety') ? document.getElementById('sig-safety').checked : false,
  };
  localStorage.setItem('jha_signatures', JSON.stringify(sigs));
}

function restoreCustomJHASettings() {
  var saved = localStorage.getItem('custom_jha_fields');
  if (saved) {
    try { customJHAFields = JSON.parse(saved); } catch(e) {}
  }
  var savedName = localStorage.getItem('jha_doc_name');
  if (savedName) jhaDocName = savedName;
  var docNameEl = document.getElementById('jha-doc-name');
  if (docNameEl && jhaDocName) docNameEl.value = jhaDocName;

  var savedSigs = localStorage.getItem('jha_signatures');
  if (savedSigs) {
    try {
      var sigs = JSON.parse(savedSigs);
      if (document.getElementById('sig-foreman')) document.getElementById('sig-foreman').checked = sigs.foreman !== false;
      if (document.getElementById('sig-crew')) document.getElementById('sig-crew').checked = !!sigs.crew;
      if (document.getElementById('sig-super')) document.getElementById('sig-super').checked = !!sigs.super;
      if (document.getElementById('sig-safety')) document.getElementById('sig-safety').checked = !!sigs.safety;
    } catch(e) {}
  }
  renderCustomJHAFields();
}

// Inject custom fields into JHA rendering
function getCustomFieldsHTML() {
  if (customJHAFields.length === 0 && !jhaDocName) return '';
  var html = '';
  if (customJHAFields.filter(function(f) { return f.label.trim(); }).length > 0) {
    html += '<div style="margin-bottom:16px;padding:12px 16px;background:#F9F8F6;border-radius:8px;border:1px solid var(--line);">';
    html += '<div style="font-size:11px;font-weight:700;color:var(--slate);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Organization Fields</div>';
    customJHAFields.filter(function(f) { return f.label.trim(); }).forEach(function(f) {
      html += '<div style="display:flex;gap:12px;align-items:baseline;padding:4px 0;border-bottom:1px solid var(--line);">'
        + '<span style="font-size:13px;font-weight:700;color:var(--navy);min-width:180px;">' + f.label + (f.required ? ' *' : '') + '</span>'
        + '<span style="font-size:13px;color:var(--slate);flex:1;" contenteditable="true">' + (f.placeholder || '') + '</span>'
        + '</div>';
    });
    html += '</div>';
  }
  return html;
}

// Get document title based on org preference
function getJHADocumentTitle() {
  return jhaDocName || 'Job Hazard Analysis';
}

// Hook into settings open/save
document.addEventListener('DOMContentLoaded', function() {
  restoreCustomJHASettings();

  var openBtn = document.getElementById('settings-open-btn');
  if (openBtn) {
    openBtn.addEventListener('click', function() {
      setTimeout(restoreCustomJHASettings, 150);
    });
  }

  var saveBtn = document.getElementById('settings-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveCustomJHASettings, true);
  }
});
