/* ============================================================
   Phase 3: Generate JHA
   ============================================================ */
let lastApiMessages = null;

async function generateJHA(messages) {
  lastApiMessages = messages;
  showScreen("generating");
  try {
    const transcript = messages.map(m =>
      `${m.role === "user" ? "FOREMAN" : "PRETASKIQ"}: ${m.content}`
    ).join("\n\n");

    const result = await callClaude({
      system: buildJHASystemPrompt(),
      messages: [{ role: "user", content: `Here is the full planning conversation:\n\n${transcript}\n\nGenerate the JHA JSON now.` }],
      maxTokens: 6000
    });
    const parsed = extractJson(result);
    renderDocument(parsed);
    showScreen("document");
    // Auto-cache for offline use
    try { cacheJHA(parsed); } catch (e) { /* non-fatal */ }
  } catch (e) {
    document.getElementById("error-message").textContent = e.message || "Something went wrong generating the document.";
    showScreen("error");
  }
}

document.getElementById("error-retry").addEventListener("click", () => {
  if (lastApiMessages) generateJHA(lastApiMessages);
  else resetToIntake();
});
