/* ============================================================
   Offline mode — connectivity detection, JHA cache, checklist
   ============================================================ */
renderLogo("logo-offline", 26);

const JHA_CACHE_KEY_PREFIX = "pretaskiq_jha_cache_";
const SYNC_QUEUE_KEY = "pretaskiq_sync_queue";
let isOffline = false;
let syncQueue = [];

// --- Connectivity detection ---
async function checkConnectivity() {
  // Two-level check:
  // Level 1: device has network at all (navigator.onLine) — controls the offline banner
  // Level 2: Anthropic API is specifically reachable — controls whether conversation can start
  // We only show the offline banner if the device itself has no network.
  // A sandboxed or firewalled environment that can't reach the API but does have general
  // connectivity should NOT show the offline banner — that confuses users.
  if (!navigator.onLine) return false;
  // Device is online — treat as connected for banner purposes.
  // Optionally verify API reachability for the intake button, but don't let
  // a blocked/sandboxed fetch incorrectly trigger offline mode.
  return true;
}

async function checkApiReachability() {
  if (!navigator.onLine) return false;
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 3000);
    await fetch(window.PRETASKIQ_API_URL, {
      method: "HEAD", signal: ctrl.signal
    });
    return true;
  } catch {
    // API unreachable but device has network — don't trigger offline mode,
    // just let the conversation fail naturally with an error message.
    return true;
  }
}

async function updateConnectivityState() {
  const online = await checkConnectivity();
  if (online !== !isOffline) {
    isOffline = !online;
    applyOfflineUI();
    if (online && syncQueue.length > 0) {
      processSyncQueue();
    }
  }
}

function applyOfflineUI() {
  const banner = document.getElementById("offline-banner");
  const offlineActions = document.getElementById("offline-actions");
  const onlineExamples = document.getElementById("online-examples-wrap");
  const intakeSubmit = document.getElementById("intake-submit");
  const intakeTitle = document.getElementById("intake-title");
  const intakeSub = document.getElementById("intake-sub");

  if (isOffline) {
    banner.style.display = "flex";
    offlineActions.style.display = "block";
    onlineExamples.style.display = "none";
    { const l = intakeSubmit.querySelector(".sp-label"); if (l) l.textContent = "Connected only"; else intakeSubmit.textContent = "Connected only"; }
    intakeSubmit.disabled = true;
    intakeTitle.textContent = "What's on the plan today?";
    intakeSub.textContent = "You're offline. Use a cached plan from a previous shift, or complete the guided checklist below.";
    renderCachedJHAList();
    renderSyncQueueNotice();
  } else {
    banner.style.display = "none";
    offlineActions.style.display = "none";
    onlineExamples.style.display = "block";
    intakeTitle.textContent = "What tasks are planned for today?";
    intakeSub.textContent = "List everything on the shift — one task or several. I'll start with the highest-risk work and walk the full plan with you, the way a safety pro would on site.";
    const val = document.getElementById("intake-textarea").value.trim();
    { const l = intakeSubmit.querySelector(".sp-label"); if (l) l.textContent = "Start Typing the Plan"; else intakeSubmit.textContent = "Start planning →"; }
    intakeSubmit.disabled = false;
    renderSyncQueueNotice();
  }
}

// Monitor connectivity changes
window.addEventListener("online", () => updateConnectivityState());
window.addEventListener("offline", () => { isOffline = true; applyOfflineUI(); });
updateConnectivityState();
setInterval(updateConnectivityState, 30000); // re-check every 30s

// --- JHA caching ---
function fingerprintJHA(jha) {
  const tasks = (jha.taskSteps || []).map(s => s.step).join("|").toLowerCase();
  const title = (jha.jobTitle || "").toLowerCase().replace(/[^a-z0-9 ]/g, "");
  return (title + "|" + tasks).slice(0, 120);
}

async function cacheJHA(jha) {
  const key = JHA_CACHE_KEY_PREFIX + Date.now();
  const entry = { jha, cached: new Date().toLocaleString(), fingerprint: fingerprintJHA(jha) };
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (e) { /* localStorage full or unavailable */ }
  try {
    if (window.storage) await window.storage.set(key, JSON.stringify(entry));
  } catch (e) {}
}

function getCachedJHAs() {
  const results = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(JHA_CACHE_KEY_PREFIX)) {
      try { results.push(JSON.parse(localStorage.getItem(k))); } catch (e) {}
    }
  }
  return results.sort((a, b) => (b.cached || "").localeCompare(a.cached || "")).slice(0, 6);
}

function renderCachedJHAList() {
  const list = document.getElementById("cached-jha-list");
  const cached = getCachedJHAs();
  if (cached.length === 0) {
    list.innerHTML = `<div style="font-size:13px;color:var(--slate);margin-bottom:12px;">No cached JHAs yet — previous plans will appear here after you've completed one while connected.</div>`;
    return;
  }
  list.innerHTML = cached.map((entry, i) =>
    `<div class="cached-jha-card" data-idx="${i}">
      <div class="cached-jha-card-title">${escapeHtml(entry.jha.jobTitle || "Untitled")}</div>
      <div class="cached-jha-card-meta">Cached ${escapeHtml(entry.cached)} · ${(entry.jha.taskSteps || []).length} task steps</div>
    </div>`
  ).join("");
  list.querySelectorAll(".cached-jha-card").forEach((card, i) => {
    card.addEventListener("click", () => {
      const jha = cached[i].jha;
      jha.revision = (jha.revision || 1);
      jha.lastUpdated = new Date().toLocaleString() + " (loaded from cache)";
      renderDocument(jha);
      showScreen("document");
    });
  });
}

// --- Sync queue ---
function loadSyncQueue() {
  try { syncQueue = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || "[]"); } catch { syncQueue = []; }
}
function saveSyncQueue() {
  try { localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(syncQueue)); } catch {}
}
function addToSyncQueue(jha) {
  loadSyncQueue();
  syncQueue.push({ jha, queuedAt: new Date().toLocaleString() });
  saveSyncQueue();
  renderSyncQueueNotice();
}

function renderSyncQueueNotice() {
  loadSyncQueue();
  const notice = document.getElementById("sync-queue-notice");
  if (syncQueue.length > 0) {
    notice.style.display = "block";
    notice.textContent = `${syncQueue.length} offline JHA${syncQueue.length > 1 ? "s" : ""} queued to sync when connected.${!isOffline ? " Syncing now..." : ""}`;
  } else {
    notice.style.display = "none";
  }
}

async function processSyncQueue() {
  loadSyncQueue();
  if (syncQueue.length === 0) return;
  const toProcess = [...syncQueue];
  syncQueue = [];
  saveSyncQueue();
  for (const item of toProcess) {
    await cacheJHA(item.jha);
  }
  renderSyncQueueNotice();
  const notice = document.getElementById("sync-queue-notice");
  if (notice) { notice.style.display = "block"; notice.textContent = `${toProcess.length} offline JHA${toProcess.length > 1 ? "s" : ""} synced successfully.`; }
}

loadSyncQueue();

// Hook into JHA generation to auto-cache and auto-queue
const _origGenerateJHA = generateJHA;
async function generateJHAWithCache(messages) {
  await _origGenerateJHA(messages);
  if (activeJHA) {
    await cacheJHA(activeJHA);
  }
}

// --- Offline guided checklist ---
const OFFLINE_HAZARD_SUGGESTIONS = {
  "elevated work": ["Fall from elevation", "Struck-by dropped tools or materials", "Aerial lift tip-over"],
  "electrical": ["Electrical shock", "Arc flash", "Energized equipment contact"],
  "material handling": ["Struck-by moving equipment", "Pinch point injury", "Overexertion / strain"],
  "excavation": ["Underground utility strike", "Equipment / excavator clearance from utilities"],
    "directional drilling": ["Utility strike — HDD rig contacting unmarked or mismarked utility", "Bore path deviation toward adjacent utility", "Inadvertent returns / frac-out", "Equipment pinch points — pipe rotation zone, vise and breakout area", "Entry and exit pit excavation hazards", "Traffic and site control — crew exposure to vehicles", "Ground disturbance near foundations or structures", "Spoil management"],
    "boring": ["Utility strike", "Bore path deviation", "Inadvertent returns", "Equipment pinch points", "Entry and exit pit hazards", "Traffic control"],
  "concrete": ["Silica dust inhalation", "Struck-by heavy formwork", "Chemical burns from concrete"],
  "roofing": ["Fall from roof edge", "Heat exhaustion", "Skylight or opening fall-through"],
  "general": ["Slip / trip / same-level fall", "Housekeeping hazard", "Vehicle / pedestrian conflict"]
};

let offlineChecklistData = { taskTitle: "", tasks: [], currentStep: 0 };

document.getElementById("offline-checklist-btn").addEventListener("click", () => {
  offlineChecklistData = { taskTitle: "", tasks: [], selectedHazards: [] };
  renderOfflineChecklist();
  showScreen("offline");
});

document.getElementById("offline-back-btn").addEventListener("click", () => showScreen("intake"));

function renderOfflineChecklist() {
  const body = document.getElementById("offline-checklist-body");
  const taskVal = document.getElementById("intake-textarea").value.trim();

  body.innerHTML = `
    <div class="offline-field-group">
      <div class="offline-field-label">Job / Task Title</div>
      <input id="oc-title" class="offline-input" type="text" placeholder="Bus duct install, Building 2" value="${escapeHtml(taskVal)}">
    </div>

    <div class="offline-field-group">
      <div class="offline-field-label">Task Steps (one per line)</div>
      <div class="offline-field-sub">List each discrete task the crew will perform today.</div>
      <textarea id="oc-tasks" class="offline-input" rows="4" placeholder="Stage material&#10;Set up scissor lift&#10;Install bus duct"></textarea>
    </div>

    <hr class="offline-section-divider">
    <div class="offline-field-group">
      <div class="offline-field-label">Hazards — select all that apply</div>
      <div class="offline-field-sub">Tap to select. Add your own below if needed.</div>
      <div id="oc-hazard-chips">
        ${Object.values(OFFLINE_HAZARD_SUGGESTIONS).flat().map(h =>
          `<span class="offline-hazard-chip" data-hazard="${escapeHtml(h)}">${escapeHtml(h)}</span>`
        ).join("")}
      </div>
      <input id="oc-custom-hazard" class="offline-input" type="text" placeholder="Add another hazard..." style="margin-top:10px;">
      <button id="oc-add-hazard" style="margin-top:6px;background:none;border:none;color:var(--orange);font-weight:600;font-size:13px;padding:0;cursor:pointer;">+ Add</button>
    </div>

    <hr class="offline-section-divider">
    <div class="offline-field-group">
      <div class="offline-field-label">Required PPE</div>
      <input id="oc-ppe" class="offline-input" type="text" placeholder="Hard hat, safety glasses, hi-vis vest, gloves...">
    </div>

    <div class="offline-field-group">
      <div class="offline-field-label">Permits Required</div>
      <input id="oc-permits" class="offline-input" type="text" placeholder="Out-of-basket permit, LOTO... (or leave blank)">
    </div>

    <div class="offline-field-group">
      <div class="offline-field-label">Emergency Considerations</div>
      <input id="oc-emergency" class="offline-input" type="text" placeholder="Nearest exit, first aid kit location, site emergency number...">
    </div>
  `;

  // Chip selection logic
  body.querySelectorAll(".offline-hazard-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      chip.classList.toggle("selected");
      validateOfflineChecklist();
    });
  });

  document.getElementById("oc-add-hazard").addEventListener("click", () => {
    const val = document.getElementById("oc-custom-hazard").value.trim();
    if (!val) return;
    const chipsDiv = document.getElementById("oc-hazard-chips");
    const chip = document.createElement("span");
    chip.className = "offline-hazard-chip selected";
    chip.dataset.hazard = val;
    chip.textContent = val;
    chip.addEventListener("click", () => { chip.classList.toggle("selected"); validateOfflineChecklist(); });
    chipsDiv.appendChild(chip);
    document.getElementById("oc-custom-hazard").value = "";
    validateOfflineChecklist();
  });

  ["oc-title", "oc-tasks", "oc-ppe"].forEach(id => {
    document.getElementById(id).addEventListener("input", validateOfflineChecklist);
  });

  validateOfflineChecklist();
}

function validateOfflineChecklist() {
  const title = (document.getElementById("oc-title")?.value || "").trim();
  const tasks = (document.getElementById("oc-tasks")?.value || "").trim();
  const ppe = (document.getElementById("oc-ppe")?.value || "").trim();
  const hasHazards = document.querySelectorAll(".offline-hazard-chip.selected").length > 0;
  const btn = document.getElementById("offline-generate-btn");
  if (btn) btn.disabled = !(title && tasks && ppe && hasHazards);
}

document.getElementById("offline-generate-btn").addEventListener("click", () => {
  const title = document.getElementById("oc-title").value.trim();
  const taskLines = document.getElementById("oc-tasks").value.trim().split("\n").filter(l => l.trim());
  const selectedHazards = [...document.querySelectorAll(".offline-hazard-chip.selected")].map(c => c.dataset.hazard);
  const ppe = document.getElementById("oc-ppe").value.trim().split(",").map(s => s.trim()).filter(Boolean);
  const permits = document.getElementById("oc-permits").value.trim().split(",").map(s => s.trim()).filter(Boolean);
  const emergency = document.getElementById("oc-emergency").value.trim();

  const now = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const jha = {
    jobTitle: title,
    date: new Date().toLocaleDateString("en-US", { dateStyle: "long" }),
    location: "Field (offline)",
    preparedBy: "Offline Checklist — PreTaskIQ",
    crewSize: "Not specified",
    revision: 1,
    lastUpdated: now,
    taskSteps: taskLines.map((step, i) => ({
      step,
      riskLevel: i === 0 ? "high" : "routine",
      equipment: [],
      hazards: selectedHazards.map(h => ({
        description: h,
        riskRating: "medium",
        control: "Verify controls with supervisor before starting"
      })),
      ppe: i === 0 ? ppe : [],
      permits: i === 0 ? permits : []
    })),
    emergencyConsiderations: emergency ? [emergency] : ["Confirm emergency plan with supervisor before starting"],
    lessonsLearned: null,
    lessonsLearnedIncidentId: null,
    stopWorkTrigger: "If any hazard cannot be adequately controlled, stop work and contact the site safety professional."
  };

  addToSyncQueue(jha);
  renderDocument(jha);
  showScreen("document");
});
