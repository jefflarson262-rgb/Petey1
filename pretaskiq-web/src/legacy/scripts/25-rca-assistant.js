// ── RCA Development Assistant ────────────────────────────────────────
var rcaMessages = [];
var rcaPhase = 1;
var rcaDone = false;

function getRCAMethodologyTemplate() {
  try {
    var stored = localStorage.getItem('rca_methodology_template');
    return stored ? JSON.parse(stored) : null;
  } catch(e) { return null; }
}

function buildRCASystemPrompt() {
  var template = getRCAMethodologyTemplate();
  var methodologySection = template
    ? '\n\nCUSTOMER METHODOLOGY TEMPLATE:\nThis organization has uploaded an example RCA document that defines their preferred methodology and structure. When generating the final RCA document, replicate the section order, terminology, and structure from this template as closely as possible. The template is from: ' + template.source + '\n\nTemplate content:\n' + template.description + '\n\nDo not deviate from this structure. Use the same section headings, same level of detail, and same terminology the customer uses in their own RCAs.'
    : '';

  var reportSection = '\n\nSTARTING FROM AN INCIDENT REPORT: the first user message may say it comes from an uploaded incident report, with a summary of what the document states (names removed). Treat that summary as the facts the investigator already has: do not ask for anything it already answers. In your first reply, in a few short lines, restate the problem definition it supports (what happened, the impact, the sequence), say plainly what is NOT in the report (timeline gaps, evidence, who was involved by role, the work being done), then ask ONE question about the most important gap. Never treat a cause that the report only implies as established; the investigation decides causes. Never use a personal name.';
  return RCA_SYSTEM_PROMPT_BASE + methodologySection + reportSection;
}

var RCA_SYSTEM_PROMPT_BASE = `You are an experienced safety investigation facilitator helping a safety professional develop a root cause analysis (RCA) for a workplace incident, near-miss, or significant close call.

Your role is to guide a structured investigation interview through seven phases, following a defined problem-solving methodology:

PHASE 1 — PROBLEM DEFINITION: Before discussing causes, clearly define the problem itself. Ask about the observable characteristics of what happened, the symptoms that were present, and the measurable impact (injury severity, downtime, cost, near-miss potential). Do not move to causes until the problem itself is precisely and factually defined — a vague problem statement produces a vague investigation.

PHASE 2 — DATA GATHERING: Establish the factual sequence of events using available records. Ask about the timeline, relevant process logs, operational records, and any other documented evidence that helps reconstruct the sequence of events leading to the issue. Get the full narrative — who, what, where, when — before moving on.

PHASE 3 — CONTRIBUTING FACTORS: Identify potential contributing factors using structured brainstorming. Explicitly use Fishbone (Ishikawa) categories — People, Equipment, Materials, Methods, Environment, Management — to make sure no category is skipped, and use the Five Whys technique on the most significant factors to probe deeper than the surface-level cause. Ask about equipment condition, PPE use, procedures followed, training, supervision, time pressure, communication, and environmental conditions.

PHASE 4 — ROOT CAUSE ANALYSIS: Analyze the relationships between the contributing factors identified in Phase 3 to pinpoint the actual root cause(s) — the systemic failures that, if corrected, would prevent recurrence. Validate candidate root causes using Is/Is Not Analysis (where did this happen vs. where it plausibly could have but didn't) or Pareto Analysis (which factors account for the largest share of the problem) rather than accepting the first plausible explanation. A root cause is something you can actually fix, not a restatement of the immediate cause.

PHASE 5 — CORRECTIVE ACTIONS: Develop corrective actions that directly target the validated root cause(s), not just the symptoms. For each action, confirm it is feasible and cost-effective, and ask whether it actually addresses the root cause or would only address a contributing factor or symptom.

PHASE 6 — IMPLEMENTATION: For each corrective action, establish clear roles, responsibilities, and timelines. Ask specifically who owns each action and by when it will be completed — a corrective action without an owner and a date is not yet actionable.

PHASE 7 — MONITORING: Establish how the effectiveness of each corrective action will be verified over time — control systems, audits, inspections, or performance metrics. Ask how and when the organization will confirm the action actually worked, not just that it was completed. An implemented action that is never checked for effectiveness risks the same failure recurring.

INVESTIGATION PRINCIPLES:
- Ask one question at a time. One. Do not combine questions.
- Do not accept "human error" as a root cause — it is always a contributing factor. Probe what allowed the human error to occur.
- Do not accept "failed to follow procedure" as a root cause — probe why the procedure was not followed.
- When you have sufficient information to move to the next phase, tell the investigator clearly and transition, naming the phase you're moving to.
- Name the tool you're applying when you apply it — tell the investigator when you're using Fishbone categories, the Five Whys, Is/Is Not Analysis, or Pareto Analysis, so the methodology is visible, not silent.
- Maintain a non-judgmental, fact-finding tone throughout.
- When Phase 7 is complete, tell the investigator you have everything needed and will generate the RCA document. Your final message MUST contain the phrase "Generating the RCA now."

Respond with ONLY your next question or statement. No preamble, no labels, no markdown.`;

// buildRCASystemPrompt now defined with methodology template support above

function openRCAAssistant() {
  rcaMessages = [];
  rcaPhase = 1;
  rcaDone = false;
  var chat = document.getElementById('rca-chat');
  if (chat) chat.innerHTML = '';
  var output = document.getElementById('rca-output');
  if (output) output.style.display = 'none';
  var exportBtn = document.getElementById('rca-export-btn');
  if (exportBtn) exportBtn.style.display = 'none';
  var inputRow = document.getElementById('rca-input-row');
  if (inputRow) inputRow.style.display = 'flex';

  var upRow = document.getElementById('rca-upload-row'); if (upRow) upRow.style.display = '';
  rcaBusyUpload = false;
  updateRCAPhases(1);
  showScreen('rca');

  // Opening message
  var opening = "Let's work through this investigation together. I'll guide you through seven phases — defining the problem, gathering data, identifying contributing factors, root cause analysis, corrective actions, implementation, and monitoring.\n\nTo start: let's define the problem clearly before we get into causes. What were the observable characteristics of what happened, and what was the measurable impact — injury, downtime, cost, or otherwise?";
  addRCABubble('assistant', opening);

  // Enter key sends
  var input = document.getElementById('rca-input');
  if (input) {
    input.onkeydown = function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendRCAMessage();
      }
    };
  }
}

function addRCABubble(role, text) {
  var chat = document.getElementById('rca-chat');
  if (!chat) return;
  var div = document.createElement('div');
  div.style.display = 'flex';
  div.style.justifyContent = role === 'user' ? 'flex-end' : 'flex-start';
  var bubble = document.createElement('div');
  bubble.className = 'rca-chat-bubble ' + role;
  bubble.style.whiteSpace = 'pre-wrap';
  bubble.textContent = text;
  div.appendChild(bubble);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function updateRCAPhases(phase) {
  rcaPhase = phase;
  for (var i = 1; i <= 7; i++) {
    var chip = document.getElementById('rca-phase-' + i);
    if (!chip) continue;
    chip.style.background = i < phase ? '#D1FAE5' : i === phase ? 'var(--orange)' : '#E8ECF0';
    chip.style.color = i < phase ? '#065F46' : i === phase ? '#fff' : '#777';
    chip.style.fontWeight = i === phase ? '700' : '600';
    chip.style.fontSize = '11px';
    chip.style.padding = '4px 12px';
    chip.style.borderRadius = '20px';
    chip.style.cursor = 'default';
  }
}

async function sendRCAMessage() {
  if (rcaDone) return;
  var input = document.getElementById('rca-input');
  var text = input ? input.value.trim() : '';
  if (!text) return;

  input.value = '';
  var upRow0 = document.getElementById('rca-upload-row'); if (upRow0) upRow0.style.display = 'none';   // only offered before the investigation starts
  addRCABubble('user', text);
  rcaMessages.push({ role: 'user', content: text });

  // Disable input while processing
  var sendBtn = document.getElementById('rca-send');
  if (sendBtn) sendBtn.disabled = true;
  if (input) input.disabled = true;

  // Typing indicator
  var chat = document.getElementById('rca-chat');
  var typingDiv = document.createElement('div');
  typingDiv.id = 'rca-typing';
  typingDiv.style.cssText = 'display:flex;justify-content:flex-start;';
  typingDiv.innerHTML = '<div class="rca-chat-bubble assistant" style="color:#aaa;font-style:italic;">Thinking...</div>';
  chat.appendChild(typingDiv);
  chat.scrollTop = chat.scrollHeight;

  try {
    var response = await fetch(window.PRETASKIQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: buildRCASystemPrompt(),
        messages: rcaMessages
      })
    });
    var data = await response.json();
    var reply = (data.content || []).map(function(b) { return b.text || ''; }).join('');

    var typing = document.getElementById('rca-typing');
    if (typing) typing.remove();

    rcaMessages.push({ role: 'assistant', content: reply });
    addRCABubble('assistant', reply);

    // Detect phase transitions from response
    var lower = reply.toLowerCase();
    if (lower.includes('phase 2') || lower.includes('data gathering') || lower.includes('gather relevant data') || lower.includes('move to.*data')) updateRCAPhases(2);
    else if (lower.includes('phase 3') || lower.includes('contributing factor') || lower.includes('fishbone') || lower.includes('five whys') || lower.includes('5 whys')) updateRCAPhases(3);
    else if (lower.includes('phase 4') || lower.includes('root cause analysis') || lower.includes('is/is not') || lower.includes('pareto')) updateRCAPhases(4);
    else if (lower.includes('phase 5') || lower.includes('corrective action')) updateRCAPhases(5);
    else if (lower.includes('phase 6') || lower.includes('implementation') || lower.includes('roles') && lower.includes('timeline')) updateRCAPhases(6);
    else if (lower.includes('phase 7') || lower.includes('monitoring') || lower.includes('effectiveness')) updateRCAPhases(7);

    // Detect done
    if (lower.includes('generating the rca now') || lower.includes('generate the rca')) {
      rcaDone = true;
      var inputRow = document.getElementById('rca-input-row');
      if (inputRow) inputRow.style.display = 'none';
      updateRCAPhases(8);
      setTimeout(generateRCADocument, 800);
    }

  } catch(err) {
    var typing = document.getElementById('rca-typing');
    if (typing) typing.remove();
    addRCABubble('assistant', 'Something went wrong. Please try again.');
  }

  if (sendBtn) sendBtn.disabled = false;
  if (input) { input.disabled = false; input.focus(); }
}

async function generateRCADocument() {
  var chat = document.getElementById('rca-chat');
  var genDiv = document.createElement('div');
  genDiv.style.cssText = 'text-align:center;padding:16px;color:var(--slate);font-size:13px;';
  genDiv.textContent = 'Building your RCA document...';
  chat.appendChild(genDiv);
  chat.scrollTop = chat.scrollHeight;

  try {
    var response = await fetch(window.PRETASKIQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: `Based on the investigation conversation provided, generate a structured Root Cause Analysis document as a JSON object. Return ONLY valid JSON, no markdown, no backticks.

Required structure:
{
  "incidentTitle": "Brief descriptive title",
  "incidentDate": "Date if mentioned, else null",
  "incidentType": "Injury / Near-Miss / Property Damage / etc",
  "problemDefinition": {"symptoms": "Observable characteristics documented", "measurableImpact": "Injury severity, downtime, cost, or other measurable impact"},
  "narrative": "2-3 sentence factual description of what happened",
  "immediateNotification": "Who was notified and when",
  "eventSequence": ["Step 1 in sequence", "Step 2", "..."],
  "dataGathered": ["Timeline / log / record referenced during the investigation", "..."],
  "contributingFactors": [{"factor": "Description", "category": "People / Equipment / Materials / Methods / Environment / Management (Fishbone categories)"}],
  "methodologyNote": "Which tools were applied during the investigation, e.g. Five Whys on X, Is/Is Not Analysis to validate Y",
  "rootCauses": [{"cause": "Systemic root cause", "systemFailure": "What management system failed", "validationMethod": "How this was validated (Is/Is Not, Pareto, etc.) if mentioned"}],
  "correctiveActions": [{"action": "Specific action", "responsibleParty": "Role or name if mentioned", "dueDate": "Timeframe if mentioned", "addressesRootCause": "Which root cause this addresses"}],
  "implementationPlan": [{"action": "Corrective action being implemented", "owner": "Who owns execution", "timeline": "When it will be completed"}],
  "monitoringPlan": [{"action": "Corrective action being monitored", "method": "Control system, audit, or metric used to verify effectiveness", "cadence": "How often / when effectiveness will be checked"}],
  "lessonsLearned": ["Key lesson 1", "Key lesson 2"],
  "investigationComplete": true
}`,
        messages: rcaMessages
      })
    });

    var data = await response.json();
    var text = (data.content || []).map(function(b) { return b.text || ''; }).join('');
    var clean = text.replace(/```json|```/g, '').trim();
    var rca = JSON.parse(clean);

    genDiv.remove();
    renderRCADocument(rca);

  } catch(err) {
    genDiv.textContent = 'Error generating document. Please try again.';
  }
}

function renderRCADocument(rca) {
  var output = document.getElementById('rca-output');
  if (!output) return;

  var exportBtn = document.getElementById('rca-export-btn');
  if (exportBtn) exportBtn.style.display = 'inline-flex';

  window._rcaData = rca;

  output.style.display = 'block';
  output.innerHTML = '<div style="background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;">'

    // Header
    + '<div style="background:var(--navy);padding:20px 24px;">'
    + '<div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-bottom:4px;">Root Cause Analysis</div>'
    + '<div style="font-size:20px;font-weight:800;color:#fff;">' + (rca.incidentTitle || 'Incident Investigation') + '</div>'
    + '<div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:4px;">'
    + (rca.incidentDate ? rca.incidentDate + '  ·  ' : '') + (rca.incidentType || '') + '</div>'
    + '</div>'

    // Problem definition
    + rcaSection('Problem Definition', rca.problemDefinition
        ? '<div style="font-size:13px;line-height:1.7;color:#333;"><strong>Symptoms:</strong> ' + (rca.problemDefinition.symptoms || 'Not captured') + '</div><div style="font-size:13px;line-height:1.7;color:#333;margin-top:6px;"><strong>Measurable impact:</strong> ' + (rca.problemDefinition.measurableImpact || 'Not captured') + '</div>'
        : '<p style="color:#aaa;font-size:13px;">Not captured</p>')

    // Narrative
    + rcaSection('What Happened', '<p style="font-size:14px;line-height:1.7;color:#333;">' + (rca.narrative || '') + '</p>')

    // Event sequence
    + rcaSection('Event Sequence', rca.eventSequence && rca.eventSequence.length
        ? '<ol style="margin:0;padding-left:20px;">' + rca.eventSequence.map(function(s) { return '<li style="font-size:13px;line-height:1.7;color:#333;margin-bottom:4px;">' + s + '</li>'; }).join('') + '</ol>'
        : '<p style="color:#aaa;font-size:13px;">Not captured</p>')

    // Data gathered
    + rcaSection('Data Gathered', rca.dataGathered && rca.dataGathered.length
        ? '<ul style="margin:0;padding-left:18px;">' + rca.dataGathered.map(function(d) { return '<li style="font-size:13px;line-height:1.7;color:#333;margin-bottom:4px;">' + d + '</li>'; }).join('') + '</ul>'
        : '<p style="color:#aaa;font-size:13px;">Not captured</p>')

    // Contributing factors (Fishbone categories)
    + rcaSection('Contributing Factors', (rca.contributingFactors && rca.contributingFactors.length
        ? rca.contributingFactors.map(function(f) {
            return '<div style="display:flex;gap:10px;align-items:baseline;padding:6px 0;border-bottom:1px solid #F0F2F5;">'
              + '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;background:#EDE9FE;color:#7C3AED;white-space:nowrap;">' + (f.category || 'Factor') + '</span>'
              + '<span style="font-size:13px;color:#333;">' + f.factor + '</span>'
              + '</div>';
          }).join('')
        : '<p style="color:#aaa;font-size:13px;">Not captured</p>')
        + (rca.methodologyNote ? '<div style="margin-top:10px;font-size:12px;color:#777;font-style:italic;">Methodology: ' + rca.methodologyNote + '</div>' : ''))

    // Root causes
    + '<div style="background:#FFF4EE;border-top:1px solid var(--line);padding:16px 20px;">'
    + '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--orange);margin-bottom:10px;">Root Causes</div>'
    + (rca.rootCauses && rca.rootCauses.length
        ? rca.rootCauses.map(function(r, i) {
            return '<div style="padding:10px 12px;background:#fff;border-radius:8px;border-left:3px solid var(--orange);margin-bottom:8px;">'
              + '<div style="font-size:14px;font-weight:700;color:var(--navy);">' + r.cause + '</div>'
              + (r.systemFailure ? '<div style="font-size:12px;color:#777;margin-top:3px;">System failure: ' + r.systemFailure + '</div>' : '')
              + (r.validationMethod ? '<div style="font-size:12px;color:#7C3AED;margin-top:3px;">Validated via: ' + r.validationMethod + '</div>' : '')
              + '</div>';
          }).join('')
        : '<p style="color:#aaa;font-size:13px;">Not captured</p>')
    + '</div>'

    // Corrective actions
    + rcaSection('Corrective Actions', rca.correctiveActions && rca.correctiveActions.length
        ? rca.correctiveActions.map(function(a, i) {
            return '<div style="padding:10px 12px;border:1px solid var(--line);border-radius:8px;margin-bottom:8px;">'
              + '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">'
              + '<span style="background:var(--navy);color:#fff;border-radius:5px;padding:1px 8px;font-size:12px;font-weight:700;">' + (i+1) + '</span>'
              + '<span style="font-size:14px;font-weight:700;color:var(--navy);">' + a.action + '</span>'
              + '</div>'
              + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">'
              + (a.responsibleParty ? '<div style="font-size:12px;color:#555;"><strong>Responsible:</strong> ' + a.responsibleParty + '</div>' : '<div></div>')
              + (a.dueDate ? '<div style="font-size:12px;color:#555;"><strong>Due:</strong> ' + a.dueDate + '</div>' : '<div></div>')
              + (a.verification ? '<div style="font-size:12px;color:#555;grid-column:1/-1;"><strong>Verification:</strong> ' + a.verification + '</div>' : '')
              + (a.addressesRootCause ? '<div style="font-size:12px;color:var(--orange);grid-column:1/-1;"><strong>Addresses:</strong> ' + a.addressesRootCause + '</div>' : '')
              + '</div>'
              + '</div>';
          }).join('')
        : '<p style="color:#aaa;font-size:13px;">Not captured</p>')

    // Implementation plan
    + rcaSection('Implementation', rca.implementationPlan && rca.implementationPlan.length
        ? rca.implementationPlan.map(function(p) {
            return '<div style="padding:8px 12px;background:#F5F4F0;border-radius:8px;margin-bottom:6px;">'
              + '<div style="font-size:13px;color:#333;font-weight:600;">' + p.action + '</div>'
              + '<div style="display:flex;gap:16px;margin-top:4px;">'
              + (p.owner ? '<span style="font-size:12px;color:#555;"><strong>Owner:</strong> ' + p.owner + '</span>' : '')
              + (p.timeline ? '<span style="font-size:12px;color:#555;"><strong>Timeline:</strong> ' + p.timeline + '</span>' : '')
              + '</div></div>';
          }).join('')
        : '<p style="color:#aaa;font-size:13px;">Not captured</p>')

    // Monitoring plan
    + rcaSection('Monitoring &amp; Effectiveness Verification', rca.monitoringPlan && rca.monitoringPlan.length
        ? rca.monitoringPlan.map(function(m) {
            return '<div style="padding:8px 12px;background:#EFF8F4;border-radius:8px;margin-bottom:6px;border-left:3px solid #5DCAA5;">'
              + '<div style="font-size:13px;color:#333;font-weight:600;">' + m.action + '</div>'
              + '<div style="display:flex;gap:16px;margin-top:4px;">'
              + (m.method ? '<span style="font-size:12px;color:#555;"><strong>Method:</strong> ' + m.method + '</span>' : '')
              + (m.cadence ? '<span style="font-size:12px;color:#555;"><strong>Cadence:</strong> ' + m.cadence + '</span>' : '')
              + '</div></div>';
          }).join('')
        : '<p style="color:#aaa;font-size:13px;">Not captured</p>')

    // Lessons learned
    + rcaSection('Lessons Learned', rca.lessonsLearned && rca.lessonsLearned.length
        ? '<ul style="margin:0;padding-left:18px;">' + rca.lessonsLearned.map(function(l) { return '<li style="font-size:13px;line-height:1.7;color:#333;margin-bottom:4px;">' + l + '</li>'; }).join('') + '</ul>'
        : '<p style="color:#aaa;font-size:13px;">Not captured</p>')

    + '<div style="background:#F5F4F0;padding:12px 20px;font-size:11px;color:#aaa;border-top:1px solid var(--line);">Generated by PreTaskIQ RCA Assistant — Review and verify all findings before finalizing. This is a working document.</div>'
    + '</div>';

  output.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function rcaSection(title, content) {
  return '<div style="padding:16px 20px;border-top:1px solid var(--line);">'
    + '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--navy);margin-bottom:10px;">' + title + '</div>'
    + content
    + '</div>';
}

function exportRCA() {
  if (!window._rcaData) return;
  var data = window._rcaData;
  var text = 'ROOT CAUSE ANALYSIS\n' + '='.repeat(50) + '\n\n';
  text += 'Incident: ' + (data.incidentTitle || '') + '\n';
  text += 'Date: ' + (data.incidentDate || 'Not specified') + '\n';
  text += 'Type: ' + (data.incidentType || '') + '\n\n';
  text += 'NARRATIVE\n' + (data.narrative || '') + '\n\n';
  if (data.rootCauses) {
    text += 'ROOT CAUSES\n';
    data.rootCauses.forEach(function(r, i) { text += (i+1) + '. ' + r.cause + '\n'; });
    text += '\n';
  }
  if (data.correctiveActions) {
    text += 'CORRECTIVE ACTIONS\n';
    data.correctiveActions.forEach(function(a, i) {
      text += (i+1) + '. ' + a.action + '\n';
      if (a.responsibleParty) text += '   Responsible: ' + a.responsibleParty + '\n';
      if (a.dueDate) text += '   Due: ' + a.dueDate + '\n';
    });
  }
  var blob = new Blob([text], { type: 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'RCA_' + (data.incidentTitle || 'Investigation').replace(/\s+/g, '_') + '.txt';
  a.click();
  URL.revokeObjectURL(url);
}

// Phase chip styling
document.addEventListener('DOMContentLoaded', function() {
  var style = document.createElement('style');
  style.textContent = '.rca-phase-chip { font-size:11px;font-weight:600;padding:4px 12px;border-radius:20px;background:#E8ECF0;color:#777;cursor:default; }';
  document.head.appendChild(style);
});


// ---- Start from an incident report --------------------------------------------------------------------------------------------------
// The administrator uploads a report (names removed). It is read once, here, into a short plain-text summary that is shown in the chat so the
// person can see exactly what was understood; only that text (never the file) goes into the rest of the conversation.
var rcaBusyUpload = false;
var RCA_MAX_FILE = 8 * 1024 * 1024;
function rcaSummaryPrompt() {
  return 'Read this incident report and respond with ONLY a JSON object (no markdown):\n'
    + '{\n'
    + '  "what_happened": "plain account, in order, max 1200 characters, only what the document states",\n'
    + '  "impact": "injury, damage, downtime or cost as stated, else empty string",\n'
    + '  "when_where": "date and general place type as stated (for example a month and year; \'second floor of a building\'), no addresses",\n'
    + '  "work_being_done": "the task or trade, else empty string",\n'
    + '  "roles_involved": ["roles only, for example \'electrician\', \'foreman\'"],\n'
    + '  "causes_stated": ["causes the document itself gives; empty if none"],\n'
    + '  "actions_stated": ["immediate or corrective actions the document lists; empty if none"],\n'
    + '  "not_stated": ["important things a root cause investigation needs that the document does not say, max 5 short phrases"],\n'
    + '  "personal_info_found": true or false   // true if the document still contains a person\'s name, phone number, address, birth date or ID number\n'
    + '}\n'
    + 'Use roles, never names, in every field. Use only facts the document states; leave a field empty instead of guessing.';
}
function rcaTrim(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); }
function rcaList(v, max, n) { return (Array.isArray(v) ? v : []).map(function(x) { return rcaTrim(x, n); }).filter(Boolean).slice(0, max); }
function rcaSummaryText(j) {
  var lines = ["I'm starting from an uploaded incident report. This is what it says (names removed):", ''];
  var add = function(label, val) { if (val && val.length) lines.push(label + ': ' + (Array.isArray(val) ? val.join('; ') : val)); };
  add('What happened', rcaTrim(j.what_happened, 1200)); add('Impact', rcaTrim(j.impact, 300)); add('When and where', rcaTrim(j.when_where, 200));
  add('Work being done', rcaTrim(j.work_being_done, 200)); add('Roles involved', rcaList(j.roles_involved, 8, 60));
  add('Causes the report states', rcaList(j.causes_stated, 6, 200)); add('Actions the report lists', rcaList(j.actions_stated, 6, 200));
  add('Not in the report', rcaList(j.not_stated, 5, 120));
  return lines.join('\n');
}
function rcaFileToBase64(file) {
  return new Promise(function(resolve, reject) {
    var r = new FileReader();
    r.onload = function() { resolve(String(r.result).split(',')[1] || ''); };
    r.onerror = function() { reject(new Error('Could not read that file.')); };
    r.readAsDataURL(file);
  });
}
async function startRCAFromReport(file) {
  if (rcaBusyUpload || rcaDone || rcaMessages.length) return;
  var okType = file && (file.type === 'application/pdf' || file.type === 'image/png' || file.type === 'image/jpeg');
  if (!okType) { addRCABubble('assistant', 'I can read a PDF, PNG or JPG. Please choose one of those.'); return; }
  if (file.size > RCA_MAX_FILE) { addRCABubble('assistant', 'That file is over 8 MB. Please upload a smaller copy (for example, only the incident pages).'); return; }
  rcaBusyUpload = true;
  var btn = document.getElementById('rca-upload-btn'); if (btn) btn.disabled = true;
  addRCABubble('user', '📎 ' + file.name);
  addRCABubble('assistant', 'Reading the report…');
  try {
    var data64 = await rcaFileToBase64(file);
    var block = file.type === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data64 } }
      : { type: 'image', source: { type: 'base64', media_type: file.type, data: data64 } };
    var response = await fetch(window.PRETASKIQ_API_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1800, messages: [{ role: 'user', content: [block, { type: 'text', text: rcaSummaryPrompt() }] }] })
    });
    if (!response.ok) throw new Error('The report could not be read (' + response.status + '). You can describe what happened instead.');
    var data = await response.json();
    var text = (data.content || []).map(function(b) { return b.text || ''; }).join('').replace(/```json|```/g, '').trim();
    var j; try { j = JSON.parse(text); } catch (e) { throw new Error('I could not make sense of that report. You can describe what happened instead.'); }
    if (!rcaTrim(j.what_happened, 50)) throw new Error('I could not find an account of what happened in that file. You can describe it instead.');
    var chat = document.getElementById('rca-chat'); var last = chat && chat.lastElementChild; if (last) last.remove();   // the "Reading the report…" line
    if (j.personal_info_found === true) addRCABubble('assistant', 'Heads up: this report still seems to contain personal details (a name, phone number, address or similar). I left them out of my summary, but please remove them from the file before uploading in future.');
    var up = document.getElementById('rca-upload-row'); if (up) up.style.display = 'none';
    var input = document.getElementById('rca-input');
    if (input) { input.value = rcaSummaryText(j); }
    rcaBusyUpload = false;
    await sendRCAMessage();
  } catch (e) {
    var chat2 = document.getElementById('rca-chat'); var l2 = chat2 && chat2.lastElementChild;
    if (l2 && /Reading the report/.test(l2.textContent || '')) l2.remove();
    addRCABubble('assistant', (e && e.message) || 'The report could not be read. You can describe what happened instead.');
    rcaBusyUpload = false; if (btn) btn.disabled = false;
  }
}
document.addEventListener('change', function(ev) {
  var t = ev.target;
  if (t && t.id === 'rca-file') { var f = t.files && t.files[0]; t.value = ''; if (f) startRCAFromReport(f); }
});
