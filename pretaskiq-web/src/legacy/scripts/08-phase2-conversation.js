/* ============================================================
   Phase 2: Conversation
   ============================================================ */
const convScrollInner = document.getElementById("conv-scroll-inner");
const convScroll = document.getElementById("conv-scroll");
const convStatus = document.getElementById("conv-status");
const convInput = document.getElementById("conv-input");
const convSend = document.getElementById("conv-send");
const convInputRow = document.getElementById("conv-input-row");

function scrollConvToBottom() {
  requestAnimationFrame(() => { convScroll.scrollTop = convScroll.scrollHeight; });
}

function addBubble(role, text) {
  const row = document.createElement("div");
  row.className = `bubble-row ${role === "assistant" ? "ai" : "user"} anim-in`;
  const col = document.createElement("div");
  col.className = "bubble-col";
  const label = document.createElement("div");
  label.className = "bubble-label";
  label.textContent = role === "assistant" ? "PRETASKIQ" : "FOREMAN";
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role === "assistant" ? "ai" : "user"}`;
  bubble.textContent = text;
  col.appendChild(label);
  col.appendChild(bubble);
  row.appendChild(col);
  convScrollInner.appendChild(row);
  scrollConvToBottom();
  return row;
}

let typingRow = null;
function showTyping() {
  typingRow = document.createElement("div");
  typingRow.className = "bubble-row ai anim-in";
  typingRow.innerHTML = `<div class="bubble ai"><span class="pulse-dots"><span class="pulse-dot"></span><span class="pulse-dot"></span><span class="pulse-dot"></span></span></div>`;
  convScrollInner.appendChild(typingRow);
  scrollConvToBottom();
}
function hideTyping() {
  if (typingRow) { typingRow.remove(); typingRow = null; }
}

function setConvStatus(loading, done) {
  if (done) {
    convStatus.classList.add("done");
    convStatus.textContent = "Plan complete";
    return;
  }
  convStatus.classList.remove("done");
  convStatus.innerHTML = loading
    ? `Planning conversation <span class="pulse-dots"><span class="pulse-dot"></span><span class="pulse-dot"></span><span class="pulse-dot"></span></span>`
    : "Planning conversation";
}

function showConvError(message) {
  const box = document.createElement("div");
  box.className = "error-box";
  box.textContent = message;
  convScrollInner.appendChild(box);
  scrollConvToBottom();
}

function recipientNamesText(entry) {
  return entry.recipients.map(r => `${r.name} (${r.role})`).join(" and ");
}

function showEscalationToast(entry) {
  // Global toast, works regardless of which screen (conversation or Petey) triggered it
  const toast = document.createElement("div");
  toast.className = "escalation-toast anim-in";
  toast.innerHTML = `
    <div class="escalation-toast-icon">🚩</div>
    <div class="escalation-toast-body">
      <div class="escalation-toast-title">Hazard flagged — notification sent</div>
      <div class="escalation-toast-text">"${escapeHtml(entry.hazard)}" was sent to ${escapeHtml(recipientNamesText(entry))}.</div>
    </div>
    <button class="escalation-toast-close" aria-label="Dismiss">&times;</button>
  `;
  document.body.appendChild(toast);
  toast.querySelector(".escalation-toast-close").addEventListener("click", () => toast.remove());
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 9000);

  // Inline, permanent confirmation in whichever conversation log is currently visible
  const inlineBox = document.createElement("div");
  inlineBox.className = "escalation-inline anim-in";
  inlineBox.innerHTML = `
    <div class="escalation-inline-head">🚩 Flagged to ${escapeHtml(recipientNamesText(entry))}</div>
    <div class="escalation-inline-text">${escapeHtml(entry.hazard)} — logged at ${escapeHtml(entry.timestamp)}. Work decisions remain with the crew and supervisor.</div>
  `;
  if (document.getElementById("screen-petey").classList.contains("active")) {
    peteyLogInner.appendChild(inlineBox);
    requestAnimationFrame(() => { const log = document.getElementById("petey-log"); log.scrollTop = log.scrollHeight; });
  } else {
    convScrollInner.appendChild(inlineBox);
    scrollConvToBottom();
  }
}

function parseIncidentTag(rawText) {
  // Strips every [INCIDENT: id] tag (wherever the model put it) and returns the first id found.
  let id = null;
  const text = String(rawText).replace(/\n?[ \t]*\[INCIDENT:\s*([A-Za-z0-9._\-]+)\s*\][ \t]*/g, (m, g) => { if (!id) id = g.trim(); return "\n"; }).trim();
  return { text, incidentId: id };
}

function attachReenactChip(rowOrTurn, incidentId) {
  try {
    if (!incidentId || !rowOrTurn || typeof window.reenactButtonHtml !== "function") return;
    const html = window.reenactButtonHtml(incidentId, "rx-chip");
    if (!html) return;
    const host = rowOrTurn.querySelector(".bubble-col") || rowOrTurn;
    const wrap = document.createElement("div");
    wrap.className = "rx-chip-wrap";
    wrap.innerHTML = html;
    host.appendChild(wrap);
    if (typeof scrollConvToBottom === "function") scrollConvToBottom();
  } catch (e) { /* the replay is an extra; never break the conversation over it */ }
}

function parseEscalationTag(rawText) {
  const match = rawText.match(/\[ESCALATE:\s*(.+?)\]\s*$/);
  if (match) {
    return { text: rawText.slice(0, match.index).trim(), hazardSummary: match[1].trim() };
  }
  return { text: rawText.trim(), hazardSummary: null };
}

async function sendTurn(newApiMessages) {
  setConvStatus(true, false);
  convInput.disabled = true;
  convSend.disabled = true;
  showTyping();
  try {
    // The pace line (which question this is, and when to close) is added to the system prompt only, never to the conversation itself.
    const rawReply = await callClaude({ system: buildInterviewSystemPrompt(newApiMessages), messages: newApiMessages });
    hideTyping();
    const incParsed = parseIncidentTag(rawReply);
    const { text: reply, hazardSummary } = parseEscalationTag(incParsed.text);
    apiMessages = [...newApiMessages, { role: "assistant", content: reply }];
    const aiRow = addBubble("assistant", reply);
    attachReenactChip(aiRow, incParsed.incidentId);
    setConvStatus(false, false);

    if (hazardSummary) {
      const entry = logEscalationNotification(hazardSummary, "Morning planning conversation");
      showEscalationToast(entry);
    }

    const lower = reply.toLowerCase();
    const isDone = lower.includes("generating it now") || lower.includes("generating the") || lower.includes("ready to generate") || lower.includes("putting the jha together") || lower.includes("put the jha together") || lower.includes("putting it together") || lower.includes("got everything i need") || lower.includes("got it — putting");
    if (isDone) {
      convDone = true;
      setConvStatus(false, true);
      convInputRow.style.display = "none";
      const doneLine = document.createElement("div");
      doneLine.className = "done-line anim-in";
      doneLine.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#2E7D5B"/><path d="M4.5 8.2l2.2 2.2 4.8-4.8" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg> Building your hazard analysis...`;
      convScrollInner.appendChild(doneLine);
      scrollConvToBottom();
      setTimeout(() => generateJHA(apiMessages), 1100);
    } else {
      convInput.disabled = false;
      convSend.disabled = false;
      convInput.focus();
    }
  } catch (e) {
    hideTyping();
    setConvStatus(false, false);
    showConvError(e.message || "Something went wrong talking to the planning assistant.");
    convInput.disabled = false;
    convSend.disabled = false;
  }
}

function startConversation(description) {
  apiMessages = [{ role: "user", content: description }];
  convDone = false;
  convScrollInner.innerHTML = "";
  convInputRow.style.display = "flex";
  convInput.value = "";
  addBubble("user", description);
  showScreen("conversation");
  sendTurn(apiMessages);
}

function handleConvSend() {
  const val = convInput.value.trim();
  if (!val || convDone || convInput.disabled) return;
  addBubble("user", val);
  const updated = [...apiMessages, { role: "user", content: val }];
  apiMessages = updated;
  convInput.value = "";
  sendTurn(updated);
}

convSend.addEventListener("click", handleConvSend);
convInput.addEventListener("keydown", e => { if (e.key === "Enter") handleConvSend(); });
