// ── Guided Demo System ───────────────────────────────────────────────
// A walk through a working day with PreTaskIQ: the problem, then the foreman's plan, the field, the safety administrator's view,
// an incident, and measuring protection. Screens shown are real captures of the app (public/demo/). Numbers on the first step
// are estimates from named sources and years; update them there if the sources change.
var demoStep = 0;
var demoSpeaking = false;

var DEMO_STEPS = [
  {
    label: 'The problem',
    narration: "Building safely takes constant planning and coordination, and the bigger the project, the more places it can break down. Drawing revisions, scope changes, R. F. I. responses, updated procedures: each one has to travel from the person who made the decision to the person holding the tool. When that handoff fails, it shows up as rework, incidents and delays. Industry research puts the cost of poor project data and miscommunication in the tens of billions, work injuries cost the country well over a hundred billion dollars a year, and more than a thousand construction workers died on the job in 2024. These aren't random outcomes. They're what happens when the right information doesn't reach the right person at the right time.",
    visual: function() {
      return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;">'
        + statCard('$31B', 'estimated 2018 cost of rework in U.S. construction caused by poor project data and miscommunication', 'PlanGrid / FMI, Construction Disconnected (2018 survey)', 'var(--orange)')
        + statCard('$181B', 'total cost of work injuries in 2024 across all U.S. industries: lost wages and productivity, medical and administrative costs', 'National Safety Council, Injury Facts', '#E87060')
        + statCard('5.5 hrs', 'a week, on average, spent looking for project data such as revised drawings, reported by the construction leaders surveyed', 'PlanGrid / FMI (2018 survey)', '#7DD3FC')
        + statCard('1,032', 'construction and extraction workers died from work injuries in 2024', 'U.S. Bureau of Labor Statistics, CFOI', '#F87171')
        + '</div>';
    }
  },
  {
    label: 'Why it keeps happening',
    narration: "Look across construction incidents and the same causes keep coming back: hazards nobody identified, plans that were never made, changes that didn't get communicated. What they share is a common thread. The information existed, but it didn't reach the person who needed it at the moment they needed it. That is the problem PreTaskIQ is built to solve.",
    visual: function() {
      var causes = [
        'Hazards not identified before work begins',
        'Pre-task planning that is missing or thin',
        'Changing conditions and revisions not communicated',
        'Poor work sequencing and coordination',
        'Weak coordination between contractors and trades',
        'Engineering and process changes not managed',
        'Inadequate supervision of critical work',
        'Hazards not reassessed as conditions change',
        'Gaps in worker training or competency',
        'Established procedures not followed'
      ];
      return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;">'
        + causes.map(function(c) {
          return '<div style="display:flex;gap:8px;align-items:baseline;padding:4px 0;">'
            + '<span style="color:var(--orange);flex-shrink:0;">&#8226;</span>'
            + '<span style="font-size:13px;color:rgba(255,255,255,0.65);line-height:1.4;">' + c + '</span>'
            + '</div>';
        }).join('')
        + '</div>';
    }
  },
  {
    label: 'One platform, three roles',
    narration: "PreTaskIQ connects three roles. The Safety Administrator loads your organization's incident history, policies, root cause analyses and procedures, and runs audits and observations. The Construction Administrator keeps the project current with drawing revisions, R. F. I. responses and scope changes. And every foreman on site has Petey, a conversational safety companion that draws on all of it, so every pre-task conversation is informed.",
    visual: function() {
      return '<div style="display:flex;align-items:stretch;gap:12px;flex-wrap:wrap;">'
        + roleCard('🦺', 'Safety Admin', 'Incidents, RCAs, policies, audits and observations', '#1A3A2A', '#2A6A4A')
        + roleCard('🏗️', 'Construction Admin', 'Drawing revisions, RFIs and scope changes', '#1A2A3A', '#2A4A6A')
        + roleCard('⛑️', 'Foreman + Petey', 'Conversational pre-task planning, no forms', '#2A1A0A', '#6A3A1A')
        + '</div>';
    }
  },
  {
    label: 'Plan the work',
    narration: "A foreman starts the shift by describing what the crew is about to do, by voice or by typing, in plain language, the way they'd explain it to a new apprentice. Petey asks one question at a time, the follow-ups a seasoned safety lead would ask, and calls out the hazards that can kill you, the sticky ones, before the work begins.",
    visual: function() { return phones(['intake_typed', 'conversation'], ['Say it or type it', 'One question at a time']); }
  },
  {
    label: 'A plan the whole crew can read',
    narration: "The conversation becomes a job hazard analysis, a J. H. A., with the hazards, controls, protective equipment and permits spelled out, and a clear stop-work trigger. No form, no template. The crew reviews it and signs on, so everyone has heard the plan before work starts.",
    visual: function() { return phones(['doc_top', 'doc_end'], ['Hazards, controls, PPE, permits', 'Stop-work trigger and crew sign-on']); }
  },
  {
    label: 'Your own lessons, every time',
    narration: "Behind every conversation is your knowledge base: policies, procedures, project documents, past incidents and root cause analyses. When today's task matches a lesson you have already learned, Petey brings it up and asks what is different today.",
    visual: function() { return phones(['kb'], ['Your policies, procedures and past incidents']); }
  },
  {
    label: 'In the field',
    narration: "In the field, Petey stays on as a shift companion. When a crew starts a strict-sequence procedure like a lockout tagout, Petey tracks each step as the crew reports it, and speaks up if something happens out of order. In this example the crew tried to apply locks before isolating the energy source, and Petey paused the work before the mistake could become an incident. A foreman can also ask for a policy by voice and get the practical answer in the moment.",
    visual: function() { return phones(['petey_loto'], ['Out of sequence: work paused']); }
  },
  {
    label: 'When the plan changes',
    narration: "Plans change mid-shift, and that's where things go wrong. In this example, a foreman says the crew is about to pull feeders, and Petey flags that the drawing was revised yesterday and two of those feeders moved to a different tray run. Petey stops the work, shows exactly what changed, and asks the foreman to notify the superintendent. New work gets the same treatment: Petey asks about permits and boundaries, adds hold points, and updates the plan to the next revision on the spot. This part of the demo uses example data. Connecting to your project management platform is planned, not built yet.",
    visual: function() {
      return '<div style="background:#0F1E2E;border:1px solid rgba(255,255,255,0.08);border-left:4px solid #F59E0B;border-radius:12px;padding:14px 16px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#FCD34D;">Drawing revision detected</div><div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,0.35);">Example</div></div>'
        + drawRow('E-201', 'Rev 3 → Rev 4', 'Issued yesterday afternoon', '#FCD34D')
        + drawRow('Feeders F-9, F-11', 'Routing changed', 'Tray 14-B → Tray 14-C', '#FB923C')
        + drawRow('Feeders F-7, F-8, F-10, F-12', 'No change', 'Routing unchanged in Rev 4', 'rgba(255,255,255,0.4)')
        + '<div style="margin-top:12px;display:flex;gap:8px;">'
        + '<div style="flex:1;padding:8px;background:#F59E0B;color:#1A1000;border-radius:8px;font-size:12px;font-weight:700;text-align:center;">Get Rev 4</div>'
        + '<div style="flex:1;padding:8px;background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.12);border-radius:8px;font-size:12px;font-weight:700;text-align:center;">Notify superintendent</div>'
        + '</div></div>';
    }
  },
  {
    label: 'The Safety Admin sees it live',
    narration: "The safety administrator gets a live view of the day: which foreman is working on what, where, how far along each plan is, and the highest risk in each. Plans changed after they were submitted are flagged. When a crew flags a hazard they can't control, it lands in the safety inbox as an alert. And one tap starts an incident report, an audit, an observation or a root cause analysis. The screen shown here is labelled sample data.",
    visual: function() { return phones(['dash'], ['Site Overview: foreman, task, area, status, risk']); }
  },
  {
    label: 'When something happens',
    narration: "When something goes wrong, the foreman files a quick preliminary report by talking it through with Petey, and safety is alerted. A full report then comes due, with the timeline, evidence, witnesses, contributing factors and interim controls captured in one place. When it's complete it goes into the knowledge base and sets up the root cause analysis.",
    visual: function() { return phones(['inc_chat', 'full_done'], ['Foreman: a quick report by talking', 'Safety: the full report']); }
  },
  {
    label: 'Learn from it',
    narration: "The root cause analysis is built from the report. Safety can also turn an incident into an animated reenactment, an illustrative storyboard rather than video, reviewed and approved first, that shows the crew what happened, and again with the controls added afterward.",
    visual: function() { return phones(['rca', 'rx_b'], ['Root cause analysis', 'Reviewed reenactment']); }
  },
  {
    label: 'Measure protection, audit anything',
    narration: "Observations count the protection that's in place, not just the harm. For each kind of work, an observer checks whether the required controls are actually there, scored as found, and the results show the gaps by category and over time without naming a single person. Customizable safety audits work the same way: pass or fail each item, a required comment on every fail, and photos captured on the spot. That's PreTaskIQ. Start exploring whenever you're ready.",
    visual: function() { return phones(['prot_results_gaps', 'aud_fail'], ['Most-missed controls', 'A required comment on every fail']); }
  }
];

// ── Visual helper functions ──────────────────────────────────────────

function statCard(num, desc, source, color) {
  return '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:16px;text-align:center;">'
    + '<div style="font-size:34px;font-weight:900;color:' + color + ';font-family:\'Space Grotesk\',sans-serif;margin-bottom:8px;line-height:1;">' + num + '</div>'
    + '<div style="font-size:12px;color:rgba(255,255,255,0.7);line-height:1.5;margin-bottom:8px;">' + desc + '</div>'
    + '<div style="font-size:11px;color:rgba(255,255,255,0.3);">' + source + '</div>'
    + '</div>';
}

function roleCard(icon, title, desc, bg, border) {
  return '<div style="flex:1;min-width:160px;background:' + bg + ';border:1px solid ' + border + ';border-radius:14px;padding:18px 16px;">'
    + '<div style="font-size:26px;margin-bottom:10px;">' + icon + '</div>'
    + '<div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:6px;">' + title + '</div>'
    + '<div style="font-size:12px;color:rgba(255,255,255,0.55);line-height:1.5;">' + desc + '</div>'
    + '</div>';
}

// Real captures of the app, in phone-shaped frames, one or two side by side, each with a short caption.
function phones(names, captions) {
  return '<div style="display:flex;gap:16px;justify-content:center;align-items:flex-start;">'
    + names.map(function(n, i) {
      return '<figure style="margin:0;flex:0 1 ' + (names.length > 1 ? '240px' : '280px') + ';min-width:0;">'
        + '<img src="/demo/' + n + '.jpg" alt="' + (captions[i] || '').replace(/"/g, '&quot;') + '" loading="lazy" style="display:block;width:100%;max-height:46vh;object-fit:cover;object-position:top;border-radius:18px;border:1px solid rgba(255,255,255,0.14);box-shadow:0 10px 30px rgba(0,0,0,0.45);">'
        + '<figcaption style="margin-top:8px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.55);text-align:center;line-height:1.4;">' + (captions[i] || '') + '</figcaption>'
        + '</figure>';
    }).join('')
    + '</div>';
}

function drawRow(label, change, detail, color) {
  return '<div style="display:flex;gap:10px;align-items:baseline;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">'
    + '<div style="width:120px;flex-shrink:0;font-size:12px;font-weight:700;color:' + color + ';">' + label + '</div>'
    + '<div><div style="font-size:13px;color:rgba(255,255,255,0.85);">' + change + '</div>'
    + '<div style="font-size:11px;color:rgba(255,255,255,0.35);">' + detail + '</div></div></div>';
}

// ── Demo navigation ──────────────────────────────────────────────────

function renderDemoStep(step) {
  var s = DEMO_STEPS[step];
  var total = DEMO_STEPS.length;

  document.getElementById('demo-step-label').textContent = 'Step ' + (step + 1) + ' of ' + total;
  document.getElementById('demo-progress').style.width = Math.round(((step + 1) / total) * 100) + '%';
  document.getElementById('demo-narration').textContent = s.narration;
  document.getElementById('demo-visual').innerHTML = s.visual();
  document.getElementById('demo-prev-btn').style.opacity = step === 0 ? '0.3' : '1';
  document.getElementById('demo-prev-btn').disabled = step === 0;

  var nextBtn = document.getElementById('demo-next-btn');
  nextBtn.textContent = step === total - 1 ? 'Start exploring →' : 'Next →';

  // Dots
  var dots = document.getElementById('demo-dots');
  dots.innerHTML = DEMO_STEPS.map(function(_, i) {
    return '<div style="width:' + (i === step ? '20px' : '6px') + ';height:6px;border-radius:3px;background:' + (i === step ? 'var(--orange)' : 'rgba(255,255,255,0.2)') + ';transition:all 0.3s;"></div>';
  }).join('');

  // Speak narration
  demoSpeak(s.narration, step);
}

// Narration is a recording (the same voice as the promo video), one file per step in public/demo/audio/.
// If a recording cannot play (offline, file missing) the browser's own voice reads the text instead.
var demoAudio = null;
var demoSpeakToken = 0;

function demoSpeakingUI(on) {
  var orb = document.getElementById('demo-orb');
  var badge = document.getElementById('demo-speaking-badge');
  if (orb) orb.style.background = on ? '#2A1000' : '#1A3050';
  if (badge) badge.style.display = on ? 'inline-block' : 'none';
  demoSpeaking = on;
}

function demoStopSpeaking() {
  demoSpeakToken++;
  if (demoAudio) { try { demoAudio.pause(); } catch (e) {} demoAudio = null; }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  demoSpeakingUI(false);
}

function demoSpeakFallback(text, token) {
  if (!window.speechSynthesis || token !== demoSpeakToken) return;
  window.speechSynthesis.cancel();
  var utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.0;
  var voices = window.speechSynthesis.getVoices();
  var voice = (selectedVoiceName && voices.find(function(v) { return v.name === selectedVoiceName; }))
    || voices.find(function(v) { return /en-US/i.test(v.lang) && /female|samantha|zira|karen/i.test(v.name); })
    || voices.find(function(v) { return /en-US/i.test(v.lang); })
    || voices[0];
  if (voice) utter.voice = voice;
  utter.onend = utter.onerror = function() { if (token === demoSpeakToken) demoSpeakingUI(false); };
  demoSpeakingUI(true);
  window.speechSynthesis.speak(utter);
}

function demoSpeak(text, step) {
  demoStopSpeaking();
  var token = demoSpeakToken;
  var audio = new Audio('/demo/audio/step-' + (step + 1) + '.mp3');
  demoAudio = audio;
  audio.onplaying = function() { if (token === demoSpeakToken) demoSpeakingUI(true); };
  audio.onended = function() { if (token === demoSpeakToken) demoSpeakingUI(false); };
  audio.onerror = function() { if (token === demoSpeakToken) demoSpeakFallback(text, token); };
  var started = audio.play();
  if (started && started.catch) started.catch(function(err) {
    if (token !== demoSpeakToken) return;
    if (err && err.name === 'NotAllowedError') { demoSpeakingUI(false); return; }   // the browser wants a tap first; stay silent
    demoSpeakFallback(text, token);
  });
}

function demoNext() {
  if (demoStep < DEMO_STEPS.length - 1) {
    demoStep++;
    renderDemoStep(demoStep);
  } else {
    exitDemo();
  }
}

function demoPrev() {
  if (demoStep > 0) {
    demoStep--;
    renderDemoStep(demoStep);
  }
}

function exitDemo() {
  demoStopSpeaking();
  showScreen('intake');
}

// (Vite port) The demo no longer starts by itself on load. The app opens on the planning screen;
// the demo starts from the account menu or with ?demo in the address. See 29-persistence-bridge.js.

// Leaving the demo any other way (the menu, switching role) must also silence the narration.
if (typeof showScreen === 'function') {
  var demoOrigShowScreen = showScreen;
  showScreen = function(name) {
    if (name !== 'intro' && demoSpeaking) demoStopSpeaking();
    return demoOrigShowScreen.apply(this, arguments);
  };
}
