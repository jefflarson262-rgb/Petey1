/* ============================================================
   Guided tour: short, role-specific walkthroughs on the real screens, with a spoken line for each step (the promo video voice).
   Added in the Vite port. Runs after the persistence bridge (29) and the crew and submit scripts (31, 32).

   How it works
   - Each step highlights one real element (a spotlight over the page) and shows a caption card at the bottom. Nothing under the
     spotlight can be tapped while the tour runs, so a tour can never submit, save or change anything.
   - The foreman tour shows a SAMPLE plan on the real document screen. Before the tour starts, whatever the person had open (screen, role,
     plan, saved-plan marker) is remembered, and it is put back exactly when the tour ends.
   - The spoken lines are recordings in public/tour/audio/<role>-<step number>.mp3. The same words are on screen, so a missing
     recording just means a silent step.
   - A small card offers the tour once per person on this device (the first time they reach their home screen). The account menu starts it any time.
   - The words below are also what was recorded. If you change a step's text, record its clip again.
   ============================================================ */
(function () {
  var PT = (window.PreTaskIQ = window.PreTaskIQ || {});
  var MUTE_KEY = 'pretaskiq_tour_muted';
  var OFFER_KEY = 'pretaskiq_tour_offered_';
  var $ = function (id) { return document.getElementById(id); };
  var store = function () { return window.PreTaskIQStore || null; };

  // ---- Sample plan for the foreman tour (clearly labelled; never saved) --------------------------
  function samplePlan() {
    var now = new Date(), when = now.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
    return {
      jobTitle: 'SAMPLE: Conduit install, Building 2', date: when, location: 'Building 2, second floor', preparedBy: 'PreTaskIQ AI Planning Assistant', crewSize: '3', revision: 1, lastUpdated: when,
      taskSteps: [
        { step: 'Install conduit from a ladder', riskLevel: 'high', equipment: ['8 ft fiberglass ladder', 'Hand tools'], hazards: [
          { description: 'Fall from the ladder while reaching overhead', riskRating: 'high', stkyCategoryId: 'STKY-FALL', control: 'Secure the ladder at the top, keep three points of contact, and stay inside the side rails.' },
          { description: 'Tools or conduit falling on someone below', riskRating: 'medium', control: 'Barricade the area below and keep tools in a bucket or pouch.' }],
          ppe: ['Hard hat', 'Safety glasses', 'Gloves'], permits: [] },
        { step: 'Stage material at the work area', riskLevel: 'routine', equipment: ['Hand cart'], hazards: [
          { description: 'Strains and pinch points when moving material', riskRating: 'low', control: 'Use the cart, get help with long pieces, and keep walkways clear.' }],
          ppe: ['Gloves'], permits: [] }],
      stkyExposures: [
        { categoryId: 'STKY-FALL', task: 'Install conduit from a ladder', exposure: 'Working from a ladder about 8 feet above the floor.', directControl: 'Secure the ladder at the top and keep three points of contact.' }],
      emergencyConsiderations: ['Know where the nearest first aid kit and exit are before work starts'],
      lessonsLearned: 'Sample text: this is where lessons from your own past incidents show up, when today\'s task matches one.',
      stopWorkTrigger: 'Stop if the ladder moves or anyone enters the barricaded zone below.',
      crew: [
        { id: 'tour-c1', name: 'Alex Rivera (sample)', signature: { d: 'M 40 110 L 90 40 L 150 120 L 230 50 L 300 100 L 380 60', vb: '0 0 500 160', at: now.toISOString(), revision: 1 } },
        { id: 'tour-c2', name: 'Sam Okafor (sample)', signature: null },
        { id: 'tour-c3', name: 'Jordan Lee (sample)', signature: null }
      ]
    };
  }

  // ---- The tours ------------------------------------------------------------------------------------
  // target: a CSS selector for the element to spotlight (steps whose target is not on screen are skipped). screen / sample say what to show first.
  var TOURS = {
    foreman: { label: 'Foreman', role: 'foreman', steps: [
      { screen: 'intake', target: '.intake-card', title: 'Start here', text: 'This is where every shift starts. Tell Petey what your crew is doing today, every task, in your own words.' },
      { screen: 'intake', target: '#intake-mic', title: 'Talk to Petey', text: 'Tap Talk to Petey and say the day\'s tasks out loud. Petey asks follow-up questions, one at a time, like a seasoned safety lead.' },
      { screen: 'intake', target: '#intake-submit', title: 'Or type it', text: 'Too loud to talk, or just prefer typing? Type my plan works exactly the same way.' },
      { screen: 'intake', target: '#fm-tiles', title: 'Everything else', text: 'From here you can also report an incident or near miss, run a safety audit, or reopen your saved plans.' },
      { screen: 'document', sample: true, target: '#doc-content', title: 'Your plan', text: 'Petey turns the conversation into a plan: the hazards, the controls, protective equipment and permits. This one is a sample.' },
      { screen: 'document', sample: true, target: '#signoff-rows', title: 'Crew signs on', text: 'Add everyone on the crew. Each person signs with a finger, so everyone has heard the plan before work starts.' },
      { screen: 'document', sample: true, target: '#doc-bar-submit', title: 'Submit the plan', text: 'When every name is signed, submit the plan. Your safety administrator sees it right away.' },
      { screen: 'document', sample: true, title: 'Petey in the field', text: 'After you submit, the button at the bottom becomes Talk to Petey. Petey stays on as your shift companion. That\'s the tour. You can replay it any time from the menu.' }
    ] },
    safety: { label: 'Safety Admin', role: 'safety', steps: [
      { screen: 'admin', target: '.ov-head', title: 'Site Overview', text: 'This is your day at a glance: every plan that foremen are working on, live.' },
      { screen: 'admin', target: '.ov-actions', title: 'Start anything in one tap', text: 'Report an incident, run a safety audit, record a protection observation, or start a root cause analysis, straight from these tiles.' },
      { screen: 'admin', target: '.ov-left .ov-card', title: 'How many are submitted', text: 'This counts the plans submitted today, out of all plans started.' },
      { screen: 'admin', target: '#admin-flag-card', title: 'Changed after submission', text: 'If a plan is changed after it was submitted, it is flagged here so you can review the change.' },
      { screen: 'admin', target: '.ov-right', title: 'Who is doing what', text: 'Each row shows the foreman, the task, the work area, how far along the plan is, and its highest risk. While you are not signed in, this list is sample data.' },
      { screen: 'admin', target: '.acct-btn', title: 'Your safety inbox', text: 'When a crew flags a hazard they cannot control, it lands in your safety alerts. Open your name in the top bar, then Safety alerts, and mark each one as seen.' },
      { screen: 'admin', target: '.ov-ask', title: 'Ask Petey', text: 'Ask Petey about policies, past incidents or a procedure any time. That\'s the tour. You can replay it from the menu.' }
    ] },
    construction: { label: 'Construction Admin', role: 'construction', steps: [
      { screen: 'construction', target: '.co-head', title: 'Project Overview', text: 'This is the live state of your job folders: what needs attention, each job, the latest drawing revisions, and open requests for information. During this tour it shows sample data.' },
      { screen: 'construction', target: '.cadmin-alert', title: 'What needs attention first', text: 'When a crew has not confirmed a new drawing revision, or a permit or 811 ticket has expired, it shows here first.' },
      { screen: 'construction', target: '.co-jobs', title: 'Job folders', text: 'Each job has its own folder for scope documents, requests for information, revisions, permits and 811 tickets. Tap a job to open it.' },
      { screen: 'construction', target: '.cadmin-card', title: 'Drawing revisions', text: 'Each revision shows whether the crews working on it have confirmed that they have the current drawing.' },
      { screen: 'construction', target: '.co-ask', title: 'Ask Petey', text: 'Ask Petey about a revision or a scope change any time. That\'s the tour. You can replay it from the menu.' }
    ] }
  };
  PT.tourDefinitions = TOURS;                                    // (read by the recording script and the tests)

  // ---- Remember and restore what was open ----------------------------------------------------------
  function activeScreenName() {
    for (var i = 0; i < screens.length; i++) { var el = $('screen-' + screens[i]); if (el && el.classList.contains('active')) return screens[i]; }
    return 'intake';
  }
  function snapshot() {
    var s = store(), snap = s && s.getSnapshot ? s.getSnapshot() : null;
    return { screen: activeScreenName(), role: currentRole, jha: activeJHA, planId: snap ? snap.planId : null, revision: snap ? snap.revision : null,
      readOnly: PT.readOnlyPlan, edit: editModeActive, scroll: window.scrollY };
  }
  function restore(sv) {
    if (!sv) return;
    try {
      if (sv.role !== currentRole) setRole(sv.role);
      editModeActive = !!sv.edit;
      if (sv.jha) { activeJHA = sv.jha; renderDocument(sv.jha); }      // the same object, so the app does not treat it as a different plan
      else { activeJHA = null; var dc = $('doc-content'); if (dc) dc.innerHTML = ''; }
      var s = store();
      if (s && s.markOpened && s.markNone) { if (sv.planId) s.markOpened(sv.planId, sv.revision); else s.markNone(); }
      PT.readOnlyPlan = !!sv.readOnly;
      if (PT.refreshCrew) PT.refreshCrew();
      if (PT.refreshSubmitUi) PT.refreshSubmitUi();
      showScreen(sv.screen);
      window.scrollTo(0, sv.scroll || 0);
    } catch (e) { /* never leave the person stuck behind the tour */ try { showScreen('intake'); } catch (e2) {} }
  }

  // ---- The overlay ---------------------------------------------------------------------------------
  var tour = null;                                               // { key, steps, i, saved, token, audio }
  var root = null;

  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function muted() { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; } }

  function build() {
    if (root) return;
    root = el('div', 'tour-root');
    root.id = 'tour-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'tour-title');
    root.innerHTML = '<div class="tour-block" id="tour-block"></div><div class="tour-spot" id="tour-spot"></div>'
      + '<div class="tour-card" id="tour-card"><div class="tour-top"><span class="tour-count" id="tour-count"></span>'
      + '<button type="button" class="tour-mute" id="tour-mute" aria-label="Turn the voice off"></button></div>'
      + '<h2 class="tour-title display" id="tour-title"></h2><p class="tour-text" id="tour-text"></p>'
      + '<div class="tour-actions"><button type="button" class="tour-skip" id="tour-skip">Skip tour</button><span class="tour-gap"></span>'
      + '<button type="button" class="tour-back" id="tour-back">Back</button><button type="button" class="tour-next" id="tour-next">Next</button></div></div>';
    document.body.appendChild(root);
    var stop = function (e) { e.preventDefault(); };
    $('tour-block').addEventListener('wheel', stop, { passive: false });
    $('tour-block').addEventListener('touchmove', stop, { passive: false });
    $('tour-next').addEventListener('click', function () { go(1); });
    $('tour-back').addEventListener('click', function () { go(-1); });
    $('tour-skip').addEventListener('click', function () { end(); });
    $('tour-mute').addEventListener('click', function () {
      var m = !muted(); try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) {}
      if (m) stopAudio(); else if (tour) speak(tour.list[tour.pos]);
      paintMute();
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') end();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    });
    window.addEventListener('resize', function () { if (tour) place(); });
  }

  function paintMute() {
    var b = $('tour-mute'); if (!b) return;
    var m = muted();
    b.textContent = m ? '🔇' : '🔊';
    b.setAttribute('aria-label', m ? 'Turn the voice on' : 'Turn the voice off');
  }

  function visibleTarget(step) {
    if (!step.target) return null;
    var n = document.querySelector(step.target);
    if (!n) return null;
    var r = n.getBoundingClientRect(), cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width < 2 || r.height < 2) return null;
    return n;
  }

  // Put the spotlight over the target (or dim the whole page when a step has no target).
  function place() {
    var step = tour.steps[tour.list[tour.pos]], spot = $('tour-spot'), block = $('tour-block'), card = $('tour-card');
    var n = visibleTarget(step);
    if (!n) { spot.style.display = 'none'; block.classList.add('tour-dim'); card.classList.remove('tour-card-top'); return; }
    block.classList.remove('tour-dim');
    var cardH = card.offsetHeight || 220, vh = window.innerHeight;
    var r = n.getBoundingClientRect();
    if (r.top < 60 || r.bottom > vh - cardH - 16) {               // bring it up into the part of the screen the caption does not cover
      window.scrollTo(0, Math.max(0, window.scrollY + r.top - 70));
      r = n.getBoundingClientRect();
    }
    // A target that sits low on the screen (the bottom Submit bar) would be hidden behind the caption, so the caption moves to the top instead.
    card.classList.toggle('tour-card-top', r.bottom > vh - cardH - 16);
    var pad = 8, top = Math.max(6, r.top - pad), left = Math.max(6, r.left - pad);
    var w = Math.min(window.innerWidth - left - 6, r.width + pad * 2), h = Math.min(vh - top - 6, r.height + pad * 2);
    spot.style.display = 'block';
    spot.style.top = top + 'px'; spot.style.left = left + 'px'; spot.style.width = w + 'px'; spot.style.height = h + 'px';
  }

  function showStep() {
    var step = tour.steps[tour.list[tour.pos]];
    if (step.screen) showScreen(step.screen);
    $('tour-count').textContent = tour.label + ' tour \u00B7 ' + (tour.pos + 1) + ' of ' + tour.list.length;
    $('tour-title').textContent = step.title;
    $('tour-text').textContent = step.text;
    $('tour-back').style.visibility = tour.pos === 0 ? 'hidden' : 'visible';
    $('tour-next').textContent = tour.pos === tour.list.length - 1 ? 'Done' : 'Next';
    paintMute();
    setTimeout(function () { if (tour) { place(); $('tour-next').focus({ preventScroll: true }); } }, 80);
    speak(tour.list[tour.pos]);
  }

  // Work out which steps can be shown right now. A step whose target is not on screen (the safety inbox button while signed out, the
  // "changed after submission" card when nothing changed) is left out, so the count is honest.
  function planSteps() {
    var list = [];
    for (var i = 0; i < tour.steps.length; i++) {
      var st = tour.steps[i];
      if (st.screen) showScreen(st.screen);
      if (!st.target || visibleTarget(st)) list.push(i);
    }
    return list;
  }

  function go(dir) {
    if (!tour) return;
    var pos = tour.pos + dir;
    if (pos < 0) return;
    if (pos >= tour.list.length) { end(); return; }
    tour.pos = pos;
    showStep();
  }

  // ---- Voice ---------------------------------------------------------------------------------------
  function stopAudio() {
    if (!tour) return;
    tour.token = (tour.token || 0) + 1;
    if (tour.audio) { try { tour.audio.pause(); } catch (e) {} tour.audio = null; }
  }
  function speak(i) {
    if (!tour) return;
    stopAudio();
    if (muted()) return;
    var token = tour.token, a = new Audio('/tour/audio/' + tour.key + '-' + (i + 1) + '.mp3');
    tour.audio = a;
    var p = a.play();
    if (p && p.catch) p.catch(function () { if (tour && token === tour.token) tour.audio = null; });   // blocked or missing: the caption is still there
  }

  // ---- Start and end ------------------------------------------------------------------------------
  function end() {
    if (!tour) return;
    var sv = tour.saved;
    stopAudio();
    tour = null;
    if (root) { root.parentNode.removeChild(root); root = null; }
    restore(sv);
  }

  PT.tourRunning = function () { return tour ? tour.key : null; };
  PT.startTour = function (which) {
    if (tour) return;
    var intro = $('screen-intro'); if (intro && intro.classList.contains('active')) return;
    var key = which && TOURS[which] ? which : (TOURS[currentRole] ? currentRole : 'foreman');
    if (PT.allowed && PT.allowed.length && PT.allowed.indexOf(TOURS[key].role) === -1) key = PT.allowed[0];
    var def = TOURS[key];
    hideOffer();
    try { if (typeof demoStopSpeaking === 'function') demoStopSpeaking(); } catch (e) {}
    tour = { key: key, role: def.role, label: def.label, steps: def.steps, list: [], pos: 0, saved: snapshot(), token: 0, audio: null };
    markOffered();
    build();
    if (tour.role !== currentRole) setRole(tour.role);
    if (tour.role === 'construction' && typeof jbLoadOverview === 'function') jbLoadOverview();      // sample job data while the tour runs
    if (def.steps.some(function (st) { return st.sample; })) {
      editModeActive = false;
      renderDocument(samplePlan());                                // (the app only saves on edits, crew changes and submit, which the tour blocks)
      PT.readOnlyPlan = false;
      if (PT.refreshCrew) PT.refreshCrew();
      if (PT.refreshSubmitUi) PT.refreshSubmitUi();
    }
    tour.list = planSteps();
    if (!tour.list.length) { end(); return; }
    showStep();
  };
  PT.endTour = end;

  // ---- The one-time offer ---------------------------------------------------------------------------
  function offerKey() { return OFFER_KEY + (PT.tourUser || 'device'); }
  function markOffered() { try { localStorage.setItem(offerKey(), '1'); } catch (e) {} }
  function hideOffer() { var o = $('tour-offer'); if (o) o.parentNode.removeChild(o); }
  function maybeOffer() {
    var seen = false; try { seen = !!localStorage.getItem(offerKey()); } catch (e) { seen = true; }
    if (seen || tour || $('tour-offer')) return;
    var blocked = ['onboarding', 'intro'];
    for (var i = 0; i < blocked.length; i++) { var s = $('screen-' + blocked[i]); if (s && s.classList.contains('active')) return; }
    markOffered();
    var o = el('div', 'tour-offer');
    o.id = 'tour-offer';
    o.setAttribute('role', 'region');
    o.setAttribute('aria-label', 'Take the tour');
    o.innerHTML = '<div class="tour-offer-title">New here?</div><div class="tour-offer-text">Take a quick tour of your screens. It takes about two minutes.</div>'
      + '<div class="tour-actions"><button type="button" class="tour-skip" id="tour-offer-no">Not now</button><span class="tour-gap"></span><button type="button" class="tour-next" id="tour-offer-yes">Start the tour</button></div>';
    document.body.appendChild(o);
    $('tour-offer-no').addEventListener('click', hideOffer);
    $('tour-offer-yes').addEventListener('click', function () { PT.startTour(); });
  }

  var origStart = PT.startApp;
  PT.startApp = function (opts) {
    PT.tourUser = (opts && opts.userId) || 'device';
    var r = origStart.apply(this, arguments);
    setTimeout(maybeOffer, 900);
    return r;
  };
  var origFinish = finishOnboarding;
  finishOnboarding = function () {
    var r = origFinish.apply(this, arguments);
    setTimeout(maybeOffer, 500);
    return r;
  };
})();
