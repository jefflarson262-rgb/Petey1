import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import './styles/index.css';
import App from './App.jsx';
import { installApiClient } from './api/client.js';
import * as plansStore from './plans/store.js';
import * as alertsStore from './alerts/store.js';
import * as kbStore from './kb/store.js';
import * as incidentsStore from './incidents/store.js';
import * as protectionStore from './protection/store.js';
import * as auditsStore from './audits/store.js';
import * as reenactRegister from './reenact/register.js';
import * as reenactStore from './reenact/store.js';
import { speech } from './api/speech.js';
import { bootLegacyApp } from './legacy/boot.js';

// The prototype's scripts (29-persistence-bridge.js) save plans through this.
window.PreTaskIQStore = plansStore;

// The prototype's scripts (08-phase2-conversation.js) raise a hazard alert in the safety inbox through this.
window.PreTaskIQAlerts = alertsStore;

// The knowledge-base scripts (19, 21) save entries to the database, and the planning conversation refreshes the list, through this.
window.PreTaskIQKb = kbStore;

// The incident report scripts (34, 35) file and complete incident reports through this.
window.PreTaskIQIncidents = incidentsStore;

// The protection observation scripts (36, 37) record and roll up control checks through this.
window.PreTaskIQProtection = protectionStore;

// The safety audit scripts (38) build templates and run audits through this.
window.PreTaskIQAudits = auditsStore;

// Approved reenactment storyboards are made playable (and drafts previewed) through this.
window.PreTaskIQReenact = reenactRegister;

// The 'Create reenactment' buttons on incident cards (21-knowledge-base-types.js) open the review screen through this.
window.PreTaskIQReenactUI = { openFor: reenactStore.openFor };

// The prototype's voice script (30-voice-conversation.js) uses the natural-voice service through this, when the server has one.
window.PreTaskIQSpeech = speech;
speech.check();

// 1. Point the prototype's AI calls at our own proxy (and add the access code to them).
installApiClient();

// 2. Render the React shell synchronously so the prototype's markup is in the page...
const root = createRoot(document.getElementById('app-shell'));
flushSync(() => root.render(<App />));

// 3. ...then start the prototype's scripts, exactly as the single HTML file did.
bootLegacyApp();

// The voice check page opens only when the address asks for it (?voicecheck=1). See api/voicecheck.js.
if (/[?&]voicecheck(=|&|$)/.test(window.location.search)) {
  import('./api/voicecheck.js').then((m) => m.startVoiceCheck(speech)).catch(() => {});
}
