/* ===== Safety metrics ==========================================================================================
   For safety administrators. Leading indicators are counted from what the app already records. OSHA rates (TRIR, DART) need hours worked and a
   recordable / not recordable decision for each injury, both entered here by the administrator. Nothing is estimated: a rate with no hours behind it
   shows as "needs hours", never as zero. */
var mxState = { months: 6, job: '', data: null, panel: '', prefs: null };
function mxEl(id) { return document.getElementById(id); }
function mxEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function mxM() { return window.PreTaskIQMetrics; }
function mxNum(v, unit) { if (v === null || v === undefined) return '<span class="mx-na">n/a</span>'; return (typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : mxEsc(v)) + (unit || ''); }
function mxSavePrefs() { mxState.prefs.months = mxState.months; mxM().savePrefs(mxState.prefs); }

async function openMetrics() {
  var M = mxM(); if (!M) return;
  showScreen('metrics'); try { window.scrollTo(0, 0); } catch (e) {}
  if (!M.enabled()) { mxEl('mx-body').innerHTML = '<section class="inf-sec"><p class="inf-hint">Safety metrics need sign-in, because they are built from your company’s saved records.</p></section>'; return; }
  if (!mxState.prefs) { mxState.prefs = M.prefs(); mxState.months = mxState.prefs.months; }
  if (!mxState.data) mxEl('mx-body').innerHTML = '<p class="inf-hint mx-light">Adding up the numbers…</p>';
  await mxReload();
}
async function mxReload() {
  var r = await mxM().load(mxState.months, mxState.job);
  if (!r.ok && mxState.job) { mxState.job = ''; r = await mxM().load(mxState.months, ''); }            // the job was removed: back to the whole company
  if (!r.ok) { mxEl('mx-body').innerHTML = '<section class="inf-sec"><p class="inf-hint" role="alert">' + mxEsc(r.message) + '</p><button type="button" class="btn-primary" onclick="mxReload()">Try again</button></section>'; return; }
  mxState.data = r; mxRender();
}
// A small trend line for one metric across the months. Months with no value leave a gap; the last value gets a dot.
function mxSpark(vals) {
  var pts = vals.map(function (v, i) { return v === null || v === undefined ? null : [i, Number(v)]; }).filter(Boolean);
  if (pts.length < 2) return '<svg class="mx-spark" viewBox="0 0 100 28" aria-hidden="true"></svg>';
  var lo = Math.min.apply(null, pts.map(function (p) { return p[1]; })), hi = Math.max.apply(null, pts.map(function (p) { return p[1]; })), span = hi - lo || 1, n = Math.max(1, vals.length - 1);
  var xy = function (p) { return [(4 + (p[0] / n) * 92).toFixed(1), (24 - ((p[1] - lo) / span) * 20).toFixed(1)]; };
  var d = '', prev = null;
  pts.forEach(function (p) { var c = xy(p); d += (prev !== null && p[0] === prev + 1 ? ' L' : ' M') + c[0] + ' ' + c[1]; prev = p[0]; });
  var last = xy(pts[pts.length - 1]);
  return '<svg class="mx-spark" viewBox="0 0 100 28" aria-hidden="true"><path d="' + d.trim() + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="3" fill="currentColor"/></svg>';
}
function mxCard(col) {
  var key = col.key, unit = col.unit || '', lower = !!col.lower, title = col.label.replace(/ %$/, '');
  var ms = mxState.data.months, cur = ms[ms.length - 1], prev = ms.length > 1 ? ms[ms.length - 2] : null, v = cur[key], pv = prev ? prev[key] : null, delta = '';
  var hint = (key === 'trir' || key === 'dart') && cur.hours === null ? 'needs hours' : (mxState.job && !col.byJob ? 'not tracked by job' : 'n/a');
  if (v !== null && v !== undefined && pv !== null && pv !== undefined && v !== pv) {
    var up = v > pv, good = lower ? !up : up;
    delta = '<span class="mx-delta ' + (good ? 'good' : 'bad') + '">' + (up ? '&#9650;' : '&#9660;') + ' ' + Math.abs(Math.round((v - pv) * 100) / 100).toLocaleString('en-US') + unit + ' vs ' + mxEsc(mxM().label(prev.month).split(' ')[0]) + '</span>';
  } else if (v !== null && v !== undefined && pv !== null && pv !== undefined) delta = '<span class="mx-delta">No change vs ' + mxEsc(mxM().label(prev.month).split(' ')[0]) + '</span>';
  return '<div class="mx-card' + (col.lagging ? ' mx-lag' : '') + '" data-mx-card="' + key + '"><small>' + mxEsc(title) + '</small><b>' + (v === null || v === undefined ? '<span class="mx-na">' + hint + '</span>' : mxNum(v, unit)) + '</b>' + delta + mxSpark(ms.map(function (m) { return m[key]; })) + '</div>';
}
var MX_BY_JOB = { plans: 1, submitted: 1, submitRate: 1, signRate: 1, injuries: 1, hours: 1, recordables: 1, dartCases: 1, trir: 1, dart: 1 };
function mxTable(head, rows) { return '<div class="mx-scroll"><table class="mx-table"><thead><tr>' + head.map(function (x) { return '<th>' + mxEsc(x) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr><th>' + mxEsc(r[0]) + '</th>' + r.slice(1).map(function (c) { return '<td>' + (typeof c === 'string' ? mxEsc(c) : mxNum(c)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>'; }
function mxRender() {
  var d = mxState.data, M = mxM(), ms = d.months, cur = ms[ms.length - 1], h = '', P = mxState.prefs, job = mxState.job;
  var cols = M.columns().map(function (c) { return Object.assign({ byJob: !!MX_BY_JOB[c.key] }, c); }), col = function (k) { return cols.filter(function (c) { return c.key === k; })[0]; };
  h += '<div class="mx-bar"><div class="mx-bar-l"><label>Looking at <select id="mx-job"><option value="">The whole company</option>' + d.jobs.map(function (j) { return '<option value="' + mxEsc(j.id) + '"' + (j.id === job ? ' selected' : '') + '>' + mxEsc(j.name) + '</option>'; }).join('') + '</select></label>'
    + '<label>over the last <select id="mx-months">' + [3, 6, 12, 24].map(function (n) { return '<option value="' + n + '"' + (n === mxState.months ? ' selected' : '') + '>' + n + ' months</option>'; }).join('') + '</select></label></div>'
    + '<div class="mx-bar-r"><button type="button" class="btn-secondary" data-mx-panel="cards" aria-expanded="' + (mxState.panel === 'cards') + '">Customize dashboard</button><button type="button" class="btn-primary" data-mx-panel="report" aria-expanded="' + (mxState.panel === 'report') + '">Create report</button></div></div>';
  if (mxState.panel === 'cards') {
    var box = function (c) { return '<label class="mx-check"><input type="checkbox" data-mx-pick="' + c.key + '"' + (P.cards.indexOf(c.key) !== -1 ? ' checked' : '') + '> ' + mxEsc(c.label) + '</label>'; };
    h += '<section class="inf-sec mx-panel"><h3>Choose what your dashboard shows</h3><p class="inf-hint">Tick the numbers you want as cards. Your choice is remembered on this device.</p><h4>Leading indicators</h4><div class="mx-checks">' + cols.filter(function (c) { return !c.lagging; }).map(box).join('') + '</div><h4>Lagging indicators</h4><div class="mx-checks">' + cols.filter(function (c) { return c.lagging; }).map(box).join('') + '</div>'
      + '<div class="ir-submit-row"><button type="button" class="btn-secondary" data-mx-reset>Back to the standard set</button><button type="button" class="btn-primary" data-mx-panel="cards">Done</button></div></section>';
  }
  if (mxState.panel === 'report') {
    h += '<section class="inf-sec mx-panel"><h3>Create a report</h3><p class="inf-hint">Switch off anything you do not want in the report, then download it as a spreadsheet. It covers ' + mxEsc(d.scope || 'the whole company') + ' for the last ' + mxState.months + ' months.</p><div class="mx-checks mx-checks-1">'
      + M.reportSections().map(function (s) { var off = P.report[s.key] === false, na = job && (s.key !== 'months' && s.key !== 'lagging'); return '<label class="mx-check' + (na ? ' mx-off' : '') + '"><input type="checkbox" data-mx-rep="' + s.key + '"' + (!off && !na ? ' checked' : '') + (na ? ' disabled' : '') + '> ' + mxEsc(s.label) + (na ? ' (whole company only)' : '') + '</label>'; }).join('')
      + '</div><div class="ir-submit-row"><button type="button" class="btn-primary" data-mx-csv>Download spreadsheet</button><button type="button" class="btn-secondary" data-mx-panel="report">Close</button></div></section>';
  }
  h += '<h3 class="mx-h">' + mxEsc(d.scope || 'Whole company') + ' · ' + mxEsc(M.label(cur.month)) + ' so far</h3>';
  var cards = P.cards.map(col).filter(Boolean);
  h += cards.length ? '<div class="mx-cards">' + cards.map(mxCard).join('') + '</div>' : '<p class="inf-hint mx-light">No cards chosen. Use Customize dashboard to pick some.</p>';
  if (job) h += '<p class="inf-hint mx-light">For one job, only what is tied to that job can be shown: plans made with the job picked, injuries assigned to it, and its hours. Audits, observations and alerts are not tied to a job yet.</p>';

  if (!job) {
    var a = d.audits, o = d.observations;
    h += '<section class="inf-sec"><h3>Audits</h3>' + (a.byTemplate.length ? mxTable(['Template', 'Audits', 'Average score %', 'No failed items %', 'Failed items'], a.byTemplate.map(function (t) { return [t.title, t.audits, t.avgScore, t.cleanRate, t.failedItems]; }))
      + (a.topFails.length ? '<h4>Items that fail most often</h4>' + mxTable(['Item', 'Template', 'Times failed'], a.topFails.map(function (f) { return [f.text, f.template, f.fails]; })) : '<p class="inf-hint">No audit items failed in this period.</p>')
      : '<p class="inf-hint">No audits were done in this period.</p>') + '</section>';
    h += '<section class="inf-sec"><h3>Observations</h3>' + (o.byCategory.length ? mxTable(['Category', 'Observations', 'Controls in place %', 'Prevention %', 'Mitigation %'], o.byCategory.map(function (c) { return [c.label, c.n, c.protection, c.prevention, c.mitigation]; }))
      + (o.gaps.length ? '<h4>Controls most often not in place</h4>' + mxTable(['Control', 'Category', 'Kind', 'Times required', 'Not in place', 'Gap %'], o.gaps.map(function (g) { return [g.text, g.label, g.kind, g.required, g.notInPlace, g.gapRate]; })) : '<p class="inf-hint">Every required control was in place in this period.</p>')
      + (o.naRate !== null ? '<p class="inf-hint">' + mxNum(o.naRate, '%') + ' of the checks were marked "does not apply".</p>' : '')
      : '<p class="inf-hint">No observations were recorded in this period.</p>') + '</section>';
  }
  // month table (metrics down the side, months across); for one job, only the rows that can be tied to a job
  var rowsCols = cols.filter(function (c) { return !job || c.byJob; });
  var monthTable = function (list) { return '<div class="mx-scroll"><table class="mx-table"><thead><tr><th>Metric</th>' + ms.map(function (m) { return '<th>' + mxEsc(M.label(m.month)) + '</th>'; }).join('') + '<th>Total</th></tr></thead><tbody>'
    + list.map(function (c) { return '<tr><th>' + mxEsc(c.label) + '</th>' + ms.concat([d.total]).map(function (m) { return '<td>' + mxNum(m[c.key]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>'; };
  h += '<section class="inf-sec"><h3>Leading indicators, month by month</h3>' + monthTable(rowsCols.filter(function (c) { return !c.lagging; })) + '<p class="inf-hint">"n/a" means the number cannot be worked out yet, for example because no crew was listed or nothing was recorded. Plans are counted in the month they were made.</p></section>';
  if (!job) {
    var jc = ['plans', 'submitRate', 'signRate', 'injuries', 'hours', 'recordables', 'trir', 'dart'].map(col);
    h += '<section class="inf-sec"><h3>By job</h3>' + (d.byJob.length ? mxTable(['Job'].concat(jc.map(function (c) { return c.label; })), d.byJob.map(function (j) { return [j.name].concat(jc.map(function (c) { return j[c.key]; })); })) + '<p class="inf-hint">A job’s numbers include only what is tied to it. Pick a job at the top to see its own dashboard.</p>'
      : '<p class="inf-hint">Nothing is tied to a job in this period yet. Plans count toward a job when the foreman picks it while planning.</p>') + '</section>';
  }
  // lagging: OSHA rates, with what they need
  var todo = d.injuries.filter(function (i) { return !i.oshaClass; }).length, noHours = ms.filter(function (m) { return m.hours === null; }).length;
  h += '<section class="inf-sec"><h3>Lagging indicators: injuries and OSHA rates</h3>' + ((todo || noHours) ? '<div class="cadmin-alert jb-alert jb-soon mx-todo"><div><div class="cadmin-alert-title">Needs your input for TRIR and DART</div><div class="cadmin-alert-sub">' + [todo ? todo + ' injur' + (todo === 1 ? 'y' : 'ies') + ' not classified yet' : '', noHours ? noHours + ' month' + (noHours === 1 ? '' : 's') + ' with no hours entered' : ''].filter(Boolean).join(' · ') + '. Until then those rates show as not available.</div></div></div>' : '')
    + monthTable(rowsCols.filter(function (c) { return c.lagging; })) + '<p class="inf-hint">TRIR = recordable cases × 200,000 ÷ hours worked. DART rate = cases with days away, restricted work or job transfer × 200,000 ÷ hours worked.</p>';
  if (!job) {
    var jobs = d.jobs.slice(0, 8), hv = function (m, j) { var e = d.hours.filter(function (x) { return x.month === m && (x.jobId || '') === (j || ''); })[0]; return e ? e.hours : ''; };
    h += '<h4>Hours worked</h4><p class="inf-hint">Enter the hours all employees worked each month, for the whole company or job by job. If a month has a whole-company figure, that is the one used for the company rate; otherwise its job figures are added up.</p><div class="mx-scroll"><table class="mx-table mx-hours"><thead><tr><th>Month</th><th>Whole company</th>' + jobs.map(function (j) { return '<th>' + mxEsc(j.name) + '</th>'; }).join('') + '</tr></thead><tbody>'
      + ms.slice().reverse().map(function (m) { return '<tr><th>' + mxEsc(M.label(m.month)) + '</th>' + [{ id: '' }].concat(jobs).map(function (j) { return '<td><input type="number" min="0" step="1" inputmode="decimal" aria-label="Hours for ' + mxEsc(M.label(m.month)) + (j.id ? ', ' + mxEsc(j.name) : ', whole company') + '" data-mx-hours="' + m.month + '" data-mx-job="' + mxEsc(j.id) + '" value="' + hv(m.month, j.id) + '"></td>'; }).join('') + '</tr>'; }).join('')
      + '</tbody></table></div><div id="mx-hours-status" class="voice-status" role="status" aria-live="polite"></div>';
  } else h += '<p class="inf-hint">To enter hours, switch to The whole company at the top.</p>';
  var cls = M.classes();
  h += '<h4>Injuries to classify</h4><p class="inf-hint">You decide whether each reported injury is recordable under OSHA’s recordkeeping rule (29 CFR Part 1904). PreTaskIQ does not decide that for you; it only counts what you choose.</p>'
    + (d.injuries.length ? d.injuries.map(function (i) {
      return '<div class="jb-doc mx-inj' + (i.oshaClass ? '' : ' mx-open') + '"><div class="jb-doc-main"><b>' + mxEsc(i.title) + '</b><em>' + mxEsc(new Date(i.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })) + (i.oshaClass ? '' : ' · not classified yet') + '</em></div><div class="jb-doc-side"><select aria-label="Classification for ' + mxEsc(i.title) + '" data-mx-class="' + mxEsc(i.id) + '"><option value="">Not classified yet</option>'
        + Object.keys(cls).map(function (k) { return '<option value="' + k + '"' + (i.oshaClass === k ? ' selected' : '') + '>' + mxEsc(cls[k]) + '</option>'; }).join('') + '</select>'
        + (d.jobs.length ? '<select aria-label="Job for ' + mxEsc(i.title) + '" data-mx-injjob="' + mxEsc(i.id) + '"><option value="">No specific job</option>' + d.jobs.map(function (j) { return '<option value="' + mxEsc(j.id) + '"' + (i.jobId === j.id ? ' selected' : '') + '>' + mxEsc(j.name) + '</option>'; }).join('') + '</select>' : '') + '</div></div>';
    }).join('') : '<p class="inf-hint">No injuries were reported in this period.</p>') + '<div id="mx-inj-status" class="voice-status" role="status" aria-live="polite"></div></section>';

  var body = mxEl('mx-body'); body.innerHTML = h;
  mxEl('mx-months').onchange = function () { mxState.months = Number(this.value) || 6; mxSavePrefs(); mxReload(); };
  mxEl('mx-job').onchange = function () { mxState.job = this.value; mxReload(); };
  body.onclick = function (ev) {
    var t = ev.target.closest('button'); if (!t) return;
    if (t.hasAttribute('data-mx-panel')) { var p = t.getAttribute('data-mx-panel'); mxState.panel = mxState.panel === p ? '' : p; mxRender(); return; }
    if (t.hasAttribute('data-mx-reset')) { mxState.prefs.cards = M.DEFAULT_CARDS.slice(); mxSavePrefs(); mxRender(); return; }
    if (t.hasAttribute('data-mx-csv')) { var inc = {}; M.reportSections().forEach(function (s) { var b = body.querySelector('[data-mx-rep="' + s.key + '"]'); inc[s.key] = !!(b && b.checked); }); M.download(mxState.data, inc); }
  };
  body.onchange = async function (ev) {
    var t = ev.target;
    if (t.hasAttribute('data-mx-pick')) {
      var k = t.getAttribute('data-mx-pick'), order = cols.map(function (c) { return c.key; }), set = P.cards.filter(function (x) { return x !== k; }); if (t.checked) set.push(k);
      P.cards = order.filter(function (x) { return set.indexOf(x) !== -1; }); mxSavePrefs(); mxRender(); return;
    }
    if (t.hasAttribute('data-mx-rep')) { P.report[t.getAttribute('data-mx-rep')] = t.checked; mxSavePrefs(); return; }
    if (t.hasAttribute('data-mx-hours')) {
      var st = mxEl('mx-hours-status'), raw = t.value.trim(); st.textContent = 'Saving…';
      var r = await mxM().setHours(t.getAttribute('data-mx-hours'), t.getAttribute('data-mx-job'), raw === '' ? null : Number(raw));
      if (!r.ok) { st.textContent = r.message; return; }
      await mxReload(); var s2 = mxEl('mx-hours-status'); if (s2) s2.textContent = 'Saved.';
    } else if (t.hasAttribute('data-mx-class') || t.hasAttribute('data-mx-injjob')) {
      var id = t.getAttribute('data-mx-class') || t.getAttribute('data-mx-injjob'), row = t.closest('.mx-inj'), c = row.querySelector('[data-mx-class]'), j = row.querySelector('[data-mx-injjob]'), si = mxEl('mx-inj-status');
      si.textContent = 'Saving…';
      var r2 = await mxM().classify(id, c.value, j ? j.value : '');
      if (!r2.ok) { si.textContent = r2.message; return; }
      await mxReload(); var s3 = mxEl('mx-inj-status'); if (s3) s3.textContent = 'Saved.';
    }
  };
}
