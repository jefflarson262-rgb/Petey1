/* ============================================================
   Persistence bridge. Added in the Vite port; not part of the original prototype.
   Runs last, in the same global scope as the prototype's scripts, so it can see activeJHA and wrap a few functions.
   It does four jobs: (1) save plans through window.PreTaskIQStore when someone is signed in, (2) limit which role
   views a signed-in person can open, (3) start the app on the planning screen instead of the guided demo,
   (4) record that a plan was submitted or that the crew signed (the crew sign-off is in 31-crew-signoff.js, the Submit button in 32-submit-plan.js).
   When nobody is signed in (shared-code mode) the store reports enabled() = false and this file changes nothing.
   ============================================================ */
(function () {
  var PT = (window.PreTaskIQ = window.PreTaskIQ || {});
  var ALL_ROLES = ['foreman', 'safety', 'construction'];
  var store = function () { return window.PreTaskIQStore || null; };
  var saving = function () { var s = store(); return !!(s && s.enabled()); };

  // ---- 1. Save plans ------------------------------------------------------------------------------
  // What the last save of the plan on screen was. A submission is saved as that same revision (with a note), not as a new kind of change.
  var lastSource = 'edit', lastNote = '';
  PT.readOnlyPlan = false;                              // true when the plan on screen belongs to someone else and this person may only read it

  // A brand-new plan was generated from the planning conversation.
  var origGenerate = generateJHA;
  generateJHA = async function () {
    var before = activeJHA;
    await origGenerate.apply(this, arguments);
    if (activeJHA && activeJHA !== before) {
      lastSource = 'planning'; lastNote = ''; PT.readOnlyPlan = false;
      if (saving()) store().savePlan(activeJHA, { source: 'planning' });
    }
  };

  // Petey changed the plan mid-shift: save it as the next revision of the same plan.
  var origPeteyUpdate = updateActiveJHAFromReport;
  updateActiveJHAFromReport = async function (report) {
    var before = activeJHA;
    await origPeteyUpdate.apply(this, arguments);
    if (activeJHA && activeJHA !== before) {
      // The AI hands back a fresh copy of the document without the crew list, the signatures or the record of the submission. Carry those over
      // from the document it was given (the AI never sees the signatures), so a later change is seen as a change.
      if (before && before.submitted) activeJHA.submitted = before.submitted; else delete activeJHA.submitted;
      if (before && before.crew) activeJHA.crew = before.crew; else delete activeJHA.crew;
      lastSource = 'petey_update'; lastNote = String(report || '');
      if (saving()) store().savePlan(activeJHA, { source: 'petey_update', note: lastNote });
    }
  };

  // Someone edited the plan by hand. Edits come in bursts, so wait a moment and save once.
  var origBump = bumpRevisionForEdit;
  var editTimer = null;
  bumpRevisionForEdit = function () {
    origBump.apply(this, arguments);
    lastSource = 'edit'; lastNote = '';
    if (!saving()) return;
    clearTimeout(editTimer);
    editTimer = setTimeout(function () { if (activeJHA && saving()) store().savePlan(activeJHA, { source: 'edit' }); }, 1200);
  };

  // The plan was submitted: save it as it stands now (any hand edit still waiting to be saved goes with it).
  // Resolves to undefined when nobody is signed in (nothing to save), the saved plan on success, or false when the save did not go through.
  // The crew list or a signature changed: save it (the same revision, with a note), after a short wait because names and signatures come in bursts.
  var crewTimer = null;
  PT.saveCrew = function () {
    if (!saving()) return;
    clearTimeout(crewTimer);
    crewTimer = setTimeout(function () {
      if (activeJHA && saving()) store().savePlan(activeJHA, { source: lastSource, note: 'Crew sign-off', continues: true });
    }, 800);
  };

  PT.saveSubmitted = function () {
    clearTimeout(editTimer); clearTimeout(crewTimer);
    if (!saving() || !activeJHA) return Promise.resolve(undefined);
    return store().savePlan(activeJHA, { source: lastSource, note: ('Submitted' + (lastNote ? ' \u00b7 ' + lastNote : '')).slice(0, 500), continues: true })
      .then(function (plan) { return plan || false; });
  };

  // Which saved plan is on screen? The store remembers that. Showing a DIFFERENT plan object (a cached copy, an offline form)
  // means it is not a saved plan yet, so later edits must create a new plan instead of overwriting the previous one.
  var origRender = renderDocument;
  renderDocument = function (jha) {
    if (jha !== activeJHA && store()) { store().markNone(); PT.readOnlyPlan = false; }
    return origRender.apply(this, arguments);
  };

  PT.currentPlan = function () { return activeJHA; };

  // Open a saved plan (record from /api/plans?id=...) on the document screen.
  PT.openPlan = function (rec) {
    if (!rec || !rec.data) return;
    editModeActive = false;
    var editBtn = document.getElementById('doc-edit-toggle');
    if (editBtn) { editBtn.textContent = '\u270F\uFE0F Edit'; editBtn.classList.remove('btn-edit-active'); }
    renderDocument(rec.data);                                   // this marks "no saved plan" ...
    if (store()) store().markOpened(rec.id, rec.current_revision);   // ... so say which one it is afterwards
    lastSource = 'edit'; lastNote = '';
    PT.readOnlyPlan = !!(store() && store().canWrite && !store().canWrite(rec));
    if (PT.refreshCrew) PT.refreshCrew();
    if (PT.refreshSubmitUi) PT.refreshSubmitUi();
    showScreen('document');
    window.scrollTo(0, 0);
  };

  // ---- 2. Role views ------------------------------------------------------------------------------
  PT.allowed = null;                                   // null = no limit (shared-code mode)
  var origSetRole = setRole;
  setRole = function (role) {
    if (PT.allowed && PT.allowed.indexOf(role) === -1) return;
    return origSetRole.apply(this, arguments);
  };

  function applyAllowedViews(allowed) {
    ALL_ROLES.forEach(function (r) {
      var b = document.getElementById('role-btn-' + r);
      if (b) b.style.display = allowed.indexOf(r) === -1 ? 'none' : '';
    });
    var bar = document.querySelector('.nav-role-bar');
    if (bar) bar.style.display = allowed.length > 1 ? '' : 'none';
  }

  // ---- 3. Start-up --------------------------------------------------------------------------------
  PT.openDemo = function () {
    demoStep = 0;
    showScreen('intro');
    renderDemoStep(0);
  };

  // opts.allowed (a list of role views) when signed in. Everyone lands on the planning screen (after the one-time setup questions on a new device), which is the foreman view,
  // whatever their role; people with more access switch views with the buttons in the top bar. The demo is opt-in
  // (account menu, or ?demo in the address).
  PT.startApp = function (opts) {
    opts = opts || {};
    if (opts.allowed && opts.allowed.length) {
      PT.allowed = opts.allowed.slice();
      applyAllowedViews(PT.allowed);
      currentRole = 'foreman';
      ALL_ROLES.forEach(function (r) {
        var b = document.getElementById('role-btn-' + r);
        if (b) b.classList.toggle('active', r === 'foreman');
      });
      renderRoleMenu('foreman');
    }
    if (/[?&]demo(=|&|$)/.test(location.search)) PT.openDemo();
    else if (shouldShowOnboarding()) startOnboarding();        // this device's first visit: the five short setup questions (they can be skipped)
    else showScreen('intake');
  };
})();
