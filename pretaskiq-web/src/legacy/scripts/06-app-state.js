/* ============================================================
   App state & screen switching
   ============================================================ */
const screens = ["intake", "conversation", "generating", "error", "document", "petey", "offline", "onboarding", "admin", "construction", "intro", "rca", "incident", "incident-full", "protection-observe", "protection-results", "protection-setup"];
let activeJHA = null; // the most recently generated JHA, available to Petey for plan-aware answers

// Active procedure tracking: when the crew starts a strict-sequence procedure (LOTO, energized work),
// Petey tracks progress against the structured checklist from procedures_kb.
let activeProcedure = null; // { procedureId, name, steps: [...], completedStepIds: [], flaggedOutOfOrder: [] }

// Configurable escalation contacts: who gets notified when a crew identifies a hazard
// they cannot mitigate with what's available. Editable in Settings; defaults are placeholders.
let escalationContacts = {
  siteSafetyProfessional: { name: "Sam Rivera", role: "Site Safety Professional", contact: "sam.rivera@example.com" },
  crewSupervisor: { name: "Jordan Park", role: "Crew Supervisor / Site Manager", contact: "jordan.park@example.com" }
};

// Log of simulated notifications sent for unresolved hazards, shown in the demo
// so it's honest about what WOULD happen rather than silently pretending to email someone.
let notificationLog = []; // { timestamp, hazard, taskOrContext, recipients: [...] }

function logEscalationNotification(hazardSummary, context) {
  const entry = {
    timestamp: new Date().toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
    hazard: hazardSummary,
    context: context,
    recipients: [escalationContacts.siteSafetyProfessional, escalationContacts.crewSupervisor]
  };
  notificationLog.unshift(entry);
  return entry;
}

function showScreen(name) {
  screens.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (!el) return;
    const becoming = (s === name);
    el.classList.toggle("active", becoming);
    if (becoming) {
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "";
    }
  });
}

let apiMessages = [];
let convDone = false;
