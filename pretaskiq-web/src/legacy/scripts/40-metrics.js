/* ===== Safety metrics ==========================================================================================
   For safety administrators. Leading indicators are counted from what the app already records. OSHA rates (TRIR, DART) need hours worked and a
   recordable / not recordable decision for each injury, both entered here by the administrator. Nothing is estimated: a rate with no hours behind it
   shows as "needs hours", never as zero. */
var mxState = { months: 6, data: null, busy: false };
function mxEl(id) { return document.getElementById(id); }
function mxEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function mxM() { return window.PreTaskIQMetrics; }
function mxNum(v, unit) { if (v === null || v === undefined) return '<span class="mx-na">n/a</span>'; return (typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : mxEsc(v)) + (unit || ''); }

async function openMetrics() {
  var M = mxM(); if (!M) return;
  showScreen('metrics'); try { window.scrollTo(0, 0); } catch (e) {}
  if (!M.enabled()) { mxEl('mx-body').innerHTML = '<section class="inf-sec"><p class="inf-hint">Safety metrics need sign-in, because they are built from your company’s saved records.</p></section>'; return; }
  if (!mxState.data) mxEl('mx-body').innerHTML = '<p class="inf-hint mx-light">Adding up the numbers…</p>';
  await mxReload();
}
async function mxReload() {
  var r = await mxM().load(mxState.months);
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
function mxCard(key, title, unit, lower, hint) {
  var ms = mxState.data.months, cur = ms[ms.length - 1], prev = ms.length > 1 ? ms[ms.length - 2] : null, v = cur[key], pv = prev ? prev[key] : null, delta = '';
  if (v !== null && v !== undefined && pv !== null && pv !== undefined && v !== pv) {
    var up = v > pv, good = lower ? !up : up;
    delta = '<span class="mx-delta ' + (good ? 'good' : 'bad') + '">' + (up ? '&#9650;' : '&#9660;') + ' ' + Math.abs(Math.round((v - pv) * 100) / 100).toLocaleString('en-US') + (unit || '') + ' vs ' + mxEsc(mxM().label(prev.month).split(' ')[0]) + '</span>';
  } else if (v !== null && v !== undefined && pv !== null && pv !== undefined) delta = '<span class="mx-delta">No change vs ' + mxEsc(mxM().label(prev.month).split(' ')[0]) + '</span>';
  return '<div class="mx-card"><small>' + title + '</small><b>' + (v === null || v === undefined ? '<span class="mx-na">' + (hint || 'n/a') + '</span>' : mxNum(v, unit)) + '</b>' + delta + mxSpark(ms.map(function (m) { return m[key]; })) + '</div>';
}
function mxRender() {
  var d = mxState.data, M = mxM(), ms = d.months, cur = ms[ms.length - 1], h = '', cols = M.columns();
  h += '<div class="mx-bar"><label>Show the last <select id="mx-months">' + [3, 6, 12, 24].map(function (n) { return '<option value="' + n + '"' + (n === mxState.months ? ' selected' : '') + '>' + n + ' months</option>'; }).join('') + '</select></label><button type="button" class="btn-primary" data-mx-csv>Download spreadsheet</button></div>';
  h += '<h3 class="mx-h">' + mxEsc(M.label(cur.month)) + ' so far</h3><div class="mx-cards">'
    + mxCard('trir', 'TRIR', '', true, 'needs hours') + mxCard('dart', 'DART rate', '', true, 'needs hours')
    + mxCard('submitRate', 'Plans submitted', '%', false) + mxCard('signRate', 'Crew sign-off', '%', false)
    + mxCard('auditScore', 'Audit score', '%', false) + mxCard('protection', 'Controls in place', '%', false)
    + mxCard('nearMisses', 'Near misses reported', '', false) + mxCard('injuries', 'Injuries reported', '', true) + '</div>';
  var todo = d.injuries.filter(function (i) { return !i.oshaClass; }).length, noHours = ms.filter(function (m) { return m.hours === null; }).length;
  if (todo || noHours) h += '<div class="cadmin-alert jb-alert jb-soon mx-todo"><div><div class="cadmin-alert-title">Needs your input for TRIR and DART</div><div class="cadmin-alert-sub">' + [todo ? todo + ' injur' + (todo === 1 ? 'y' : 'ies') + ' not classified yet' : '', noHours ? noHours + ' month' + (noHours === 1 ? '' : 's') + ' with no hours entered' : ''].filter(Boolean).join(' · ') + '. Until then those rates show as not available.</div></div></div>';

  // hours
  var jobs = d.jobs.slice(0, 8), hv = function (m, j) { var e = d.hours.filter(function (x) { return x.month === m && (x.jobId || '') === (j || ''); })[0]; return e ? e.hours : ''; };
  h += '<section class="inf-sec"><h3>Hours worked</h3><p class="inf-hint">Enter the hours all employees worked each month, for the whole company or job by job. If a month has a whole-company figure, that is the one used for the company rate; otherwise its job figures are added up.</p><div class="mx-scroll"><table class="mx-table mx-hours"><thead><tr><th>Month</th><th>Whole company</th>' + jobs.map(function (j) { return '<th>' + mxEsc(j.name) + '</th>'; }).join('') + '</tr></thead><tbody>'
    + ms.slice().reverse().map(function (m) { return '<tr><th>' + mxEsc(M.label(m.month)) + '</th>' + [{ id: '' }].concat(jobs).map(function (j) { return '<td><input type="number" min="0" step="1" inputmode="decimal" aria-label="Hours for ' + mxEsc(M.label(m.month)) + (j.id ? ', ' + mxEsc(j.name) : ', whole company') + '" data-mx-hours="' + m.month + '" data-mx-job="' + mxEsc(j.id) + '" value="' + hv(m.month, j.id) + '"></td>'; }).join('') + '</tr>'; }).join('')
    + '</tbody></table></div><div id="mx-hours-status" class="voice-status" role="status" aria-live="polite"></div></section>';
  // injuries
  var cls = M.classes();
  h += '<section class="inf-sec"><h3>Injuries to classify</h3><p class="inf-hint">You decide whether each reported injury is recordable under OSHA’s recordkeeping rule (29 CFR Part 1904). PreTaskIQ does not decide that for you; it only counts what you choose.</p>'
    + (d.injuries.length ? d.injuries.map(function (i) {
      return '<div class="jb-doc mx-inj' + (i.oshaClass ? '' : ' mx-open') + '"><div class="jb-doc-main"><b>' + mxEsc(i.title) + '</b><em>' + mxEsc(new Date(i.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })) + (i.oshaClass ? '' : ' · not classified yet') + '</em></div><div class="jb-doc-side"><select aria-label="Classification for ' + mxEsc(i.title) + '" data-mx-class="' + mxEsc(i.id) + '"><option value="">Not classified yet</option>'
        + Object.keys(cls).map(function (k) { return '<option value="' + k + '"' + (i.oshaClass === k ? ' selected' : '') + '>' + mxEsc(cls[k]) + '</option>'; }).join('') + '</select>'
        + (d.jobs.length ? '<select aria-label="Job for ' + mxEsc(i.title) + '" data-mx-injjob="' + mxEsc(i.id) + '"><option value="">No specific job</option>' + d.jobs.map(function (j) { return '<option value="' + mxEsc(j.id) + '"' + (i.jobId === j.id ? ' selected' : '') + '>' + mxEsc(j.name) + '</option>'; }).join('') + '</select>' : '') + '</div></div>';
    }).join('') : '<p class="inf-hint">No injuries were reported in this period.</p>') + '<div id="mx-inj-status" class="voice-status" role="status" aria-live="polite"></div></section>';
  // month table (metrics down the side, months across)
  h += '<section class="inf-sec"><h3>Month by month</h3><div class="mx-scroll"><table class="mx-table"><thead><tr><th>Metric</th>' + ms.map(function (m) { return '<th>' + mxEsc(M.label(m.month)) + '</th>'; }).join('') + '<th>Total</th></tr></thead><tbody>'
    + cols.map(function (c) { return '<tr><th>' + mxEsc(c.label) + '</th>' + ms.concat([d.total]).map(function (m) { return '<td>' + mxNum(m[c.key]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>'
    + '<p class="inf-hint">TRIR = recordable cases × 200,000 ÷ hours worked. DART rate = cases with days away, restricted work or job transfer × 200,000 ÷ hours worked. "n/a" means the number cannot be worked out yet, for example because no hours are entered or no crew was listed. Plans are counted in the month they were made.</p></section>';
  // by job
  var jc = ['plans', 'submitRate', 'signRate', 'injuries', 'hours', 'recordables', 'trir', 'dart'].map(function (k) { return cols.filter(function (c) { return c.key === k; })[0]; });
  h += '<section class="inf-sec"><h3>By job</h3>' + (d.byJob.length ? '<div class="mx-scroll"><table class="mx-table"><thead><tr><th>Job</th>' + jc.map(function (c) { return '<th>' + mxEsc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>'
    + d.byJob.map(function (j) { return '<tr><th>' + mxEsc(j.name) + '</th>' + jc.map(function (c) { return '<td>' + mxNum(j[c.key]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div><p class="inf-hint">A job’s numbers include only what is tied to it: plans made with that job picked, injuries you assign to it above, and hours entered for it. Audits, observations and alerts are not tied to a job, so they appear only in the monthly table.</p>'
    : '<p class="inf-hint">Nothing is tied to a job in this period yet. Plans count toward a job when the foreman picks it while planning.</p>') + '</section>';
  var box = mxEl('mx-body'); box.innerHTML = h;
  mxEl('mx-months').onchange = function () { mxState.months = Number(this.value) || 6; mxReload(); };
  box.onclick = function (ev) { var t = ev.target.closest('[data-mx-csv]'); if (t) mxM().download(mxState.data); };
  box.onchange = async function (ev) {
    var t = ev.target;
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
