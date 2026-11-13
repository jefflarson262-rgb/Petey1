const STKY_CATEGORIES = [
  { id: 'STKY-DROP',     energy: 'Gravity / Motion', name: 'Dropped load or object',             trigger: null },
  { id: 'STKY-STRUCK',   energy: 'Motion',           name: 'Struck by equipment or vehicle',     trigger: null },
  { id: 'STKY-CAUGHT',   energy: 'Mechanical',       name: 'Caught in equipment',                trigger: null },
  { id: 'STKY-TRENCH',   energy: 'Pressure',         name: 'Excavation or trench collapse',      trigger: '≥ 5 ft' },
  { id: 'STKY-ELEC',     energy: 'Electrical',       name: 'Electrical contact or arc flash',    trigger: '≥ 50 V' },
  { id: 'STKY-FALL',     energy: 'Gravity',          name: 'Fall from elevation',                trigger: '≥ 4 ft' },
  { id: 'STKY-VEHICLE',  energy: 'Motion',           name: 'Motor vehicle accident or rollover', trigger: '≥ 30 mph' },
  { id: 'STKY-CONFINED', energy: 'Chemical',         name: 'Confined space, toxic atmosphere',   trigger: null }
];
const STKY_NO_CONTROL = 'None recorded in the conversation. Confirm one before work starts.';
const STKY_FOOTNOTE = 'STKY thresholds are recognition triggers. Company policy and regulation set the required controls.';
function stkyById(id) { for (var i = 0; i < STKY_CATEGORIES.length; i++) if (STKY_CATEGORIES[i].id === id) return STKY_CATEGORIES[i]; return null; }
function stkyEsc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"]/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function stkyLabel(c) { return c.name + (c.trigger ? ' (' + c.trigger + ')' : ''); }
function stkyOptionsHtml() { return STKY_CATEGORIES.map(function(c) { return '<option value="' + c.id + '">' + stkyEsc(stkyLabel(c)) + '</option>'; }).join(''); }
function stkyReferenceHtml() {
  return '<ul class="stky-ref-list">' + STKY_CATEGORIES.map(function(c) {
    return '<li><span class="stky-energy">' + stkyEsc(c.energy) + '</span> ' + stkyEsc(c.name) + (c.trigger ? ' <span class="stky-trig">' + stkyEsc(c.trigger) + '</span>' : '') + '</li>';
  }).join('') + '</ul><div class="stky-foot">' + stkyEsc(STKY_FOOTNOTE) + '</div>';
}
function stkyBadgeHtml(id) {
  var c = stkyById(id); if (!c) return '';
  return '<span class="stky-pill" title="Stuff That Can Kill You: ' + stkyEsc(c.energy) + '">STKY · ' + stkyEsc(c.name) + '</span>';
}
function stkyEntryMetaHtml(e) {
  var ids = (e && e.stkyCategoryIds) || []; var names = ids.map(function(id) { var c = stkyById(id); return c ? c.name : null; }).filter(Boolean);
  return names.length ? '<div class="kb-entry-meta">STKY: ' + stkyEsc(names.join(', ')) + (e.stkyManual ? '' : ' (suggested)') + '</div>' : '';
}
function stkyPromptField(entry) {
  if (!entry || entry.kbType !== 'incident') return '';
  return ',\n  "stky_category_ids": ["ids from this list that the incident falls under, or an empty array if none or unsure: '
    + STKY_CATEGORIES.map(function(c) { return c.id + ' = ' + stkyLabel(c); }).join('; ') + '"]';
}
function stkyResolveIds(entry, parsed) {
  if (entry && entry.stkyManual) return entry.stkyCategoryIds || [];
  var ids = (parsed && Array.isArray(parsed.stky_category_ids)) ? parsed.stky_category_ids : [];
  return ids.filter(function(id, k) { return stkyById(id) && ids.indexOf(id) === k; });
}
function stkyBoxHtml(jha) {
  if (!jha || !Array.isArray(jha.stkyExposures)) return '';
  var rows = [];
  jha.stkyExposures.forEach(function(x, k) {
    var c = x && stkyById(x.categoryId); if (!c) return;
    rows.push('<div class="stky-row">'
      + '<div class="stky-row-head"><span class="stky-energy">' + stkyEsc(c.energy) + '</span><span class="stky-cat">' + stkyEsc(c.name) + '</span>' + (c.trigger ? '<span class="stky-trig">' + stkyEsc(c.trigger) + '</span>' : '') + '</div>'
      + (x.task ? '<div class="stky-task">' + stkyEsc(x.task) + '</div>' : '')
      + '<div class="stky-line"><b>Exposure:</b> <span class="editable-field" contenteditable="false" data-edit="stky-exposure" data-stky="' + k + '">' + stkyEsc(x.exposure || '') + '</span></div>'
      + '<div class="stky-line"><b>Direct control:</b> <span class="editable-field' + (x.directControl ? '' : ' stky-missing') + '" contenteditable="false" data-edit="stky-control" data-stky="' + k + '">' + stkyEsc(x.directControl || STKY_NO_CONTROL) + '</span></div>'
      + '</div>');
  });
  if (!rows.length) {
    return '<div class="stky-box stky-none"><div class="stky-head"><span class="stky-flag">STKY</span><div><div class="stky-title">Stuff That Can Kill You</div>'
      + '<div class="stky-sub">No STKY exposure came up in this planning conversation. If the work changes, tell Petey.</div></div></div></div>';
  }
  return '<div class="stky-box"><div class="stky-head"><span class="stky-flag">STKY</span><div><div class="stky-title">Stuff That Can Kill You</div>'
    + '<div class="stky-sub">' + rows.length + (rows.length === 1 ? ' exposure' : ' exposures') + ' in this plan. Cover these with the crew first.</div></div></div>'
    + rows.join('') + '<div class="stky-foot">' + stkyEsc(STKY_FOOTNOTE) + '</div></div>';
}
