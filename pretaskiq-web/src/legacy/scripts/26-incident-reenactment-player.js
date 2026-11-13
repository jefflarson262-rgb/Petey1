/* ===== Incident reenactment player (illustrative animation, no external assets) ===== */
(function () {
  var FLOOR = 430, DUR = 31, OFF = 1.2, CH3 = 11.5;               // OFF = seconds of title card before the action starts
  var C = { wall:'#DCE4EB', floor:'#BFC7CF', steel:'#5C6772', steelD:'#46515B', plate:'#74808C', hat:'#F2B01E', sleeve:'#2F4A63', pants:'#2B3A4A', skin:'#D9CFC4', ink:'#0F1E2E', orange:'#E86A14', green:'#2E7D5B' };
  var EX = 577, EY = 292, ELEAN = -9;                    // elevated worker: feet on ladder rung
  var BOLT = { x: 470, y: 127 };                         // bolt being cut (head of bolt)
  var BOLTS = [380, 425, 470, 640];
  var WA = { x: 418 }, WB = { x: 292 };                  // ground worker position: A = in the debris path, B = outside the zone
  var CAPS = [
    [-9, 0.5, 'Overhead bolt work: a metal fragment strike', 'Illustrative reenactment of the incident record'],
    [0.5, 3.5, 'A worker on a ladder is removing bolts from an overhead structure', 'with an impact drill, wearing a face shield.'],
    [3.5, 5.9, 'A second worker is on the ground below, looking up at the work,', 'wearing standard safety glasses.'],
    [5.9, 7.6, 'A metal fragment is ejected. It gets past the edge of the', 'safety glasses and strikes the worker in the eye.'],
    [7.6, 9.3, 'The worker is taken for medical evaluation.', ''],
    [9.9, 12.9, 'Same task, with the corrective actions in place.', 'A magnet over the drill catches debris before it is released.'],
    [12.9, 15.2, 'The drill runs. Debris is drawn to the magnet', 'and held at the source.'],
    [15.2, 18.2, 'An exclusion zone is marked below the work.', 'Any debris that still escapes falls where no one is standing.'],
    [18.2, 20.8, 'Anyone who must stay in that path wears a face shield.', 'Everyone in the area is briefed before overhead work begins.']
  ];
  var CONTROLS = [
    { short: 'Magnet over the drill to catch debris before it is released', full: 'Magnet over the drill to catch debris before it is released' },
    { short: 'Exclusion zone marked beneath overhead work', full: 'Establish and mark an exclusion zone or barricade beneath any overhead cutting, grinding, or drilling operation' },
    { short: 'Face shield, not just glasses, for anyone in the debris path', full: 'Require face shield (not just safety glasses) for any personnel who must remain within the debris path of overhead cutting or grinding work' },
    { short: 'Everyone in the work area briefed before overhead work begins', full: 'Brief all personnel in the work area \u2014 not only the person performing overhead work \u2014 before overhead cutting or grinding begins' },
    { short: 'Overhead exclusion zones become a standard pre-task question', full: 'Incorporate overhead-work exclusion zones into pre-task planning as a standard question, separate from PPE for the elevated worker' }
  ];
  var esc = function (x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
  var clamp = function (x, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, x)); };
  var seg = function (t, a, b) { return clamp((t - a) / (b - a)); };
  var ease = function (x) { return x * x * (3 - 2 * x); };
  var lerp = function (a, b, x) { return a + (b - a) * x; };
  var win = function (t, a, b, f) { f = f || 0.25; return Math.min(seg(t, a, a + f), 1 - seg(t, b - f, b)); };
  var rot = function (p, deg) { var r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
  var bez = function (p0, p1, p2, u) { var a = 1 - u; return [a * a * p0[0] + 2 * a * u * p1[0] + u * u * p2[0], a * a * p0[1] + 2 * a * u * p1[1] + u * u * p2[1]]; };

  function ik(S, T, l1, l2) {                             // two-bone arm, elbow bends downward
    var dx = T[0] - S[0], dy = T[1] - S[1], d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.5), a = Math.atan2(dy, dx);
    var cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), A = Math.acos(cosA);
    var e1 = [S[0] + l1 * Math.cos(a + A), S[1] + l1 * Math.sin(a + A)], e2 = [S[0] + l1 * Math.cos(a - A), S[1] + l1 * Math.sin(a - A)];
    var E = e1[1] > e2[1] ? e1 : e2;
    var H = [S[0] + d * Math.cos(a), S[1] + d * Math.sin(a)];
    return [S, E, H];
  }
  function person(id, vest, kind) {
    var head = '<g id="' + id + '-head" transform="translate(0,-110)">' +
      '<rect x="-4" y="-4" width="8" height="8" fill="' + C.skin + '"/>' +
      '<circle cx="0" cy="-16" r="14" fill="' + C.skin + '"/>' +
      '<path d="M14,-17 L19,-13 L14,-11 Z" fill="' + C.skin + '"/>' +
      '<path d="M-16,-19 C-16,-38 16,-38 16,-19 Z" fill="' + C.hat + '"/><path d="M-17,-19 L26,-19" stroke="' + C.hat + '" stroke-width="4" stroke-linecap="round"/><path d="M-16,-19 L-16,-19" stroke="#C98F0E" stroke-width="1"/>' +
      (kind === 'W'
        ? '<path d="M6,-18 L-5,-19" stroke="#2B4A5E" stroke-width="1.6"/><rect x="6" y="-22" width="11" height="7" rx="2.5" fill="rgba(140,200,235,.55)" stroke="#2B4A5E" stroke-width="1.4"/><circle cx="11.5" cy="-17.5" r="1.7" fill="#1B2733"/><g id="' + id + '-shield" opacity="0"><path d="M10,-36 L28,-29 L28,-2 L10,-7 Z" fill="rgba(160,205,240,.38)" stroke="#5B87A6" stroke-width="1.6"/><path d="M6,-31 L12,-35" stroke="#5B87A6" stroke-width="3" stroke-linecap="round"/></g>'
        : '<path d="M10,-36 L28,-29 L28,-2 L10,-7 Z" fill="rgba(160,205,240,.38)" stroke="#5B87A6" stroke-width="1.6"/><path d="M6,-31 L12,-35" stroke="#5B87A6" stroke-width="3" stroke-linecap="round"/><circle cx="11.5" cy="-17.5" r="1.7" fill="#1B2733"/>') +
      '</g>';
    return '<g id="' + id + '">' +
      '<path d="M-3,-62 L-8,-3" stroke="' + C.pants + '" stroke-width="11" stroke-linecap="round" fill="none"/><path d="M3,-62 L8,-3" stroke="#1F2C3A" stroke-width="11" stroke-linecap="round" fill="none"/>' +
      '<rect x="-14" y="-7" width="15" height="7" rx="2.5" fill="#161E26"/><rect x="2" y="-7" width="15" height="7" rx="2.5" fill="#161E26"/>' +
      '<path id="' + id + '-armF" d="" stroke="#243C52" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
      '<rect x="-14" y="-110" width="28" height="52" rx="9" fill="' + vest + '"/><rect x="-14" y="-95" width="28" height="4" fill="#EAF0F5"/><rect x="-14" y="-82" width="28" height="4" fill="#EAF0F5"/>' + head +
      '<path id="' + id + '-armN" d="" stroke="' + C.sleeve + '" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
      '<circle id="' + id + '-hN" r="5" fill="' + C.skin + '"/><circle id="' + id + '-hF" r="5" fill="' + C.skin + '"/></g>';
  }
  function chip(id, w, label, col) {
    return '<g id="' + id + '" opacity="0"><rect x="0" y="0" width="' + w + '" height="30" rx="15" fill="#fff" stroke="' + col + '" stroke-width="2"/><circle cx="16" cy="15" r="5" fill="' + col + '"/><text x="28" y="20" font-size="14" font-weight="700" fill="' + C.ink + '">' + label + '</text></g>';
  }
  function build(svg) {
    var s = '';
    s += '<defs><pattern id="rx-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="rgba(242,176,30,.28)"/><rect width="5" height="10" fill="rgba(15,30,46,.18)"/></pattern></defs>';
    s += '<rect width="960" height="540" fill="' + C.wall + '"/><rect y="' + FLOOR + '" width="960" height="110" fill="' + C.floor + '"/><rect y="' + (FLOOR - 3) + '" width="960" height="4" fill="#A9B2BB"/>';
    s += '<rect x="215" y="64" width="28" height="' + (FLOOR - 64) + '" fill="' + C.steelD + '"/><rect x="205" y="' + (FLOOR - 8) + '" width="48" height="8" fill="#3B454E"/>';
    s += '<rect x="215" y="64" width="715" height="18" fill="' + C.steel + '"/><rect x="215" y="82" width="715" height="6" fill="' + C.steelD + '"/><rect x="380" y="88" width="290" height="8" fill="' + C.plate + '"/>';
    BOLTS.forEach(function (x, i) { var cut = (x === BOLT.x); s += '<g id="rx-bolt' + (cut ? 'c' : i) + '"><rect id="rx-shaft' + (cut ? 'c' : i) + '" x="' + (x - 3.5) + '" y="96" width="7" height="24" fill="#3E4851"/><rect id="rx-head' + (cut ? 'c' : i) + '" x="' + (x - 8) + '" y="120" width="16" height="7" rx="1.5" fill="#2F3841"/></g>'; });
    var lx0 = 515, lx1 = 585;                              // ladder, top-left and bottom-left x
    function lx(y) { return lx0 + (y - 96) / (FLOOR - 96) * (lx1 - lx0); }
    s += '<path d="M' + lx0 + ',96 L' + lx1 + ',' + FLOOR + ' M' + (lx0 + 42) + ',96 L' + (lx1 + 42) + ',' + FLOOR + '" stroke="#97A3AF" stroke-width="5" stroke-linecap="round" fill="none"/>';
    for (var y = 126; y < FLOOR - 10; y += 34) s += '<path d="M' + lx(y) + ',' + y + ' L' + (lx(y) + 42) + ',' + y + '" stroke="#97A3AF" stroke-width="4" stroke-linecap="round"/>';
    // phase B zone (floor hatch, cones, tape)
    s += '<g id="rx-zone" opacity="0"><ellipse cx="478" cy="' + (FLOOR + 4) + '" rx="112" ry="14" fill="url(#rx-hatch)" stroke="' + C.orange + '" stroke-width="2" stroke-dasharray="6 5"/>' +
      '<g id="rx-cone1"><path d="M-10,0 L10,0 L5,-28 L-5,-28 Z" fill="#F26B1D"/><rect x="-7" y="-19" width="14" height="5" fill="#fff"/><rect x="-12" y="-2" width="24" height="3" fill="#E4570C"/></g>' +
      '<g id="rx-cone2"><path d="M-10,0 L10,0 L5,-28 L-5,-28 Z" fill="#F26B1D"/><rect x="-7" y="-19" width="14" height="5" fill="#fff"/><rect x="-12" y="-2" width="24" height="3" fill="#E4570C"/></g>' +
      '<line id="rx-tape1" x1="0" y1="0" x2="0" y2="0" stroke="#F2B01E" stroke-width="5"/><line id="rx-tape2" x1="0" y1="0" x2="0" y2="0" stroke="#0F1E2E" stroke-width="5" stroke-dasharray="9 9"/></g>';
    s += '<g id="rx-ladderfoot"></g>';
    s += '<g id="rx-tool">' +
      '<rect x="-1.8" y="0" width="3.6" height="27" fill="#8A97A3"/>' +
      '<path d="M-8,26 L8,26 L10,38 L-10,38 Z" fill="#4A5560"/>' +
      '<rect x="-13" y="38" width="26" height="28" rx="6" fill="#55606B"/><rect x="-13" y="47" width="26" height="4" fill="#9AA6B2"/>' +
      '<rect x="-6" y="64" width="12" height="28" rx="4" fill="#2B3640"/><rect x="-14" y="90" width="28" height="11" rx="3" fill="#3A4650"/>' +
      '<g id="rx-mag" opacity="0"><path d="M-13,6 L-13,16 A13,13 0 0 0 13,16 L13,6" fill="none" stroke="#D93A2F" stroke-width="7"/>' +
      '<rect x="-16.5" y="2" width="7" height="6" fill="#DDE3E8"/><rect x="9.5" y="2" width="7" height="6" fill="#DDE3E8"/>' +
      '<circle id="rx-spk1" cx="-13" cy="0.5" r="3" fill="#3A444D" stroke="#C9D2DA" stroke-width=".6" opacity="0"/><circle id="rx-spk2" cx="-9.5" cy="-1.5" r="2.4" fill="#3A444D" stroke="#C9D2DA" stroke-width=".6" opacity="0"/><circle id="rx-spk3" cx="-16.5" cy="-1" r="2.2" fill="#3A444D" stroke="#C9D2DA" stroke-width=".6" opacity="0"/></g></g>';
    s += person('rx-w', '#E8591A', 'W') + person('rx-e', '#F28A1D', 'E');
    s += '<circle id="rx-magring" cx="' + BOLT.x + '" cy="' + (BOLT.y + 16) + '" r="23" fill="none" stroke="#2E7D5B" stroke-width="2.5" stroke-dasharray="5 4" opacity="0"/><circle id="rx-pulse" cx="' + BOLT.x + '" cy="' + (BOLT.y + 13) + '" r="8" fill="none" stroke="#2E7D5B" stroke-width="3" opacity="0"/>';
    s += '<g id="rx-sparks"></g><g id="rx-trail"></g><path id="rx-frag" d="M0,-3 L4,-1 L3,3 L-2,3 L-4,0 Z" fill="#3A444D" stroke="#C9D2DA" stroke-width=".8" opacity="0"/>';
    s += '<g id="rx-impact" opacity="0"><circle id="rx-ring" r="10" fill="none" stroke="#E5322D" stroke-width="4"/><circle id="rx-ring2" r="4" fill="#FFE08A" opacity=".9"/></g>';
    s += '<g id="rx-land" opacity="0"><circle r="15" fill="#2E7D5B"/><path d="M-6,0 L-2,5 L7,-5" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>';
    s += chip('rx-chipE', 138, 'Face shield', C.green) + chip('rx-chipW', 150, 'Safety glasses', C.orange) + chip('rx-chipZ', 178, 'Exclusion zone', C.green) + chip('rx-chipS', 138, 'Face shield', C.green) + chip('rx-chipB', 214, 'Crew briefed first', C.green) + chip('rx-chipM', 214, 'Medical evaluation', '#C62F2A') + chip('rx-chipG', 204, 'Magnet over the drill', C.green);
    s += '<rect x="0" y="452" width="960" height="88" fill="#0F1E2E"/><text id="rx-c1" x="480" y="488" text-anchor="middle" font-size="23" font-weight="600" fill="#fff"></text><text id="rx-c2" x="480" y="520" text-anchor="middle" font-size="23" font-weight="600" fill="#fff"></text>';
    s += '<g><rect x="14" y="14" width="452" height="26" rx="13" fill="rgba(15,30,46,.82)"/><text x="28" y="31.5" font-size="11.5" font-weight="700" letter-spacing=".9" fill="#fff">ILLUSTRATIVE REENACTMENT · BASED ON THE INCIDENT RECORD</text></g>';
    s += '<g id="rx-pill" opacity="0"><rect id="rx-pillr" x="700" y="14" width="246" height="26" rx="13" fill="' + C.orange + '"/><text id="rx-pillt" x="823" y="31.5" text-anchor="middle" font-size="12" font-weight="800" letter-spacing=".9" fill="#fff"></text></g>';
    s += '<rect id="rx-fade" width="960" height="452" fill="' + C.wall + '" opacity="0"/>';
    var card = '<g id="rx-card3" opacity="0"><rect width="960" height="540" fill="#0F1E2E"/><text x="60" y="84" font-size="30" font-weight="800" fill="#fff">Corrective actions added</text><text x="60" y="112" font-size="15" fill="#9FB3C8">INC-310 \u00B7 Overhead work \u00B7 from the incident record</text>';
    CONTROLS.forEach(function (c, i) { var y0 = 150 + i * 66; card += '<g id="rx-row' + i + '" opacity="0"><rect x="60" y="' + y0 + '" width="840" height="54" rx="12" fill="rgba(255,255,255,.07)"/><circle cx="90" cy="' + (y0 + 27) + '" r="16" fill="#2E7D5B"/><text x="90" y="' + (y0 + 33) + '" text-anchor="middle" font-size="17" font-weight="800" fill="#fff">' + (i + 1) + '</text><text x="122" y="' + (y0 + 34) + '" font-size="21" font-weight="600" fill="#fff">' + esc(c.short) + '</text></g>'; });
    card += '<text x="60" y="510" font-size="13" fill="#7F95AB">Illustrative reenactment \u00B7 based on the incident record \u00B7 not video footage</text></g>';
    s += card;
    svg.innerHTML = s;
  }
  var $ = function (id) { return document.getElementById(id); };
  var setT = function (id, tr, op) { var e = $(id); if (!e) return; if (tr !== null && tr !== undefined) e.setAttribute('transform', tr); if (op !== undefined) e.setAttribute('opacity', op); };
  function pathOf(pts) { return 'M' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' L'); }

  function render(t) {
    var tt = t - OFF, B = tt >= 9.35, lt = tt - 9.6;
    // ---- ground worker
    var wx = B ? WB.x : WA.x, headA, handUp = 0, lean = 0, dx = 0;
    if (!B) {
      headA = lerp(0, -54, ease(seg(tt, 3.7, 4.5)));
      var hit = ease(seg(tt, 6.75, 7.4)); headA = lerp(headA, -10, hit); handUp = ease(seg(tt, 6.85, 7.5)); lean = lerp(0, -6, hit); dx = lerp(0, -9, hit);
    } else { headA = lerp(0, -42, ease(seg(lt, 0.9, 1.7))); }
    setT('rx-w', 'translate(' + (wx + dx) + ',' + FLOOR + ') rotate(' + lean + ')'); setT('rx-w-head', 'translate(0,-110) rotate(' + headA + ')');
    var S = [0, -102], hand = [lerp(7, 11, handUp), lerp(-48, -124, handUp)];
    var a1 = ik(S, hand, 44, 42); $('rx-w-armN').setAttribute('d', pathOf(a1)); setT('rx-w-hN', 'translate(' + a1[2][0] + ',' + a1[2][1] + ')');
    var a2 = ik(S, [-4, -50], 44, 42); $('rx-w-armF').setAttribute('d', pathOf(a2)); setT('rx-w-hF', 'translate(' + a2[2][0] + ',' + a2[2][1] + ')', 0);
    // ---- drill (with a little vibration while it runs) and the elevated worker holding it
    var vib = B ? ((lt > 2.6 && lt < 3.6) || (lt > 6.3 && lt < 7.3)) : (tt > 5.2 && tt < 6.0);
    var jx = vib ? Math.sin(t * 75) * 0.9 : 0, jy = vib ? Math.cos(t * 83) * 0.7 : 0, TS = 0.78;
    var TX = BOLT.x + jx, TY = BOLT.y + 2 + jy;
    setT('rx-tool', 'translate(' + TX + ',' + TY + ') scale(' + TS + ')');
    var mg = B ? ease(seg(lt, 0.3, 1.0)) : 0; setT('rx-mag', 'translate(0,' + ((1 - mg) * -26) + ')', mg);
    var caught = B && lt >= 3.5; setT('rx-spk1', null, caught ? 1 : 0); setT('rx-spk2', null, caught ? 1 : 0); setT('rx-spk3', null, B && lt >= 6.9 ? 1 : 0);
    setT('rx-e', 'translate(' + EX + ',' + EY + ') rotate(' + ELEAN + ')');
    setT('rx-e-head', 'translate(0,-110) rotate(-26)');
    var loc = function (p) { return rot([p[0] - EX, p[1] - EY], -ELEAN); };
    var ES = [0, -102], hN = loc([TX, TY + 72 * TS]), hF = loc([TX + 13 * TS, TY + 52 * TS]);
    var e1 = ik(ES, hN, 50, 48), e2 = ik(ES, hF, 50, 48);
    $('rx-e-armN').setAttribute('d', pathOf(e1)); setT('rx-e-hN', 'translate(' + e1[2][0] + ',' + e1[2][1] + ')');
    $('rx-e-armF').setAttribute('d', pathOf(e2)); setT('rx-e-hF', 'translate(' + e2[2][0] + ',' + e2[2][1] + ')');
    // bolt state: intact until the first event, then removed
    var boltGone = B ? lt >= 3.0 : tt >= 6.0;
    $('rx-shaftc').setAttribute('height', boltGone ? 16 : 24); $('rx-headc').setAttribute('opacity', boltGone ? 0 : 1);
    // ---- sparks
    var events = B ? [3.0, 6.8] : [6.0], cl = B ? lt : tt, sc = '';
    events.forEach(function (e0) { if (cl >= e0 && cl < e0 + 0.6) { var su = seg(cl, e0, e0 + 0.6); for (var k = 0; k < 10; k++) { var ang = (k / 10) * 6.283 + 0.4, spd = 22 + (k % 4) * 11, px = BOLT.x + Math.cos(ang) * spd * ease(su), py = BOLT.y + 6 + Math.sin(ang) * spd * ease(su) + 14 * su * su; sc += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + (2.6 - su * 1.6).toFixed(2) + '" fill="' + (k % 2 ? '#FFD04A' : '#FF8A2A') + '" opacity="' + (1 - su).toFixed(2) + '"/>'; } } });
    $('rx-sparks').innerHTML = sc;
    // ---- fragments
    var frag = $('rx-frag'), tr = '', P0 = [BOLT.x, BOLT.y + 8];
    var trailOf = function (fn, u, n, step, r0) { var o = ''; for (var j = 1; j <= n; j++) { var uu = Math.max(0, u - j * step), q = fn(uu); o += '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="' + Math.max(0.6, r0 - j * 0.5).toFixed(2) + '" fill="#9AA6B2" opacity="' + Math.max(0.05, 0.55 - j * 0.1).toFixed(2) + '"/>'; } return o; };
    setT('rx-impact', null, 0); setT('rx-land', null, 0); setT('rx-pulse', null, 0);
    if (!B) {
      var eyeL = rot([11.5, -17.5], -54), eyeW = [eyeL[0] + WA.x, eyeL[1] - 110 + FLOOR];
      var pathA = function (u) { return bez(P0, [P0[0] - 12, (P0[1] + eyeW[1]) / 2 - 20], eyeW, ease(u) * 0.85 + u * 0.15); };
      var u = seg(tt, 6.0, 6.75);
      if (tt >= 6.0 && tt < 6.78) { var p = pathA(u); frag.setAttribute('transform', 'translate(' + p[0] + ',' + p[1] + ') rotate(' + (tt * 900) + ')'); frag.setAttribute('opacity', 1); tr = trailOf(pathA, u, 5, 0.06, 3.2); } else frag.setAttribute('opacity', 0);
      var is = seg(tt, 6.75, 7.4);
      if (tt >= 6.75 && tt < 7.4) { setT('rx-impact', 'translate(' + (eyeW[0] - 9 * is) + ',' + eyeW[1] + ')', 1 - is); $('rx-ring').setAttribute('r', lerp(6, 34, ease(is))); $('rx-ring2').setAttribute('r', lerp(5, 18, ease(is))); }
    } else {
      var tip = [TX - 13 * TS, TY + 1];
      var pathC = function (u) { return bez(P0, [P0[0] - 30, P0[1] + 14], tip, ease(u)); };
      var uc = seg(lt, 3.0, 3.5);
      if (lt >= 3.0 && lt < 3.5) { var pc = pathC(uc); frag.setAttribute('transform', 'translate(' + pc[0] + ',' + pc[1] + ') rotate(' + (lt * 900) + ')'); frag.setAttribute('opacity', 1); tr = trailOf(pathC, uc, 4, 0.08, 3); }
      else if (lt >= 6.8 && lt < 7.7) {
        var Pl = [452, FLOOR - 4], pathE = function (u) { return bez(P0, [P0[0] - 70, P0[1] + 60], Pl, ease(u) * 0.9 + u * 0.1); }, ue = seg(lt, 6.8, 7.7), pe = pathE(ue);
        frag.setAttribute('transform', 'translate(' + pe[0] + ',' + pe[1] + ') rotate(' + (lt * 900) + ')'); frag.setAttribute('opacity', 1); tr = trailOf(pathE, ue, 4, 0.07, 3);
      } else if (lt >= 7.7 && lt < CH3 + 1) {
        var bnc = Math.abs(Math.sin(seg(lt, 7.7, 8.1) * Math.PI)) * 7 * (1 - seg(lt, 7.7, 8.1));
        frag.setAttribute('transform', 'translate(452,' + (FLOOR - 4 - bnc) + ') rotate(60)'); frag.setAttribute('opacity', 1);
      } else frag.setAttribute('opacity', 0);
      var up = seg(lt, 3.45, 3.95); if (lt >= 3.45 && lt < 3.95) { $('rx-pulse').setAttribute('r', lerp(8, 30, ease(up))); setT('rx-pulse', null, (1 - up).toFixed(2)); }
      setT('rx-land', 'translate(' + 478 + ',' + (FLOOR - 56) + ')', lt > 8.1 ? ease(seg(lt, 8.1, 8.5)) : 0);
    }
    $('rx-trail').innerHTML = tr;
    // ---- zone
    setT('rx-zone', null, B ? ease(seg(lt, 5.6, 6.4)) : 0);
    var c1 = [398, FLOOR + 6], c2 = [562, FLOOR + 6], drop = (1 - ease(seg(lt, 5.6, 6.3))) * -34;
    setT('rx-cone1', 'translate(' + c1[0] + ',' + (c1[1] + drop) + ')'); setT('rx-cone2', 'translate(' + c2[0] + ',' + (c2[1] + drop) + ')');
    var tp = ease(seg(lt, 6.1, 6.8)), ty = FLOOR - 30;
    ['rx-tape1', 'rx-tape2'].forEach(function (id) { var e = $(id); e.setAttribute('x1', c1[0]); e.setAttribute('y1', ty); e.setAttribute('x2', lerp(c1[0], c2[0], tp)); e.setAttribute('y2', ty); });
    // ---- chips
    setT('rx-chipE', 'translate(690,150)', B ? 0 : win(tt, 3.4, 6.0));
    setT('rx-chipW', 'translate(252,252)', B ? 0 : win(tt, 4.0, 7.2));
    setT('rx-chipM', 'translate(322,226)', B ? 0 : win(tt, 7.7, 9.25));
    var gw = B ? win(lt, 1.0, 5.4) : 0; setT('rx-chipG', 'translate(244,152)', gw); setT('rx-magring', null, (gw * 0.9).toFixed(2));
    setT('rx-chipZ', 'translate(393,330)', B ? win(lt, 6.2, 10.8) : 0);
    setT('rx-w-shield', null, B ? ease(seg(lt, 8.9, 9.4)) : 0);
    setT('rx-chipS', 'translate(332,262)', B ? win(lt, 9.0, 11.3) : 0);
    setT('rx-chipB', 'translate(596,218)', B ? win(lt, 9.6, 11.3) : 0);
    // ---- controls card
    var cardO = B ? ease(seg(lt, CH3 - 0.3, CH3 + 0.4)) : 0; setT('rx-card3', null, cardO.toFixed(3));
    for (var r = 0; r < CONTROLS.length; r++) { var ro = B ? ease(seg(lt, CH3 + 0.7 + r * 0.8, CH3 + 1.2 + r * 0.8)) : 0; setT('rx-row' + r, 'translate(' + ((1 - ro) * 18).toFixed(1) + ',0)', ro.toFixed(3)); }
    // ---- captions, pill, fade
    var cap = ['', '']; for (var i = 0; i < CAPS.length; i++) if (tt >= CAPS[i][0] && tt < CAPS[i][1]) cap = [CAPS[i][2], CAPS[i][3]];
    if (t < OFF) cap = [CAPS[0][2], CAPS[0][3]];
    if (B && lt >= CH3 + 0.4) cap = ['Corrective actions added:', CONTROLS.map(function (c, i) { return (i + 1) + ', ' + c.short; }).join('; ') + '.'];
    var showCap = !(B && lt >= CH3 - 0.1);
    $('rx-c1').textContent = showCap ? cap[0] : ''; $('rx-c2').textContent = showCap ? cap[1] : '';
    $('rx-c1').setAttribute('y', cap[1] ? 488 : 508); $('rx-c2').setAttribute('y', 520);
    $('rx-pillt').textContent = B ? 'WITH CONTROLS IN PLACE' : 'WHAT HAPPENED'; $('rx-pill').setAttribute('opacity', tt > 0.2 ? 1 : 0);
    var pw = B ? 246 : 168; $('rx-pillr').setAttribute('width', pw); $('rx-pillr').setAttribute('x', 946 - pw); $('rx-pillr').setAttribute('fill', B ? C.green : C.orange); $('rx-pillt').setAttribute('x', 946 - pw / 2);
    setT('rx-fade', null, (1 - clamp(Math.abs(tt - 9.35) / 0.55)).toFixed(3));
    return cap;
  }

  // ===== player =====
  var R = { t: 0, dur: DUR, scene: null, builtScene: null, playing: false, last: 0, raf: 0, built: false, opener: null, id: null };
  window.RX_SCENES = window.RX_SCENES || {};
  window.RX_SCENES.overhead = { build: build, render: render, dur: DUR };
  var DEFS = { 'INC-310': { scene: 'overhead', kind: 'Incident', title: 'Overhead bolt work: metal fragment strike to a worker below', dur: DUR, chapters: [[0, 'What happened'], [OFF + 9.5, 'With controls in place'], [OFF + 9.6 + CH3 - 0.2, 'Controls added']], controls: CONTROLS,
    listTitle: 'Controls added as corrective actions',
    note: 'Based on the incident record: the worker on the ladder wore a face shield; the worker below wore standard safety glasses, was looking up at the moment of the event, and was taken for medical evaluation. The second half illustrates the corrective actions recorded for this incident. Figures are simplified and do not depict real people.' } };
  window.REENACTMENTS = window.REENACTMENTS || DEFS; if (window.REENACTMENTS !== DEFS) { for (var k in DEFS) window.REENACTMENTS[k] = DEFS[k]; DEFS = window.REENACTMENTS; }
  window.rxRenderAt = function (t) { if (!$('rx-fade')) build($('rx-svg')); return render(t); };
  window.rxBuildInto = function (svg) { build(svg); };
  window.rxDuration = DUR;
  function fmt(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function ui() {
    $('rx-seek').value = R.t; $('rx-time').textContent = fmt(R.t) + ' / ' + fmt(R.dur);
    var ended = R.t >= R.dur - 0.02;
    $('rx-play').innerHTML = R.playing ? '<span aria-hidden="true">❚❚</span> Pause' : (ended ? '<span aria-hidden="true">↻</span> Replay' : '<span aria-hidden="true">▶</span> Play');
    $('rx-bigplay').className = R.playing ? 'hide' : '';
    $('rx-bigplay').setAttribute('aria-label', ended ? 'Replay' : 'Play');
    var cb = document.querySelectorAll('.rx-chap'); var ch = DEFS[R.id].chapters, cur = 0; ch.forEach(function (c, i) { if (R.t >= c[0]) cur = i; });
    for (var i = 0; i < cb.length; i++) cb[i].className = 'rx-chap' + (i === cur ? ' on' : '');
  }
  var lastCap = null;
  function paint() { var cap = R.scene.render(R.t), txt = (cap[0] + ' ' + cap[1]).trim(); if (txt !== lastCap) { lastCap = txt; $('rx-sr').textContent = txt; } ui(); }
  function loop(now) { if (!R.playing) return; R.t = Math.min(R.dur, R.t + (now - R.last) / 1000); R.last = now; paint(); if (R.t >= R.dur) { R.playing = false; ui(); return; } R.raf = requestAnimationFrame(loop); }
  function play() { if (R.t >= R.dur - 0.02) R.t = 0; R.playing = true; R.last = performance.now(); ui(); R.raf = requestAnimationFrame(loop); }
  function pause() { R.playing = false; cancelAnimationFrame(R.raf); ui(); }
  function seek(t) { R.t = clamp(t, 0, R.dur); paint(); if (R.playing) R.last = performance.now(); }
  function ensure() {
    if (R.built) return; R.built = true;
    var o = document.createElement('div'); o.id = 'rx-overlay'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'rx-title');
    o.innerHTML = '<div id="rx-card"><div id="rx-head"><div><div id="rx-title"></div><div id="rx-sub">Illustrative reenactment based on the written incident record. Not video footage.</div></div><button id="rx-close" aria-label="Close reenactment">×</button></div>' +
      '<div id="rx-stagewrap"><svg id="rx-svg" viewBox="0 0 960 540" role="img" aria-label="Animated reenactment" font-family="Inter, system-ui, -apple-system, Segoe UI, sans-serif"></svg><button id="rx-bigplay" aria-label="Play"><span class="rx-tri-l"></span></button></div><div id="rx-sr" aria-live="polite"></div>' +
      '<div id="rx-controls"><button class="rx-ctl" id="rx-play"></button><input type="range" id="rx-seek" min="0" max="' + DUR + '" step="0.01" value="0" aria-label="Seek"><div id="rx-time"></div></div>' +
      '<div id="rx-chaps"></div><div id="rx-list"><div id="rx-list-h">Controls added as corrective actions</div><ol id="rx-list-ol"></ol></div><div id="rx-note"></div></div>';
    document.body.appendChild(o);
    $('rx-close').onclick = close; o.addEventListener('mousedown', function (e) { if (e.target === o) close(); });
    $('rx-play').onclick = function () { R.playing ? pause() : play(); }; $('rx-bigplay').onclick = function () { play(); };
    $('rx-seek').oninput = function (e) { seek(parseFloat(e.target.value)); };
    document.addEventListener('keydown', function (e) {
      if (!o.classList.contains('open')) return;
      if (e.key === 'Escape') { close(); }
      else if (e.key === ' ' && document.activeElement && document.activeElement.tagName !== 'BUTTON' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); R.playing ? pause() : play(); }
      else if (e.key === 'Tab') { var f = o.querySelectorAll('button, input'); var first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    });
  }
  function open(id, opener) {
    var def = DEFS[id], sc = def && window.RX_SCENES && window.RX_SCENES[def.scene || 'overhead']; if (!def || !sc) return;
    ensure(); R.id = id; R.scene = sc; R.dur = def.dur; R.opener = opener || document.activeElement; lastCap = null;
    if (R.builtScene !== (def.scene || 'overhead')) { sc.build($('rx-svg')); R.builtScene = def.scene || 'overhead'; }
    $('rx-seek').max = R.dur; $('rx-title').textContent = def.title; $('rx-note').textContent = def.note || ''; $('rx-list-h').textContent = def.listTitle || 'Corrective actions';
    var cs = $('rx-chaps'); cs.innerHTML = ''; DEFS[id].chapters.forEach(function (c) { var b = document.createElement('button'); b.className = 'rx-chap'; b.textContent = c[1]; b.onclick = function () { seek(c[0]); play(); }; cs.appendChild(b); });
    var ol = $('rx-list-ol'); ol.innerHTML = ''; (DEFS[id].controls || []).forEach(function (c) { var li = document.createElement('li'); li.textContent = c.full; ol.appendChild(li); });
    R.t = 0; R.playing = false; paint(); $('rx-overlay').classList.add('open'); $('rx-bigplay').focus();
  }
  function close() { pause(); $('rx-overlay').classList.remove('open'); if (R.opener && R.opener.focus) try { R.opener.focus(); } catch (e) {} }
  window.openReenactment = open; window.closeReenactment = close;
  window.reenactButtonHtml = function (id, cls) { if (!DEFS[id]) return ''; return '<button type="button" class="' + (cls || 'rx-btn') + '" data-rx="' + id + '" onclick="openReenactment(\'' + id + '\', this)"><span class="rx-tri" aria-hidden="true"></span>Click here to see a reenactment video <small>· ' + Math.round(DEFS[id].dur) + ' sec</small></button>'; };
})();
