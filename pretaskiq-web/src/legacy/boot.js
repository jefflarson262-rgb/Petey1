import kb from '../data/kb.json';
import { LEGACY_SCRIPTS } from './scripts.js';

// Run one file as a classic script (global scope, like a <script> tag in the original HTML).
// Appending an inline <script> element runs it immediately and synchronously.
function runClassicScript(code, name) {
  const el = document.createElement('script');
  el.textContent = `${code}\n//# sourceURL=pretaskiq/${name}`;
  document.head.appendChild(el);
  el.remove();
}

export function bootLegacyApp() {
  // The prototype waits for DOMContentLoaded in several places. When this runs from the normal module script, that event
  // has not fired yet and fires on its own once we finish. If the page is already fully loaded (for example after a
  // hot reload), replay the listeners ourselves.
  const late = document.readyState === 'complete';
  const replay = [];
  const nativeAdd = document.addEventListener.bind(document);
  if (late) {
    document.addEventListener = (type, fn, opts) => (type === 'DOMContentLoaded' ? replay.push(fn) : nativeAdd(type, fn, opts));
  }

  runClassicScript(`const KB = ${JSON.stringify(kb)};`, 'data/kb.json');
  for (const [name, code] of LEGACY_SCRIPTS) runClassicScript(code, name);

  if (late) {
    document.addEventListener = nativeAdd;
    replay.forEach((fn) => fn.call(document, new Event('DOMContentLoaded')));
  }
}
