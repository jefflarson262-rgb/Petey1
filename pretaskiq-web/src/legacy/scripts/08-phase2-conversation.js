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
  if (role === "assistant") row.appendChild(peteyAvatarEl());
  row.appendChild(col);
  convScrollInner.appendChild(row);
  scrollConvToBottom();
  return row;
}

let typingRow = null;
function showTyping() {
  typingRow = document.createElement("div");
  typingRow.className = "bubble-row ai anim-in";
  typingRow.innerHTML = `<img class="bubble-avatar" src="${PETEY_HEAD}" alt="" aria-hidden="true"><div class="bubble ai"><span class="pulse-dots"><span class="pulse-dot"></span><span class="pulse-dot"></span><span class="pulse-dot"></span></span></div>`;
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

// What a hazard flag really did. The words on screen follow entry.delivery, so they never claim more than happened:
//   'sending'   being saved to the safety inbox         'delivered'  it is in the safety inbox (shown to safety administrators while the app is open)
//   'failed'    the inbox could not be reached           'screen'     nobody is signed in, so it is shown on this screen only and sent to no one
function escalationWords(entry) {
  const hazard = escapeHtml(entry.hazard);
  switch (entry.delivery) {
    case 'sending': return { title: 'Hazard flagged \u2014 sending to the safety inbox\u2026', text: `"${hazard}"`, head: '\ud83d\udea9 Flagged \u2014 sending to the safety inbox\u2026', tail: '' };
    case 'delivered': return { title: 'Hazard flagged \u2014 in the safety inbox', text: `"${hazard}" is in the safety inbox. A safety administrator sees it while they have the app open. For anything urgent, tell them directly.`, head: '\ud83d\udea9 Flagged \u2014 in the safety inbox', tail: ' Work decisions remain with the crew and supervisor.' };
    case 'failed': return { title: 'Hazard flagged \u2014 NOT delivered', text: `"${hazard}" did not reach the safety inbox (${escapeHtml(entry.deliveryError || 'no connection')}). Tell the site safety professional directly.`, head: '\ud83d\udea9 Flagged \u2014 NOT delivered. Tell the site safety professional directly.', tail: '' };
    default: return { title: 'Hazard flagged on this screen only', text: `"${hazard}" is logged here but was not sent to anyone. Tell the site safety professional and your supervisor directly.`, head: '\ud83d\udea9 Flagged on this screen only \u2014 not sent to anyone', tail: ' Tell the site safety professional directly.' };
  }
}

// Sends the flag to the safety inbox when someone is signed in; resolves once it is known whether it got there.
function deliverEscalation(entry, job) {
  const A = window.PreTaskIQAlerts;
  if (!A || !A.enabled()) { entry.delivery = 'screen'; return Promise.resolve(entry); }
  entry.delivery = 'sending';
  const snap = window.PreTaskIQStore && window.PreTaskIQStore.getSnapshot ? window.PreTaskIQStore.getSnapshot() : null;
  return A.raise({ hazard: entry.hazard, context: entry.context, job: job || '', planId: snap && snap.planId ? snap.planId : undefined })
    .then((r) => { entry.delivery = r.ok ? 'delivered' : 'failed'; entry.deliveryError = r.ok ? '' : r.message; return entry; });
}

// What job is this flag about? The plan on screen, or else the first thing the foreman said in the planning conversation.
function escalationJob() {
  if (typeof activeJHA !== "undefined" && activeJHA && activeJHA.jobTitle) return activeJHA.jobTitle;
  if (typeof apiMessages !== "undefined" && apiMessages && apiMessages[0] && typeof apiMessages[0].content === "string") return apiMessages[0].content;
  return "";
}

function showEscalationToast(entry) {
  // Global toast, works regardless of which screen (conversation or Petey) triggered it
  const sending = deliverEscalation(entry, escalationJob());
  const words = escalationWords(entry);
  const toast = document.createElement("div");
  toast.className = "escalation-toast anim-in";
  toast.innerHTML = `
    <div class="escalation-toast-icon">🚩</div>
    <div class="escalation-toast-body">
      <div class="escalation-toast-title">${words.title}</div>
      <div class="escalation-toast-text">${words.text}</div>
    </div>
    <button class="escalation-toast-close" aria-label="Dismiss">&times;</button>
  `;
  document.body.appendChild(toast);
  toast.querySelector(".escalation-toast-close").addEventListener("click", () => toast.remove());
  let removeTimer = setTimeout(() => { if (toast.parentNode) toast.remove(); }, 9000);

  // Inline, permanent record in whichever conversation log is currently visible
  const inlineBox = document.createElement("div");
  inlineBox.className = "escalation-inline anim-in";
  const paintInline = (w) => {
    inlineBox.innerHTML = `
    <div class="escalation-inline-head">${w.head}</div>
    <div class="escalation-inline-text">${escapeHtml(entry.hazard)} — logged at ${escapeHtml(entry.timestamp)}.${w.tail}</div>
  `;
  };
  paintInline(words);
  if (document.getElementById("screen-petey").classList.contains("active")) {
    peteyLogInner.appendChild(inlineBox);
    requestAnimationFrame(() => { const log = document.getElementById("petey-log"); log.scrollTop = log.scrollHeight; });
  } else {
    convScrollInner.appendChild(inlineBox);
    scrollConvToBottom();
  }

  // When the result is known, correct the words. A failure stays on screen until it is dismissed.
  sending.then(() => {
    const w = escalationWords(entry);
    const t = toast.querySelector(".escalation-toast-title"), x = toast.querySelector(".escalation-toast-text");
    if (t) t.innerHTML = w.title;
    if (x) x.innerHTML = w.text;
    paintInline(w);
    clearTimeout(removeTimer);
    if (entry.delivery !== 'failed') removeTimer = setTimeout(() => { if (toast.parentNode) toast.remove(); }, 9000);
    if (typeof renderNotificationLog === "function") { try { renderNotificationLog(); } catch (e) { /* settings not open */ } }
  });
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

// Only one question may be waiting on the AI at a time. A second start (a double click, the voice auto-send plus a tap on the button, an example chip)
// used to ask the AI twice, and both answers appeared: two similar but different questions.
let turnInFlight = false;

async function sendTurn(newApiMessages) {
  if (turnInFlight) return;
  turnInFlight = true;
  setConvStatus(true, false);
  convInput.disabled = true;
  convSend.disabled = true;
  showTyping();
  try {
    // Pick up any knowledge-base entry saved in the last minute (a drawing revision, a new policy) before the AI is asked. Never held up for long.
    if (window.PreTaskIQKb) { try { await window.PreTaskIQKb.ensureFresh(); } catch (e) { /* use what is already loaded */ } }
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
    // A reply that ends in a question is waiting for the foreman's answer, whatever words it contains (the closing question itself says "put the JHA together").
    const waitingForAnswer = /\?[\s"'”’)\]*_]*$/.test(reply.trim());
    const isDone = !waitingForAnswer && (lower.includes("generating it now") || lower.includes("generating the") || lower.includes("ready to generate") || lower.includes("putting the jha together") || lower.includes("put the jha together") || lower.includes("putting it together") || lower.includes("got everything i need") || lower.includes("got it — putting"));
    if (isDone) {
      convDone = true;
      setConvStatus(false, true);
      convInputRow.style.display = "none";
      const doneLine = document.createElement("div");
      doneLine.className = "done-line anim-in";
      doneLine.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#2E7D5B"/><path d="M4.5 8.2l2.2 2.2 4.8-4.8" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg> Building your hazard analysis...`;
      convScrollInner.appendChild(doneLine);
      scrollConvToBottom();
      // Let Petey finish his closing message before the screen changes (changing screens silences him mid-sentence). Never wait more than 30 s.
      const waitStart = Date.now();
      const buildWhenQuiet = () => {
        const busy = typeof window.PreTaskIQVoiceBusy === "function" && window.PreTaskIQVoiceBusy();
        if (busy && Date.now() - waitStart < 30000) return setTimeout(buildWhenQuiet, 250);
        generateJHA(apiMessages);
      };
      setTimeout(buildWhenQuiet, 1100);
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
  } finally {
    turnInFlight = false;
  }
}

function startConversation(description) {
  if (turnInFlight) return;            // already waiting for the first question
  apiMessages = [{ role: "user", content: description }];
  convDone = false;
  convScrollInner.innerHTML = "";
  convInputRow.style.display = "flex";
  convInput.value = "";
  addBubble("user", description);
  showScreen("conversation");
  sendTurn(apiMessages);
}

// Words only, lower case: so "verify uh the" and "verify, uh, the phases." can be compared.
function plainWords(t) { return String(t || "").toLowerCase().replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim(); }

// The same spoken answer can arrive twice: first cut off where the speaker paused, then complete. Instead of two answers and two different questions,
// the cut-off one (and Petey's reply to it) is replaced by the complete one. Only when the new text begins with the earlier one, within a minute.
let lastAnswer = null;   // { text, at, msgIndex, rowIndex }
function replaceCutOffAnswer(val) {
  const prev = lastAnswer;
  if (!prev || Date.now() - prev.at > 60000) return false;
  const a = plainWords(prev.text), b = plainWords(val);
  if (a.split(" ").length < 4 || b.length <= a.length || !b.startsWith(a)) return false;
  if (apiMessages.length !== prev.msgIndex + 2 || apiMessages[prev.msgIndex].content !== prev.text) return false;   // the conversation has moved on
  apiMessages = apiMessages.slice(0, prev.msgIndex);
  const rows = Array.from(convScrollInner.children);
  rows.slice(prev.rowIndex).forEach(r => r.remove());
  if (typeof window.PreTaskIQVoiceInterrupt === "function") window.PreTaskIQVoiceInterrupt();
  return true;
}

function handleConvSend() {
  const val = convInput.value.trim();
  if (!val || convDone || convInput.disabled) return;
  replaceCutOffAnswer(val);
  lastAnswer = { text: val, at: Date.now(), msgIndex: apiMessages.length, rowIndex: convScrollInner.children.length };
  addBubble("user", val);
  const updated = [...apiMessages, { role: "user", content: val }];
  apiMessages = updated;
  convInput.value = "";
  sendTurn(updated);
}

convSend.addEventListener("click", handleConvSend);
convInput.addEventListener("keydown", e => { if (e.key === "Enter") handleConvSend(); });
