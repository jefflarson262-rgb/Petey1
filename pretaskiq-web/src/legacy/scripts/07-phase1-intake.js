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
  if (val) startConversation(val);
});
