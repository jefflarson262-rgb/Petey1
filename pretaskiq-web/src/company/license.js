// Hides the parts of the app a company is not licensed for. The server is what really blocks them; this only keeps the buttons out of sight.
// The old prototype menus are built from text, so they are hidden by matching the name of the function a button calls.
import { FEATURES } from '../shared/licensing.js';

const HIDE = {
  incidents: ['openIncidentReport('],
  protection: ['openProtectionObserve('],
  audits: ['openAuditHome('],
  jobs: ['openJobs('],
  rca: ['openRCAAssistant('],
  knowledge_base: ['openSettingsToKb('],
  construction_admin: ["setRole('construction')"],
};

let styleEl = null;
export function applyLicense(company) {
  if (typeof document === 'undefined') return;
  if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'license-hide'; document.head.appendChild(styleEl); }
  const has = (f) => !company || (company.features || []).includes(f);        // no company info (old mode): show everything
  const rules = [];
  for (const f of Object.keys(FEATURES)) {
    if (has(f)) continue;
    for (const needle of HIDE[f] || []) rules.push(`[onclick*="${needle}"]{display:none !important}`);
  }
  styleEl.textContent = rules.join('\n');
  window.PreTaskIQLicense = { has };
}
