/* ============================================================
   Phase 6: Petey — voice-activated shift companion
   ============================================================ */
renderLogo("logo-petey", 26);

const WAKE_PATTERNS = [
  /hey\s+pet[ey]y?/i,
  /\bpetey\b/i
];

let recognition = null;
let peteyEnabled = false;
let peteyState = "idle"; // idle | listening | active | speaking | thinking
let restartingRecognition = false;
let peteyBusy = false;

const peteyOrb = document.getElementById("petey-orb");
const peteyStatePill = document.getElementById("petey-state-pill");
const peteyStateText = document.getElementById("petey-state-text");
const peteyHint = document.getElementById("petey-hint");
const peteyToggleBtn = document.getElementById("petey-toggle");
const peteyLogInner = document.getElementById("petey-log-inner");
const peteyUnsupportedBox = document.getElementById("petey-unsupported-box");

function getSpeechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function setPeteyState(state) {
  peteyState = state;
  peteyStatePill.className = `petey-state-pill ${state}`;
  peteyOrb.classList.remove("listening", "processing", "speaking", "alert");
  const dot = peteyStatePill.querySelector(".petey-dot");
  dot.classList.remove("live");

  // Orb inner elements
  const mic   = document.getElementById("petey-orb-mic");
  const bars  = document.getElementById("petey-orb-bars");
  const alert = document.getElementById("petey-orb-alert");
  if (mic)   mic.style.display   = "none";
  if (bars)  bars.style.display  = "none";
  if (alert) alert.style.display = "none";

  const labels = {
    idle:      "Ready",
    listening: "Listening for “Hey Petey”",
    active:    "Listening...",
    thinking:  "Checking policy...",
    speaking:  "Responding",
    alert:     "Hold — hazard flagged"
  };
  peteyStateText.textContent = labels[state] || state;

  // Update plain-language mode label
  const modeLabel = document.getElementById("petey-mode-label");
  const modeLabels = {
    idle:      { text: "Not listening — tap Enable Petey to activate", cls: "off" },
    listening: { text: "Waiting for “Hey Petey” — the microphone is open", cls: "waiting" },
    active:    { text: "Listening to you now", cls: "active" },
    thinking:  { text: "Processing your question", cls: "active" },
    speaking:  { text: "Petey is responding", cls: "speaking" },
    alert:     { text: "Hazard flagged — not listening to background", cls: "alert" }
  };
  if (modeLabel && modeLabels[state]) {
    modeLabel.textContent = modeLabels[state].text;
    modeLabel.className = "petey-mode-label " + modeLabels[state].cls;
  }

  if (state === "idle") {
    if (mic) mic.style.display = "block";
  } else if (state === "listening") {
    if (mic) mic.style.display = "block";
    dot.classList.add("live");
    peteyOrb.classList.add("listening");
  } else if (state === "active") {
    if (mic) mic.style.display = "block";
    dot.classList.add("live");
    peteyOrb.classList.add("listening");
  } else if (state === "thinking") {
    peteyOrb.classList.add("processing");
  } else if (state === "speaking") {
    if (bars) bars.style.display = "flex";
    peteyOrb.classList.add("speaking");
  } else if (state === "alert") {
    if (alert) alert.style.display = "block";
    peteyOrb.classList.add("alert");
    dot.classList.add("live");
  }
}

function addPeteyLogEntry(role, text) {
  const turn = document.createElement("div");
  turn.className = `petey-turn ${role} anim-in`;
  const label = document.createElement("div");
  label.className = "petey-turn-label";
  label.textContent = role === "user" ? "YOU SAID" : role === "petey" ? "PETEY" : "";
  const body = document.createElement("div");
  body.className = "petey-turn-text";
  body.textContent = text;
  if (role !== "system") turn.appendChild(label);
  turn.appendChild(body);
  peteyLogInner.appendChild(turn);
  requestAnimationFrame(() => {
    const log = document.getElementById("petey-log");
    log.scrollTop = log.scrollHeight;
  });
  return turn;
}

function renderProcedureTracker() {
  // Update mode label to show procedure tracking mode
  const modeLabel = document.getElementById("petey-mode-label");
  if (modeLabel && activeProcedure) {
    modeLabel.textContent = "Procedure tracking active — reporting steps only, not recording";
    modeLabel.className = "petey-mode-label tracking";
  }
  const container = document.getElementById("procedure-tracker");
  if (!activeProcedure || !activeProcedure.steps) {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }

  const completed = activeProcedure.completedStepIds || [];
  const criticalSteps = activeProcedure.criticalSteps || [];
  const flaggedIds = activeProcedure.flaggedOutOfOrder || [];
  const nextStep = (activeProcedure.steps || []).find(s => !completed.includes(s.id));

  const outOfOrderHtml = activeProcedure.outOfOrderFlag
    ? `<div class="proc-paused-banner">🛑 ${escapeHtml(activeProcedure.outOfOrderFlag)}</div>`
    : "";

  const rowsHtml = (activeProcedure.steps || []).map((step, idx) => {
    const isDone = completed.includes(step.id);
    const isFlagged = flaggedIds.includes(step.id);
    const isCritical = criticalSteps.includes(step.id);

    let rowClass = "proc-step-row";
    let badgeClass = "proc-step-badge";
    let titleClass = "proc-step-title";
    let badgeInner = String(idx + 1);
    let warnHtml = "";

    if (isDone) {
      rowClass += " is-done";
      badgeClass += " is-done";
      titleClass += " is-done";
      badgeInner = "✓";
    } else if (isFlagged) {
      rowClass += " is-flagged";
      badgeClass += " is-flagged";
      titleClass += " is-flagged";
      warnHtml = `<div class="proc-step-warn">⚠ required before you proceed</div>`;
    }

    return `
      <div class="${rowClass}">
        <div class="${badgeClass}">${badgeInner}</div>
        <div class="proc-step-body">
          <div class="${titleClass}">${escapeHtml(step.title)}</div>
          ${warnHtml}
        </div>
        ${isCritical ? '<div class="proc-crit-badge">CRIT</div>' : ''}
      </div>
    `;
  }).join("");

  container.style.display = "block";
  container.innerHTML = `
    ${outOfOrderHtml}
    <div class="proc-tracker-card">
      <div class="proc-tracker-caution"></div>
      <div class="proc-tracker-label">Procedure Tracker</div>
      <div class="proc-tracker-name">${escapeHtml(activeProcedure.name || "Procedure")}</div>
      ${rowsHtml}
      <div class="proc-tracker-progress">${completed.length} / ${(activeProcedure.steps || []).length} steps</div>
    </div>
  `;
}

let selectedVoiceName = null;
let baselinePolicyPref = 'layer'; // 'layer' = keep baseline as safety net | 'replace' = company policies only

function speakText(text, onDone) {
  if (!window.speechSynthesis) { if (onDone) onDone(); return; }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.02;
  utter.pitch = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const preferred = (selectedVoiceName && voices.find(v => v.name === selectedVoiceName))
    || voices.find(v => /en-US/i.test(v.lang) && /male|david|guy|fred/i.test(v.name))
    || voices.find(v => /en-US/i.test(v.lang))
    || voices[0];
  if (preferred) utter.voice = preferred;
  utter.onstart = () => setPeteyState("speaking");
  utter.onend = () => { setPeteyState(peteyEnabled ? "listening" : "idle"); if (onDone) onDone(); };
  utter.onerror = () => { setPeteyState(peteyEnabled ? "listening" : "idle"); if (onDone) onDone(); };
  window.speechSynthesis.speak(utter);
}

function extractWakeQuery(transcript) {
  for (const pattern of WAKE_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      const idx = match.index + match[0].length;
      let rest = transcript.slice(idx).trim();
      rest = rest.replace(/^[,.\s]+/, "");
      return rest;
    }
  }
  return null;
}

function parsePeteyReply(raw) {
  // Strip any [INCIDENT: id] tag first, then a trailing [ESCALATE: ...] tag, regardless of intent
  const incParsed = parseIncidentTag(raw);
  let working = incParsed.text.trim();
  let hazardSummary = null;
  const escMatch = working.match(/\[ESCALATE:\s*(.+?)\]\s*$/);
  if (escMatch) {
    hazardSummary = escMatch[1].trim();
    working = working.slice(0, escMatch.index).trim();
  }

  const match = working.match(/^\[INTENT:\s*([A-Z_]+)\]\s*\n?([\s\S]*)$/);
  if (match) {
    return { intent: match[1].trim(), text: match[2].trim(), hazardSummary, incidentId: incParsed.incidentId };
  }
  return { intent: "GENERAL_QUESTION", text: working, hazardSummary, incidentId: incParsed.incidentId };
}

async function handlePeteyQuery(query) {
  if (!query || peteyBusy) return;
  peteyBusy = true;
  addPeteyLogEntry("user", query);
  setPeteyState("thinking");

  try {
    const activePlanJson = activeJHA ? JSON.stringify(activeJHA) : null;
    const activeProcedureJson = activeProcedure ? JSON.stringify(activeProcedure) : null;
    const systemPrompt = buildPeteySystemPrompt(activePlanJson, activeProcedureJson);
    const rawReply = await callClaude({
      system: systemPrompt,
      messages: [{ role: "user", content: query }],
      maxTokens: 400
    });
    const { intent, text, hazardSummary, incidentId } = parsePeteyReply(rawReply);
    const peteyTurn = addPeteyLogEntry("petey", text);
    attachReenactChip(peteyTurn, incidentId);
    speakText(text);

    if (hazardSummary) {
      const entry = logEscalationNotification(hazardSummary, "Petey — mid-shift");
      showEscalationToast(entry);
    }

    if (intent === "PLAN_CHANGE" && activeJHA) {
      updateActiveJHAFromReport(query);
    }
    if (intent === "PROCEDURE_TRACKING") {
      updateActiveProcedureFromReport(query);
    }
  } catch (e) {
    const errMsg = "I had trouble reaching the safety system just now. Try that again in a second.";
    addPeteyLogEntry("petey", errMsg);
    speakText(errMsg);
  } finally {
    peteyBusy = false;
  }
}

async function updateActiveJHAFromReport(report) {
  try {
    addPeteyLogEntry("system", "Updating today's JHA...");
    const result = await callClaude({
      system: PETEY_UPDATE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `ACTIVE HAZARD ANALYSIS DOCUMENT:\n${JSON.stringify(activeJHA)}\n\nFOREMAN'S REPORT:\n${report}\n\nReturn the complete updated document JSON now.` }],
      maxTokens: 6000
    });
    const updated = extractJson(result);
    activeJHA = updated;
    addPeteyLogEntry("system", `JHA updated — now Rev ${updated.revision || "?"}. View it on the JHA screen to see the change.`);
  } catch (e) {
    addPeteyLogEntry("system", "Logged the update, but couldn't sync it to the written JHA just now — flag this to your supervisor to update it manually.");
  }
}

async function updateActiveProcedureFromReport(report) {
  try {
    const procedureLibraryJson = JSON.stringify(getActiveKB().procedures || []);
    const result = await callClaude({
      system: PETEY_PROCEDURE_UPDATE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `PROCEDURE LIBRARY:\n${procedureLibraryJson}\n\nCURRENT PROCEDURE TRACKING STATE:\n${activeProcedure ? JSON.stringify(activeProcedure) : "null"}\n\nCREW'S LATEST STATEMENT:\n${report}\n\nReturn the complete updated procedure tracking state JSON now (or null if nothing should be tracked).` }],
      maxTokens: 1200
    });
    const updated = extractJson(result);
    activeProcedure = updated;
    renderProcedureTracker();
  } catch (e) {
    addPeteyLogEntry("system", "Noted, but couldn't sync that to the procedure tracker just now.");
  }
}

function initRecognition() {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";

  rec.onresult = (event) => {
    let finalTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) finalTranscript += res[0].transcript;
    }
    if (!finalTranscript) return;

    const lower = finalTranscript.toLowerCase().trim();
    const query = extractWakeQuery(lower);
    if (query !== null) {
      setPeteyState("active");
      if (query.length > 0) {
        handlePeteyQuery(query);
      } else {
        // Wake word with no query yet — give a brief audible cue
        addPeteyLogEntry("system", "Wake word detected — listening...");
      }
    }
  };

  rec.onerror = (event) => {
    if (event.error === "no-speech" || event.error === "aborted") return;
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      addPeteyLogEntry("system", "Microphone access was denied. Enable mic permissions to use Petey.");
      peteyEnabled = false;
      setPeteyState("idle");
      peteyToggleBtn.textContent = "Enable Petey";
      peteyToggleBtn.classList.remove("on");
    }
  };

  rec.onend = () => {
    if (peteyEnabled && !restartingRecognition) {
      restartingRecognition = true;
      setTimeout(() => {
        restartingRecognition = false;
        try { rec.start(); } catch (e) { /* already started */ }
      }, 250);
    }
  };

  return rec;
}

function togglePetey() {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    peteyUnsupportedBox.style.display = "block";
    peteyUnsupportedBox.innerHTML = `<div class="petey-unsupported">Petey's wake-word listening uses your browser's built-in speech recognition, which this browser doesn't support. For the best demo experience, try the latest Chrome or Edge on desktop.</div>`;
    return;
  }

  if (!peteyEnabled) {
    if (!recognition) recognition = initRecognition();
    try {
      recognition.start();
      peteyEnabled = true;
      setPeteyState("listening");
      peteyToggleBtn.textContent = "Petey is On";
      peteyToggleBtn.classList.add("on");
      peteyHint.innerHTML = `Petey is listening. Just say <span class="petey-wake-phrase">"Hey Petey"</span> followed by your question, plan update, or report.`;
      addPeteyLogEntry("system", "Petey enabled — say \u201cHey Petey\u201d any time.");
    } catch (e) {
      addPeteyLogEntry("system", "Couldn't start the microphone. Check browser permissions and try again.");
    }
  } else {
    peteyEnabled = false;
    if (recognition) { try { recognition.stop(); } catch (e) {} }
    window.speechSynthesis && window.speechSynthesis.cancel();
    setPeteyState("idle");
    peteyToggleBtn.textContent = "Enable Petey";
    peteyToggleBtn.classList.remove("on");
    peteyHint.innerHTML = `Tap below to give Petey mic access. Once on, just say <span class="petey-wake-phrase">"Hey Petey"</span> any time during the shift.`;
    addPeteyLogEntry("system", "Petey turned off.");
  }
}

peteyToggleBtn.addEventListener("click", togglePetey);

document.getElementById("doc-open-petey").addEventListener("click", () => {
  renderProcedureTracker();
  showScreen("petey");
});
document.getElementById("petey-back-doc").addEventListener("click", () => {
  if (activeJHA) {
    renderDocument(activeJHA);
    showScreen("document");
  } else {
    showScreen("intake");
  }
});

// Surface a one-time browser-support note proactively if unsupported
if (!getSpeechRecognitionCtor()) {
  peteyUnsupportedBox.style.display = "block";
  peteyUnsupportedBox.innerHTML = `<div class="petey-unsupported">Heads up: this browser doesn't support the Web Speech API that powers Petey's voice mode. For the full hands-free demo, open this in the latest Chrome or Edge on desktop.</div>`;
}
