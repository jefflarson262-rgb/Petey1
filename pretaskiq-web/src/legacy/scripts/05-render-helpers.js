/* ============================================================
   Small render helpers
   ============================================================ */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function logoSVG(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none">
    <path d="M24 4C14 4 9 11 9 19v5h30v-5c0-8-5-15-15-15z" fill="#F47920"/>
    <rect x="6" y="24" width="36" height="6" rx="1" fill="#0F1E2E"/>
    <circle cx="20" cy="34" r="9" fill="none" stroke="#0F1E2E" stroke-width="3"/>
    <line x1="26.5" y1="40.5" x2="33" y2="47" stroke="#0F1E2E" stroke-width="3.5" stroke-linecap="round"/>
  </svg>`;
}

// The PreTaskIQ logo (the crane and wordmark supplied by the owner). Files live in public/. "size" is the old icon size; the picture is sized from it.
function renderLogo(elId, size, variant) {
  const el = document.getElementById(elId);
  if (!el) return;
  const src = variant === "full" ? "/logo-full.png" : variant === "light" ? "/logo-wordmark-light.png" : "/logo-wordmark.png";
  const h = variant === "full" ? Math.round(size * 2.6) : Math.round(size * 1.45);
  el.innerHTML = `<img src="${src}" alt="PreTaskIQ" class="app-logo-img" style="height:${h}px;width:auto;display:block;">`;
}

["logo-intake", "logo-conv", "logo-gen", "logo-err", "logo-doc"].forEach(id => {
  const size = id === "logo-conv" ? 26 : 28;
  renderLogo(id, size, id === "logo-intake" ? "full" : undefined);   // the start screen shows the full logo with its tagline
});
renderLogo("logo-nav", 20, "light");                                  // the top bar is dark, so it gets the white-lettered version
const taglineText = document.querySelector("#logo-intake + .logo-tagline");
if (taglineText) taglineText.style.display = "none";                 // the full logo already carries "EVERY JOB. EVERY LESSON."

const examples = [
  "Stage material, set up the scissor lift, then install bus duct in Building 2.",
  "Load bank test a PDC, switch it to primary power, then walk the floor for QA.",
  "Move a unistrut rack to the fab table for rework, then pull a transformer panel for a pin connector repair.",
  "Morning safety huddle, then conduit rough-in on the third floor, then close out paperwork."
];
const examplesListEl = document.getElementById("examples-list");
examples.forEach(ex => {
  const btn = document.createElement("button");
  btn.className = "example-btn";
  btn.textContent = ex;
  btn.addEventListener("click", () => startConversation(ex));
  examplesListEl.appendChild(btn);
});
