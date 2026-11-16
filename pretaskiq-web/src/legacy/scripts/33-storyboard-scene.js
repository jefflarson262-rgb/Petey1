/* ===== Storyboard scene: draws any validated reenactment storyboard (see src/shared/storyboard.js) in the same player as the hand-built scenes ===== */
(function () {
  var W = 960, STAGE_H = 452, FLOOR = 410, TOP = 20;
  var C = { ink: '#0F1E2E', orange: '#E86A14', green: '#2E7D5B', red: '#D64545', amber: '#F5A623', steel: '#7B8794', steelD: '#5C6772', hat: '#F2B01E', vest: '#E8591A', pants: '#2B3A4A', skin: '#D9CFC4' };
  var LEVEL_Y = { ground: 0, elevated: -118, trench: 42 };
  var Z = { trench: 0, overhead: 1, platform: 2, ladder: 3, panel: 4, vehicle: 5, barricade: 6, sign: 7, energy: 8, load: 9, tool: 10 };
  var ANCHOR_Y = { ladder: -110, platform: -90, panel: -75, overhead: -262, load: -155, vehicle: -45, trench: 20, tool: -70, barricade: -30, sign: -80, energy: -190 };
  var px = function (x) { return 60 + x * 8.4; };
  var clamp = function (x, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, x)); };
  var seg = function (t, a, b) { return clamp((t - a) / (b - a)); };
  var ease = function (x) { return x * x * (3 - 2 * x); };
  var lerp = function (a, b, x) { return a + (b - a) * x; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var $ = function (id) { return document.getElementById(id); };

  function wrap(text, max) {                                   // up to two lines for the title card
    var words = String(text).split(' '), a = '', b = '';
    words.forEach(function (w) { if (!b && (a + ' ' + w).trim().length <= max) a = (a + ' ' + w).trim(); else b = (b + ' ' + w).trim(); });
    return [a, b];
  }

  // ---------- drawings (each is drawn with its base at 0,0 = on the floor) ----------
  var DRAW = {
    ladder: function () { var s = '<g stroke="#8A95A1" stroke-width="5" stroke-linecap="round"><line x1="-20" y1="0" x2="-6" y2="-205"/><line x1="20" y1="0" x2="34" y2="-205"/></g><g stroke="#A8B2BC" stroke-width="4">'; for (var i = 1; i <= 7; i++) { var y = -i * 27, k = i * 27 / 205; s += '<line x1="' + (-20 + 14 * k) + '" y1="' + y + '" x2="' + (20 + 14 * k) + '" y2="' + y + '"/>'; } return s + '</g>'; },
    platform: function () { return '<g stroke="' + C.steelD + '" stroke-width="5"><line x1="-54" y1="-108" x2="-54" y2="0"/><line x1="54" y1="-108" x2="54" y2="0"/><line x1="-54" y1="-100" x2="54" y2="-10" stroke-width="3"/><line x1="54" y1="-100" x2="-54" y2="-10" stroke-width="3"/></g><rect x="-66" y="-120" width="132" height="12" rx="2" fill="#9AA5B1" stroke="' + C.steelD + '" stroke-width="2"/><g stroke="' + C.steel + '" stroke-width="3"><line x1="-62" y1="-120" x2="-62" y2="-165"/><line x1="62" y1="-120" x2="62" y2="-165"/><line x1="-62" y1="-165" x2="62" y2="-165"/><line x1="-62" y1="-142" x2="62" y2="-142"/></g>'; },
    panel: function () { return '<rect x="-44" y="-152" width="88" height="152" rx="4" fill="#6B7785" stroke="' + C.ink + '" stroke-width="2.5"/><rect x="-36" y="-144" width="72" height="136" rx="2" fill="#7E8997" stroke="#4A5563" stroke-width="1.5"/><line x1="0" y1="-144" x2="0" y2="-8" stroke="#4A5563" stroke-width="1.5"/><rect x="6" y="-82" width="5" height="22" rx="2" fill="#2F3944"/><path d="M-12,-118 L12,-118 L0,-94 Z" fill="' + C.hat + '" stroke="' + C.ink + '" stroke-width="2"/><path d="M1,-114 L-4,-105 L0,-105 L-2,-98 L4,-108 L0,-108 Z" fill="' + C.ink + '"/>'; },
    overhead: function () { var s = '<g stroke="' + C.steelD + '" stroke-width="4"><line x1="-100" y1="-254" x2="-100" y2="-' + (FLOOR - TOP) + '"/><line x1="100" y1="-254" x2="100" y2="-' + (FLOOR - TOP) + '"/></g><rect x="-130" y="-270" width="260" height="18" rx="3" fill="#8C97A3" stroke="' + C.steelD + '" stroke-width="2.5"/>'; [-100, -50, 0, 50, 100].forEach(function (x) { s += '<circle cx="' + x + '" cy="-261" r="4.5" fill="#46515B"/>'; }); return s; },
    load: function () { return '<line x1="0" y1="-' + (FLOOR - TOP) + '" x2="0" y2="-215" stroke="#3A444D" stroke-width="3"/><circle cx="0" cy="-209" r="8" fill="none" stroke="#3A444D" stroke-width="4"/><g stroke="#3A444D" stroke-width="2"><line x1="0" y1="-201" x2="-38" y2="-168"/><line x1="0" y1="-201" x2="38" y2="-168"/></g><rect x="-48" y="-168" width="96" height="72" rx="3" fill="#A9814A" stroke="#6F5326" stroke-width="2.5"/><g stroke="#6F5326" stroke-width="2"><line x1="-48" y1="-132" x2="48" y2="-132"/><line x1="-16" y1="-168" x2="-16" y2="-96"/><line x1="16" y1="-168" x2="16" y2="-96"/></g>'; },
    vehicle: function () { return '<rect x="-90" y="-72" width="124" height="50" rx="4" fill="#D9A21B" stroke="' + C.ink + '" stroke-width="2.5"/><path d="M34,-72 L34,-22 L96,-22 L96,-46 L74,-72 Z" fill="#E8B923" stroke="' + C.ink + '" stroke-width="2.5"/><path d="M42,-66 L42,-46 L88,-46 L72,-66 Z" fill="#BFE0F2" stroke="' + C.ink + '" stroke-width="1.5"/><g fill="#222B34" stroke="#0B1219" stroke-width="2"><circle cx="-56" cy="-16" r="18"/><circle cx="64" cy="-16" r="18"/></g><g fill="#9AA5B1"><circle cx="-56" cy="-16" r="7"/><circle cx="64" cy="-16" r="7"/></g>'; },
    trench: function () { return '<path d="M-84,0 L-70,40 L70,40 L84,0 Z" fill="#4B3F35" stroke="#2F2620" stroke-width="2"/><path d="M92,0 Q118,-34 150,0 Z" fill="#8B7355" stroke="#5E4B35" stroke-width="2"/>'; },
    tool: function () { return '<g stroke="' + C.ink + '" stroke-width="2"><rect x="-20" y="-10" width="34" height="18" rx="4" fill="#E8B923"/><rect x="-12" y="8" width="10" height="20" rx="3" fill="#2F3944"/><rect x="14" y="-4" width="14" height="6" fill="#9AA5B1"/></g>'; },
    barricade: function () { var cone = function (x) { return '<path d="M' + (x - 11) + ',0 L' + (x + 11) + ',0 L' + x + ',-42 Z" fill="' + C.orange + '" stroke="' + C.ink + '" stroke-width="2"/><rect x="' + (x - 14) + '" y="-3" width="28" height="5" rx="1" fill="#2F3944"/><path d="M' + (x - 6) + ',-22 L' + (x + 6) + ',-22 L' + (x + 4) + ',-30 L' + (x - 4) + ',-30 Z" fill="#fff"/>'; }; return '<line x1="-56" y1="-34" x2="56" y2="-34" stroke="#fff" stroke-width="6"/><line x1="-56" y1="-34" x2="56" y2="-34" stroke="' + C.red + '" stroke-width="6" stroke-dasharray="12 12"/>' + cone(-56) + cone(56); },
    sign: function () { return '<line x1="0" y1="0" x2="0" y2="-96" stroke="#46515B" stroke-width="5"/><path d="M0,-150 L30,-98 L-30,-98 Z" fill="' + C.hat + '" stroke="' + C.ink + '" stroke-width="3" stroke-linejoin="round"/><rect x="-2.5" y="-136" width="5" height="20" fill="' + C.ink + '"/><circle cx="0" cy="-107" r="3" fill="' + C.ink + '"/>'; },
    energy: function () { return '<path d="M0,-250 L38,-190 L0,-130 L-38,-190 Z" fill="' + C.hat + '" stroke="' + C.ink + '" stroke-width="3" stroke-linejoin="round"/><path d="M5,-228 L-12,-188 L-1,-188 L-6,-152 L14,-196 L2,-196 Z" fill="' + C.ink + '"/>'; }
  };

  function person(a, st) {                                      // st: { x, y, rot, label, ppe, lit }
    var s = '<g transform="translate(' + st.x.toFixed(1) + ',' + st.y.toFixed(1) + ') rotate(' + st.rot.toFixed(1) + ')">';
    if (st.lit) s += '<ellipse cx="0" cy="-58" rx="40" ry="72" fill="rgba(255,255,255,.28)" stroke="rgba(255,255,255,.75)" stroke-width="2" stroke-dasharray="5 4"/>';
    s += '<ellipse cx="0" cy="2" rx="22" ry="5" fill="rgba(0,0,0,.18)"/>';
    s += '<g stroke="' + C.pants + '" stroke-width="10" stroke-linecap="round"><line x1="-6" y1="-50" x2="-9" y2="-4"/><line x1="6" y1="-50" x2="9" y2="-4"/></g>';
    s += '<g stroke="#1B2530" stroke-width="9" stroke-linecap="round"><line x1="-9" y1="-3" x2="-14" y2="-3"/><line x1="9" y1="-3" x2="14" y2="-3"/></g>';
    s += '<rect x="-15" y="-100" width="30" height="54" rx="9" fill="' + C.vest + '" stroke="#9A3A05" stroke-width="1.5"/><rect x="-15" y="-78" width="30" height="5" fill="#F5E3A0"/>';
    s += '<g stroke="#2F4A63" stroke-width="8" stroke-linecap="round"><line x1="-15" y1="-94" x2="-22" y2="-62"/><line x1="15" y1="-94" x2="22" y2="-62"/></g>';
    s += '<circle cx="0" cy="-112" r="11" fill="' + C.skin + '" stroke="#8A7F73" stroke-width="1.5"/><path d="M-13,-114 A13,13 0 0 1 13,-114 Z" fill="' + C.hat + '" stroke="#A97B0B" stroke-width="1.5"/><rect x="-16" y="-115" width="32" height="4" rx="2" fill="' + C.hat + '" stroke="#A97B0B" stroke-width="1.2"/>';
    s += '</g>';
    return s;
  }
  function pill(x, y, text, fill, color, size) {
    var w = Math.max(40, String(text).length * (size * 0.58) + 16);
    return '<g><rect x="' + (x - w / 2).toFixed(1) + '" y="' + (y - size - 2) + '" width="' + w.toFixed(1) + '" height="' + (size + 8) + '" rx="' + ((size + 8) / 2) + '" fill="' + fill + '"/><text x="' + x.toFixed(1) + '" y="' + (y + 1) + '" text-anchor="middle" font-size="' + size + '" font-weight="700" fill="' + color + '">' + esc(text) + '</text></g>';
  }

  // ---------- what is where at time t ----------
  function stateAt(def, t) {
    var sb = def.sb, tm = def.timing, startPhase = 'happened';
    var phaseSwitch = tm.controlsAt !== null ? tm.controlsAt - 0.45 : Infinity;
    var phase = t >= phaseSwitch ? 'controls' : 'happened';
    var cur = {}, init = {}; var ent = sb.actors.map(function (a) { return { id: a.id, actor: true, x: a.x, lvl: LEVEL_Y[a.level] }; }).concat(sb.objects.map(function (o) { return { id: o.id, actor: false, x: o.x, lvl: 0 }; }));
    ent.forEach(function (e) { cur[e.id] = { x: e.x, lvl: e.lvl, fall: 0 }; init[e.id] = { x: e.x, lvl: e.lvl, fall: 0 }; });
    var active = null, prevPhase = 'happened';
    sb.beats.forEach(function (b, i) {
      var bt = tm.beats[i]; if (t < bt.t0) return;
      if (b.phase === 'controls' && prevPhase !== 'controls') { ent.forEach(function (e) { cur[e.id] = { x: init[e.id].x, lvl: init[e.id].lvl, fall: 0 }; }); }
      prevPhase = b.phase;
      var u = seg(t, bt.t0, bt.t0 + (bt.t1 - bt.t0) * 0.7), done = t >= bt.t1;
      b.move.forEach(function (m) {
        var c = cur[m.id]; if (!c) return;
        var tx = m.x !== undefined ? m.x : c.x, tl = m.level ? LEVEL_Y[m.level] : c.lvl;
        if (done || u >= 1) { c.x = tx; c.lvl = tl; } else { c.fromX = c.fromX === undefined ? c.x : c.fromX; c.x = lerp(c.x, tx, ease(u)); c.lvl = lerp(c.lvl, tl, ease(u)); }
      });
      if (b.event === 'fall') { var id = b.to || b.focus; if (cur[id]) cur[id].fall = done ? 1 : ease(seg(t, bt.t0 + 0.2, bt.t0 + 1.1)); }
      if (!done) active = { beat: b, i: i, u: seg(t, bt.t0, bt.t1) };
    });
    return { cur: cur, phase: phase, active: active, ent: ent };
  }
  function anchor(def, id, S, t) {
    var a = def.sb.actors.filter(function (e) { return e.id === id; })[0], c = S.cur[id]; if (!c) return [480, 250];
    if (a) return [px(c.x), FLOOR + c.lvl - 62 * (1 - c.fall * 0.8)];
    var o = def.sb.objects.filter(function (e) { return e.id === id; })[0];
    var el = 0; if (o.type === 'tool') def.sb.actors.forEach(function (ac) { var cc = S.cur[ac.id]; if (Math.abs(cc.x - c.x) < 6) el = Math.min(el, cc.lvl); });
    return [px(c.x), FLOOR + (ANCHOR_Y[o.type] || -60) + (o.type === 'tool' ? el : 0)];
  }

  function effects(def, S, t) {
    var A = S.active; if (!A) return '';
    var b = A.beat, u = A.u, s = '', bt = def.timing.beats[A.i], local = t - bt.t0;
    var tgt = b.to || b.focus; var at = tgt ? anchor(def, tgt, S, t) : null;
    if (b.event === 'hazard' && at) { var r = 38 + 8 * Math.sin(local * 6), o = 0.55 + 0.4 * Math.abs(Math.sin(local * 3)); s += '<circle cx="' + at[0].toFixed(1) + '" cy="' + at[1].toFixed(1) + '" r="' + r.toFixed(1) + '" fill="rgba(245,166,35,.12)" stroke="' + C.amber + '" stroke-width="4" opacity="' + o.toFixed(2) + '"/><g transform="translate(' + (at[0] + 34).toFixed(1) + ',' + (at[1] - 52).toFixed(1) + ')"><path d="M0,-16 L16,12 L-16,12 Z" fill="' + C.amber + '" stroke="' + C.ink + '" stroke-width="2" stroke-linejoin="round"/><rect x="-1.8" y="-6" width="3.6" height="10" fill="' + C.ink + '"/><circle cx="0" cy="8" r="1.8" fill="' + C.ink + '"/></g>'; }
    if (b.event === 'strike' && b.from && b.to) {
      var p0 = anchor(def, b.from, S, t), p1 = at, uu = seg(local, 0.5, 1.3), hit = seg(local, 1.25, 2.0);
      var q = function (k) { var a = 1 - k; return [a * a * p0[0] + 2 * a * k * ((p0[0] + p1[0]) / 2) + k * k * p1[0], a * a * p0[1] + 2 * a * k * (Math.min(p0[1], p1[1]) - 36) + k * k * p1[1]]; };
      if (uu > 0 && uu < 1) { for (var j = 4; j >= 1; j--) { var qq = q(Math.max(0, ease(uu) - j * 0.05)); s += '<circle cx="' + qq[0].toFixed(1) + '" cy="' + qq[1].toFixed(1) + '" r="' + Math.max(1, 5 - j) + '" fill="#3A444D" opacity="' + (0.5 - j * 0.09).toFixed(2) + '"/>'; } var pp = q(ease(uu)); s += '<path transform="translate(' + pp[0].toFixed(1) + ',' + pp[1].toFixed(1) + ') rotate(' + (local * 900).toFixed(0) + ')" d="M0,-4 L5,-1 L4,4 L-3,4 L-5,0 Z" fill="#3A444D" stroke="#C9D2DA" stroke-width="1"/>'; }
      if (hit > 0 && hit < 1) s += burst(p1, hit);
    }
    if (b.event === 'contact' && at) { var h = seg(local, 0.4, 1.4); if (h > 0 && h < 1) s += burst(at, h); }
    if (b.event === 'energized' && at) {
      var n = 4; for (var k = 0; k < n; k++) { var ang = (k / n) * 6.283 + Math.floor(local * 9) * 0.7, x0 = at[0] + Math.cos(ang) * 22, y0 = at[1] + Math.sin(ang) * 22, d = 'M' + x0.toFixed(1) + ',' + y0.toFixed(1); for (var z = 1; z <= 4; z++) d += ' L' + (at[0] + Math.cos(ang + (z % 2 ? 0.12 : -0.12)) * (22 + z * 11)).toFixed(1) + ',' + (at[1] + Math.sin(ang + (z % 2 ? -0.12 : 0.12)) * (22 + z * 11)).toFixed(1); s += '<path d="' + d + '" fill="none" stroke="' + (k % 2 ? C.amber : C.red) + '" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" opacity="' + (0.55 + 0.4 * Math.abs(Math.sin(local * 14 + k))).toFixed(2) + '"/>'; }
    }
    if (b.event === 'safe' && at) { var g = ease(seg(local, 0.2, 0.8)); s += '<g transform="translate(' + at[0].toFixed(1) + ',' + (at[1] - 70).toFixed(1) + ') scale(' + (0.4 + 0.6 * g).toFixed(2) + ')" opacity="' + g.toFixed(2) + '"><circle r="20" fill="' + C.green + '" stroke="#fff" stroke-width="3"/><path d="M-8,0 L-2,7 L9,-6" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>'; }
    return s;
  }
  function burst(p, h) { return '<g transform="translate(' + p[0].toFixed(1) + ',' + p[1].toFixed(1) + ')" opacity="' + (1 - h).toFixed(2) + '"><circle r="' + lerp(8, 40, ease(h)).toFixed(1) + '" fill="none" stroke="' + C.red + '" stroke-width="5"/><circle r="' + lerp(5, 20, ease(h)).toFixed(1) + '" fill="#FFE08A" opacity=".85"/></g>'; }

  function build(svg, def) {
    var indoor = def.sb.setting === 'indoor';
    var s = '<defs><linearGradient id="sb-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + (indoor ? '#E6ECF1' : '#BFDDF2') + '"/><stop offset="1" stop-color="' + (indoor ? '#D3DCE4' : '#E8F3FA') + '"/></linearGradient></defs>';
    s += '<rect width="' + W + '" height="' + STAGE_H + '" fill="url(#sb-sky)"/>';
    if (indoor) { for (var i = 1; i < 6; i++) s += '<line x1="' + (i * 160) + '" y1="0" x2="' + (i * 160) + '" y2="' + FLOOR + '" stroke="rgba(15,30,46,.06)" stroke-width="2"/>'; }
    else s += '<g fill="rgba(255,255,255,.7)"><ellipse cx="180" cy="80" rx="70" ry="20"/><ellipse cx="640" cy="60" rx="90" ry="22"/><ellipse cx="820" cy="120" rx="60" ry="16"/></g>';
    s += '<rect y="' + FLOOR + '" width="' + W + '" height="' + (STAGE_H - FLOOR) + '" fill="' + (indoor ? '#BFC7CF' : '#B3BFA6') + '"/><line x1="0" y1="' + FLOOR + '" x2="' + W + '" y2="' + FLOOR + '" stroke="rgba(15,30,46,.25)" stroke-width="2"/>';
    s += '<g id="sb-dyn"></g>';
    s += '<g id="sb-title" opacity="1"><rect width="' + W + '" height="' + STAGE_H + '" fill="#0F1E2E"/><text id="sb-kind" x="480" y="150" text-anchor="middle" font-size="16" font-weight="800" letter-spacing="2" fill="' + C.amber + '"></text><text id="sb-t1" x="480" y="210" text-anchor="middle" font-size="34" font-weight="800" fill="#fff"></text><text id="sb-t2" x="480" y="256" text-anchor="middle" font-size="34" font-weight="800" fill="#fff"></text><text x="480" y="318" text-anchor="middle" font-size="16" fill="#9FB3C8">Illustrative storyboard drafted from the written incident record</text></g>';
    s += '<rect x="0" y="' + STAGE_H + '" width="' + W + '" height="88" fill="#0F1E2E"/><text id="sb-c1" x="480" y="488" text-anchor="middle" font-size="23" font-weight="600" fill="#fff"></text><text id="sb-c2" x="480" y="520" text-anchor="middle" font-size="23" font-weight="600" fill="#fff"></text>';
    s += '<g><rect x="14" y="14" width="470" height="26" rx="13" fill="rgba(15,30,46,.82)"/><text x="28" y="31.5" font-size="11.5" font-weight="700" letter-spacing=".9" fill="#fff">ILLUSTRATIVE STORYBOARD · BASED ON THE INCIDENT RECORD</text></g>';
    s += '<g id="sb-pill" opacity="0"><rect id="sb-pillr" x="700" y="14" width="246" height="26" rx="13" fill="' + C.orange + '"/><text id="sb-pillt" x="823" y="31.5" text-anchor="middle" font-size="12" font-weight="800" letter-spacing=".9" fill="#fff"></text></g>';
    s += '<rect id="sb-fade" width="' + W + '" height="' + STAGE_H + '" fill="' + (indoor ? '#E6ECF1' : '#E8F3FA') + '" opacity="0"/>';
    var card = '<g id="sb-card" opacity="0"><rect width="' + W + '" height="540" fill="#0F1E2E"/><text x="60" y="84" font-size="30" font-weight="800" fill="#fff">Corrective actions added</text><text id="sb-card-sub" x="60" y="112" font-size="15" fill="#9FB3C8"></text>';
    def.sb.controls.forEach(function (c, i) { var y0 = 150 + i * 62; card += '<g id="sb-row' + i + '" opacity="0"><rect x="60" y="' + y0 + '" width="840" height="52" rx="12" fill="rgba(255,255,255,.07)"/><circle cx="90" cy="' + (y0 + 26) + '" r="15" fill="' + C.green + '"/><text x="90" y="' + (y0 + 32) + '" text-anchor="middle" font-size="16" font-weight="800" fill="#fff">' + (i + 1) + '</text><text x="120" y="' + (y0 + 32) + '" font-size="19" font-weight="600" fill="#fff">' + esc(c.short) + '</text></g>'; });
    card += '<text x="60" y="520" font-size="13" fill="#7F95AB">Illustrative storyboard · based on the incident record · not video footage</text></g>';
    svg.innerHTML = s + card;
    var tl = wrap(def.sb.title, 34); $('sb-kind').textContent = String(def.sb.kind).toUpperCase(); $('sb-t1').textContent = tl[0]; $('sb-t2').textContent = tl[1]; $('sb-card-sub').textContent = def.sb.title;
  }

  function render(t, def) {
    if (!def || !def.sb || !$('sb-dyn')) return ['', ''];
    var sb = def.sb, tm = def.timing, S = stateAt(def, t), dyn = '';
    // objects, then people, then effects, then labels
    var objs = sb.objects.filter(function (o) { return o.phase === 'both' || o.phase === S.phase; }).sort(function (a, b) { return Z[a.type] - Z[b.type]; });
    var fadeIn = S.phase === 'controls' && tm.controlsAt !== null ? ease(seg(t, tm.controlsAt - 0.45, tm.controlsAt + 0.3)) : 1;
    objs.forEach(function (o) {
      var c = S.cur[o.id], x = px(c.x), y = FLOOR, tr = 'translate(' + x.toFixed(1) + ',' + y + ')', op = o.phase === 'controls' ? fadeIn : 1;
      if (o.type === 'tool') { var el = 0; sb.actors.forEach(function (a) { var cc = S.cur[a.id]; if (Math.abs(cc.x - c.x) < 6) el = Math.min(el, cc.lvl); }); tr = 'translate(' + x.toFixed(1) + ',' + (FLOOR - 70 + el) + ')'; }
      if (c.fall) tr += ' rotate(' + (c.fall * (o.type === 'load' ? 0 : 78)).toFixed(1) + ')';
      var A = S.active, sw = '';
      if (A && A.beat.event === 'swing' && A.beat.from === o.id && A.beat.to) {                       // swings about its top, toward the target
        var tc = anchor(def, A.beat.to, S, t), dir = tc[0] >= x ? 1 : -1, lt = t - tm.beats[A.i].t0, amp = lerp(0, 24, ease(seg(lt, 0.3, 1.5))) * (1 - 0.3 * seg(lt, 1.8, 2.6));
        sw = ' rotate(' + (dir * amp).toFixed(1) + ' 0 ' + (-(FLOOR - TOP)) + ')';
      }
      dyn += '<g transform="' + tr + sw + '" opacity="' + op.toFixed(2) + '">' + (DRAW[o.type] ? DRAW[o.type]() : '') + '</g>';
    });
    var focusId = S.active ? (S.active.beat.focus || S.active.beat.to) : null;
    sb.actors.forEach(function (a) {
      var c = S.cur[a.id], y = FLOOR + c.lvl, drop = c.fall ? -c.lvl * c.fall : 0;
      dyn += person(a, { x: px(c.x) + c.fall * 36, y: y + drop, rot: c.fall * 84, lit: focusId === a.id });
    });
    dyn += effects(def, S, t);
    sb.actors.forEach(function (a) {                                    // names above heads; protective equipment while someone is the focus
      var c = S.cur[a.id]; if (c.fall > 0.5) return;
      var x = px(c.x), y = FLOOR + c.lvl - 132; dyn += pill(x, y, a.label, 'rgba(15,30,46,.85)', '#fff', 12);
      if (focusId === a.id) a.ppe.forEach(function (p, i) { dyn += pill(x, y - 22 - i * 22, p, '#2E7D5B', '#fff', 11); });
    });
    objs.forEach(function (o) { if (o.label) { var c = S.cur[o.id]; dyn += '<text x="' + px(c.x).toFixed(1) + '" y="' + (FLOOR + 26) + '" text-anchor="middle" font-size="12.5" font-weight="700" fill="#2B3A4A">' + esc(o.label) + '</text>'; } });
    $('sb-dyn').innerHTML = dyn;

    // captions, banner, title card, phase fade, controls card
    var cap = ['', ''], bi = -1; for (var i = 0; i < sb.beats.length; i++) if (t >= tm.beats[i].t0 && t < tm.beats[i].t1) bi = i;
    if (bi >= 0) cap = sb.beats[bi].caption; else if (t < tm.title) cap = [sb.title, ''];
    else if (t >= tm.title) { var last = -1; for (var k = 0; k < sb.beats.length; k++) if (t >= tm.beats[k].t1) last = k; if (last >= 0 && last < sb.beats.length - 1) cap = sb.beats[last].caption; else if (last === sb.beats.length - 1 && tm.cardAt === null) cap = sb.beats[last].caption; }
    var inCard = tm.cardAt !== null && t >= tm.cardAt - 0.1;
    if (inCard && t >= tm.cardAt + 0.4) cap = ['Corrective actions added:', sb.controls.map(function (c, n) { return (n + 1) + ', ' + c.short; }).join('; ') + '.'];
    $('sb-c1').textContent = inCard ? '' : cap[0]; $('sb-c2').textContent = inCard ? '' : cap[1]; $('sb-c1').setAttribute('y', cap[1] ? 488 : 508);
    var tt = 1 - seg(t, tm.title - 0.4, tm.title); $('sb-title').setAttribute('opacity', tt.toFixed(3));
    var ctl = S.phase === 'controls'; var pw = ctl ? 246 : 168;
    $('sb-pillt').textContent = ctl ? 'WITH CONTROLS IN PLACE' : 'WHAT HAPPENED'; $('sb-pill').setAttribute('opacity', t > tm.title ? 1 : 0);
    $('sb-pillr').setAttribute('width', pw); $('sb-pillr').setAttribute('x', 946 - pw); $('sb-pillr').setAttribute('fill', ctl ? C.green : C.orange); $('sb-pillt').setAttribute('x', 946 - pw / 2);
    $('sb-fade').setAttribute('opacity', tm.controlsAt !== null ? (1 - clamp(Math.abs(t - (tm.controlsAt - 0.45)) / 0.45)).toFixed(3) : '0');
    $('sb-card').setAttribute('opacity', tm.cardAt !== null ? ease(seg(t, tm.cardAt - 0.2, tm.cardAt + 0.5)).toFixed(3) : '0');
    for (var r = 0; r < sb.controls.length; r++) { var ro = tm.cardAt !== null ? ease(seg(t, tm.cardAt + 0.9 + r * 0.9, tm.cardAt + 1.4 + r * 0.9)) : 0; var row = $('sb-row' + r); if (row) { row.setAttribute('transform', 'translate(' + ((1 - ro) * 18).toFixed(1) + ',0)'); row.setAttribute('opacity', ro.toFixed(3)); } }
    return cap;
  }

  window.RX_SCENES = window.RX_SCENES || {};
  window.RX_SCENES.storyboard = { build: build, render: render, perDef: true, dur: 30 };
})();
