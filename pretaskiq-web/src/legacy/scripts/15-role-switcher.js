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

function renderAdminCrews() {
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

  // Animate completion counter
  const target = DEMO_CREWS.filter(c => c.status === 'Completed').length;
  let cur = 0;
  const el = document.getElementById('admin-count');
  if (el) {
    el.textContent = '0';
    const iv = setInterval(() => {
      cur++;
      el.textContent = cur;
      if (cur >= target) clearInterval(iv);
    }, 300);
  }
}
