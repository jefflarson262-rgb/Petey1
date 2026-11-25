// The prototype's JavaScript, in the exact order it ran in the original single file.
// Each file is a classic (non-module) script: it runs in the page's global scope, so the functions and variables
// declared in one file are visible to the files after it and to the inline onclick="..." handlers in the markup.
// boot.js runs the embedded knowledge base first (from ../data/kb.json), then these, in this order.
import s01 from './scripts/01-knowledge-base-helpers.js?raw';
import s02 from './scripts/02-escalation-contacts.js?raw';
import s03 from './scripts/03-system-prompts.js?raw';
import s04 from './scripts/04-claude-api.js?raw';
import s05 from './scripts/05-render-helpers.js?raw';
import s06 from './scripts/06-app-state.js?raw';
import s07 from './scripts/07-phase1-intake.js?raw';
import s08 from './scripts/08-phase2-conversation.js?raw';
import s09 from './scripts/09-phase3-generate-jha.js?raw';
import s10 from './scripts/10-phase4-document.js?raw';
import s11 from './scripts/11-scope-profile.js?raw';
import s12 from './scripts/12-offline-mode.js?raw';
import s13 from './scripts/13-phase6-petey-voice.js?raw';
import s14 from './scripts/14-pwa-service-worker.js?raw';
import s15 from './scripts/15-role-switcher.js?raw';
import s16 from './scripts/16-petey-demo-scenarios.js?raw';
import s17 from './scripts/17-scope-change-demo.js?raw';
import s18 from './scripts/18-voice-picker.js?raw';
import s19 from './scripts/19-project-knowledge-base.js?raw';
import s20 from './scripts/20-nav-dropdown.js?raw';
import s21 from './scripts/21-knowledge-base-types.js?raw';
import s22 from './scripts/22-role-system.js?raw';
import s23 from './scripts/23-guided-demo.js?raw';
import s24 from './scripts/24-custom-jha-fields.js?raw';
import s25 from './scripts/25-rca-assistant.js?raw';
import s26 from './scripts/26-incident-reenactment-player.js?raw';
import s27 from './scripts/27-near-miss-reenactment-inc-270.js?raw';
import s28 from './scripts/28-stky-categories.js?raw';
import s29 from './scripts/29-persistence-bridge.js?raw';
import s30 from './scripts/30-voice-conversation.js?raw';
import s31 from './scripts/31-crew-signoff.js?raw';
import s32 from './scripts/32-submit-plan.js?raw';
import s33 from './scripts/33-storyboard-scene.js?raw';
import s34 from './scripts/34-incident-report.js?raw';
import s35 from './scripts/35-incident-full.js?raw';
import s36 from './scripts/36-protection.js?raw';
import s37 from './scripts/37-audits.js?raw';
import s38 from './scripts/38-guided-tour.js?raw';
import s39 from './scripts/39-jobs.js?raw';
import s40 from './scripts/40-metrics.js?raw';

export const LEGACY_SCRIPTS = [
  ['01-knowledge-base-helpers.js', s01],
  ['02-escalation-contacts.js', s02],
  ['03-system-prompts.js', s03],
  ['04-claude-api.js', s04],
  ['05-render-helpers.js', s05],
  ['06-app-state.js', s06],
  ['07-phase1-intake.js', s07],
  ['08-phase2-conversation.js', s08],
  ['09-phase3-generate-jha.js', s09],
  ['10-phase4-document.js', s10],
  ['11-scope-profile.js', s11],
  ['12-offline-mode.js', s12],
  ['13-phase6-petey-voice.js', s13],
  ['14-pwa-service-worker.js', s14],
  ['15-role-switcher.js', s15],
  ['16-petey-demo-scenarios.js', s16],
  ['17-scope-change-demo.js', s17],
  ['18-voice-picker.js', s18],
  ['19-project-knowledge-base.js', s19],
  ['20-nav-dropdown.js', s20],
  ['21-knowledge-base-types.js', s21],
  ['22-role-system.js', s22],
  ['23-guided-demo.js', s23],
  ['24-custom-jha-fields.js', s24],
  ['25-rca-assistant.js', s25],
  ['26-incident-reenactment-player.js', s26],
  ['27-near-miss-reenactment-inc-270.js', s27],
  ['28-stky-categories.js', s28],
  ['29-persistence-bridge.js', s29],
  ['30-voice-conversation.js', s30],
  ['31-crew-signoff.js', s31],
  ['32-submit-plan.js', s32],
  ['33-storyboard-scene.js', s33],
  ['34-incident-report.js', s34],
  ['35-incident-full.js', s35],
  ['36-protection.js', s36],
  ['37-audits.js', s37],
  ['38-guided-tour.js', s38],
  ['39-jobs.js', s39],
  ['40-metrics.js', s40],
];
