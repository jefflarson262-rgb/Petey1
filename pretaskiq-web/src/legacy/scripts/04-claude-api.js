/* ============================================================
   Claude API helper
   ============================================================ */
async function callClaude({ system, messages, maxTokens = 700 }) {
  const response = await fetch(window.PRETASKIQ_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system,
      messages
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API error ${response.status}: ${errText}`);
  }
  const data = await response.json();
  const text = (data.content || [])
    .map(block => (block.type === "text" ? block.text : ""))
    .filter(Boolean)
    .join("\n");
  // (Vite port) Never show half a reply. If the model hit its limit, or sent nothing, say so; the person can simply send it again.
  if (data.stop_reason === "max_tokens") {
    throw new Error("Petey's reply was cut off before it finished (the response limit was reached). Please send that again.");
  }
  if (!text.trim()) {
    throw new Error("Petey sent back an empty reply. Please send that again.");
  }
  return text;
}

function extractJson(text) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in response");
  const candidate = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (parseErr) {
    // A common failure mode is the model's response getting cut off mid-structure
    // because the output hit the token limit before the JSON closed properly.
    const looksTruncated = !candidate.trim().endsWith("}") || (candidate.match(/\{/g) || []).length !== (candidate.match(/\}/g) || []).length;
    if (looksTruncated) {
      throw new Error("The generated document was cut off before it finished (likely too long for the response limit). Try again — if it keeps happening with the same input, the task list may need to be shorter or split up.");
    }
    throw new Error(`Couldn't parse the generated document as valid JSON (${parseErr.message}).`);
  }
}
