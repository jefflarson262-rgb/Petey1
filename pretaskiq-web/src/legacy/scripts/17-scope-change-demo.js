function runScopeChangeDemo() {
  demoBubble('user', "Hey Petey, they just added a task -- we need to terminate feeders in the energized switchgear room while the other crew keeps working next door.", 300)
  .then(function() { return demoTyping(900); })
  .then(function() {
      removeTyping();
    return demoBubble('assistant', "That's a significant scope change from what we planned this morning -- energized switchgear work wasn't in the original JHA.\n\nBefore I update the document I need to walk through this with you. Is the switchgear room going to be partially energized while your crew is terminating, or fully de-energized?", 0);
  })
  .then(function() { return new Promise(function(r) { setTimeout(r, 2500); }); })
  .then(function() {
    return demoBubble('user', "Partially -- bus A stays live, we're only terminating on bus B which is dead.", 300);
  })
  .then(function() { return demoTyping(900); })
  .then(function() {
      removeTyping();
    return demoBubble('assistant', "Got it. Energized work within the Limited Approach Boundary triggers Arc Flash PPE requirements -- that's an 8-cal minimum for this gear class, and no one enters without a face shield and arc-rated gloves even if they're only working the dead bus.\n\nTwo more things: does your crew have an Energized Electrical Work Permit signed for this room, and has anyone done a shock and arc flash boundary verification today?", 0);
  })
  .then(function() { return new Promise(function(r) { setTimeout(r, 2500); }); })
  .then(function() {
    return demoBubble('user', "No permit yet, and boundaries haven't been verified today.", 300);
  })
  .then(function() { return demoTyping(900); })
  .then(function() {
      removeTyping();
    return demoBubble('assistant', "Okay -- don't start yet. I'm adding this to the JHA now with those two items as hard stops before work begins. I'll also flag Sam Rivera since an energized work permit needs a safety professional signature.", 0);
  })
  .then(function() { return new Promise(function(r) { setTimeout(r, 900); }); })
  .then(function() {
    // Render the JHA update card
    var log = document.getElementById('petey-log-inner');
    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border:1px solid #E0E8F0;border-left:4px solid #0F1E2E;border-radius:12px;padding:14px 16px;margin:6px 0;font-size:13px;line-height:1.6;';
    card.innerHTML = '<div style="font-size:11px;font-weight:800;letter-spacing:.08em;color:#0F1E2E;text-transform:uppercase;margin-bottom:10px;">JHA Updated — Rev 2</div>'
      + '<div style="display:flex;flex-direction:column;gap:7px;">'
      + jhaUpdateRow('add', 'Task added', 'Bus B feeder termination — Switchgear Room 2A')
      + jhaUpdateRow('add', 'Hazard added', 'Proximity to energized Bus A — Arc Flash / Shock')
      + jhaUpdateRow('add', 'PPE required', '8-cal arc flash suit, face shield, arc-rated gloves — all personnel in room')
      + jhaUpdateRow('stop', 'Hold point', 'Energized Electrical Work Permit required before entry — signature: Sam Rivera')
      + jhaUpdateRow('stop', 'Hold point', 'Shock and arc flash boundary verification required before work begins')
      + jhaUpdateRow('add', 'Coordination', 'Adjacent crew (Bus A side) notified — no simultaneous work within 3 ft of boundary')
      + '</div>'
      + '<div style="margin-top:12px;padding-top:10px;border-top:1px solid #E8ECF0;display:flex;gap:8px;align-items:center;">'
      + '<button style="flex:1;padding:9px;background:#0F1E2E;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;">Sign Rev 2</button>'
      + '<button style="flex:1;padding:9px;background:#F5F4F0;color:#0F1E2E;border:1px solid #D0D8E0;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;">View full JHA</button>'
      + '</div>';
    log.appendChild(card);
    log.scrollTop = log.scrollHeight;
    return new Promise(function(r) { setTimeout(r, 600); });
  })
  .then(function() {
    return demoBubble('assistant', "Rev 2 is ready. Two hold points are in place -- work can't start until the permit is signed and boundaries are verified. I've flagged Sam Rivera. Once those are cleared, come back and I'll walk the crew through the termination sequence.", 0);
  })
  .then(function() { demoBusy = false; });
}

function jhaUpdateRow(type, label, text) {
  var icon = type === 'stop' ? '🛑' : '＋';
  var bg = type === 'stop' ? '#FFF4EE' : '#F0FAF5';
  var border = type === 'stop' ? '#F4C09A' : '#A7E3C5';
  var labelColor = type === 'stop' ? '#9A4010' : '#1A6640';
  return '<div style="display:flex;gap:9px;align-items:baseline;background:' + bg + ';border:1px solid ' + border + ';border-radius:7px;padding:7px 10px;">'
    + '<span style="flex-shrink:0;font-size:12px;">' + icon + '</span>'
    + '<div><span style="font-size:11px;font-weight:700;color:' + labelColor + ';text-transform:uppercase;letter-spacing:.04em;">' + label + '</span>'
    + '<div style="font-size:13px;color:#1A2A3A;margin-top:1px;">' + text + '</div></div></div>';
}
