/* ============================================================
   Submit the plan, then hand over to Petey as the shift companion.
   Added in the Vite port; not part of the original prototype. Runs after the persistence bridge (29) and the voice script (30).

   What "submit" means here: the foreman has gone through the plan with the crew, the crew has signed it (31-crew-signoff.js: every person
   on the crew list must have signed this revision), and the foreman hands it over to start the shift.
   - The plan is marked as submitted, inside the plan itself: activeJHA.submitted = { at, revision }. (Plans are saved as plain JSON,
     so the mark is saved with the plan and comes back when the plan is opened from "My plans".)
   - When someone is signed in it is saved as the same plan (29-persistence-bridge.js: PT.saveSubmitted).
   - The app then opens Petey's shift companion screen with a greeting (spoken too, if the plan was made by voice).
   It does NOT send the plan to anyone: there is no approval step or notification yet.

   If the plan changes after it was submitted (a hand edit, or Petey's mid-shift update) the Submit button comes back as "Submit Rev N",
   so the crew looks at the change before carrying on. A plan this person may only read (someone else's) has no Submit button.
   ============================================================ */
(function () {
  var PT = (window.PreTaskIQ = window.PreTaskIQ || {});
  var $ = function (id) { return document.getElementById(id); };
  var show = function (el, on, display) { if (el) el.style.display = on ? (display || '') : 'none'; };

  function plan() { return typeof activeJHA !== 'undefined' ? activeJHA : null; }
  function revOf(j) { return (j && j.revision) || 1; }
  function submittedOf(j) { return j && j.submitted && j.submitted.at ? j.submitted : null; }
  function upToDate(j) { var s = submittedOf(j); return !!s && (s.revision || 1) >= revOf(j); }   // submitted, and not changed since
  function whenText(iso) { try { return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; } }

  // ---- what the document screen shows --------------------------------------------------------------
  function refresh() {
    var j = plan(), sub = submittedOf(j), current = upToDate(j), readOnly = !!PT.readOnlyPlan;
    var canSubmit = !!j && !readOnly && !current;
    var label = sub ? 'Submit Rev ' + revOf(j) : 'Submit plan';

    var top = $('doc-submit');
    if (top) top.textContent = '✓ ' + label;
    show(top, canSubmit);
    show($('doc-open-petey'), !!j && (!!sub || readOnly), 'inline-flex');     // before it is submitted, Petey comes after Submit

    var barLabel = $('doc-bar-submit-label');
    if (barLabel) barLabel.textContent = sub ? label : 'Submit and start shift with Petey';
    show($('doc-bar-submit'), canSubmit, 'inline-flex');
    show($('doc-bar-petey'), !canSubmit, 'inline-flex');

    var crewSt = PT.crew ? PT.crew.status(j) : { ok: true, total: 0, signed: 0, waiting: [] };
    var panel = $('doc-submit-panel');
    if (panel) {
      if (!j || readOnly) { show(panel, false); panel.innerHTML = ''; }
      else {
        show(panel, true);
        if (current) {
          panel.className = 'submit-panel is-done';
          panel.innerHTML = '<div class="submit-done">✓ Submitted · Rev ' + revOf(j) + ' · ' + escapeHtml(whenText(sub.at)) + '</div>'
            + '<div class="submit-text">Petey is your shift companion for this plan. Open him if the work changes, for a policy or OSHA question, or to track a procedure.'
            + (crewSt.ok ? '' : ' <strong>Still waiting for a signature: ' + escapeHtml(crewSt.waiting.join(', ')) + '.</strong>') + '</div>'
            + '<button id="doc-panel-petey" class="btn-primary submit-big" type="button">🎙️ Open Petey</button>';
        } else if (sub) {
          panel.className = 'submit-panel is-changed';
          panel.innerHTML = '<div class="submit-done">This plan changed after it was submitted (Rev ' + escapeHtml(String(sub.revision || 1)) + ' → Rev ' + revOf(j) + ').</div>'
            + '<div class="submit-text">Go through the change with the crew and have everyone sign again, then submit it. Petey stays your shift companion.'
            + (crewSt.ok ? '' : ' <strong>' + crewSt.signed + ' of ' + crewSt.total + ' have signed this revision.</strong>') + '</div>'
            + '<button id="doc-panel-submit" class="btn-primary submit-big" type="button">✓ Submit Rev ' + revOf(j) + '</button>';
        } else {
          panel.className = 'submit-panel';
          panel.innerHTML = '<div class="submit-title">Ready to start the shift?</div>'
            + '<div class="submit-text">When the crew has reviewed this plan and everyone has signed above, submit it. Petey then becomes your shift companion: call on him when the plan changes, for a policy or OSHA question, or to track a procedure.'
            + (crewSt.ok ? '' : ' <strong>' + (crewSt.total ? crewSt.signed + ' of ' + crewSt.total + ' have signed.' : 'No one is on the crew list yet.') + '</strong>') + '</div>'
            + '<button id="doc-panel-submit" class="btn-primary submit-big" type="button">✓ Submit and start shift with Petey</button>';
        }
      }
    }

    var eyebrow = document.querySelector('#doc-content .doc-eyebrow');
    if (eyebrow) {
      var old = eyebrow.querySelector('.submitted-chip');
      if (old) old.remove();
      if (current) {
        var chip = document.createElement('span');
        chip.className = 'submitted-chip';
        chip.textContent = '✓ SUBMITTED';
        eyebrow.appendChild(chip);
      }
    }
  }

  // ---- what the companion screen shows -------------------------------------------------------------
  function banner() {
    var el = $('petey-shift-banner'), j = plan(), sub = submittedOf(j);
    if (!el) return;
    if (!j || !sub) { show(el, false); el.innerHTML = ''; return; }
    show(el, true);
    el.innerHTML = '<div class="shift-banner-top"><span class="shift-badge">ON SHIFT</span>'
      + '<span class="shift-job">' + escapeHtml(j.jobTitle || 'Today’s plan') + '</span>'
      + '<span class="shift-rev">Rev ' + revOf(j) + ' · submitted ' + escapeHtml(whenText(sub.at)) + '</span></div>'
      + (upToDate(j) ? '' : '<div class="shift-warn">The plan changed after it was submitted (Rev ' + escapeHtml(String(sub.revision || 1)) + ' → Rev ' + revOf(j) + '). Open Today’s JHA so the crew can review it, then submit it again.</div>')
      + '<div class="shift-uses">'
      + '<div><strong>The plan changes</strong> Tell me what changed and I update the plan.</div>'
      + '<div><strong>Policy or OSHA question</strong> Ask me, any time.</div>'
      + '<div><strong>A procedure</strong> Tell me which one you are starting and I track the steps.</div>'
      + '</div>';
  }

  // ---- submitting ----------------------------------------------------------------------------------
  // Apply a half-typed edit (Safari does not focus a tapped button, so the field may still be in focus and not yet saved).
  function applyPendingEdit() {
    var ae = document.activeElement;
    if (ae && ae.classList && ae.classList.contains('editable-field') && ae.blur) ae.blur();
  }
  // Leave edit mode, so what is submitted is what is on screen.
  function leaveEditMode() {
    if (typeof editModeActive !== 'undefined' && editModeActive) {
      editModeActive = false;
      var b = $('doc-edit-toggle');
      if (b) { b.textContent = '✏️ Edit'; b.classList.remove('btn-edit-active'); }
      if (plan()) renderDocument(plan());
    }
  }

  function greet(j) {
    var n = (j.crew || []).length;
    var text = 'Plan submitted — Rev ' + revOf(j) + (n ? ', signed by ' + n + (n === 1 ? ' person' : ' people') : '') + '. I am your shift companion now. Call on me when the work plan changes, when you have a policy or OSHA question, or when you start a procedure and want the steps tracked. Tap “Tap and talk”, or turn on “Hey Petey” for hands-free.';
    if (typeof addPeteyLogEntry === 'function') addPeteyLogEntry('petey', text);
    var v = PT.voice;
    // Spoken only if the person planned by voice (they have the sound on and are used to Petey talking). The tap that submitted counts as the tap that allows sound.
    if (v && v.usedForPlanning && v.canSpeak && typeof speakText === 'function') {
      try { v.prime(); } catch (e) { /* not fatal */ }
      speakText('Plan submitted. I am your shift companion now. Tell me if the plan changes, ask me any policy or OSHA question, or tell me when you start a procedure and I will track the steps.');
    }
  }

  function submit() {
    var j = plan();
    if (!j || PT.readOnlyPlan) return;
    applyPendingEdit();
    j = plan();
    if (upToDate(j)) return;                                                       // already submitted and not changed (a second tap)
    if (PT.crew && !PT.crew.requireAll()) return;                                  // everyone on the crew has to have signed this revision (stays in edit mode if it was on)
    leaveEditMode();
    j = plan();
    j.submitted = { at: new Date().toISOString(), revision: revOf(j) };
    var saved = PT.saveSubmitted ? PT.saveSubmitted() : Promise.resolve(undefined);   // does not wait: the shift starts either way
    refresh();
    if (typeof renderProcedureTracker === 'function') renderProcedureTracker();
    showScreen('petey');
    window.scrollTo(0, 0);
    greet(j);
    Promise.resolve(saved).then(function (r) {
      if (r === false && typeof addPeteyLogEntry === 'function') addPeteyLogEntry('system', 'The plan is submitted on this device, but it did not save to your account. See the note at the bottom left.');
    });
  }

  // ---- wiring --------------------------------------------------------------------------------------
  var on = function (id, fn) { var el = $(id); if (el) el.addEventListener('click', fn); };
  on('doc-submit', submit);
  on('doc-bar-submit', submit);
  var panelEl = $('doc-submit-panel');
  if (panelEl) panelEl.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#doc-panel-submit')) submit();
    else if (e.target.closest && e.target.closest('#doc-panel-petey')) { renderProcedureTracker(); showScreen('petey'); }
  });

  var origRender = renderDocument;
  renderDocument = function () { var r = origRender.apply(this, arguments); refresh(); return r; };

  var origBump = bumpRevisionForEdit;
  bumpRevisionForEdit = function () { var r = origBump.apply(this, arguments); refresh(); return r; };    // an edit after submitting: "Submit Rev N"

  var origUpdate = updateActiveJHAFromReport;
  updateActiveJHAFromReport = async function () {
    var before = plan();
    var r = await origUpdate.apply(this, arguments);
    var j = plan();
    if (j && j !== before) {
      refresh(); banner();
      if (submittedOf(j) && !upToDate(j) && typeof addPeteyLogEntry === 'function') addPeteyLogEntry('system', 'Rev ' + revOf(j) + ' changes what the crew signed off on. Open Today’s JHA, go through it with the crew, and tap Submit.');
    }
    return r;
  };

  var origShow = showScreen;
  showScreen = function (name) {
    var r = origShow.apply(this, arguments);
    if (name === 'petey') banner();
    if (name === 'document') refresh();
    return r;
  };

  PT.submitPlan = submit;
  PT.refreshSubmitUi = refresh;
})();
