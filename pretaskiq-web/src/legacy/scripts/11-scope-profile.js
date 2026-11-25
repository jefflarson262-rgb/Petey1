/* ============================================================
   Scope of Work Profile + Onboarding
   ============================================================ */

const PROFILE_KEY = "pretaskiq_scope_profile";
const ONBOARDING_DONE_KEY = "pretaskiq_onboarding_done";

const DEFAULT_PROFILE = {
  trade: "",
  projects: "",
  equipment: "",
  environments: "",
  exclusions: ""
};

let scopeProfile = DEFAULT_PROFILE;

function loadScopeProfile() {
  try {
    const stored = localStorage.getItem(PROFILE_KEY);
    if (stored) scopeProfile = { ...DEFAULT_PROFILE, ...JSON.parse(stored) };
  } catch (e) {}
}

function saveScopeProfile() {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(scopeProfile)); } catch (e) {}
}

function getScopeProfileContext() {
  // Returns a natural-language paragraph injected into system prompts.
  // If no profile is set, returns empty string (falls back to generic KB).
  const { trade, projects, equipment, environments, exclusions } = scopeProfile;
  if (!trade && !projects && !equipment && !environments) return "";

  let parts = [];
  if (trade) parts.push(`This organization is a ${trade} contractor.`);
  if (projects) parts.push(`Their crews typically work on: ${projects}.`);
  if (equipment) parts.push(`Equipment commonly used includes: ${equipment}.`);
  if (environments) parts.push(`Typical work environments include: ${environments}.`);
  if (exclusions) parts.push(`This organization does NOT perform: ${exclusions} — do not ask about these scope areas.`);
  parts.push("When assessing risk, prioritizing hazards, and generating follow-up questions, focus on hazard categories and patterns consistent with this scope. Do not apply hazard patterns from the knowledge base that are unrelated to this scope.");

  return `\n\nORGANIZATION SCOPE OF WORK:\n${parts.join(" ")}\n`;
}

loadScopeProfile();

// Onboarding step definitions
const ONBOARDING_STEPS = [
  {
    id: "trade",
    eyebrow: "Step 1 of 5 — What you do",
    title: "What's your primary trade or specialty?",
    sub: "This helps PreTaskIQ prioritize the right hazard categories for your crews from day one.",
    type: "chips+text",
    chips: ["Electrical", "Civil / Underground", "General Contractor", "Concrete", "Roofing", "Mechanical / Plumbing", "Steel / Structural", "Commissioning"],
    placeholder: "Or describe your trade...",
    field: "trade"
  },
  {
    id: "projects",
    eyebrow: "Step 2 of 5 — Typical projects",
    title: "What kinds of projects do your crews typically work on?",
    sub: "Data center fit-out, underground utilities, commercial build-out — the more specific, the better the questions.",
    type: "text",
    placeholder: "e.g. Data center electrical installation and commissioning, commercial high-rise electrical rough-in...",
    field: "projects"
  },
  {
    id: "equipment",
    eyebrow: "Step 3 of 5 — Equipment",
    title: "What equipment do your crews use regularly?",
    sub: "Common tools, lifts, vehicles, or specialized equipment. This helps match hazard patterns to what your crews actually use.",
    type: "chips+text",
    chips: ["Scissor lifts", "Boom lifts", "Forklifts", "Trenchers / Excavators", "Concrete pumps", "Electrical switchgear", "Load banks", "PDCs / Switchboards"],
    placeholder: "Add other equipment...",
    field: "equipment"
  },
  {
    id: "environments",
    eyebrow: "Step 4 of 5 — Work environments",
    title: "Where do your crews typically work?",
    sub: "Indoor, outdoor, elevated, underground — this shapes which regulatory requirements and environmental hazards are most relevant.",
    type: "chips+text",
    chips: ["Indoor commercial", "Outdoor / Site work", "Elevated work", "Underground / Trenching", "Confined spaces", "Energized environments", "Active construction sites"],
    placeholder: "Describe other environments...",
    field: "environments"
  },
  {
    id: "exclusions",
    eyebrow: "Step 5 of 5 — Out of scope (optional)",
    title: "Anything your crews definitely do NOT do?",
    sub: "Optional but useful — tells PreTaskIQ not to ask about scopes that don't apply to you.",
    type: "text",
    placeholder: "e.g. No roofing, no confined space entry, no crane operations... (or leave blank)",
    field: "exclusions",
    optional: true
  }
];

let onboardingStep = 0;
let onboardingDraft = { ...DEFAULT_PROFILE };

function shouldShowOnboarding() {
  return !localStorage.getItem(ONBOARDING_DONE_KEY);
}

function startOnboarding() {
  onboardingStep = 0;
  onboardingDraft = { ...scopeProfile };
  screens.push("onboarding");
  renderLogo("logo-onboarding", 26);
  showScreen("onboarding");
  renderOnboardingStep();
}

function renderOnboardingStep() {
  const step = ONBOARDING_STEPS[onboardingStep];
  const progress = ((onboardingStep) / ONBOARDING_STEPS.length) * 100;
  document.getElementById("onboarding-progress-fill").style.width = progress + "%";

  const backBtn = document.getElementById("onboarding-back-btn");
  const nextBtn = document.getElementById("onboarding-next-btn");
  backBtn.style.visibility = onboardingStep > 0 ? "visible" : "hidden";
  nextBtn.textContent = onboardingStep === ONBOARDING_STEPS.length - 1 ? "Finish →" : "Next →";

  const currentVal = onboardingDraft[step.field] || "";
  const hasValue = currentVal.trim().length > 0 || step.optional;
  nextBtn.disabled = !hasValue;

  let innerHtml = (onboardingStep === 0 ? `<div class="petey-greeting"><img class="petey-greeting-img" src="${PETEY_HEAD}" alt="Petey"><div class="petey-greeting-text">${PETEY_GREETING}</div></div>` : "") + `
    <div class="onboarding-step">
      <div class="onboarding-step-eyebrow">${step.eyebrow}</div>
      <div class="onboarding-step-title">${step.title}</div>
      <div class="onboarding-step-sub">${step.sub}</div>
  `;

  if (step.type === "chips+text" || step.type === "chips") {
    const selectedChips = currentVal ? currentVal.split(",").map(s => s.trim()) : [];
    innerHtml += `<div class="onboarding-chip-group" id="ob-chips">`;
    step.chips.forEach(chip => {
      const sel = selectedChips.some(s => s.toLowerCase() === chip.toLowerCase());
      innerHtml += `<span class="onboarding-chip${sel ? " selected" : ""}" data-chip="${chip}">${chip}</span>`;
    });
    innerHtml += `</div>`;
  }

  if (step.type === "text" || step.type === "chips+text") {
    innerHtml += `<textarea class="onboarding-input" id="ob-text" rows="3" placeholder="${step.placeholder}">${currentVal}</textarea>`;
  }

  innerHtml += `</div>`;
  document.getElementById("onboarding-step-display").innerHTML = innerHtml;

  // Wire chip selection
  document.querySelectorAll(".onboarding-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      chip.classList.toggle("selected");
      syncOnboardingFieldFromChipsAndText(step);
    });
  });

  // Wire text input
  const textEl = document.getElementById("ob-text");
  if (textEl) {
    textEl.addEventListener("input", () => syncOnboardingFieldFromChipsAndText(step));
  }
}

function syncOnboardingFieldFromChipsAndText(step) {
  const chips = [...document.querySelectorAll(".onboarding-chip.selected")].map(c => c.dataset.chip);
  const textEl = document.getElementById("ob-text");
  const textVal = textEl ? textEl.value.trim() : "";

  // Combine selected chips + custom text, deduplicating
  const allParts = [...chips];
  if (textVal && !chips.some(c => c.toLowerCase() === textVal.toLowerCase())) {
    allParts.push(textVal);
  }
  const combined = textVal && step.type === "text" ? textVal : allParts.join(", ");
  onboardingDraft[step.field] = combined;

  const nextBtn = document.getElementById("onboarding-next-btn");
  if (nextBtn) nextBtn.disabled = !combined.trim() && !step.optional;
}

document.getElementById("onboarding-next-btn").addEventListener("click", () => {
  // Sync current field one more time before advancing
  const step = ONBOARDING_STEPS[onboardingStep];
  syncOnboardingFieldFromChipsAndText(step);

  if (onboardingStep < ONBOARDING_STEPS.length - 1) {
    onboardingStep++;
    renderOnboardingStep();
  } else {
    finishOnboarding();
  }
});

document.getElementById("onboarding-back-btn").addEventListener("click", () => {
  if (onboardingStep > 0) {
    onboardingStep--;
    renderOnboardingStep();
  }
});

document.getElementById("onboarding-skip-btn").addEventListener("click", () => {
  finishOnboarding(true);
});

function finishOnboarding(skipped = false) {
  if (!skipped) {
    scopeProfile = { ...onboardingDraft };
    saveScopeProfile();
  }
  localStorage.setItem(ONBOARDING_DONE_KEY, "1");
  // Remove "onboarding" from screens if it ended up there as a duplicate
  const idx = screens.indexOf("onboarding");
  if (idx !== -1) screens.splice(idx, 1);
  showScreen("intake");
}

// Leaving the setup questions another way (for example by tapping a role at the top) counts as skipping them, so they do not come back on
// every visit. The answers can still be filled in under Settings.
(function () {
  var orig = showScreen;
  showScreen = function (name) {
    try {
      var ob = document.getElementById('screen-onboarding');
      if (name !== 'onboarding' && ob && ob.classList.contains('active') && !localStorage.getItem(ONBOARDING_DONE_KEY)) {
        localStorage.setItem(ONBOARDING_DONE_KEY, '1');
        var idx = screens.lastIndexOf('onboarding'); if (idx !== -1 && screens.indexOf('onboarding') !== idx) screens.splice(idx, 1);
      }
    } catch (e) {}
    return orig.apply(this, arguments);
  };
})();

// Wire scope profile fields in settings modal
function populateScopeProfileInSettings() {
  document.getElementById("sp-trade").value = scopeProfile.trade || "";
  document.getElementById("sp-projects").value = scopeProfile.projects || "";
  document.getElementById("sp-equipment").value = scopeProfile.equipment || "";
  document.getElementById("sp-environments").value = scopeProfile.environments || "";
  document.getElementById("sp-exclusions").value = scopeProfile.exclusions || "";
}

// Override openSettingsModal to also populate scope profile fields
const _origOpenSettings = openSettingsModal;
// Will be re-assigned after openSettingsModal is defined below

// (Vite port) The first-run questions no longer start by themselves at page load, because that raced with sign-in.
// PreTaskIQ.startApp (29-persistence-bridge.js) starts them once the person is signed in, if this device has not done them yet.
