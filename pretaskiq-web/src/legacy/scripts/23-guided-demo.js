// ── Guided Demo System ───────────────────────────────────────────────
var demoStep = 0;
var demoSpeaking = false;

var DEMO_STEPS = [
  {
    label: 'The problem',
    narration: "The amount of persistent planning and coordination required to execute a safe and quality construction project is extraordinary — and the more complex the project, the more opportunities there are for something to break down. Drawing revisions, scope changes, R. F. I. responses, updated procedures — every one of those has to travel from the people who made the decision to the person holding the tool. When that handoff fails, the consequences show up as rework, incidents, and delays. Over 31 billion dollars a year in avoidable rework, 181 billion dollars in workplace injury costs, and more than a thousand construction workers who don't go home. These aren't random outcomes. They're what happens when the right information doesn't reach the right person at the right time.",
    visual: function() {
      return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;">'
        + statCard('$31B+', 'per year in avoidable rework from poor communication and bad project data', 'PlanGrid / FMI', 'var(--orange)')
        + statCard('$181B+', 'per year in workplace injury costs — lost productivity, medical expenses and wage losses', 'National Safety Council', '#E87060')
        + statCard('5.5 hrs', 'lost every week per worker just searching for project information they should already have', 'PlanGrid / FMI', '#7DD3FC')
        + statCard('1,032', 'construction workers killed on the job in 2024 — more than any other private industry', 'BLS / CFOI 2024', '#F87171')
        + '</div>';
    }
  },
  {
    label: 'Root causes',
    narration: "OSHA and NIOSH have identified ten recurring root causes across construction incidents. What they share is a common thread — information that existed but didn't reach the person who needed it, at the moment they needed it. That's the problem PreTaskIQ is built to solve.",
    visual: function() {
      var causes = [
        'Failure to identify hazards before work begins',
        'Inadequate pre-task planning or job hazard analysis',
        'Failure to communicate changing conditions or revisions',
        'Poor work sequencing and coordination',
        'Inadequate coordination between contractors and trades',
        'Weak management of engineering or process changes',
        'Inadequate supervision of critical work',
        'Failure to reassess hazards as conditions change',
        'Deficient worker training or competency verification',
        'Ineffective implementation of established procedures'
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
    label: 'How PreTaskIQ works',
    narration: "PreTaskIQ sits at the intersection of three roles. The Safety Administrator loads the platform with your organization's incident history, policies, root cause analyses and procedures. The Construction Administrator keeps it current with drawing revisions, RFI responses and scope changes. And every foreman on site has Petey — a conversational AI that draws from all of that to make every pre-task conversation intelligent.",
    visual: function() {
      return '<div style="display:flex;align-items:stretch;gap:12px;flex-wrap:wrap;">'
        + roleCard('🦺', 'Safety Admin', 'Incidents, RCAs, policies and procedures', '#1A3A2A', '#2A6A4A')
        + roleCard('🏗️', 'Construction Admin', 'Drawing revisions, RFIs and scope changes', '#1A2A3A', '#2A4A6A')
        + roleCard('⛑️', 'Foreman + Petey', 'Conversational pre-task planning — no forms', '#2A1A0A', '#6A3A1A')
        + '</div>';
    }
  },
  {
    label: 'The foreman flow',
    narration: "A foreman starts their day by describing what the crew is about to do — in plain language, the way they'd explain it to a new apprentice. Petey asks the right questions, identifies the highest-risk tasks, and generates a complete job hazard analysis — a J. H. A. The document writes itself through conversation. No form. No template. Just talking.",
    visual: function() {
      return flowDiagram([
        { icon: '🎙️', label: 'Foreman describes the task', sub: '"We\'re pulling feeders in Bldg 2"' },
        { icon: '🤔', label: 'Petey asks smart questions', sub: 'Energized nearby? Who\'s in the area?' },
        { icon: '📋', label: 'JHA generated automatically', sub: 'Hazards, controls, PPE — complete' },
        { icon: '✍️', label: 'Crew reviews and signs', sub: 'On-screen — before work begins' }
      ]);
    }
  },
  {
    label: 'Procedure tracking',
    narration: "When a crew starts a strict-sequence procedure like a lockout tagout, Petey tracks every step in real time. He marks steps complete as the crew reports progress, and catches immediately if something is done out of order. In our example, the crew tried to apply locks before isolating the energy source — Petey flagged it and stopped the sequence before the error could become an incident.",
    visual: function() {
      return procCard([
        { n: '1', title: 'Notify affected personnel', done: true },
        { n: '2', title: 'Identify all energy sources', done: true },
        { n: '3', title: 'Shut down equipment', done: true },
        { n: '4', title: 'Isolate energy sources — open disconnect', flagged: true, warn: 'Required before applying locks' },
        { n: '5', title: 'Apply individual locks and tags', crit: true },
        { n: '6', title: 'Relieve stored energy' },
        { n: '7', title: 'Verify zero energy', crit: true }
      ]);
    }
  },
  {
    label: 'Policy recall',
    narration: "A foreman on the roof asks Petey what the tie-off rule is above six feet. Petey answers with the specific policy citation and the OSHA reference — not a wall of text, just the practical answer the foreman needs in the moment. He then follows up on a bump cap question by surfacing the actual incident from the knowledge base where a bump cap contributed to a serious head injury. Lessons learned, delivered in context.",
    visual: function() {
      return chatBubbles([
        { role: 'user', text: "What's our tie-off rule above 6 feet?" },
        { role: 'ai', text: "Fall protection required at 6 feet or higher — guardrail, PFAS, or fall restraint. Anchor must support 5,000 lbs per person. Our policy POL-FALL-002 and OSHA 1926 Subpart M." },
        { role: 'user', text: "What about bump caps on elevated work?" },
        { role: 'ai', text: "Bump caps don't satisfy our policy for elevated work. We had an incident — INC-282 — where an employee on a 4-foot platform ladder was wearing a bump cap, lost grip of an 80 lb strut, fell, and hit concrete. Hard hat only on elevated work. No exceptions." }
      ]);
    }
  },
  {
    label: 'Scope change — live JHA update',
    narration: "A foreman tells Petey they've been handed new work mid-shift — energized switchgear terminations that weren't in the morning J. H. A.. Petey doesn't just accept that. He probes for permit status and boundary verification, identifies two hard stop points, and updates the J. H. A. to revision 2 on the spot. The document stays current with what's actually happening on site.",
    visual: function() {
      return '<div style="background:#0F1E2E;border:1px solid rgba(255,255,255,0.08);border-left:4px solid #0F1E2E;border-radius:12px;padding:14px 16px;">'
        + '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:10px;">JHA Updated — Rev 2</div>'
        + jhaRow('add', 'Task added', 'Bus B feeder termination — Switchgear Room 2A')
        + jhaRow('add', 'Hazard added', 'Proximity to energized Bus A — Arc Flash / Shock')
        + jhaRow('add', 'PPE required', '8-cal arc flash suit, face shield, arc-rated gloves')
        + jhaRow('stop', 'Hold point', 'Energized Electrical Work Permit required — not yet signed')
        + jhaRow('stop', 'Hold point', 'Shock and arc flash boundary verification required before entry')
        + '</div>';
    }
  },
  {
    label: 'Drawing revision intercept',
    narration: "A foreman says they're about to pull feeders F-7 through F-12 in the Building 2 data hall. Before they take a single step, Petey flags that Drawing E-201 was revised yesterday — Rev 4 moved two of those feeders to a different tray run. The foreman confirms they're on last week's set. Petey stops the work, surfaces exactly which feeders changed, notifies the superintendent, and logs the intercept. The cables never land in the wrong tray.",
    visual: function() {
      return '<div style="background:#0F1E2E;border:1px solid rgba(255,255,255,0.08);border-left:4px solid #F59E0B;border-radius:12px;padding:14px 16px;">'
        + '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#FCD34D;margin-bottom:10px;">Drawing revision detected</div>'
        + drawRow('E-201', 'Rev 3 → Rev 4', 'Issued Jun 25 14:47', '#FCD34D')
        + drawRow('Feeders F-9, F-11', 'Routing changed', 'Tray 14-B → Tray 14-C', '#FB923C')
        + drawRow('Feeders F-7, F-8, F-10, F-12', 'No change', 'Routing unchanged in Rev 4', 'rgba(255,255,255,0.4)')
        + '<div style="margin-top:12px;display:flex;gap:8px;">'
        + '<div style="flex:1;padding:8px;background:#F59E0B;color:#1A1000;border-radius:8px;font-size:12px;font-weight:700;text-align:center;">Get Rev 4</div>'
        + '<div style="flex:1;padding:8px;background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.12);border-radius:8px;font-size:12px;font-weight:700;text-align:center;">Notify superintendent</div>'
        + '</div>'
        + '</div>';
    }
  },
  {
    label: 'Safety Admin dashboard',
    narration: "The Safety Manager sees a real-time view across all active crews — J. H. A. completion status, open flags, hold points waiting for resolution. This morning four of six work groups have completed their J. H. A.s. The Fire Protection crew has a revision awaiting review. Everything Petey has flagged across every crew surfaces here, without the superintendent having to chase down each foreman individually.",
    visual: function() {
      return '<div style="background:#fff;border-radius:14px;padding:16px;border:1px solid #E8ECF0;">'
        + '<div style="font-size:18px;font-weight:800;color:#0F1E2E;margin-bottom:14px;">Site Overview <span style="font-size:13px;font-weight:600;color:#999;margin-left:8px;">4 / 6 groups cleared</span></div>'
        + crewRow('Bldg 2 Electrical', 'HIGH', 'Completed', '#D1FAE5', '#065F46', '#10B981', 5)
        + crewRow('Roof Mechanical', 'MED', 'Completed', '#D1FAE5', '#065F46', '#10B981', 5)
        + crewRow('Curtain Wall South', 'HIGH', 'Signing', '#FEF3C7', '#92400E', '#F59E0B', 3)
        + crewRow('Fire Protection', 'MED', 'Review', '#EDE9FE', '#7C3AED', '#7C3AED', 2)
        + '</div>';
    }
  },
  {
    label: 'Construction Admin dashboard',
    narration: "The Construction Administrator sees the project's document state in real time — drawing revisions issued and whether crews have confirmed them, open RFIs with hold implications, and scope changes logged with their J. H. A. status. The platform is designed to connect directly to your existing project management platform to sync this information automatically. No manual uploads required in production.",
    visual: function() {
      return '<div style="display:flex;flex-direction:column;gap:10px;">'
        + cadminCard('📐', 'Drawing Revision', 'E-201 Rev 4 — Feeders F-9 and F-11 rerouted', '#FDE8E8', '#B91C1C', 'Unconfirmed')
        + cadminCard('📬', 'RFI Open', 'RFI-041 — Fire suppression conflicts with cable tray 14-C', '#FEF3C7', '#92400E', 'Hold in place')
        + cadminCard('🔄', 'Scope Change', 'CO-12 — Energized switchgear terminations added — JHA Rev 2', '#EDE9FE', '#7C3AED', 'Hold points active')
        + '</div>';
    }
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
  return '<div style="flex:1;min-width:160px;background:' + bg + ';border:1px solid ' + border + ';border-radius:12px;padding:16px;">'
    + '<div style="font-size:22px;margin-bottom:8px;">' + icon + '</div>'
    + '<div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:6px;">' + title + '</div>'
    + '<div style="font-size:12px;color:rgba(255,255,255,0.5);line-height:1.5;">' + desc + '</div>'
    + '</div>';
}

function flowDiagram(steps) {
  return '<div style="display:flex;align-items:center;gap:0;flex-wrap:wrap;justify-content:center;gap:6px;">'
    + steps.map(function(s, i) {
      return '<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:14px 16px;text-align:center;flex:1;min-width:130px;">'
        + '<div style="font-size:22px;margin-bottom:6px;">' + s.icon + '</div>'
        + '<div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:4px;">' + s.label + '</div>'
        + '<div style="font-size:11px;color:rgba(255,255,255,0.4);font-style:italic;">' + s.sub + '</div>'
        + '</div>'
        + (i < steps.length - 1 ? '<div style="color:rgba(255,255,255,0.25);font-size:18px;flex-shrink:0;">→</div>' : '');
    }).join('')
    + '</div>';
}

function procCard(steps) {
  var rows = steps.map(function(s) {
    var isDone = s.done;
    var isFlagged = s.flagged;
    var rowBg = isDone ? '#11241F' : isFlagged ? '#2A1813' : '#141C2C';
    var rowBorder = isDone ? '#1E4A40' : isFlagged ? '#6A3326' : '#222C42';
    var badgeBg = isDone ? '#1A7A5C' : isFlagged ? '#C0392B' : '#2A3550';
    var badgeText = isDone ? '✓' : s.n;
    var titleColor = isDone ? '#7FD0C2' : isFlagged ? '#FBB778' : '#9FB0CC';
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;margin-bottom:6px;background:' + rowBg + ';border:1px solid ' + rowBorder + ';">'
      + '<div style="width:24px;height:24px;border-radius:50%;background:' + badgeBg + ';display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex-shrink:0;">' + badgeText + '</div>'
      + '<div style="flex:1;font-size:13px;font-weight:600;color:' + titleColor + ';">' + s.title + (s.warn ? '<div style="font-size:11px;color:#D85A30;font-weight:600;margin-top:2px;">' + s.warn + '</div>' : '') + '</div>'
      + (s.crit ? '<div style="font-size:10px;font-weight:800;color:#E68A6E;border:1px solid #5A3128;border-radius:4px;padding:2px 5px;">CRIT</div>' : '')
      + '</div>';
  }).join('');
  return '<div style="background:#10161A;border:1px solid #1E2A38;border-radius:12px;padding:14px;">'
    + '<div style="font-size:12px;font-weight:700;color:#4E6068;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">Procedure Tracker — Lockout / Tagout</div>'
    + '<div style="background:#2A1813;border:1px solid #6A3326;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;font-weight:700;color:#FBB778;">🛑 Out of sequence — Step 4 required before locks are applied</div>'
    + rows
    + '</div>';
}

function chatBubbles(bubbles) {
  return '<div style="background:#10161A;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px;">'
    + bubbles.map(function(b) {
      var isAI = b.role === 'ai';
      return '<div style="display:flex;justify-content:' + (isAI ? 'flex-start' : 'flex-end') + ';">'
        + '<div style="max-width:85%;padding:10px 14px;font-size:13px;line-height:1.55;border-radius:' + (isAI ? '4px 12px 12px 12px' : '12px 4px 12px 12px') + ';background:' + (isAI ? '#1A2B3C' : 'rgba(255,255,255,0.09)') + ';color:' + (isAI ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.75)') + ';border:1px solid rgba(255,255,255,0.07);">'
        + b.text + '</div></div>';
    }).join('')
    + '</div>';
}

function jhaRow(type, label, text) {
  var isStop = type === 'stop';
  return '<div style="display:flex;gap:9px;align-items:baseline;background:' + (isStop ? '#2A1813' : '#11241F') + ';border:1px solid ' + (isStop ? '#6A3326' : '#1E4A40') + ';border-radius:7px;padding:7px 10px;margin-bottom:6px;">'
    + '<span style="flex-shrink:0;font-size:12px;">' + (isStop ? '🛑' : '＋') + '</span>'
    + '<div><div style="font-size:11px;font-weight:700;color:' + (isStop ? '#E87878' : '#5DBF9C') + ';text-transform:uppercase;letter-spacing:.04em;">' + label + '</div>'
    + '<div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:1px;">' + text + '</div></div></div>';
}

function drawRow(label, change, detail, color) {
  return '<div style="display:flex;gap:10px;align-items:baseline;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">'
    + '<div style="width:120px;flex-shrink:0;font-size:12px;font-weight:700;color:' + color + ';">' + label + '</div>'
    + '<div><div style="font-size:13px;color:rgba(255,255,255,0.85);">' + change + '</div>'
    + '<div style="font-size:11px;color:rgba(255,255,255,0.35);">' + detail + '</div></div></div>';
}

function crewRow(name, risk, status, sBg, sColor, barColor, filled) {
  var riskColors = { HIGH: ['#FDE8E8','#B91C1C'], MED: ['#FEF3C7','#92400E'], LOW: ['#D1FAE5','#065F46'] };
  var rc = riskColors[risk] || riskColors.MED;
  var segs = [1,2,3,4,5].map(function(i) {
    return '<div style="flex:1;height:4px;border-radius:2px;background:' + (i <= filled ? barColor : '#E8ECF0') + ';"></div>';
  }).join('');
  return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #F0F2F5;">'
    + '<div style="width:4px;height:36px;border-radius:2px;background:' + barColor + ';flex-shrink:0;"></div>'
    + '<div style="flex:1;">'
    + '<div style="display:flex;align-items:center;gap:7px;margin-bottom:6px;">'
    + '<span style="font-size:10px;font-weight:800;padding:2px 6px;border-radius:4px;background:' + rc[0] + ';color:' + rc[1] + ';">' + risk + '</span>'
    + '<span style="font-size:14px;font-weight:700;color:#0F1E2E;">' + name + '</span>'
    + '<span style="margin-left:auto;font-size:12px;font-weight:700;padding:4px 10px;border-radius:7px;background:' + sBg + ';color:' + sColor + ';">' + status + '</span>'
    + '</div>'
    + '<div style="display:flex;gap:3px;">' + segs + '</div>'
    + '</div></div>';
}

function cadminCard(icon, type, desc, bgColor, textColor, status) {
  return '<div style="background:#fff;border:1px solid #E8ECF0;border-radius:12px;padding:13px 15px;display:flex;align-items:center;gap:12px;">'
    + '<div style="font-size:20px;flex-shrink:0;">' + icon + '</div>'
    + '<div style="flex:1;">'
    + '<div style="font-size:13px;font-weight:700;color:#0F1E2E;">' + desc + '</div>'
    + '</div>'
    + '<div style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px;background:' + bgColor + ';color:' + textColor + ';white-space:nowrap;">' + status + '</div>'
    + '</div>';
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
  demoSpeak(s.narration);
}

function demoSpeak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  var orb = document.getElementById('demo-orb');
  var badge = document.getElementById('demo-speaking-badge');
  if (orb) orb.style.background = '#2A1000';
  if (badge) badge.style.display = 'inline-block';
  demoSpeaking = true;

  var utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.0;
  var voices = window.speechSynthesis.getVoices();
  var voice = (selectedVoiceName && voices.find(function(v) { return v.name === selectedVoiceName; }))
    || voices.find(function(v) { return /en-US/i.test(v.lang) && /female|samantha|zira|karen/i.test(v.name); })
    || voices.find(function(v) { return /en-US/i.test(v.lang); })
    || voices[0];
  if (voice) utter.voice = voice;

  utter.onend = function() {
    demoSpeaking = false;
    if (orb) orb.style.background = '#1A3050';
    if (badge) badge.style.display = 'none';
  };
  utter.onerror = function() {
    demoSpeaking = false;
    if (orb) orb.style.background = '#1A3050';
    if (badge) badge.style.display = 'none';
  };
  window.speechSynthesis.speak(utter);
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
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  showScreen('intake');
}

// (Vite port) The demo no longer starts by itself on load. The app opens on the planning screen;
// the demo starts from the account menu or with ?demo in the address. See 29-persistence-bridge.js.
