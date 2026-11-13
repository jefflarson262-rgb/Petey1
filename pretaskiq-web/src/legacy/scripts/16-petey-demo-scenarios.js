// Petey Demo Scenarios
let demoBusy = false;
let currentPeteyMode = "foreman";

function clearPeteyDemo() {
  document.getElementById('petey-log-inner').innerHTML = '';
  var pt = document.getElementById('procedure-tracker');
  pt.style.display = 'none';
  pt.innerHTML = '';
  activeProcedure = null;
  if (typeof setPeteyState === 'function') setPeteyState('idle');
  demoBusy = false;
}

function demoShowScreen() {
  showScreen('petey');
  if (typeof setPeteyState === 'function') setPeteyState('listening');
}

function demoBubble(role, text, delay) {
  return new Promise(function(resolve) {
    setTimeout(function() {
      // Inject into petey log directly
      var log = document.getElementById('petey-log-inner');
      var row = document.createElement('div');
      row.className = 'bubble-row ' + (role === 'assistant' ? 'ai' : 'user') + ' anim-in';
      var col = document.createElement('div');
      col.className = 'bubble-col';
      var label = document.createElement('div');
      label.className = 'bubble-label';
      label.textContent = role === 'assistant' ? 'PRETASKIQ' : 'FOREMAN';
      var bubble = document.createElement('div');
      bubble.className = 'bubble ' + (role === 'assistant' ? 'ai' : 'user');
      bubble.textContent = text;
      col.appendChild(label);
      col.appendChild(bubble);
      row.appendChild(col);
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;

      // Speak assistant messages aloud
      if (role === 'assistant' && typeof speakText === 'function') {
        speakText(text, resolve);
      } else {
        resolve();
      }
    }, delay);
  });
}

function demoTyping(delay) {
  return new Promise(function(resolve) {
    setTimeout(function() {
      if (typeof setPeteyState === 'function') setPeteyState('thinking');
      var log = document.getElementById('petey-log-inner');
      var existing = document.getElementById('demo-typing');
      if (existing) existing.remove();
      var row = document.createElement('div');
      row.className = 'bubble-row ai';
      row.id = 'demo-typing';
      row.innerHTML = '<div class="bubble-col"><div class="bubble-label">PRETASKIQ</div><div class="bubble ai" style="padding:12px 16px;"><span style="letter-spacing:.2em;color:rgba(255,255,255,0.3);">...</span></div></div>';
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
      resolve();
    }, delay);
  });
}

function removeTyping() {
  var el = document.getElementById('demo-typing');
  if (el) el.remove();
  if (typeof setPeteyState === 'function') setPeteyState('speaking');
}

function runPeteyDemo(type) {
  if (demoBusy) return;
  demoBusy = true;
  clearPeteyDemo();
  demoShowScreen();
  if (type === 'loto') runLotoDemo();
  else if (type === 'policy') runPolicyDemo();
  else if (type === 'escalate') runEscalateDemo();
  else if (type === 'scope') runScopeChangeDemo();
  else if (type === 'drawing') runDrawingRevisionDemo();
}

function runLotoDemo() {
  demoBubble('user', "Hey Petey, we're about to LOTO the Building 2 panel before we pull the dead front.", 300)
  .then(function() { return demoTyping(900); })
  .then(function() {
      removeTyping();
    return demoBubble('assistant', "Got it -- starting Lockout/Tagout tracking for the Building 2 panel. I'll follow along and flag anything done out of sequence.\n\nStep 1: Verify the Method of Procedure (MOP) is signed off, and walk through it with the crew. Step 2: Confirm the Energy Isolation Permit (EIP) for this equipment has been submitted and signed.", 0);
  })
  .then(function() {
    activeProcedure = {
      procedureId: 'PROC-LOTO',
      name: 'Lockout / Tagout -- Bldg 2 Panel',
      steps: [
        { id: 1, title: 'Verify signed MOP and review with crew' },
        { id: 2, title: 'Confirm the Energy Isolation Permit (EIP)' },
        { id: 3, title: 'Notify affected personnel' },
        { id: 4, title: 'Identify all energy sources' },
        { id: 5, title: 'Shut down equipment' },
        { id: 6, title: 'Isolate energy sources -- open disconnect' },
        { id: 7, title: 'Apply individual locks and tags' },
        { id: 8, title: 'Relieve stored energy' },
        { id: 9, title: 'Verify zero energy (Live-Dead-Live)' }
      ],
      completedStepIds: [],
      criticalSteps: [7, 9],
      flaggedOutOfOrder: [],
      outOfOrderFlag: null
    };
    renderProcedureTracker();
    return new Promise(function(r) { setTimeout(r, 1800); });
  })
  .then(function() {
    return demoBubble('user', "MOP is signed and the whole crew has walked through it. The Energy Isolation Permit is submitted and signed.", 0);
  })
  .then(function() { return demoTyping(900); })
  .then(function() {
      removeTyping();
    activeProcedure.completedStepIds = [1, 2];
    renderProcedureTracker();
    return demoBubble('assistant', "Good. Step 3: notify all affected personnel that equipment is being shut down.", 0);
  })
  .then(function() { return new Promise(function(r) { setTimeout(r, 1600); }); })
  .then(function() {
    return demoBubble('user', "Crew's notified, we found two energy sources -- main feed and the UPS bypass.", 0);
  })
  .then(function() { return demoTyping(900); })
  .then(function() {
      removeTyping();
    activeProcedure.completedStepIds = [1, 2, 3, 4];
    renderProcedureTracker();
    return demoBubble('assistant', "Good -- both sources need to be isolated, not just the main feed. Step 5: shut down the equipment using the normal stopping procedure.\n\nWhen you get to isolation, check each isolation point and lock number against the Energy Isolation Permit first -- we've had a near miss where locks went on the wrong isolation point.", 0);
  })
  .then(function() {
    activeProcedure.completedStepIds = [1, 2, 3, 4, 5];
    renderProcedureTracker();
    return new Promise(function(r) { setTimeout(r, 2200); });
  })
  .then(function() {
    return demoBubble('user', "Okay we already put our locks on.", 300);
  })
  .then(function() { return demoTyping(900); })
  .then(function() {
      removeTyping();
    activeProcedure.flaggedOutOfOrder = [6];
    activeProcedure.outOfOrderFlag = 'Out of sequence -- work paused';
    renderProcedureTracker();
    return demoBubble('assistant', "Hold on -- you haven't isolated the energy sources yet, that has to happen before you apply locks. Step 6 is opening the disconnect on both the main feed and the UPS bypass, at the isolation points listed on the Energy Isolation Permit.\n\nLocks go on after isolation, not before. Let's back up to Step 6.", 0);
  })
  .then(function() { demoBusy = false; });
}

function runPolicyDemo() {
  demoBubble('user', "Hey Petey, what's our tie-off rule above 6 feet?", 300)
  .then(function() { return demoTyping(900); })
  .then(function() {
      removeTyping();
    return demoBubble('assistant', "Per our Fall Protection Policy (POL-FALL-002) and OSHA 29 CFR 1926 Subpart M:\n\nFall protection is required at 6 feet or more above a lower level -- guardrail system, personal fall arrest, or fall restraint. Your choice depends on the task and available anchor points.\n\nFor a personal fall arrest system, the anchor needs to support at least 5,000 lbs per person attached. On a scissor lift, the guardrail may satisfy the requirement -- but never stand on it or use a ladder inside the platform to gain height.", 0);
  })
  .then(function() { return new Promise(function(r) { setTimeout(r, 2500); }); })
  .then(function() {
    return demoBubble('user', "What about bump caps on elevated work?", 300);
  })
  .then(function() { return demoTyping(900); })
  .then(function() {
      removeTyping();
    return demoBubble('assistant', "Bump caps don't satisfy our policy for elevated work. Hard hats are required any time you're working at height with overhead material handling or any fall risk.\n\nWe've had a case where an employee on a platform ladder lost grip of a heavy strut, and the bump cap didn't protect them the way a hard hat would have when they went down.\n\nHard hat, not bump cap, on elevated work. No exceptions.", 0);
  })
  .then(function() { demoBusy = false; });
}

function openAdminPetey() {
  // Switch to petey screen in safety manager mode
  currentPeteyMode = 'admin';
  clearPeteyDemo();
  showScreen('petey');
  // Show admin-specific hint and demo buttons
  var hint = document.getElementById('petey-hint');
  if (hint) hint.textContent = "Ask about any policy, regulation, or incident pattern. I can cite the source and flag gaps.";
  var panel = document.getElementById('petey-demo-panel');
  if (panel) {
    panel.querySelector('div').textContent = 'Safety Manager scenarios';
    var btns = panel.querySelectorAll('.petey-demo-btn');
    if (btns[0]) { btns[0].innerHTML = '<strong>Confirm tie-off rule</strong> -- what exactly does POL-FALL-002 require?'; btns[0].onclick = function() { runPeteyDemo("policy"); }; }
    if (btns[1]) { btns[1].innerHTML = '<strong>LOTO audit question</strong> -- what does individual lock verification actually mean?'; btns[1].onclick = function() { runAdminLotoDemo(); }; }
    if (btns[2]) { btns[2].innerHTML = '<strong>Incident pattern lookup</strong> -- what have we seen on phase verification?'; btns[2].onclick = function() { runAdminIncidentDemo(); }; }
  }
}

function runAdminLotoDemo() {
  if (demoBusy) return;
  demoBusy = true;
  clearPeteyDemo();
  demoBubble('user', "Petey, I'm auditing LOTO compliance. What does individual lock verification actually require -- our crews keep treating a panel-level lockout as enough.", 300)
  .then(function() { return demoTyping(900); })
  .then(function() {
      removeTyping();
    return demoBubble('assistant', "This comes up a lot and it's a real gap. Per POL-LOTO-001 and OSHA 29 CFR 1910.147:\n\nA panel-level lockout is NOT sufficient. Every employee exposed to the hazard must apply their own personal lock. The requirement is per-person, not per-panel.\n\nFor group lockout situations, the correct setup is a lock box -- each worker's individual lock goes on the lock box, not directly on the equipment. That way no single person can remove the group lockout unilaterally.", 0);
  })
  .then(function() { return new Promise(function(r) { setTimeout(r, 2000); }); })
  .then(function() {
    return demoBubble('user', "Do we have incidents where this was the issue?", 0);
  })
  .then(function() { return demoTyping(900); })
  .then(function() {
      removeTyping();
    return demoBubble('assistant', "Yes -- two directly relevant ones.\n\nINC-301 (August 2025): Crew was labeling panels ahead of first-time energization. Panel-level lockout was in place but individual user locks were not applied. A superintendent stopped work when the crew couldn't identify their lockout point. Three hours of retraining followed.\n\nINC-304 (June 2026): Locks applied to incorrect isolation point and wrong breaker position. No formal independent verification requirement existed. Error wasn't caught for two weeks.\n\nBoth root cause analyses are in the system if you want the full corrective action details.", 0);
  })
  .then(function() { demoBusy = false; });
}

function runAdminIncidentDemo() {
  if (demoBusy) return;
  demoBusy = true;
  clearPeteyDemo();
  demoBubble('user', "What patterns do we have around phase verification failures?", 300)
  .then(function() { return demoTyping(900); })
  .then(function() {
      removeTyping();
    return demoBubble('assistant', "We have one incident and one RCA on this -- both from the same event.\n\nINC-243 / RCA-PDC-001 (February 2026, SBN Building 208): During load bank testing of a PDC, A and B phase cables were crossed when connecting to the primary side. When the breaker was closed to switch to primary power, mismatched phases caused an arc that tripped all three breakers. No injuries.\n\nRoot causes: the phase connection was made by a single person under time pressure from the client. No independent second-person verification was in place.\n\nThe corrective actions require two-worker verification of cable phasing before any primary power switchover, foreman sign-off on the full data hall setup, and a dedicated load bank testing checklist with phase verification as a signed step.", 0);
  })
  .then(function() { return new Promise(function(r) { setTimeout(r, 2000); }); })
  .then(function() {
    return demoBubble('user', "What policy governs this now?", 0);
  })
  .then(function() { return demoTyping(900); })
  .then(function() {
      removeTyping();
    return demoBubble('assistant', "POL-ELEC-004 -- Energized Electrical Work Policy. The specific requirement:\n\nPhase verification must be independently performed by a second qualified person before any switch-over from temporary or test power to primary power, or vice versa. Single-person phase verification is explicitly not permitted for primary power switching operations.\n\nThis was added directly as a result of the February incident.", 0);
  })
  .then(function() { demoBusy = false; });
}

function runEscalateDemo() {
  demoBubble('user', "Petey, we're about to tie off for the roof work. Anchor point is a piece of unistrut we clamped to the parapet.", 300)
  .then(function() { return demoTyping(900); })
  .then(function() {
      removeTyping();
    return demoBubble('assistant', "I need to flag this before you proceed.\n\nA unistrut clamped to a parapet wall is not a verified anchor point. Our fall protection policy requires anchors capable of supporting 5,000 lbs per person attached -- a field-installed clamp on unistrut has no rated capacity you can verify on site.\n\nDo you have a qualified person who can evaluate and sign off on that anchor, or an engineered anchor point available?", 0);
  })
  .then(function() { return new Promise(function(r) { setTimeout(r, 2500); }); })
  .then(function() {
    return demoBubble('user', "No, it's just what we have up there right now.", 300);
  })
  .then(function() { return demoTyping(900); })
  .then(function() {
      removeTyping();
    if (typeof setPeteyState === 'function') setPeteyState('alert');
    return demoBubble('assistant', "Understood -- and I want to be straight with you: this is a gap I can't help you work around.\n\nAn unverified anchor point with no rated capacity and no qualified person available means fall protection isn't actually in place. I'm flagging this to Sam Rivera (Site Safety Professional) and Jordan Park (Crew Supervisor) so someone who can get you a real solution is in the loop.\n\nI'm not telling you to stop -- that call belongs to you and your supervisor. But the hazard is open and they need to know.", 0);
  })
  .then(function() {
    return new Promise(function(r) { setTimeout(r, 800); });
  })
  .then(function() {
    var log = document.getElementById('petey-log-inner');
    var notice = document.createElement('div');
    notice.style.cssText = 'background:#FFF4EE;border:1px solid #F4C09A;border-left:4px solid #D85A30;border-radius:10px;padding:12px 14px;font-size:13px;color:#7A3510;line-height:1.5;margin:4px 0;';
    notice.innerHTML = '<strong style="display:block;margin-bottom:3px;">Escalation sent</strong>Sam Rivera -- Site Safety Professional<br>Jordan Park -- Crew Supervisor / Site Manager<br><span style="color:#A06040;font-size:12px;">Unverified anchor point -- no rated capacity confirmed</span>';
    log.appendChild(notice);
    log.scrollTop = log.scrollHeight;
    demoBusy = false;
  });
}
