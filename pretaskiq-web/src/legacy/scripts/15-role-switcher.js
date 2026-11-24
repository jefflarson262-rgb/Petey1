// ─── Role Switcher ──────────────────────────────────────────────────
let currentRole = 'foreman';

function switchRole(role) {
  if (role === 'admin') {
    showScreen('admin');
    startAdminClock();
    renderAdminCrews();
  } else {
    showScreen('intake');
  }
}

// ─── Admin Clock ─────────────────────────────────────────────────────
let adminClockInterval = null;
function startAdminClock() {
  function tick() {
    const now = new Date();
    const h = now.getHours().toString().padStart(2,'0');
    const m = now.getMinutes().toString().padStart(2,'0');
    const el = document.getElementById('admin-clock');
    if (el) el.textContent = h + ':' + m;
  }
  tick();
  if (adminClockInterval) clearInterval(adminClockInterval);
  adminClockInterval = setInterval(tick, 60000);
}

// ─── Admin Crew Data ─────────────────────────────────────────────────
const DEMO_CREWS = [
  { name: 'Bldg 2 Electrical',   badge: 'HIGH', status: 'Completed', statusBg: '#D1FAE5', statusColor: '#065F46', seg: 5, segColor: '#10B981', cleared: true  },
  { name: 'Roof Mechanical',      badge: 'MED',  status: 'Completed', statusBg: '#D1FAE5', statusColor: '#065F46', seg: 5, segColor: '#10B981', cleared: true  },
  { name: 'Curtain Wall — South', badge: 'HIGH', status: 'Signing',   statusBg: '#FEF3C7', statusColor: '#92400E', seg: 3, segColor: '#F59E0B', cleared: false },
  { name: 'L3 Plumbing',          badge: 'MED',  status: 'Completed', statusBg: '#D1FAE5', statusColor: '#065F46', seg: 5, segColor: '#10B981', cleared: true  },
  { name: 'Fire Protection',      badge: 'MED',  status: 'Review',    statusBg: '#EDE9FE', statusColor: '#7C3AED', seg: 2, segColor: '#7C3AED', cleared: false },
  { name: 'Site Civil / Grading', badge: 'LOW',  status: 'Completed', statusBg: '#D1FAE5', statusColor: '#065F46', seg: 5, segColor: '#10B981', cleared: true  },
];

// Real data (signed in as an administrator): every plan changed today, from /api/plans?overview=1. Not signed in: the sample list above, labelled as sample data.
const OV_STATUS = {
  planning:  { text: 'Planning',          bg: '#F1F5F9', color: '#475569', seg: 1, segColor: '#94A3B8' },
  signing:   { text: 'Crew signing',      bg: '#FEF3C7', color: '#92400E', seg: 3, segColor: '#F59E0B' },
  ready:     { text: 'Ready to submit',   bg: '#DBEAFE', color: '#1E40AF', seg: 4, segColor: '#3B82F6' },
  submitted: { text: 'Submitted',         bg: '#D1FAE5', color: '#065F46', seg: 5, segColor: '#10B981' },
  changed:   { text: 'Changed — resubmit', bg: '#EDE9FE', color: '#7C3AED', seg: 3, segColor: '#7C3AED' },
};
let adminRenderSeq = 0;

function adminSet(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function adminShow(id, on) { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; }
function adminStats(done, total, changed) {
  adminSet('admin-qi-plans', String(total)); adminSet('admin-qi-done', String(done)); adminSet('admin-qi-changed', String(changed));
  const pct = total ? Math.round(done * 100 / total) : 0;
  adminSet('admin-pct', pct + '%');
  const f = document.getElementById('admin-bar-fill'); if (f) f.style.width = pct + '%';
}
function adminCount(target) {
  const el = document.getElementById('admin-count');
  if (!el) return;
  if (el._iv) clearInterval(el._iv);
  let cur = 0;
  el.textContent = '0';
  if (target <= 0) return;
  el._iv = setInterval(() => { cur++; el.textContent = cur; if (cur >= target) clearInterval(el._iv); }, 300);
}

function renderAdminDemo() {
  adminSet('admin-count-label', 'JHA Completed Today');
  adminSet('admin-denom', ' / ' + DEMO_CREWS.length + ' groups');
  adminSet('admin-count-sub', 'Sample data. Sign in to see your real plans here.');
  adminSet('admin-list-label', 'Sample work groups · not real data');
  adminSet('admin-flag-chip', 'Sample');
  adminShow('admin-flag-card', true);
  const list = document.getElementById('admin-crew-list');
  if (!list) return;
  list.innerHTML = DEMO_CREWS.map(c => `
    <div class="crew-row-card">
      <div class="crew-color-bar" style="background:${c.segColor};"></div>
      <div class="crew-info">
        <div class="crew-name-row">
          <span class="risk-badge ${c.badge}">${c.badge}</span>
          <span class="crew-name">${c.name}</span>
          <span class="crew-status-pill" style="background:${c.statusBg};color:${c.statusColor};margin-left:auto;">${c.status}</span>
        </div>
        <div class="crew-seg-bar">
          ${[1,2,3,4,5].map(i => `<div class="crew-seg" style="background:${i<=c.seg ? c.segColor : '#E8ECF0'};"></div>`).join('')}
        </div>
      </div>
      ${c.cleared ? '<div class="crew-cleared">✓ Cleared</div>' : ''}
    </div>
  `).join('');
  const demoDone = DEMO_CREWS.filter(c => c.status === 'Completed').length;
  adminStats(demoDone, DEMO_CREWS.length, DEMO_CREWS.filter(c => c.status === 'Review').length);
  adminCount(demoDone);
}

function overviewRowHtml(p) {
  const st = OV_STATUS[p.status] || OV_STATUS.planning;
  const badge = p.risk === 'high' ? 'HIGH' : p.risk === 'medium' ? 'MED' : p.risk === 'low' ? 'LOW' : '';
  const who = [p.foreman || 'Unknown foreman', p.area].filter(Boolean).join(' · ');
  const crew = p.crew && p.crew.total ? p.crew.signed + ' of ' + p.crew.total + ' signed' : 'No crew listed';
  const when = p.updated_at ? new Date(p.updated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  return `
    <div class="crew-row-card">
      <div class="crew-color-bar" style="background:${st.segColor};"></div>
      <div class="crew-info">
        <div class="crew-name-row">
          ${badge ? `<span class="risk-badge ${badge}">${badge}</span>` : ''}
          <span class="crew-name">${escapeHtml(p.task)}</span>
          <span class="crew-status-pill" style="background:${st.bg};color:${st.color};margin-left:auto;">${escapeHtml(st.text)}</span>
        </div>
        <div style="font-size:13px;color:#555;margin:-3px 0 8px;">${escapeHtml(who)}</div>
        <div class="crew-seg-bar">
          ${[1,2,3,4,5].map(i => `<div class="crew-seg" style="background:${i<=st.seg ? st.segColor : '#E8ECF0'};"></div>`).join('')}
        </div>
        <div style="font-size:12px;color:#888;margin-top:6px;">Rev ${p.revision} · ${escapeHtml(crew)}${when ? ' · updated ' + escapeHtml(when) : ''}</div>
      </div>
    </div>`;
}

function renderOverview(plans) {
  const list = document.getElementById('admin-crew-list');
  const done = plans.filter(p => p.status === 'submitted').length;
  adminSet('admin-count-label', 'Plans Submitted Today');
  adminSet('admin-denom', ' / ' + plans.length + ' plan' + (plans.length === 1 ? '' : 's'));
  adminSet('admin-count-sub', 'Counts plans saved or changed today. Submitted = the crew signed and the foreman submitted it.');
  adminSet('admin-list-label', 'Plans worked on today · foreman, task and work area');
  adminStats(done, plans.length, plans.filter(p => p.status === 'changed').length);
  adminCount(done);
  // The flag card: plans that were submitted and then changed. Only shown when there are some.
  const changed = plans.filter(p => p.status === 'changed');
  if (changed.length) {
    const c = changed[0];
    adminSet('admin-flag-chip', 'Changed after submission');
    adminSet('admin-flag-time', changed.length > 1 ? changed.length + ' plans' : '');
    adminSet('admin-flag-title', c.task + ' · Rev ' + c.revision);
    adminSet('admin-flag-sub', (c.foreman || 'The foreman') + (c.area ? ' · ' + c.area : '') + '. The plan changed after it was submitted, and it has not been submitted again.');
    adminShow('admin-flag-card', true);
  } else adminShow('admin-flag-card', false);
  if (!list) return;
  list.innerHTML = plans.length ? plans.map(overviewRowHtml).join('')
    : '<div class="admin-card" style="color:#777;font-size:14px;">No plans have been saved or changed today yet.</div>';
}

function renderAdminCrews() {
  const store = window.PreTaskIQStore;
  if (!store || !store.enabled || !store.enabled() || !store.listOverview) { renderAdminDemo(); return; }
  const seq = ++adminRenderSeq;
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  adminSet('admin-count-sub', 'Loading today’s plans…');
  store.listOverview(midnight.toISOString()).then(out => {
    if (seq === adminRenderSeq) renderOverview(out.plans || []);
  }).catch(e => {
    if (seq !== adminRenderSeq) return;
    adminShow('admin-flag-card', false);
    adminSet('admin-count-sub', 'Could not load today’s plans' + (e && e.message ? ': ' + e.message : '.'));
    const list = document.getElementById('admin-crew-list');
    if (list) list.innerHTML = '';
  });
}
