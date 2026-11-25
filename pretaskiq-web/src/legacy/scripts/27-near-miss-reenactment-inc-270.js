/* ===== Near-miss reenactment: INC-270 (illustrative animation built only from the incident record) ===== */
(function () {
  var FLOOR = 430, DUR = 27.6, P_HYP = 10.8, P_CTL = 17.4, P_CARD = 22.2;
  var C = { wall:'#DCE4EB', floor:'#BFC7CF', hat:'#F2B01E', sleeve:'#2F4A63', pants:'#2B3A4A', skin:'#D9CFC4', ink:'#0F1E2E', orange:'#E86A14', green:'#2E7D5B', red:'#C62F2A' };
  var CAPS = [
    [0, 2.4, 'Near miss: a person is walking through a work area', 'on a routine walk-through.'],
    [2.4, 4.6, 'They notice a protective cover is missing', 'from a transformer panel.'],
    [4.6, 7.0, 'They stop to investigate. The breaker is closed, so the', 'equipment is energized with no cover in place.'],
    [7.0, 8.8, 'They immediately notify the LOTO team.', ''],
    [8.8, 10.8, 'The breaker is opened and the equipment is made safe.', 'No contact occurred.'],
    [10.8, 13.4, 'What could have happened. Leaving covers off energized equipment', 'until QA/QC inspection was a common, unwritten practice.'],
    [13.4, 15.0, 'The panel was open and energized, with no barricade or sign.', ''],
    [15.0, 17.4, 'Anyone who reached in could have been exposed to live parts.', 'The record calls it a potential serious injury.'],
    [17.4, 19.8, 'With the corrective actions: if a cover must come off for QA/QC,', 'the equipment is de-energized and locked out first.'],
    [19.8, 22.2, 'Equipment that is open or awaiting inspection', 'is barricaded and signed.']
  ];
  var CONTROLS = [
    'Never leave covers off energized equipment',
    'If a cover must come off for QA/QC, de-energize and lock out first',
    'Barricade and sign equipment that is open or awaiting inspection',
    'Reinforce stop-work authority and recognition training'
  ];
  var esc = function (x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
  var clamp = function (x, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, x)); };
  var seg = function (t, a, b) { return clamp((t - a) / (b - a)); };
  var ease = function (x) { return x * x * (3 - 2 * x); };
  var lerp = function (a, b, x) { return a + (b - a) * x; };
  var win = function (t, a, b, f) { f = f || 0.25; return Math.min(seg(t, a, a + f), 1 - seg(t, b - f, b)); };
  function ik(S, T, l1, l2) {
    var dx = T[0] - S[0], dy = T[1] - S[1], d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.5), a = Math.atan2(dy, dx);
    var A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    var e1 = [S[0] + l1 * Math.cos(a + A), S[1] + l1 * Math.sin(a + A)], e2 = [S[0] + l1 * Math.cos(a - A), S[1] + l1 * Math.sin(a - A)];
    return [S, e1[1] > e2[1] ? e1 : e2, [S[0] + d * Math.cos(a), S[1] + d * Math.sin(a)]];
  }
  var pathOf = function (pts) { return 'M' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' L'); };
  function person(id, vest) {
    return '<g id="' + id + '" opacity="0">' +
      '<path id="' + id + '-l1" d="" stroke="' + C.pants + '" stroke-width="11" stroke-linecap="round" fill="none"/><path id="' + id + '-l2" d="" stroke="#1F2C3A" stroke-width="11" stroke-linecap="round" fill="none"/>' +
      '<rect id="' + id + '-s1" x="-8" y="-4" width="16" height="7" rx="2.5" fill="#161E26"/><rect id="' + id + '-s2" x="-8" y="-4" width="16" height="7" rx="2.5" fill="#161E26"/>' +
      '<path id="' + id + '-armF" d="" stroke="#243C52" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
      '<rect x="-14" y="-110" width="28" height="52" rx="9" fill="' + vest + '"/><rect x="-14" y="-95" width="28" height="4" fill="#EAF0F5"/><rect x="-14" y="-82" width="28" height="4" fill="#EAF0F5"/>' +
      '<g id="' + id + '-head" transform="translate(0,-110)"><rect x="-4" y="-4" width="8" height="8" fill="' + C.skin + '"/><circle cx="0" cy="-16" r="14" fill="' + C.skin + '"/><path d="M14,-17 L19,-13 L14,-11 Z" fill="' + C.skin + '"/>' +
      '<path d="M-16,-19 C-16,-38 16,-38 16,-19 Z" fill="' + C.hat + '"/><path d="M-17,-19 L26,-19" stroke="' + C.hat + '" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M6,-18 L-5,-19" stroke="#2B4A5E" stroke-width="1.6"/><rect x="6" y="-22" width="11" height="7" rx="2.5" fill="rgba(140,200,235,.55)" stroke="#2B4A5E" stroke-width="1.4"/><circle cx="11.5" cy="-17.5" r="1.7" fill="#1B2733"/></g>' +
      '<path id="' + id + '-armN" d="" stroke="' + C.sleeve + '" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
      '<circle id="' + id + '-hN" r="5" fill="' + C.skin + '"/><circle id="' + id + '-hF" r="5" fill="' + C.skin + '"/></g>';
  }
  function chip(id, label, col) {
    var w = 46 + label.length * 7.7;
    return '<g id="' + id + '" opacity="0"><rect width="' + w.toFixed(0) + '" height="30" rx="15" fill="#fff" stroke="' + col + '" stroke-width="2"/><circle cx="16" cy="15" r="5" fill="' + col + '"/><text x="28" y="20" font-size="14" font-weight="700" fill="' + C.ink + '">' + esc(label) + '</text></g>';
  }
  function build(svg) {
    var s = '<defs><pattern id="rx2-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="rgba(242,176,30,.30)"/><rect width="5" height="10" fill="rgba(15,30,46,.20)"/></pattern></defs>';
    s += '<rect width="960" height="540" fill="' + C.wall + '"/><rect y="' + FLOOR + '" width="960" height="110" fill="' + C.floor + '"/><rect y="' + (FLOOR - 3) + '" width="960" height="4" fill="#A9B2BB"/>';
    // transformer cabinet (front panel cover missing)
    s += '<rect x="606" y="186" width="198" height="244" rx="6" fill="#8C98A4" stroke="#6B7783" stroke-width="3"/>';
    for (var v = 0; v < 6; v++) s += '<rect x="622" y="' + (194 + v * 3.2) + '" width="166" height="1.6" fill="#6B7783"/>';
    s += '<rect x="622" y="216" width="166" height="196" rx="3" fill="#27303A"/>';
    [650, 705, 760].forEach(function (x) {
      s += '<rect x="' + (x - 10) + '" y="226" width="20" height="9" fill="#C9D2DA"/><rect x="' + (x - 7) + '" y="235" width="14" height="150" fill="#C9822F"/><rect x="' + (x - 10) + '" y="385" width="20" height="9" fill="#C9D2DA"/>';
    });
    s += '<rect x="640" y="296" width="140" height="10" fill="#7C8996"/><rect x="640" y="336" width="140" height="10" fill="#7C8996"/>';
    s += '<text x="705" y="206" text-anchor="middle" font-size="10.5" font-weight="700" letter-spacing=".8" fill="#2B3640">TRANSFORMER PANEL</text>';
    s += '<rect x="596" y="428" width="218" height="6" fill="#6B7783"/>';
    s += '<rect id="rx2-hz" x="618" y="212" width="174" height="204" rx="6" fill="rgba(198,47,42,.10)" stroke="#E5322D" stroke-width="3" stroke-dasharray="9 6" opacity="0"/>';
    s += '<path id="rx2-miss" d="M622,216 L788,216 L788,412 L622,412 Z" fill="none" stroke="#5B6B7B" stroke-width="2" stroke-dasharray="5 6" opacity="0"/>';
    // barricade + sign (controls part)
    s += '<g id="rx2-bar" opacity="0"><rect x="580" y="338" width="6" height="94" fill="#3A444D"/><rect x="826" y="338" width="6" height="94" fill="#3A444D"/>' +
      '<line x1="583" y1="352" x2="829" y2="352" stroke="#F2B01E" stroke-width="7"/><line x1="583" y1="352" x2="829" y2="352" stroke="#0F1E2E" stroke-width="7" stroke-dasharray="12 12"/>' +
      '<line x1="583" y1="388" x2="829" y2="388" stroke="#F2B01E" stroke-width="7"/><line x1="583" y1="388" x2="829" y2="388" stroke="#0F1E2E" stroke-width="7" stroke-dasharray="12 12"/>' +
      '<g transform="translate(706,320)"><path d="M0,-30 L28,18 L-28,18 Z" fill="#F2B01E" stroke="#0F1E2E" stroke-width="3" stroke-linejoin="round"/><rect x="-2.6" y="-14" width="5.2" height="18" rx="2" fill="#0F1E2E"/><circle cx="0" cy="10.5" r="3" fill="#0F1E2E"/></g></g>';
    // people (walker = near-miss worker, ghost = hypothetical)
    s += person('rx2-w', '#E8591A') + person('rx2-g', '#E8591A');
    s += '<g id="rx2-q" opacity="0"><circle r="16" fill="#fff" stroke="' + C.orange + '" stroke-width="2.5"/><text y="7" text-anchor="middle" font-size="22" font-weight="800" fill="' + C.orange + '">?</text></g>';
    // breaker inset
    s += '<g id="rx2-in" opacity="0" transform="translate(40,62)"><rect width="268" height="168" rx="14" fill="#fff" stroke="' + C.ink + '" stroke-width="2"/>' +
      '<text x="16" y="28" font-size="14" font-weight="800" fill="' + C.ink + '">Associated breaker</text>' +
      '<rect x="20" y="46" width="92" height="104" rx="8" fill="#2F3A44"/><rect x="55" y="58" width="22" height="80" rx="7" fill="#161E26"/>' +
      '<rect id="rx2-lev" x="57" y="62" width="18" height="36" rx="5" fill="#E4E9EE"/>' +
      '<text x="120" y="76" font-size="11" font-weight="800" fill="#5B6B7B">ON</text><text x="120" y="136" font-size="11" font-weight="800" fill="#5B6B7B">OFF</text>' +
      '<circle id="rx2-lamp" cx="152" cy="66" r="9" fill="' + C.red + '"/>' +
      '<text id="rx2-st1" x="170" y="73" font-size="19" font-weight="800" fill="' + C.red + '">CLOSED</text>' +
      '<text id="rx2-st2" x="140" y="108" font-size="15" font-weight="700" fill="' + C.ink + '">ENERGIZED</text>' +
      '<g id="rx2-lock" opacity="0" transform="translate(66,124) scale(1.35)"><path d="M-6,0 V-8 a6,6 0 0 1 12,0 V0" stroke="' + C.ink + '" stroke-width="3" fill="none"/><rect x="-9" y="-1" width="18" height="14" rx="3" fill="#F2B01E" stroke="' + C.ink + '" stroke-width="2"/></g></g>';
    s += chip('rx2-cMiss', 'Cover missing', C.orange) + chip('rx2-cEn', 'Energized', C.red) + chip('rx2-cDe', 'De-energized', C.green) + chip('rx2-cLoto', 'LOTO team notified', C.green) +
      chip('rx2-cNB', 'No barricade', C.red) + chip('rx2-cNS', 'No warning sign', C.red) + chip('rx2-cLive', 'Exposed live parts', C.red);
    s += '<rect id="rx2-tint" width="960" height="452" fill="#14283C" opacity="0"/>';
    s += '<rect x="0" y="452" width="960" height="88" fill="#0F1E2E"/><text id="rx2-c1" x="480" y="488" text-anchor="middle" font-size="22" font-weight="600" fill="#fff"></text><text id="rx2-c2" x="480" y="520" text-anchor="middle" font-size="22" font-weight="600" fill="#fff"></text>';
    s += '<g><rect x="14" y="14" width="452" height="26" rx="13" fill="rgba(15,30,46,.82)"/><text x="28" y="31.5" font-size="11.5" font-weight="700" letter-spacing=".9" fill="#fff">ILLUSTRATIVE REENACTMENT · BASED ON THE INCIDENT RECORD</text></g>';
    s += '<g id="rx2-pill"><rect id="rx2-pillr" y="14" height="26" rx="13" fill="' + C.orange + '"/><text id="rx2-pillt" y="31.5" text-anchor="middle" font-size="12" font-weight="800" letter-spacing=".9" fill="#fff"></text></g>';
    var card = '<g id="rx2-card" opacity="0"><rect width="960" height="540" fill="#0F1E2E"/><text x="60" y="84" font-size="30" font-weight="800" fill="#fff">Corrective actions in the record</text><text x="60" y="112" font-size="15" fill="#9FB3C8">INC-270 · Near miss · Energized equipment exposure</text>';
    CONTROLS.forEach(function (c, i) { var y0 = 160 + i * 74; card += '<g id="rx2-row' + i + '" opacity="0"><rect x="60" y="' + y0 + '" width="840" height="60" rx="12" fill="rgba(255,255,255,.07)"/><circle cx="92" cy="' + (y0 + 30) + '" r="17" fill="#2E7D5B"/><text x="92" y="' + (y0 + 36) + '" text-anchor="middle" font-size="18" font-weight="800" fill="#fff">' + (i + 1) + '</text><text x="126" y="' + (y0 + 38) + '" font-size="22" font-weight="600" fill="#fff">' + esc(c) + '</text></g>'; });
    card += '<text x="60" y="510" font-size="13" fill="#7F95AB">Illustrative reenactment · based on the incident record · not video footage</text></g>';
    svg.innerHTML = s + card;
  }
  var $ = function (id) { return document.getElementById(id); };
  var setT = function (id, tr, op) { var e = $(id); if (!e) return; if (tr !== null && tr !== undefined) e.setAttribute('transform', tr); if (op !== undefined) e.setAttribute('opacity', (+op).toFixed(3)); };
  function pose(id, x, ph, amp, nearT, farT, headA, op) {
    setT(id, 'translate(' + x.toFixed(1) + ',' + FLOOR + ')', op);
    var sn = Math.sin(ph) * amp, cs = Math.cos(ph) * amp, f1 = [-8 + 16 * sn, -3 - 7 * Math.max(0, cs)], f2 = [8 - 16 * sn, -3 - 7 * Math.max(0, -cs)];
    $(id + '-l1').setAttribute('d', 'M-3,-62 L' + f1[0].toFixed(1) + ',' + f1[1].toFixed(1)); $(id + '-l2').setAttribute('d', 'M3,-62 L' + f2[0].toFixed(1) + ',' + f2[1].toFixed(1));
    setT(id + '-s1', 'translate(' + f1[0].toFixed(1) + ',' + (f1[1] + 3).toFixed(1) + ')'); setT(id + '-s2', 'translate(' + f2[0].toFixed(1) + ',' + (f2[1] + 3).toFixed(1) + ')');
    var S = [0, -102], a1 = ik(S, nearT, 44, 42), a2 = ik(S, farT, 44, 42);
    $(id + '-armN').setAttribute('d', pathOf(a1)); setT(id + '-hN', 'translate(' + a1[2][0].toFixed(1) + ',' + a1[2][1].toFixed(1) + ')');
    $(id + '-armF').setAttribute('d', pathOf(a2)); setT(id + '-hF', 'translate(' + a2[2][0].toFixed(1) + ',' + a2[2][1].toFixed(1) + ')');
    setT(id + '-head', 'translate(0,-110) rotate(' + headA.toFixed(1) + ')');
  }
  function capsAt(tt) { for (var i = 0; i < CAPS.length; i++) if (tt >= CAPS[i][0] && tt < CAPS[i][1]) return CAPS[i]; return ['', '', '', '']; }
  function render(t) {
    var tt = t, hyp = tt >= P_HYP && tt < P_CTL, ctl = tt >= P_CTL && tt < P_CARD;
    // ---- walker (the near-miss worker)
    var wx, walking = 0;
    if (tt < 2.4) { wx = lerp(120, 400, tt / 2.4); walking = 1 - seg(tt, 2.1, 2.4); }
    else if (tt < 3.4) { wx = 400; }
    else if (tt < 4.4) { wx = lerp(400, 470, ease(seg(tt, 3.4, 4.4))); walking = Math.min(seg(tt, 3.4, 3.6), 1 - seg(tt, 4.1, 4.4)); }
    else wx = 470;
    var ph = wx / 11, point = ease(seg(tt, 4.6, 5.2)) * (1 - ease(seg(tt, 7.0, 7.5)));
    var swing = Math.sin(ph) * 13 * walking;
    var nearT = [12 + swing + point * 36, -50 - point * 38], farT = [-6 - swing, -50];
    var wOp = tt < 10.9 ? 1 : 1 - seg(tt, 10.9, 11.3);
    pose('rx2-w', wx, ph, walking, nearT, farT, lerp(0, -9, ease(seg(tt, 2.5, 3.0))) * (1 - seg(tt, 4.4, 4.8)), wOp);
    var qo = win(tt, 2.6, 4.4, 0.25); setT('rx2-q', 'translate(' + (wx + 6) + ',' + (FLOOR - 190) + ')', qo);
    // ---- ghost (hypothetical person, not an actual event)
    var gx = lerp(150, 545, seg(tt, 13.4, 15.0)), gwalk = (tt >= 13.4 && tt < 15.0) ? 1 - seg(tt, 14.7, 15.0) : 0, reach = ease(seg(tt, 15.0, 15.9)) * (1 - ease(seg(tt, 17.0, 17.3)));
    var gsw = Math.sin(gx / 11) * 13 * gwalk;
    var gOp = 0.5 * (hyp ? Math.min(seg(tt, 13.4, 13.8), 1 - seg(tt, 17.0, 17.4)) : 0);
    pose('rx2-g', gx, gx / 11, gwalk, [12 + gsw + reach * 64, -50 - reach * 40], [-6 - gsw, -50], -4 * reach, gOp);
    // ---- breaker inset state
    var open = 0, locked = 0;
    if (tt < P_HYP) open = ease(seg(tt, 8.8, 9.3)); else if (tt < P_CTL) open = 1 - ease(seg(tt, 10.8, 11.2)); else open = ease(seg(tt, 17.4, 17.8));
    locked = ctl ? ease(seg(tt, 17.9, 18.4)) : 0;
    var inOp = tt < 4.6 ? 0 : (tt < P_CARD ? ease(seg(tt, 4.6, 5.0)) : 0);
    setT('rx2-in', null, inOp);
    $('rx2-lev').setAttribute('y', lerp(62, 100, open).toFixed(1));
    var isOpen = open > 0.5;
    $('rx2-lamp').setAttribute('fill', isOpen ? C.green : C.red);
    $('rx2-st1').setAttribute('fill', isOpen ? C.green : C.red); $('rx2-st1').textContent = isOpen ? 'OPEN' : 'CLOSED';
    $('rx2-st2').textContent = isOpen ? (locked > 0.5 ? 'LOCKED OUT' : 'SAFE') : 'ENERGIZED';
    setT('rx2-lock', null, locked);
    // ---- cabinet states
    var energized = (tt >= 5.0 && tt < 9.0) || hyp;
    var pulse = 0.55 + 0.45 * Math.sin(t * 6);
    setT('rx2-hz', null, energized ? (tt >= 5.0 && tt < 5.4 ? seg(tt, 5.0, 5.4) : (hyp ? Math.min(1, seg(tt, 10.8, 11.2)) : 1)) * pulse : 0);
    setT('rx2-miss', null, win(tt, 2.5, 5.0, 0.3) * 0.9);
    setT('rx2-bar', null, ctl ? ease(seg(tt, 19.8, 20.4)) : 0);
    // ---- chips
    setT('rx2-cMiss', 'translate(430,150)', win(tt, 2.7, 4.6, 0.3));
    setT('rx2-cEn', 'translate(650,146)', win(tt, 5.2, 8.9, 0.3));
    setT('rx2-cLoto', 'translate(' + (wx - 70) + ',' + (FLOOR - 236) + ')', win(tt, 7.1, 8.8, 0.3));
    setT('rx2-cDe', 'translate(650,146)', win(tt, 9.4, 10.8, 0.3));
    setT('rx2-cNB', 'translate(430,150)', win(tt, 13.4, 15.2, 0.3)); setT('rx2-cNS', 'translate(430,190)', win(tt, 13.5, 15.2, 0.3));
    setT('rx2-cLive', 'translate(650,146)', win(tt, 15.4, 17.3, 0.3));
    // ---- tint, pill, captions, card
    setT('rx2-tint', null, hyp ? 0.2 * Math.min(seg(tt, 10.8, 11.3), 1 - seg(tt, 17.1, 17.4)) : 0);
    var pt = tt < P_HYP ? 'WHAT HAPPENED' : (tt < P_CTL ? 'WHAT COULD HAVE HAPPENED · NOT AN ACTUAL EVENT' : 'CONTROLS FROM THE INCIDENT RECORD');
    var pc = tt < P_HYP ? C.orange : (tt < P_CTL ? '#8E2B27' : C.green), pw = pt.length * 8.9 + 32;
    $('rx2-pillr').setAttribute('x', (946 - pw).toFixed(1)); $('rx2-pillr').setAttribute('width', pw.toFixed(1)); $('rx2-pillr').setAttribute('fill', pc);
    $('rx2-pillt').setAttribute('x', (946 - pw / 2).toFixed(1)); $('rx2-pillt').textContent = pt;
    var cap = capsAt(tt); $('rx2-c1').textContent = cap[2]; $('rx2-c2').textContent = cap[3];
    var cardOp = ease(seg(tt, P_CARD, P_CARD + 0.5)); setT('rx2-card', null, cardOp);
    for (var i = 0; i < CONTROLS.length; i++) setT('rx2-row' + i, null, ease(seg(tt, P_CARD + 0.7 + i * 1.0, P_CARD + 1.2 + i * 1.0)));
    return [cap[2], cap[3]];
  }
  window.RX_SCENES = window.RX_SCENES || {};
  window.RX_SCENES.panel = { build: build, render: render, dur: DUR };
  window.REENACTMENTS = window.REENACTMENTS || {};
  window.REENACTMENTS['INC-270'] = { scene: 'panel', kind: 'Near miss', title: 'Near miss: energized transformer panel with the cover left off', dur: DUR,
    chapters: [[0, 'What happened'], [P_HYP, 'What could have happened'], [P_CTL, 'Controls from the record'], [P_CARD, 'Corrective actions']],
    controls: [
      { full: 'Eliminate the practice of leaving covers off energized equipment under any circumstance' },
      { full: 'If covers must be removed for QA/QC, de-energize and LOTO the equipment first' },
      { full: 'Implement signage/barricading requirements for any equipment in a temporarily open or inspection-pending state' },
      { full: 'Reinforce stop-work authority and recognition training for abnormal equipment conditions' }],
    listTitle: 'Corrective actions recorded for this near miss',
    note: 'Based on the near-miss record: a person on a routine walk-through noticed a protective cover missing from a transformer panel and found the breaker closed, so the equipment was energized. They notified the LOTO team and the breaker was opened. No contact occurred. The middle section is a hypothetical of what could have happened and is labeled as not an actual event. The last part shows the corrective actions recorded. Figures are simplified and do not depict real people.' };
  window.rx2Duration = DUR;
  window.rx2RenderAt = function (t) { if (!$('rx2-c1')) build($('rx-svg')); return render(t); };
})();

/* High-risk activity categories (kept under the internal name "stky"). Category names and thresholds follow the category chart supplied by the PreTaskIQ founder.
   Thresholds are recognition triggers only: company policy and regulation still set the required controls. */
