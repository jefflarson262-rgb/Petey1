// (the embedded knowledge base `const KB` now comes from src/data/kb.json, injected just before this file runs)
// Setup mode: before a company uploads its own incident history and policies,
// PreTaskIQ runs on the regulatory baseline only (OSHA/NFPA/ANSI). Once company
// data is "uploaded" (simulated via toggle below), it layers on top permanently.
let companyDataUploaded = false;

function getActiveKB() {
  const baselinePolicies = (KB.policies || []).filter(p => p.baseline === true);
  const companyPolicies = (KB.policies || []).filter(p => !p.baseline);
  const hasCompanyPolicies = companyDataUploaded && companyPolicies.length > 0;

  if (!companyDataUploaded) {
    // No company data uploaded yet — always show baseline
    return {
      regulatory: KB.regulatory,
      procedures: KB.procedures,
      policies: baselinePolicies,
      incidents: [],
      rootCauseAnalyses: []
    };
  }

  // Company data uploaded — apply preference
  if (baselinePolicyPref === 'replace' && hasCompanyPolicies) {
    // Replace mode: remove baseline, use company policies only
    return {
      regulatory: KB.regulatory,
      incidents: KB.incidents,
      rootCauseAnalyses: KB.rootCauseAnalyses,
      policies: companyPolicies,
      procedures: KB.procedures
    };
  }

  // Layer mode (default): company policies take priority, baseline fills gaps
  // Put company policies first so AI sees them as higher priority
  return {
    regulatory: KB.regulatory,
    incidents: KB.incidents,
    rootCauseAnalyses: KB.rootCauseAnalyses,
    policies: [...companyPolicies, ...baselinePolicies],
    procedures: KB.procedures
  };
}

// Merge uploaded KB entries with baseline
function getMergedKBText() {
  const active = getActiveKB();
  // Layer uploaded KB entries on top of baseline
  const uploaded = projectKnowledgeBase ? projectKnowledgeBase.filter(e => e.status === "ready") : [];
  const uploadedPolicies = uploaded.filter(e => e.kbType === "policy");
  const uploadedIncidents = uploaded.filter(e => e.kbType === "incident");
  const uploadedRCAs = uploaded.filter(e => e.kbType === "rca");
  const uploadedProcedures = uploaded.filter(e => e.kbType === "procedure");

  return JSON.stringify({
    regulatory: active.regulatory || [],
    policies: [...(active.policies || []), ...uploadedPolicies],
    incidents: [...(active.incidents || []), ...uploadedIncidents],
    rootCauseAnalyses: [...(active.rootCauseAnalyses || []), ...uploadedRCAs],
    procedures: [...(active.procedures || []), ...uploadedProcedures],
    stky: (typeof STKY_CATEGORIES !== 'undefined') ? STKY_CATEGORIES : []
  });
}

function getKBText() {
  return getMergedKBText();
}

function getProjectKBText() {
  if (!projectKnowledgeBase || projectKnowledgeBase.length === 0) return "No project documents uploaded yet.";
  const ready = projectKnowledgeBase.filter(e => e.status === 'ready');
  if (ready.length === 0) return "No project documents ready yet.";
  return JSON.stringify(ready.map(e => ({
    id: e.id,
    type: e.kbType,
    title: e.title,
    revision: e.revision || null,
    change_description: e.change_description || '',
    affected_work: e.affected_work || '',
    keywords: e.keywords || [],
    hold_question: e.hold_question || '',
    stkyCategoryIds: e.stkyCategoryIds || []
  })));
}

function updateSetupBanner() {
  const banner = document.getElementById("setup-mode-banner");
  const text = document.getElementById("setup-banner-text");
  const btn = document.getElementById("setup-banner-toggle");
  if (companyDataUploaded) {
    text.textContent = "Company incident history and policies are active — PreTaskIQ is personalized to your organization, layered on top of the regulatory baseline.";
    btn.textContent = "Revert to Setup Mode (demo only)";
    btn.classList.add("is-uploaded");
  } else {
    text.textContent = "Running on regulatory baseline (OSHA / NFPA / ANSI) — upload your incident history and policies to personalize PreTaskIQ to your organization.";
    btn.textContent = "Simulate: Upload Company Data";
    btn.classList.remove("is-uploaded");
  }
}

var _bannerToggle = document.getElementById("setup-banner-toggle");
if (_bannerToggle) {
  _bannerToggle.addEventListener("click", () => {
    companyDataUploaded = !companyDataUploaded;
    updateSetupBanner();
  });
}
updateSetupBanner();
