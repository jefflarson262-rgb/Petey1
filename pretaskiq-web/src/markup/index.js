// The prototype's page markup, split into one file per top-level element, in document order.
// They are joined into a single string so the elements stay siblings, exactly as they were in <body>.
import p1 from './01-screen-intro.html?raw';
import p2 from './02-setup-mode-banner.html?raw';
import p3 from './03-top-nav.html?raw';
import p4 from './04-settings-modal-overlay.html?raw';
import p5 from './05-screen-onboarding.html?raw';
import p6 from './06-app-root.html?raw';
import p7 from './07-screen-admin.html?raw';
import p8 from './08-screen-construction.html?raw';
import p9 from './09-screen-rca.html?raw';
import p10 from './10-screen-incident.html?raw';
import p11 from './11-screen-incident-full.html?raw';

const PARTIALS = [
  p1,
  p2,
  p3,
  p4,
  p5,
  p6,
  p7,
  p8,
  p9,
  p10,
  p11,
];

export const APP_MARKUP = PARTIALS.map((html) => html.trim()).join('\n');
