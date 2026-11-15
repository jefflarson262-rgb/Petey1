/* ============================================================
   Escalation contacts settings modal
   ============================================================ */
const settingsOverlay = document.getElementById("settings-modal-overlay");

function openSettingsModal() {
  // Restore baseline policy preference
  var savedPref = localStorage.getItem('baseline_pref');
  if (savedPref) baselinePolicyPref = savedPref;
  var radio = document.getElementById(baselinePolicyPref === 'replace' ? 'baseline-replace' : 'baseline-layer');
  if (radio) radio.checked = true;

  document.getElementById("settings-safety-name").value = escalationContacts.siteSafetyProfessional.name;
  document.getElementById("settings-safety-contact").value = escalationContacts.siteSafetyProfessional.contact;
  document.getElementById("settings-supervisor-name").value = escalationContacts.crewSupervisor.name;
  document.getElementById("settings-supervisor-contact").value = escalationContacts.crewSupervisor.contact;
  // Populate scope profile fields
  document.getElementById("sp-trade").value = scopeProfile.trade || "";
  document.getElementById("sp-projects").value = scopeProfile.projects || "";
  document.getElementById("sp-equipment").value = scopeProfile.equipment || "";
  document.getElementById("sp-environments").value = scopeProfile.environments || "";
  document.getElementById("sp-exclusions").value = scopeProfile.exclusions || "";
  renderNotificationLog();
  settingsOverlay.style.display = "flex";
}

function closeSettingsModal() {
  settingsOverlay.style.display = "none";
}

function renderNotificationLog() {
  const list = document.getElementById("notification-log-list");
  if (notificationLog.length === 0) {
    list.innerHTML = `<div class="notification-log-empty">No hazards flagged yet this session.</div>`;
    return;
  }
  list.innerHTML = notificationLog.map(entry => `
    <div class="notification-log-item">
      <div class="notification-log-item-time">${escapeHtml(entry.timestamp)} · ${escapeHtml(entry.context)}</div>
      <div class="notification-log-item-text">${escapeHtml(entry.hazard)} — ${escapeHtml(({ delivered: 'in the safety inbox', sending: 'sending to the safety inbox\u2026', failed: 'NOT delivered', screen: 'on this screen only, not sent to anyone' })[entry.delivery] || 'on this screen only, not sent to anyone')}</div>
    </div>
  `).join("");
}

// settings-open-btn is rendered dynamically -- openSettingsModal called directly via onclick
document.getElementById("settings-close-btn").addEventListener("click", closeSettingsModal);
settingsOverlay.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) closeSettingsModal();
});

document.getElementById("settings-save-btn").addEventListener("click", () => {
  // Save baseline policy preference
  const baselineRadio = document.querySelector('input[name="baseline-pref"]:checked');
  if (baselineRadio) {
    baselinePolicyPref = baselineRadio.value;
    localStorage.setItem('baseline_pref', baselinePolicyPref);
  }

  // Save scope profile
  scopeProfile = {
    trade: document.getElementById("sp-trade").value.trim(),
    projects: document.getElementById("sp-projects").value.trim(),
    equipment: document.getElementById("sp-equipment").value.trim(),
    environments: document.getElementById("sp-environments").value.trim(),
    exclusions: document.getElementById("sp-exclusions").value.trim()
  };
  saveScopeProfile();

  // Save escalation contacts
  escalationContacts = {
    siteSafetyProfessional: {
      name: document.getElementById("settings-safety-name").value.trim() || "Site Safety Professional",
      role: "Site Safety Professional",
      contact: document.getElementById("settings-safety-contact").value.trim()
    },
    crewSupervisor: {
      name: document.getElementById("settings-supervisor-name").value.trim() || "Crew Supervisor",
      role: "Crew Supervisor / Site Manager",
      contact: document.getElementById("settings-supervisor-contact").value.trim()
    }
  };
  closeSettingsModal();
});
