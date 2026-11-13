/* ============================================================
   Phase 4: Document rendering
   ============================================================ */
function tagListHtml(items, color) {
  return `<div class="tag-list">${items.map(item =>
    `<span class="tag" style="color:${color};background:${color}14;border:1px solid ${color}33;">${escapeHtml(item)}</span>`
  ).join("")}</div>`;
}

const RISK_RATING_STYLES = {
  high:   { label: "HIGH",   color: "#fff", bg: "#B5472A", border: "#B5472A" },
  medium: { label: "MEDIUM", color: "#7A5400", bg: "#FCEEC7", border: "#E8C766" },
  low:    { label: "LOW",    color: "#27500A", bg: "#E6F1DC", border: "#A9CC8A" }
};

function riskBadge(rating) {
  const key = (rating || "medium").toLowerCase();
  const s = RISK_RATING_STYLES[key] || RISK_RATING_STYLES.medium;
  return `<span style="flex-shrink:0;font-size:10px;font-weight:700;letter-spacing:0.04em;color:${s.color};background:${s.bg};border:1px solid ${s.border};border-radius:5px;padding:2px 7px;margin-right:8px;">${s.label}</span>`;
}

let editModeActive = false;

function riskRatingSelect(stepIdx, hazardIdx, currentRating) {
  if (!editModeActive) {
    // Read mode: show the styled colored badge, not a dropdown
    return riskBadge(currentRating);
  }
  // Edit mode: show an actual select
  const opts = ["low", "medium", "high"].map(r =>
    `<option value="${r}" ${r === (currentRating || "medium").toLowerCase() ? "selected" : ""}>${r.toUpperCase()}</option>`
  ).join("");
  return `<select class="editable-select" data-edit="hazard-rating" data-step="${stepIdx}" data-hazard="${hazardIdx}">${opts}</select>`;
}

function renderDocument(jha) {
  activeJHA = jha;

  const stepsHtml = (jha.taskSteps || []).map((step, i) => {
    const isHigh = (step.riskLevel || "").toLowerCase() === "high";
    const badge = isHigh
      ? `<span style="margin-left:auto;font-size:10.5px;font-weight:700;letter-spacing:0.04em;color:#fff;background:#B5472A;border-radius:5px;padding:2px 8px;">HIGH RISK</span>`
      : `<span style="margin-left:auto;font-size:10.5px;font-weight:700;letter-spacing:0.04em;color:var(--slate);background:#E5E1D8;border-radius:5px;padding:2px 8px;">ROUTINE</span>`;

    const hazardsHtml = (step.hazards || []).map((h, j) => `
      <li style="margin-bottom:10px;list-style:none;">
        <div style="display:flex;align-items:flex-start;gap:0;">
          ${riskRatingSelect(i, j, h.riskRating)}
          <span class="editable-field" contenteditable="false"
            data-edit="hazard-desc" data-step="${i}" data-hazard="${j}">${escapeHtml(h.description || "")}</span>
        </div>
        ${(typeof stkyBadgeHtml === 'function' && h.stkyCategoryId && stkyBadgeHtml(h.stkyCategoryId)) ? '<div style="margin-top:5px;">' + stkyBadgeHtml(h.stkyCategoryId) + '</div>' : ''}
        <div style="margin-top:4px;font-size:13px;display:flex;gap:6px;align-items:flex-start;">
          <span style="font-weight:700;flex-shrink:0;color:var(--good);">Control:</span>
          <span class="editable-field" contenteditable="false"
            data-edit="hazard-control" data-step="${i}" data-hazard="${j}"
            style="color:var(--slate-dark);">${escapeHtml(h.control || "")}</span>
        </div>
      </li>
    `).join("");

    const taskPpeVal = (step.ppe && step.ppe.length > 0) ? step.ppe.join(", ") : "";
    const taskPpeHtml = `<span class="editable-field" contenteditable="false"
      data-edit="step-ppe" data-step="${i}"
      style="font-size:${taskPpeVal ? "13" : "12.5"}px;color:var(--${taskPpeVal ? "slate-dark" : "slate"});">${escapeHtml(taskPpeVal || "Standard PPE only")}</span>`;

    const taskPermitsVal = (step.permits && step.permits.length > 0) ? step.permits.join(", ") : "";
    const taskPermitsHtml = `<span class="editable-field" contenteditable="false"
      data-edit="step-permits" data-step="${i}"
      style="font-size:${taskPermitsVal ? "13" : "12.5"}px;color:var(--${taskPermitsVal ? "slate-dark" : "slate"});">${escapeHtml(taskPermitsVal || "None")}</span>`;

    const equipmentHtml = (step.equipment && step.equipment.length > 0)
      ? `<div style="padding:12px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span style="font-size:11px;font-weight:700;letter-spacing:0.04em;color:var(--slate);flex-shrink:0;">\u{1F527} EQUIPMENT</span>
          ${tagListHtml(step.equipment, "#5B6B7C")}
        </div>`
      : "";

    return `
    <div class="step-card" style="${isHigh ? "border-color:#F0997B;" : ""}">
      <div class="step-head" style="${isHigh ? "background:#FAECE7;" : ""}">
        <span class="step-num mono">${String(i + 1).padStart(2, "0")}</span>
        <span class="editable-field" contenteditable="false"
          data-edit="step-name" data-step="${i}">${escapeHtml(step.step)}</span>
        ${badge}
      </div>
      ${equipmentHtml}
      <div style="padding:14px 16px;border-bottom:1px solid var(--line);">
        <div class="step-col-label" style="color:#B5472A;margin-bottom:10px;">HAZARDS &amp; CONTROLS</div>
        <ul style="margin:0;padding:0;">${hazardsHtml}</ul>
      </div>
      <div class="step-grid">
        <div class="step-col left">
          <div class="step-col-label" style="color:var(--navy);">PPE FOR THIS TASK</div>
          ${taskPpeHtml}
        </div>
        <div class="step-col">
          <div class="step-col-label" style="color:#B5472A;">PERMITS FOR THIS TASK</div>
          ${taskPermitsHtml}
        </div>
      </div>
    </div>
  `;
  }).join("");

  const lessonsHtml = jha.lessonsLearned ? `
    <div class="lessons-box">
      <div style="font-size:18px;line-height:1;">\u{1F4A1}</div>
      <div>
        <div class="lessons-title">LESSONS LEARNED</div>
        <div class="editable-field" contenteditable="false"
          data-edit="lessons"
          style="font-size:14px;line-height:1.6;color:var(--slate-dark);">${escapeHtml(jha.lessonsLearned)}</div>
        ${(typeof window.reenactButtonHtml === "function" && jha.lessonsLearnedIncidentId) ? `<div style="margin-top:10px;">${window.reenactButtonHtml(String(jha.lessonsLearnedIncidentId))}</div>` : ""}
      </div>
    </div>` : "";

  const emergencyHtml = `<ul class="plain">${(jha.emergencyConsiderations || []).map((e, i) =>
    `<li><span class="editable-field" contenteditable="false"
      data-edit="emergency" data-idx="${i}">${escapeHtml(e)}</span></li>`
  ).join("")}</ul>`;

  const revision = jha.revision || 1;
  const isManualEdit = revision > 1 && (jha.lastUpdated || "").includes("edited");
  const revisionBadge = revision > 1
    ? `<span style="font-size:11px;font-weight:700;letter-spacing:0.04em;color:#fff;background:var(--orange);border-radius:5px;padding:2px 9px;margin-left:10px;">REV ${revision}${isManualEdit ? " — EDITED" : " — UPDATED"}</span>`
    : `<span style="font-size:11px;font-weight:600;letter-spacing:0.04em;color:#A9C2D8;margin-left:10px;">REV 1</span>`;

  document.getElementById("doc-content").innerHTML = `
    ${editModeActive ? '<div class="doc-edit-banner">\u2712\uFE0F Edit mode active — tap any field to edit. Changes save automatically.</div>' : ""}
    <div class="doc-header">
      <div class="doc-eyebrow mono">${(typeof getJHADocumentTitle === "function" ? getJHADocumentTitle() : "JOB HAZARD ANALYSIS").toUpperCase()}${revisionBadge}</div>
      <h1 class="doc-title display">
        <span class="editable-field" contenteditable="false" data-edit="jobTitle">${escapeHtml(jha.jobTitle || "Untitled Task")}</span>
      </h1>
      <div class="doc-meta">
        <div><span class="lbl">Date </span><span class="editable-field" contenteditable="false" data-edit="date" style="color:#E6F1FB;">${escapeHtml(jha.date || "")}</span></div>
        <div><span class="lbl">Location </span><span class="editable-field" contenteditable="false" data-edit="location" style="color:#E6F1FB;">${escapeHtml(jha.location || "")}</span></div>
        <div><span class="lbl">Crew </span><span class="editable-field" contenteditable="false" data-edit="crewSize" style="color:#E6F1FB;">${escapeHtml(jha.crewSize || "")}</span></div>
        <div><span class="lbl">Prepared by </span>${escapeHtml(jha.preparedBy || "PreTaskIQ AI Planning Assistant")}</div>
      </div>
      <div style="margin-top:10px;font-size:12px;color:#A9C2D8;">Last updated: ${escapeHtml(jha.lastUpdated || jha.date || "")}</div>
    </div>
    <div id="doc-custom-fields-area"></div>
    <div class="doc-body">
      ${typeof stkyBoxHtml === 'function' ? stkyBoxHtml(jha) : ''}
      <div class="section-label">Task Steps, Hazards, Controls &amp; Requirements</div>
      <div style="margin-bottom:32px;">${stepsHtml}</div>
      <div class="section-label">Emergency Considerations</div>
      ${emergencyHtml}
      ${lessonsHtml}
      <div class="stopwork-row">
        <div class="stopwork-label">STOP WORK IF</div>
        <div class="editable-field" contenteditable="false" data-edit="stopWorkTrigger"
          style="font-size:14px;line-height:1.6;color:var(--slate-dark);font-weight:500;">${escapeHtml(jha.stopWorkTrigger || "")}</div>
      </div>
      <div style="margin-top:32px;padding-top:24px;border-top:1px solid var(--line);">
        <div class="section-label">Crew Acknowledgment</div>
        <div style="font-size:12.5px;color:var(--slate);margin-bottom:16px;line-height:1.6;">By signing below, each crew member confirms they reviewed this hazard analysis, understand the hazards and controls for today's work, and will stop work and notify their supervisor if conditions change.</div>
        <div id="signoff-rows">${signoffRowsHtml(4)}</div>
      </div>
    </div>
  `
  // Render custom org fields
  var _cfArea = document.getElementById('doc-custom-fields-area');
  if (_cfArea && typeof getCustomFieldsHTML === 'function') { _cfArea.innerHTML = getCustomFieldsHTML(); }
;

  const docCard = document.getElementById("doc-content");
  const editBtn = document.getElementById("doc-edit-toggle");
  if (editBtn) editBtn.style.display = "inline-block";
  if (editModeActive) { docCard.classList.add("edit-mode-active"); } 
  else { docCard.classList.remove("edit-mode-active"); }
  attachEditHandlers();
}

function attachEditHandlers() {
  const docCard = document.getElementById("doc-content");
  docCard.querySelectorAll(".editable-field").forEach(el => {
    el.addEventListener("click", () => {
      if (!editModeActive) return;
      el.contentEditable = "true";
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    });
    el.addEventListener("blur", () => {
      el.contentEditable = "false";
      const val = el.textContent.trim();
      const editType = el.dataset.edit;
      const stepIdx = parseInt(el.dataset.step);
      const hazardIdx = parseInt(el.dataset.hazard);
      const itemIdx = parseInt(el.dataset.idx);
      let changed = false;
      if (editType === "jobTitle" && val !== activeJHA.jobTitle) { activeJHA.jobTitle = val; changed = true; }
      else if (editType === "date") { activeJHA.date = val; changed = true; }
      else if (editType === "location") { activeJHA.location = val; changed = true; }
      else if (editType === "crewSize") { activeJHA.crewSize = val; changed = true; }
      else if (editType === "stopWorkTrigger" && val !== activeJHA.stopWorkTrigger) { activeJHA.stopWorkTrigger = val; changed = true; }
      else if (editType === "lessons") { activeJHA.lessonsLearned = val; changed = true; }
      else if (editType === "step-name" && !isNaN(stepIdx)) { activeJHA.taskSteps[stepIdx].step = val; changed = true; }
      else if (editType === "hazard-desc" && !isNaN(stepIdx) && !isNaN(hazardIdx)) { activeJHA.taskSteps[stepIdx].hazards[hazardIdx].description = val; changed = true; }
      else if (editType === "hazard-control" && !isNaN(stepIdx) && !isNaN(hazardIdx)) { activeJHA.taskSteps[stepIdx].hazards[hazardIdx].control = val; changed = true; }
      else if (editType === "step-ppe" && !isNaN(stepIdx)) { activeJHA.taskSteps[stepIdx].ppe = val.split(",").map(s => s.trim()).filter(Boolean); changed = true; }
      else if (editType === "step-permits" && !isNaN(stepIdx)) { activeJHA.taskSteps[stepIdx].permits = val.split(",").map(s => s.trim()).filter(Boolean); changed = true; }
      else if (editType === "emergency" && !isNaN(itemIdx)) { activeJHA.emergencyConsiderations[itemIdx] = val; changed = true; }
      else if (editType === "stky-exposure" && activeJHA.stkyExposures && activeJHA.stkyExposures[parseInt(el.dataset.stky)]) { activeJHA.stkyExposures[parseInt(el.dataset.stky)].exposure = val; changed = true; }
      else if (editType === "stky-control" && activeJHA.stkyExposures && activeJHA.stkyExposures[parseInt(el.dataset.stky)] && val && val !== STKY_NO_CONTROL) { activeJHA.stkyExposures[parseInt(el.dataset.stky)].directControl = val; el.classList.remove("stky-missing"); changed = true; }
      if (changed) bumpRevisionForEdit();
    });
    el.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); el.blur(); }
      if (e.key === "Escape") { el.contentEditable = "false"; }
    });
  });
  docCard.querySelectorAll(".editable-select").forEach(sel => {
    sel.disabled = !editModeActive;
    sel.addEventListener("change", () => {
      const si = parseInt(sel.dataset.step), hi = parseInt(sel.dataset.hazard);
      activeJHA.taskSteps[si].hazards[hi].riskRating = sel.value;
      bumpRevisionForEdit();
    });
  });
}

function bumpRevisionForEdit() {
  activeJHA.revision = (activeJHA.revision || 1) + 1;
  activeJHA.lastUpdated = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) + " (manually edited)";
  const eyebrow = document.querySelector(".doc-eyebrow");
  if (eyebrow) {
    eyebrow.innerHTML = `JOB HAZARD ANALYSIS <span style="font-size:11px;font-weight:700;letter-spacing:0.04em;color:#fff;background:var(--orange);border-radius:5px;padding:2px 9px;margin-left:10px;">REV ${activeJHA.revision} — EDITED</span>`;
  }
}

// Edit mode toggle — wired directly since script runs after DOM
(function() {
  const editBtn = document.getElementById("doc-edit-toggle");
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      editModeActive = !editModeActive;
      editBtn.textContent = editModeActive ? "✅ Done editing" : "✏️ Edit";
      editBtn.classList.toggle("btn-edit-active", editModeActive);
      if (activeJHA) renderDocument(activeJHA);
    });
  }
})();

function signoffRowsHtml(count) {
  let rows = "";
  for (let i = 0; i < count; i++) {
    rows += `
      <div style="display:grid;grid-template-columns:1fr 1fr 110px;gap:16px;padding:12px 0;border-bottom:1px solid var(--line);align-items:end;">
        <div style="border-bottom:1px solid var(--slate);height:20px;"></div>
        <div style="border-bottom:1px solid var(--slate);height:20px;"></div>
        <div style="border-bottom:1px solid var(--slate);height:20px;"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 110px;gap:16px;margin-bottom:14px;">
        <div style="font-size:10.5px;color:var(--slate);letter-spacing:0.03em;">PRINTED NAME</div>
        <div style="font-size:10.5px;color:var(--slate);letter-spacing:0.03em;">SIGNATURE</div>
        <div style="font-size:10.5px;color:var(--slate);letter-spacing:0.03em;">TIME</div>
      </div>
    `;
  }
  return rows;
}

document.getElementById("doc-restart").addEventListener("click", resetToIntake);

function resetToIntake() {
  apiMessages = [];
  lastApiMessages = null;
  convDone = false;
  activeProcedure = null;
  intakeTextarea.value = "";
  intakeSubmit.disabled = true;
  updateConnectivityState();
  showScreen("intake");
}
