/* ============================================================
   Phase 1: Intake
   ============================================================ */
const intakeTextarea = document.getElementById("intake-textarea");
const intakeSubmit = document.getElementById("intake-submit");

// The button stays active. Tapping it with an empty box just points the person back to the box.
intakeTextarea.addEventListener("input", () => {
  const st = document.getElementById("intake-voice-status");
  if (st && intakeTextarea.value.trim() && st.getAttribute("data-empty-hint")) { st.textContent = ""; st.removeAttribute("data-empty-hint"); }
});

intakeSubmit.addEventListener("click", () => {
  const val = intakeTextarea.value.trim();
  if (!val) {
    const st = document.getElementById("intake-voice-status");
    if (st) { st.textContent = "Type the day's tasks in the box, or tap Talk to Petey and say them out loud."; st.setAttribute("data-empty-hint", "1"); }
    intakeTextarea.focus();
    return;
  }
  intakeSubmit.disabled = true;        // one tap starts one conversation
  startConversation(val);
  setTimeout(() => { intakeSubmit.disabled = !navigator.onLine; }, 1500);      // available again if they come back to this screen
});

