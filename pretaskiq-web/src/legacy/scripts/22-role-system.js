// ── Three-way role system ────────────────────────────────────────────
// currentRole declared in main script above

var ROLE_MENUS = {
  foreman: {
    header: { icon: '⛑', title: 'Foreman', desc: 'Plan tasks, talk to Petey, execute safely.' },
    sections: [
      {
        label: 'Field Tools',
        items: [
          { icon: '📋', label: 'New JHA', sub: 'Start a pre-task hazard analysis', action: "showScreen('intake'); closeNavDropdown();" },
          { icon: '🎙️', label: 'Petey', sub: 'Procedure tracking, policy recall, escalation', action: "showScreen('petey'); closeNavDropdown();" },
        ]
      }
    ]
  },
  safety: {
    header: { icon: '🦺', title: 'Safety Administrator', desc: 'Manage the safety knowledge base Petey draws from in every pre-task conversation.' },
    sections: [
      {
        label: 'Field Tools',
        items: [
          { icon: '📋', label: 'New JHA', sub: 'Start a pre-task hazard analysis', action: "showScreen('intake'); closeNavDropdown();" },
          { icon: '🎙️', label: 'Petey', sub: 'Field companion', action: "showScreen('petey'); closeNavDropdown();" },
        ]
      },
      {
        label: 'Dashboards & Alerts',
        items: [
          { icon: '📊', label: 'Safety Dashboard', sub: 'Live JHA completion across all crews', action: "switchRole('admin'); closeNavDropdown();" },
          { icon: '🚨', label: 'Safety Alerts Inbox', sub: 'Hazards flagged by crews (needs sign-in)', action: "closeNavDropdown(); if (window.PreTaskIQAlerts && PreTaskIQAlerts.enabled()) PreTaskIQAlerts.openDialog(); else alert('The safety inbox works once sign-in is turned on.');" },
        ]
      },
      {
        label: 'Incidents',
        items: [
          { icon: '⚠️', label: 'Upload Incident', sub: 'Petey surfaces lessons learned in context', action: "openSettingsToKb('incident'); closeNavDropdown();" },
          { icon: '🎬', label: 'Incident Reenactments', sub: 'Draft, review and approve replays (open an incident, then Create reenactment)', action: "openSettingsToKb('incident'); closeNavDropdown();" },
        ]
      },
      {
        label: 'Root Cause Analyses',
        items: [
          { icon: '🔍', label: 'Upload Root Cause Analysis', sub: 'Corrective actions Petey can probe for', action: "openSettingsToKb('rca'); closeNavDropdown();" },
        ]
      },
      {
        label: 'Policies & Procedures',
        items: [
          { icon: '📋', label: 'Upload Policy', sub: 'Safety and operational policies', action: "openSettingsToKb('policy'); closeNavDropdown();" },
          { icon: '📝', label: 'Upload Procedure', sub: 'Step-by-step procedures Petey can track live', action: "openSettingsToKb('procedure'); closeNavDropdown();" },
        ]
      },
      {
        label: 'Setup',
        items: [
          { icon: '👥', label: 'Escalation Contacts', sub: 'Names for hazard flags (alerts go to the safety inbox)', action: "openSettingsModal(); closeNavDropdown();", id: 'settings-open-btn' },
        ]
      }
    ]
  },
  construction: {
    header: { icon: '🏗️', title: 'Construction Administrator', desc: 'Keep Petey current on project documents so crews never execute on outdated information.' },
    sections: [
      {
        label: '📐 Drawing Revision Management',
        items: [
          { icon: '⬆️', label: 'Upload Revised Drawing', sub: 'Petey intercepts crews before they pull to old routing', action: "openSettingsToKb('drawings'); closeNavDropdown();" },
          { icon: '▶️', label: 'Demo — Revision Intercept', sub: 'See Petey catch a change before cables land wrong', action: "showScreen('petey'); runPeteyDemo('drawing'); closeNavDropdown();" },
        ]
      },
      {
        label: '📬 RFI Awareness',
        items: [
          { icon: '⬆️', label: 'Upload RFI Response', sub: 'Open RFIs surface as hold points before work starts', action: "openSettingsToKb('drawings'); closeNavDropdown();" },
          { icon: '🔒', label: 'Connect project management platform', sub: 'Direct sync with your project management platform — coming soon', action: '', disabled: true },
        ]
      },
      {
        label: '🔄 Scope Change Tracking',
        items: [
          { icon: '⬆️', label: 'Upload Scope Change', sub: 'Petey updates the live JHA when scope shifts', action: "openSettingsToKb('drawings'); closeNavDropdown();" },
          { icon: '▶️', label: 'Demo — Scope Change', sub: 'Petey catches added energized work mid-shift', action: "showScreen('petey'); runPeteyDemo('scope'); closeNavDropdown();" },
        ]
      },
      {
        label: 'Site Overview',
        items: [
          { icon: '📊', label: 'Superintendent Dashboard', sub: 'Real-time work front status across all crews', action: "switchRole('admin'); closeNavDropdown();" },
        ]
      }
    ]
  }
};

function setRole(role) {
  currentRole = role;

  // Update toggle buttons
  ['foreman','safety','construction'].forEach(function(r) {
    var btn = document.getElementById('role-btn-' + r);
    if (btn) btn.classList.toggle('active', r === role);
  });

  // Switch main screen based on role
  if (role === 'foreman') {
    showScreen('intake');
  } else if (role === 'safety') {
    // Safety admin sees the safety dashboard (admin screen)
    showScreen('admin');
    startAdminClock();
    renderAdminCrews();
  } else if (role === 'construction') {
    showScreen('construction');
  }

  // Rebuild context menu for this role
  renderRoleMenu(role);
  closeNavDropdown();
}

function renderRoleMenu(role) {
  var dd = document.getElementById('nav-dropdown-context');
  if (!dd) return;
  var cfg = ROLE_MENUS[role];
  if (!cfg) return;

  var html = '<div style="background:#F5F4F0;padding:10px 16px 8px;border-bottom:1px solid #E8ECF0;">'
    + '<div style="font-size:12px;font-weight:800;color:var(--navy);">' + cfg.header.icon + ' ' + cfg.header.title + '</div>'
    + '<div style="font-size:11px;color:#777;margin-top:2px;line-height:1.4;">' + cfg.header.desc + '</div>'
    + '</div>';

  cfg.sections.forEach(function(section, si) {
    if (si > 0) html += '<div class="nav-dropdown-divider"></div>';
    html += '<div class="nav-dropdown-section">';
    html += '<div class="nav-dropdown-label">' + section.label + '</div>';
    section.items.forEach(function(item) {
      var disabled = item.disabled ? 'style="opacity:0.45;cursor:default;"' : '';
      var onclick = item.action ? 'onclick="' + item.action.replace(/"/g, '&quot;') + '"' : '';
      var idAttr = item.id ? 'id="' + item.id + '"' : '';
      html += '<button class="nav-dropdown-item" ' + onclick + ' ' + idAttr + ' ' + disabled + '>'
        + '<span class="item-icon">' + item.icon + '</span>'
        + '<div><div>' + item.label + '</div>'
        + '<div class="item-sub">' + item.sub + '</div></div>'
        + '</button>';
    });
    html += '</div>';
  });

  dd.innerHTML = html;
}

// switchRole handled by original function above

// Init on load
document.addEventListener('DOMContentLoaded', function() {
  renderRoleMenu('foreman');
});
