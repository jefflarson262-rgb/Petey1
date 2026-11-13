/* ============================================================
   Persistence bridge. Added in the Vite port; not part of the original prototype.
   Runs last, in the same global scope as the prototype's scripts, so it can see activeJHA and wrap a few functions.
   It does three jobs: (1) save plans through window.PreTaskIQStore when someone is signed in, (2) limit which role
   views a signed-in person can open, (3) start the app on the planning screen instead of the guided demo.
   When nobody is signed in (shared-code mode) the store reports enabled() = false and this file changes nothing.
   ============================================================ */
(function () {
  var PT = (window.PreTaskIQ = window.PreTaskIQ || {});
  var ALL_ROLES = ['foreman', 'safety', 'construction'];
  var store = function () { return window.PreTaskIQStore || null; };
  var saving = function () { var s = store(); return !!(s && s.enabled()); };

  // ---- 1. Save plans ------------------------------------------------------------------------------
  // A brand-new plan was generated from the planning conversation.
  var origGenerate = generateJHA;
  generateJHA = async function () {
    var before = activeJHA;
    await origGenerate.apply(this, arguments);
    if (saving() && activeJHA && activeJHA !== before) store().savePlan(activeJHA, { source: 'planning' });
  };

  // Petey changed the plan mid-shift: save it as the next revision of the same plan.
  var origPeteyUpdate = updateActiveJHAFromReport;
  updateActiveJHAFromReport = async function (report) {
    var before = activeJHA;
    await origPeteyUpdate.apply(this, arguments);
    if (saving() && activeJHA && activeJHA !== before) store().savePlan(activeJHA, { source: 'petey_update', note: String(report || '') });
  };

  // Someone edited the plan by hand. Edits come in bursts, so wait a moment and save once.
  var origBump = bumpRevisionForEdit;
  var editTimer = null;
  bumpRevisionForEdit = function () {
    origBump.apply(this, arguments);
    if (!saving()) return;
    clearTimeout(editTimer);
    editTimer = setTimeout(function () { if (activeJHA && saving()) store().savePlan(activeJHA, { source: 'edit' }); }, 1200);
  };

  // Which saved plan is on screen? The store remembers that. Showing a DIFFERENT plan object (a cached copy, an offline form)
  // means it is not a saved plan yet, so later edits must create a new plan instead of overwriting the previous one.
  var origRender = renderDocument;
  renderDocument = function (jha) {
    if (jha !== activeJHA && store()) store().markNone();
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
