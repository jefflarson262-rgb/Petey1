/* ============================================================
   Phase 1: Intake
   ============================================================ */
const intakeTextarea = document.getElementById("intake-textarea");
const intakeSubmit = document.getElementById("intake-submit");

intakeTextarea.addEventListener("input", () => {
  intakeSubmit.disabled = !intakeTextarea.value.trim();
});

intakeSubmit.addEventListener("click", () => {
  const val = intakeTextarea.value.trim();
  if (!val) return;
  intakeSubmit.disabled = true;        // one tap starts one conversation
  startConversation(val);
  setTimeout(() => { intakeSubmit.disabled = !intakeTextarea.value.trim(); }, 1500);      // available again if they come back to this screen
});
