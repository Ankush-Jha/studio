/* film-game-show timeline: Studio Films "Rhythm Game Show" (styles/game-show/STYLE.md).
 *
 * Everything sits on one tempo grid: 120 BPM, beat 0.5 s (15 frames), bar 2 s. Every pop, drop,
 * press, stamp and punch is at a (bar, beat) or a subdivision, and is also a sound cue (MT.cue).
 *
 *   0.0   HOOK (bars 0-1)  accent set + scrolling stripes. Frame 1: sticker banner (paid), outlined
 *                          "still owes" + giant balance, the contestant at a buzzer. Hops from frame 2.
 *                          Presses on beats 2,3,4,5: the balance wobbles, the paid-off meter stays at 0.
 *   4.0   ROUND 1 card (bar 2), shrinks into the corner banner on beat 3.
 *   6.0   play (bars 3-4): price tag drops, pumped up a step per beat, slam + judgement (the delta).
 *  10.0   SPLIT (bars 5-7)  pattern interrupt (~38%): no card, split stage. Payments drop onto a
 *                          tower on quarters -> eighths -> sixteenths; the lender bot shakes its head
 *                          after each; the balance board never moves; stamp on the beat.
 *  16.0   BONUS card (bar 8).
 *  18.0   play (bars 9-12): tag pumped to the new payment, +extra chip; every press now feeds the
 *                          balance board, which steps down month by month (values.series); slam +
 *                          judgement (amount off) + confetti.
 *  26.0   hard cut on the bar line back to the hook: the last frame is frame 1.
 *
 * Determinism: one paused GSAP timeline (fromTo + MT.IR, t=0 states via tl.set(...,0)) for
 * entrances/pops/counters; continuous motion (hops, squash, punches, scrolling sets, bursts,
 * confetti) is a pure function of t, written in MT.after(t) on elements GSAP never touches.
 * Randomness only from MT.rng. No numbers or client copy are typed here: they come from M.block
 * and M.values; generic game words (Round 1, Bonus round, Paid off...) are template chrome.
 */
window.TEMPLATE = {
  build(MT, M, tl) {
    const B = M.block, V = M.values || {};
    const W = M.width, H = M.height, FR = 1 / M.fps;
    const safe = M.safe;
    const IR = MT.IR, money = MT.fmt.money, esc = MT.esc, typo = MT.typo;
    const stage = document.getElementById('stage');
    const layer = document.getElementById('layer');
    const beatOf = (id) => B.beats.find((b) => b.id === id);
    const hk = B.hook, rise = beatOf('rise'), stack = beatOf('stack'), fix = beatOf('fix');
    const warnings = [], keyframes = [], holds = [];

    /* ---------- tempo grid ---------- */
    const BEAT = 0.5, BAR = 2;
    const at = (bar, beat = 0) => +(bar * BAR + beat * BEAT).toFixed(4);
    const T = { r1: at(2), r1play: at(3), split: at(5), bonus: at(8), bonusPlay: at(9), loop: at(13) };
    const END = T.loop + FR; // frames 0..N-1; the last frame (t = T.loop) is the frame-1 state
    const ceilBeat = (t) => Math.ceil(t / BEAT - 1e-6) * BEAT;
    // Payment rhythm: quarters -> eighths -> sixteenths (speeding the pattern up IS the plot).
    const rhythm = (start, n) => {
      const q = Math.max(1, Math.round(n / 4)), s = Math.max(1, Math.round(n / 3)), e = Math.max(0, n - q - s);
      const out = [start];
      for (let i = 1; i < n; i++) out.push(+(out[i - 1] + (i < q ? 0.5 : i < q + e ? 0.25 : 0.125)).toFixed(4));
      return out;
    };
    // No cue on the seam frame: the loop's own t=0 cues play it.
    const cue = (t, name, gain) => { if (t >= 0 && t < T.loop - 1e-6) MT.cue(t, name, gain); };

    /* ---------- colour: client accent + the style's ink / cream / candy ---------- */
    const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const hex = (h) => { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (h) => { const [r, g, b] = hex(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
    const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const mixHex = (a, b, t) => { const A = hex(a), Bv = hex(b); return '#' + A.map((v, i) => Math.round(v + (Bv[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
    const toward = (c, target, bg, need) => { for (let t = 0; t <= 1.0001; t += 0.03) { const m = mixHex(c, target, t); if (cr(m, bg) >= need) return m; } return target; };
    const hueOf = (h) => { const [r, g, b] = hex(h).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (hh * 60 + 360) % 360; };
    const hd = (a, b) => { const d = Math.abs(hueOf(a) - hueOf(b)); return Math.min(d, 360 - d); };
    const pickHue = (prefs, avoid, min) => prefs.find((c) => avoid.every((a) => hd(c, a) >= min)) || prefs[0];

    const INK = '#1B1B1B', CREAM = '#FFF6E5', WHITE = '#FFFFFF';
    const CANDY = { yellow: '#FFD23F', pink: '#FF8FB1', lime: '#C6F16D', sky: '#8ED1FC', red: '#FF5A5F', orange: '#FF8C42' };
    const ACC = css('--color-accent') || '#D6421F';
    // A set = one saturated hue + its pattern one step lighter + a darker floor. Big words are
    // white or yellow: the set is deepened until the better of the two clears 3.4:1 on BOTH the
    // ground and the lighter pattern, so outlined telops pass even before their ink stroke.
    const fitSet = (c) => {
      for (let k = 0; k <= 1.0001; k += 0.04) {
        const bg = mixHex(c, INK, k), pat = mixHex(bg, WHITE, 0.12);
        const best = [WHITE, CANDY.yellow].map((w) => ({ w, c: Math.min(cr(w, bg), cr(w, pat)) })).sort((a, b) => b.c - a.c)[0];
        if (best.c >= 3.4) {
          const judge = [CANDY.pink, CANDY.yellow, WHITE].map((w) => ({ w, c: Math.min(cr(w, bg), cr(w, pat)) })).filter((x) => x.c >= 3.2)[0] || best;
          return { bg, pat, floor: mixHex(bg, INK, 0.3), word: best.w, judge: judge.w, wordC: +best.c.toFixed(2) };
        }
      }
      return { bg: INK, pat: '#333333', floor: '#000000', word: WHITE, judge: CANDY.yellow, wordC: 12 };
    };
    // Rounds never share a hue with the accent (hook) or with their neighbours.
    const hR1 = pickHue(['#26264A', '#46318F', '#1E6F6A'], [ACC], 40);
    const hSL = pickHue(['#1E7F78', '#2B59C3', '#1F7A4D'], [ACC, hR1], 40);
    const hSR = pickHue(['#B8326A', '#B83A2E', '#46318F'], [ACC, hSL], 40);
    const hBO = pickHue(['#5B3FB0', '#2B59C3', '#26264A'], [ACC, hSR, hSL], 40);
    const SET = { hook: fitSet(ACC), r1: fitSet(hR1), sL: fitSet(hSL), sR: fitSet(hSR), bo: fitSet(hBO) };
    // The contestant owns one colour for the whole show, never the hue of a set it stands on.
    const BEAN = pickHue([CANDY.yellow, CANDY.lime, CANDY.pink, CANDY.sky], [ACC, hR1, hSL, hSR, hBO], 25);
    const ROOF = hd(BEAN, CANDY.red) > 30 ? CANDY.red : CANDY.sky;
    const STAMP = toward(ACC, INK, CREAM, 4.8);
    const ROBOT = '#C3CAD9';
    if (SET.hook.bg !== ACC.toLowerCase()) warnings.push(`hook set deepened from ${ACC} to ${SET.hook.bg} for ${SET.hook.word} telops`);

    /* ---------- chrome first: the foot ticket decides where the floor is ---------- */
    const ch = MT.chrome(stage, { series: M.series, tag: M.tag, fine: M.fine });
    const footTop = Math.round(ch.foot.getBoundingClientRect().top);
    const kicker = hk.kicker ? typo(hk.kicker) : '';
    const floorY = footTop - (kicker ? 52 : 26);
    const X0 = safe.x0 + 25, X1 = safe.x1 - 25, CW = X1 - X0;
    const TOP = Math.round(ch.top.getBoundingClientRect().bottom) + 34;

    /* ---------- helpers ---------- */
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, q) => a + (b - a) * q;
    const eo = (q) => 1 - (1 - q) * (1 - q);
    const backOut = (q, s = 2.2) => { q -= 1; return q * q * ((s + 1) * q + s) + 1; };
    const R = (e) => e.getBoundingClientRect();
    const abs = (parent, cls, x, y, html, style = {}) => { const e = MT.el('div', `abs ${cls}`, parent, html); e.style.left = x + 'px'; e.style.top = y + 'px'; Object.assign(e.style, style); return e; };
    const g = (parent, attrs) => MT.svgEl('g', attrs || {}, parent);
    const P = (parent, tag, attrs) => MT.svgEl(tag, attrs, parent);
    const OL = (w) => ({ stroke: INK, 'stroke-width': w, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    const setSize = (e, fs) => { e.style.fontSize = fs.toFixed(1) + 'px'; e.style.setProperty('--sw', (fs * 0.14).toFixed(1) + 'px'); e._fs = fs; };
    const fitW = (e, maxW, max, min = 28) => { setSize(e, max); const w = R(e).width; if (w > maxW) setSize(e, Math.max(min, (max * maxW) / w)); return e._fs; };
    // Telop: outlined display type built glyph by glyph so every character can pop.
    const glyphs = (e, text) => { e.innerHTML = ''; for (const c of [...text]) { const s = MT.el('span', 'g', e); s.textContent = c; } e.glyphs = [...e.children]; return e; };
    const telop = (parent, text, o) => {
      const e = MT.el('div', `abs gs ${o.plain ? '' : 'telop'} ${o.cls || ''}`, parent);
      e.dataset.role = o.role || 'display';
      e.style.color = o.color;
      setSize(e, o.size);
      return glyphs(e, text);
    };
    // Counters show the settled value as text to read; values rolling past are "passed", not read.
    const roleWhenSettled = (cnt, finals) => MT.after(() => { const v = Math.round(cnt.proxy.v); cnt.node.dataset.role = finals.includes(v) ? 'display' : 'label'; });

    /* ---------- procedural registries (all pure functions of t) ---------- */
    const scenes = [], actors = [], bursts = [], waves = [], pulses = [], shakes = [], punches = [];
    const punch = (t, a) => punches.push({ t, a });
    const punchAt = (t) => { let s = 1; for (const p of punches) { const d = t - p.t; if (d >= 0 && d < 0.4) s += p.a * Math.exp(-d / 0.05); } return s; };
    const winOf = (sc, t) => sc.windows.find(([a, b]) => t >= a - 1e-6 && t < b - 1e-6);

    /* ---------- sets ---------- */
    function pattern(svg, id, h) {
      const w = h.x1 - h.x0;
      if (h.pattern === 'rays') {
        const cp = P(P(svg, 'defs', {}), 'clipPath', { id: `gsc-${id}` });
        P(cp, 'rect', { x: h.x0, y: 0, width: w, height: H });
        const outer = g(svg, { 'clip-path': `url(#gsc-${id})` });
        const rg = g(outer, {});
        const n = 18, Rr = 2600;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2;
          P(rg, 'path', { d: `M0,0 L${(Rr * Math.cos(a0)).toFixed(1)},${(Rr * Math.sin(a0)).toFixed(1)} L${(Rr * Math.cos(a1)).toFixed(1)},${(Rr * Math.sin(a1)).toFixed(1)} Z`, fill: h.set.pat });
        }
        return { kind: 'rays', el: rg, cx: h.cx, cy: h.cy, speed: h.speed };
      }
      const Pp = h.pattern === 'dots' ? 124 : 112;
      const pat = P(P(svg, 'defs', {}), 'pattern', { id: `gsp-${id}`, patternUnits: 'userSpaceOnUse', width: Pp, height: Pp, patternTransform: `rotate(${h.angle})` });
      if (h.pattern === 'dots') { P(pat, 'circle', { cx: Pp / 4, cy: Pp / 4, r: 19, fill: h.set.pat }); P(pat, 'circle', { cx: (3 * Pp) / 4, cy: (3 * Pp) / 4, r: 19, fill: h.set.pat }); }
      else P(pat, 'rect', { x: 0, y: 0, width: Pp / 2, height: Pp, fill: h.set.pat });
      P(svg, 'rect', { x: h.x0, y: 0, width: w, height: H, fill: `url(#gsp-${id})` });
      return { kind: h.pattern, el: pat, angle: h.angle, P: Pp, speed: h.speed };
    }
    function scene(name, halves, windows) {
      const s = MT.el('div', `scene sc-${name}`, layer);
      const cam = MT.el('div', 'cam', s);
      halves.forEach((h) => { const bg = MT.el('div', 'setbg', cam); bg.style.left = h.x0 + 'px'; bg.style.width = h.x1 - h.x0 + 'px'; bg.style.background = h.set.bg; });
      const pat = P(cam, 'svg', { class: 'pat', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
      const pats = halves.map((h, i) => pattern(pat, `${name}${i}`, h));
      halves.forEach((h) => { const f = MT.el('div', 'floor', cam); f.style.left = h.x0 + 'px'; f.style.width = h.x1 - h.x0 + 'px'; f.style.top = floorY + 'px'; f.style.background = h.set.floor; });
      const art = P(cam, 'svg', { class: 'art', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
      const ui = MT.el('div', 'ui', cam);
      const sc = { name, s, cam, art, ui, pats, windows };
      scenes.push(sc);
      return sc;
    }

    /* ---------- the drawing kit: bean contestant, lender bot, buzzer, burst ---------- */
    function bean(sc, { x, s = 0.82, podium = false }) {
      const root = g(sc.art, { transform: `translate(${x},${floorY}) scale(${s})` });
      const drop = g(root);
      let dome = null;
      if (podium) {
        const pod = g(drop);
        P(pod, 'rect', { x: 92, y: -68, width: 60, height: 68, rx: 10, fill: CREAM, ...OL(7) });
        P(pod, 'rect', { x: 92, y: -44, width: 60, height: 15, fill: ROOF, ...OL(5) });
        dome = g(pod);
        P(dome, 'path', { d: 'M 96,-68 C 96,-98 148,-98 148,-68 Z', fill: CANDY.red, ...OL(6) });
        P(dome, 'ellipse', { cx: 111, cy: -82, rx: 6, ry: 4, fill: WHITE });
      }
      const hop = g(drop);
      const dark = mixHex(BEAN, INK, 0.22), light = mixHex(BEAN, WHITE, 0.5);
      P(hop, 'ellipse', { cx: -30, cy: -7, rx: 28, ry: 14, fill: dark, ...OL(6) });
      P(hop, 'ellipse', { cx: 30, cy: -7, rx: 28, ry: 14, fill: dark, ...OL(6) });
      P(hop, 'path', { d: 'M -72,-62 C -76,-152 -44,-192 0,-192 C 44,-192 76,-152 72,-62 C 70,-22 42,-8 0,-8 C -42,-8 -70,-22 -72,-62 Z', fill: BEAN, ...OL(8) });
      P(hop, 'ellipse', { cx: 0, cy: -60, rx: 40, ry: 31, fill: light, ...OL(5) });
      for (const sx of [-1, 1]) {
        P(hop, 'ellipse', { cx: 24 * sx, cy: -128, rx: 9, ry: 14, fill: INK });
        P(hop, 'circle', { cx: 24 * sx + 3, cy: -133, r: 3.6, fill: WHITE });
        P(hop, 'ellipse', { cx: 47 * sx, cy: -103, rx: 11, ry: 6, fill: CANDY.pink });
      }
      const mouthC = P(hop, 'path', { d: 'M -13,-107 Q 0,-95 13,-107', fill: 'none', ...OL(5) });
      const mouthO = P(hop, 'path', { d: 'M -15,-111 Q 0,-80 15,-111 Z', fill: '#E8424A', ...OL(5) });
      // one head mark: a little house (the home behind the HELOC)
      const hat = g(hop, { transform: 'translate(0,-186)' });
      P(hat, 'rect', { x: -21, y: -36, width: 42, height: 32, fill: CREAM, ...OL(6) });
      P(hat, 'path', { d: 'M -32,-34 L 0,-62 L 32,-34 Z', fill: ROOF, ...OL(6) });
      P(hat, 'rect', { x: -6, y: -20, width: 12, height: 16, fill: INK });
      const sweat = P(hop, 'path', { d: 'M 70,-176 C 79,-162 81,-155 70,-150 C 59,-155 61,-162 70,-176 Z', fill: CANDY.sky, ...OL(4) });
      const arm = (sx) => {
        const o = g(hop, { transform: `translate(${sx},-94)` });
        const r = g(o);
        P(r, 'path', { d: 'M0,0 L0,50', stroke: INK, 'stroke-width': 34, 'stroke-linecap': 'round', fill: 'none' });
        P(r, 'path', { d: 'M0,0 L0,50', stroke: BEAN, 'stroke-width': 21, 'stroke-linecap': 'round', fill: 'none' });
        P(r, 'circle', { cx: 0, cy: 56, r: 15, fill: WHITE, ...OL(6) });
        return r;
      };
      const a = { kind: 'bean', sc, x, s, root, drop, hop, armL: arm(-60), armR: arm(60), mouthC, mouthO, sweat, dome, presses: [], shouts: [], sweats: [], hits: [], quiet: [], hopH: () => 14 };
      actors.push(a);
      return a;
    }
    function robot(sc, { x, s = 0.82 }) {
      const root = g(sc.art, { transform: `translate(${x},${floorY}) scale(${s})` });
      const drop = g(root);
      const body = g(drop);
      const dark = mixHex(ROBOT, INK, 0.25);
      P(body, 'rect', { x: -44, y: -18, width: 34, height: 18, rx: 7, fill: dark, ...OL(6) });
      P(body, 'rect', { x: 10, y: -18, width: 34, height: 18, rx: 7, fill: dark, ...OL(6) });
      const arm = (sx) => {
        const o = g(body, { transform: `translate(${sx},-104)` });
        const r = g(o);
        P(r, 'path', { d: 'M0,0 L0,44', stroke: INK, 'stroke-width': 30, 'stroke-linecap': 'round', fill: 'none' });
        P(r, 'path', { d: 'M0,0 L0,44', stroke: ROBOT, 'stroke-width': 18, 'stroke-linecap': 'round', fill: 'none' });
        P(r, 'circle', { cx: 0, cy: 50, r: 14, fill: WHITE, ...OL(6) });
        return r;
      };
      const armL = arm(-66), armR = arm(66);
      P(body, 'line', { x1: 0, y1: -156, x2: 0, y2: -184, ...OL(6) });
      P(body, 'circle', { cx: 0, cy: -190, r: 11, fill: CANDY.pink, ...OL(5) });
      P(body, 'rect', { x: -66, y: -158, width: 132, height: 144, rx: 28, fill: ROBOT, ...OL(8) });
      P(body, 'rect', { x: -48, y: -142, width: 96, height: 62, rx: 16, fill: '#26264A', ...OL(6) });
      const eyes = g(body);
      P(eyes, 'rect', { x: -30, y: -124, width: 18, height: 26, rx: 7, fill: CANDY.sky });
      P(eyes, 'rect', { x: 12, y: -124, width: 18, height: 26, rx: 7, fill: CANDY.sky });
      // a vault door on the chest: the lender, drawn generic (no logo, no name)
      P(body, 'circle', { cx: 0, cy: -46, r: 21, fill: CREAM, ...OL(6) });
      for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + Math.PI / 4; P(body, 'line', { x1: (6 * Math.cos(a)).toFixed(2), y1: (-46 + 6 * Math.sin(a)).toFixed(2), x2: (17 * Math.cos(a)).toFixed(2), y2: (-46 + 17 * Math.sin(a)).toFixed(2), ...OL(4) }); }
      const a = { kind: 'robot', sc, x, s, root, drop, body, eyes, armL, armR, nos: [], nods: [] };
      actors.push(a);
      return a;
    }
    function burst(sc, x, y, r, t0, fill = CANDY.yellow) {
      const root = g(sc.art, {});
      root.style.display = 'none';
      const star = g(root);
      const pts = [];
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.52 : r; pts.push(`${(rr * Math.cos(a)).toFixed(1)},${(rr * Math.sin(a)).toFixed(1)}`); }
      P(star, 'polygon', { points: pts.join(' '), fill, ...OL(7) });
      const ring = P(root, 'circle', { cx: 0, cy: 0, r: r, fill: 'none', stroke: WHITE, 'stroke-width': 10 });
      const lines = g(root);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; P(lines, 'line', { x1: (r * 1.15 * Math.cos(a)).toFixed(1), y1: (r * 1.15 * Math.sin(a)).toFixed(1), x2: (r * 1.55 * Math.cos(a)).toFixed(1), y2: (r * 1.55 * Math.sin(a)).toFixed(1), ...OL(9) }); }
      bursts.push({ root, star, ring, lines, x, y, r, t0 });
    }

    /* ---------- reusable UI: round card, price tag, board, slip, name tag ---------- */
    function roundCard(sc, pillText, nameText, set) {
      const wrap = abs(sc.ui, 'cw', 0, 0, '');
      const card = MT.el('div', 'card', wrap);
      const pill = MT.el('div', 'pill gs', card, esc(pillText));
      pill.style.background = set.bg; pill.style.color = set.word; pill.dataset.role = 'display';
      const nm = MT.el('div', 'gs cname', card);
      nm.dataset.role = 'display';
      glyphs(nm, typo(nameText));
      setSize(nm, 104);
      const w0 = R(nm).width;
      if (w0 > 760) setSize(nm, Math.max(52, (104 * 760) / w0));
      const r = R(card);
      const left = Math.round((W - r.width) / 2), top = Math.round(TOP + 190);
      wrap.style.left = left + 'px'; wrap.style.top = top + 'px'; wrap.style.width = r.width + 'px'; wrap.style.height = r.height + 'px';
      const k = Math.min(0.5, 380 / r.width);
      return { wrap, card, pill, nm, left, top, w: r.width, h: r.height, k, dx: X0 - left, dy: TOP - top };
    }
    function cardIn(C, t) {
      tl.set(C.wrap, { autoAlpha: 0, x: 0, y: 0, scale: 1, rotation: 0, transformOrigin: '0% 0%' }, 0);
      tl.set(C.card, { scale: 0.4, rotation: -10, transformOrigin: '50% 50%' }, 0);
      tl.set(C.pill, { scale: 0 }, 0);
      tl.set(C.nm.glyphs, { scale: 0, y: 34 }, 0);
      tl.set(C.wrap, { autoAlpha: 1 }, t);
      tl.fromTo(C.card, { scale: 0.4, rotation: -10 }, { scale: 1, rotation: -2, duration: 0.3, ease: 'back.out(2)', ...IR }, t);
      tl.fromTo(C.pill, { scale: 0 }, { scale: 1, duration: 0.24, ease: 'back.out(3)', ...IR }, t + 0.08);
      C.nm.glyphs.forEach((gl, i) => {
        const tt = t + 0.16 + i * 0.035;
        tl.fromTo(gl, { scale: 0, y: 34 }, { scale: 1, y: 0, duration: 0.22, ease: 'back.out(3)', ...IR }, tt);
        if (i % 2 === 0) cue(tt, i % 4 === 0 ? 'pop' : 'tick', 0.22);
      });
      // a bounce on the bar's middle beat, then shrink into the corner banner on beat 3
      tl.fromTo(C.card, { scale: 1 }, { scale: 1.05, duration: 0.07, ease: 'power2.out', ...IR }, t + 1.0);
      tl.fromTo(C.card, { scale: 1.05 }, { scale: 1, duration: 0.3, ease: 'back.out(3)', ...IR }, t + 1.07);
      punch(t + 1.0, 0.012); cue(t + 1.0, 'pop', 0.35);
      tl.fromTo(C.wrap, { x: 0, y: 0, scale: 1, rotation: 0 }, { x: C.dx, y: C.dy, scale: C.k, rotation: -1, duration: 0.3, ease: 'back.out(1.3)', ...IR }, t + 1.5);
      cue(t + 1.48, 'swish', 0.5);
    }
    function priceTag(sc, set, x, y, w, h, from, to, unit, vmax) {
      const tag = abs(sc.ui, 'ptag', x, y, '', { width: w + 'px', height: h + 'px' });
      MT.el('i', 'hole', tag).style.background = set.bg;
      const v = MT.el('div', 'gs pv', tag);
      v.style.left = '104px'; v.style.top = '14px';
      const cnt = MT.counter(v, { from, to });
      const widest = [money(from), money(to)].sort((a, b) => b.length - a.length)[0];
      v.textContent = widest; setSize(v, vmax);
      const vw = R(v).width; if (vw > w - 140) setSize(v, (vmax * (w - 140)) / vw);
      v.textContent = money(to);
      const u = MT.el('div', 'gs pu', tag, esc(typo(unit)));
      u.style.left = '108px'; u.style.bottom = '20px'; u.dataset.role = 'display';
      roleWhenSettled(cnt, [Math.round(to)]);
      return { tag, v, cnt, u };
    }
    function board(sc, x, y, w, h, label, vsize) {
      const el = abs(sc.ui, 'board', x, y, '', { width: w + 'px', height: h + 'px' });
      const l = MT.el('div', 'gs bl', el, esc(typo(label).toUpperCase()));
      l.style.left = '26px'; l.style.top = '16px'; l.dataset.role = 'display';
      const v = MT.el('div', 'gs bv', el);
      v.style.left = '24px'; v.style.top = '58px'; v.dataset.role = 'display';
      setSize(v, vsize);
      return { el, l, v };
    }
    const fitTo = (texts, maxW, max) => {
      const probe = abs(layer, 'gs', 0, 0, '', { visibility: 'hidden' });
      let size = max;
      for (const t of texts) { probe.textContent = t; setSize(probe, max); const w = R(probe).width; if (w > maxW) size = Math.min(size, (max * maxW) / w); }
      probe.remove();
      return size;
    };
    const nameTag = (sc, cx) => {
      if (!kicker) return null;
      const t = abs(sc.ui, 'gs ntag', 0, floorY - 4, esc(kicker));
      t.dataset.role = 'label';
      t.style.left = Math.round(clamp(cx - R(t).width / 2, X0, X1 - R(t).width)) + 'px';
      return t;
    };

    /* ======================= HOOK ======================= */
    const sH = scene('hook', [{ x0: 0, x1: W, set: SET.hook, pattern: 'stripes', angle: -32, speed: 56 }], [[0, T.r1], [T.loop, END + 1]]);
    const bannerText = typo(hk.sticker || `${money(hk.paid)} paid.`);
    const hBanner = abs(sH.ui, 'sticker gs', X0, TOP, esc(bannerText), { fontSize: '62px', transform: 'rotate(-3deg)' });
    hBanner.dataset.role = 'display';
    { let fs = 62; while (R(hBanner).width > CW * 0.8 && fs > 36) { fs -= 2; hBanner.style.fontSize = fs + 'px'; } }
    const labelText = typo(hk.label || 'Still owes').toUpperCase();
    const hLabel = telop(sH.ui, labelText, { size: 86, color: SET.hook.word });
    fitW(hLabel, CW, 86, 48);
    hLabel.style.left = X0 + 'px';
    hLabel.style.top = Math.round(R(hBanner).bottom + 36) + 'px';
    const hGiant = telop(sH.ui, money(hk.balance), { size: 280, color: SET.hook.word });
    fitW(hGiant, CW - 10, 280, 120);
    hGiant.style.left = X0 - 4 + 'px';
    hGiant.style.top = Math.round(R(hLabel).bottom + 2) + 'px';
    const giantBottom = R(hGiant).bottom;
    const beanX = X0 + 72;
    const bH = bean(sH, { x: beanX, podium: true });
    nameTag(sH, beanX);
    // paid-off meter (computed: principal repaid / principal)
    const principal = V.principal ? V.principal.shown : null;
    const repaid = V.principalIO ? V.principalIO.shown : principal != null ? principal - hk.balance : null;
    let meter = null, meterFill = null, meterTrack = null;
    if (principal) {
      const pct = Math.round((100 * repaid) / principal);
      const mx = X0 + 250, mw = X1 - mx, mh = 118, my = floorY - mh - 30;
      meter = abs(sH.ui, 'meter', mx, my, '', { width: mw + 'px', height: mh + 'px' });
      const ml = MT.el('div', 'gs ml', meter, 'Paid off'); ml.style.left = '22px'; ml.style.top = '12px'; ml.dataset.role = 'display';
      const mp = MT.el('div', 'gs ml', meter, `${pct}%`); mp.style.right = '22px'; mp.style.top = '12px'; mp.dataset.role = 'display';
      meterTrack = MT.el('div', 'track', meter); meterTrack.style.left = '22px'; meterTrack.style.right = '22px'; meterTrack.style.bottom = '18px';
      meterFill = MT.el('i', 'fill', meterTrack); meterFill.style.background = SET.hook.bg;
      if (my < giantBottom + 10) warnings.push('hook: meter overlaps the giant number');
      holds.push({ name: 'hook: paid-off meter', words: 3, start: 1.3, end: T.r1 });
    }
    holds.push({ name: 'hook: banner + label + balance', words: MT.wordCount(bannerText) + MT.wordCount(labelText) + 1, start: 0, end: T.r1 });
    keyframes.push({ t: 0, name: 'frame 1 (hook)' });

    // presses on beats 2,3 of bar 0 and 0,1 of bar 1: the balance wobbles, nothing moves
    const hPress = [at(0, 2), at(0, 3), at(1, 0), at(1, 1)];
    bH.presses = hPress;
    bH.quiet = [[hPress[0] - 0.35, hPress[hPress.length - 1] + 0.3]];
    bH.shouts = [at(1, 2)];
    bH.sweats = [[at(1, 2), T.r1]];
    bH.hits = [at(1, 2)];
    punch(at(0, 1), 0.012);
    const domeXY = (b) => [b.x + 122 * b.s, floorY - 92 * b.s];
    hPress.forEach((p, i) => {
      waves.push({ els: hGiant.glyphs, t0: p + 0.03, amp: i === 2 ? 34 : 22 });
      const [dx, dy] = domeXY(bH);
      burst(sH, dx, dy - 10, i === 2 ? 70 : 46, p);
      punch(p, i === 2 ? 0.032 : 0.02);
      cue(p, 'thud', 0.55); cue(p, 'pop', 0.3); cue(p + 0.18, 'glitch', 0.24);
    });
    if (meter) {
      tl.set(meter, { autoAlpha: 0, scale: 0.6 }, 0); tl.set(meterFill, { scaleX: 0 }, 0);
      tl.fromTo(meter, { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'back.out(2.4)', ...IR }, hPress[0] + 0.04);
      hPress.forEach((p) => {
        tl.fromTo(meterFill, { scaleX: 0 }, { scaleX: 0.07, duration: 0.09, ease: 'power2.out', ...IR }, p + 0.04);
        tl.fromTo(meterFill, { scaleX: 0.07 }, { scaleX: 0, duration: 0.14, ease: 'power3.in', ...IR }, p + 0.18);
      });
      shakes.push({ el: meterTrack, t0: at(1, 3), amp: 12 });
      tl.set(meter, { autoAlpha: 0, scale: 0.6 }, T.loop); tl.set(meterFill, { scaleX: 0 }, T.loop);
    }
    waves.push({ els: hGiant.glyphs, t0: at(1, 3), amp: 18 });
    punch(at(1, 2), 0.02); punch(at(1, 3), 0.016);
    cue(at(1, 2), 'swish', 0.5); cue(at(1, 3), 'glitch', 0.5);
    keyframes.push({ t: 3.3, name: 'hook: meter stuck at 0' });

    /* ======================= ROUND 1 ======================= */
    const sR = scene('r1', [{ x0: 0, x1: W, set: SET.r1, pattern: 'dots', angle: -18, speed: 44 }], [[T.r1, T.split]]);
    const c1 = roundCard(sR, 'Round 1', rise.label || 'Interest only', SET.r1);
    cardIn(c1, T.r1);
    holds.push({ name: 'round 1 card', words: 2 + MT.wordCount(rise.label || 'Interest only'), start: T.r1 + 0.5, end: T.split });
    keyframes.push({ t: +(T.r1 + 1.2).toFixed(3), name: 'round 1 card' });
    const bR = bean(sR, { x: beanX });
    nameTag(sR, beanX);
    const tagX = X0 + 230, tagY = Math.round(TOP + c1.h * c1.k + 44), tagW = X1 - tagX, tagH = 268;
    const pt1 = priceTag(sR, SET.r1, tagX, tagY, tagW, tagH, rise.from, rise.to, rise.unit || 'a month', 168);
    const note = rise.note ? abs(sR.ui, 'plate gs', 0, tagY + tagH + 34, esc(typo(rise.note))) : null;
    if (note) { note.dataset.role = 'display'; { let fs = 40; while (R(note).width > tagW && fs > 30) { fs -= 2; note.style.fontSize = fs + 'px'; } } note.style.left = Math.round(X1 - R(note).width) + 'px'; }
    if (note && R(note).bottom > floorY - 10) warnings.push('round 1: note is close to the floor');
    const j1w = abs(sR.ui, 'jw', 0, 0, '');
    const j1 = telop(j1w, typo(String(rise.delta)), { size: 150, color: SET.r1.judge, plain: false });
    j1.style.position = 'relative';
    fitW(j1, CW * 0.5, 150, 80);
    { const r = R(j1); j1w.style.left = Math.round(X1 - r.width - 10) + 'px'; j1w.style.top = Math.round(tagY - r.height * 0.78) + 'px'; j1w.style.width = r.width + 'px'; j1w.style.height = r.height + 'px'; }
    const tagLand = T.r1play, steps1 = [at(3, 1), at(3, 2), at(3, 3)], slam1 = at(4, 0);
    tl.set(pt1.tag, { y: -(tagY + tagH + 60), scaleX: 1, scaleY: 1 }, 0);
    pt1.cnt.set(tl, rise.from, 0);
    if (note) tl.set(note, { autoAlpha: 0, scale: 0.5, rotation: 3 }, 0);
    tl.set(j1w, { autoAlpha: 0, scale: 0.2, rotation: -20 }, 0);
    tl.fromTo(pt1.tag, { y: -(tagY + tagH + 60) }, { y: 0, duration: 0.4, ease: 'power2.in', ...IR }, tagLand - 0.4);
    tl.fromTo(pt1.tag, { scaleY: 0.82, scaleX: 1.06 }, { scaleY: 1, scaleX: 1, duration: 0.3, ease: 'back.out(3)', ...IR }, tagLand);
    punch(tagLand, 0.03); cue(tagLand, 'thud', 0.7); cue(tagLand, 'pop', 0.4);
    if (note) { tl.fromTo(note, { autoAlpha: 0, scale: 0.5, rotation: 3 }, { autoAlpha: 1, scale: 1, rotation: 1.5, duration: 0.26, ease: 'back.out(2.6)', ...IR }, tagLand + 0.15); cue(tagLand + 0.15, 'pop', 0.3); }
    steps1.forEach((s, i) => {
      const a = Math.round(rise.from + ((rise.to - rise.from) * i) / steps1.length), b = Math.round(rise.from + ((rise.to - rise.from) * (i + 1)) / steps1.length);
      tl.fromTo(pt1.cnt.proxy, { v: a }, { v: b, duration: 0.08, ease: 'power1.out', ...IR }, s);
      tl.fromTo(pt1.tag, { scaleX: 1, scaleY: 1 }, { scaleX: 1.045, scaleY: 1.045, duration: 0.06, ease: 'power2.out', ...IR }, s);
      tl.fromTo(pt1.tag, { scaleX: 1.045, scaleY: 1.045 }, { scaleX: 1, scaleY: 1, duration: 0.22, ease: 'back.out(3)', ...IR }, s + 0.06);
      burst(sR, tagX + tagW - 30, tagY + 20, 34, s, CANDY.pink);
      punch(s, 0.012); cue(s, 'click', 0.6); cue(s, 'tick', 0.35);
    });
    tl.fromTo(j1w, { autoAlpha: 0, scale: 0.2, rotation: -20 }, { autoAlpha: 1, scale: 1, rotation: -6, duration: 0.26, ease: 'back.out(3)', ...IR }, slam1);
    { const r = R(j1w); burst(sR, r.left + r.width / 2, r.top + r.height / 2, 120, slam1); }
    punch(slam1, 0.045); cue(slam1, 'stamp', 0.85); cue(slam1, 'pop', 0.6);
    pulses.push({ el: j1, times: [at(4, 1), at(4, 2), at(4, 3)] });
    bR.hopH = (t) => (t >= tagLand ? 24 : 14);
    bR.shouts = [slam1, at(4, 2)];
    bR.sweats = [[slam1, T.split]];
    bR.hits = [tagLand];
    holds.push({ name: 'round 1: note', words: MT.wordCount(rise.note || ''), start: tagLand + 0.3, end: T.split });
    holds.push({ name: 'round 1: tag (settled) + unit', words: 1 + MT.wordCount(rise.unit || 'a month'), start: steps1[steps1.length - 1] + 0.1, end: T.split });
    holds.push({ name: 'round 1: judgement', words: 1, start: slam1 + 0.25, end: T.split });
    keyframes.push({ t: +(slam1 + 1.3).toFixed(3), name: 'round 1: judged' });

    /* ======================= SPLIT (pattern interrupt) ======================= */
    const sS = scene('split', [
      { x0: 0, x1: W / 2, set: SET.sL, pattern: 'stripes', angle: -32, speed: 80 },
      { x0: W / 2, x1: W, set: SET.sR, pattern: 'stripes', angle: 32, speed: -80 },
    ], [[T.split, T.bonus]]);
    // the divider: an ink bolt down the middle
    { const pts = []; for (let y = -20, i = 0; y <= H + 40; y += 70, i++) pts.push(`${W / 2 + (i % 2 ? 16 : -16)},${y}`); P(sS.art, 'polyline', { points: pts.join(' '), fill: 'none', ...OL(16) }); P(sS.art, 'polyline', { points: pts.join(' '), fill: 'none', stroke: CREAM, 'stroke-width': 5, 'stroke-linejoin': 'round' }); }
    const n = stack.n;
    const bW = W / 2 - X0 - 34, bHh = 206, bY = TOP + 6;
    const vSize = fitTo([money(stack.total), money(stack.balance)], bW - 52, 112);
    const owesLabel = hk.label || 'Still owes';
    const bdL = board(sS, X0, bY, bW, bHh, stack.label || 'Paid', vSize);
    const bdR = board(sS, W / 2 + 34, bY, bW, bHh, owesLabel, vSize);
    const paidCnt = MT.counter(bdL.v, { from: 0, to: stack.total });
    roleWhenSettled(paidCnt, [Math.round(stack.total)]);
    bdR.v.textContent = money(stack.balance);
    // tower of payment slips beside the contestant, bottom row first
    const bS = bean(sS, { x: X0 + 62 });
    nameTag(sS, X0 + 62);
    const rbS = robot(sS, { x: Math.round(W * 0.75 + 40) });
    const cols = n <= 12 ? 3 : 4, rows = Math.ceil(n / cols);
    const tx0 = X0 + 150, tx1 = W / 2 - 30, gap = 8;
    const sw = Math.floor((tx1 - tx0 - gap * (cols - 1)) / cols), sh = 58;
    const slipFs = Math.max(28, Math.min(34, fitTo([money(stack.unit)], sw - 14, 34)));
    const rr = MT.rng('slips');
    const slips = [];
    for (let i = 0; i < n; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const x = tx0 + c * (sw + gap), y = floorY - (r + 1) * (sh + 6);
      const s = abs(sS.ui, 'slip gs', x, y, `<span class="num">${esc(money(stack.unit))}</span>`, { width: sw + 'px', height: sh + 'px' });
      s.firstChild.style.fontSize = slipFs + 'px';
      s.firstChild.dataset.role = 'body';
      s._rot = (rr() - 0.5) * 7; s._y = y;
      slips.push(s);
    }
    if (floorY - rows * (sh + 6) < bY + bHh + 40) warnings.push('split: slip tower reaches the boards');
    // the boards sit on top of falling slips
    sS.ui.appendChild(bdL.el); sS.ui.appendChild(bdR.el);
    const stampW = abs(sS.ui, 'jw', 0, 0, '');
    const stamp = MT.el('div', 'stamp gs', stampW, esc(typo(stack.stamp || 'Unchanged')));
    stamp.style.color = STAMP; stamp.style.background = CREAM; stamp.dataset.role = 'display';
    { let fs = 60; while (R(stamp).width > bW - 10 && fs > 34) { fs -= 2; stamp.style.fontSize = fs + 'px'; } }
    { const r = R(stamp); stampW.style.width = r.width + 'px'; stampW.style.height = r.height + 'px'; stampW.style.left = Math.round(W * 0.75 + 17 - r.width / 2) + 'px'; stampW.style.top = Math.round(bY + bHh + 60) + 'px'; }
    if (R(stampW).bottom > floorY - 220 * 0.82) warnings.push('split: stamp is close to the lender bot');
    const drops = rhythm(T.split + 0.5, n);
    const stampT = ceilBeat(drops[n - 1] + 0.2);
    tl.set([bdL.el, bdR.el], { y: -(bY + bHh + 40) }, 0);
    paidCnt.set(tl, 0, 0);
    slips.forEach((s) => tl.set(s, { autoAlpha: 0, y: -(s._y + 90), rotation: s._rot * 4, scaleY: 1 }, 0));
    tl.set(stampW, { autoAlpha: 0, scale: 2.4, rotation: -18 }, 0);
    const boardLand = T.split + 0.25;
    tl.fromTo([bdL.el, bdR.el], { y: -(bY + bHh + 40) }, { y: 0, duration: 0.25, ease: 'power2.in', stagger: 0, ...IR }, T.split);
    punch(boardLand, 0.03); cue(boardLand, 'thud', 0.7); cue(boardLand, 'pop', 0.35);
    drops.forEach((d, i) => {
      const s = slips[i];
      tl.set(s, { autoAlpha: 1 }, d - 0.28);
      tl.fromTo(s, { y: -(s._y + 90), rotation: s._rot * 4 }, { y: 0, rotation: s._rot, duration: 0.28, ease: 'power2.in', ...IR }, d - 0.28);
      tl.fromTo(s, { scaleY: 0.7 }, { scaleY: 1, duration: 0.16, ease: 'back.out(3)', ...IR }, d);
      tl.fromTo(paidCnt.proxy, { v: stack.unit * i }, { v: stack.unit * (i + 1), duration: 0.06, ease: 'power1.out', ...IR }, d);
      cue(d, i % 2 ? 'tick' : 'pop', 0.42); if (i % 3 === 2) cue(d, 'paper', 0.3);
      const next = i < n - 1 ? drops[i + 1] : stampT;
      const resp = d + Math.min(0.25, (next - d) / 2);
      if (next - d >= 0.25 || i % 2 === 1) { rbS.nos.push(resp); shakes.push({ el: bdR.v, t0: resp, amp: 9 }); }
      if (next - d >= 0.5) cue(resp, 'glitch', 0.26);
      bS.hits.push(d);
    });
    tl.fromTo(stampW, { autoAlpha: 0, scale: 2.4, rotation: -18 }, { autoAlpha: 1, scale: 1, rotation: -9, duration: 0.16, ease: 'power4.in', ...IR }, stampT - 0.16);
    { const r = R(stampW); burst(sS, r.left + r.width / 2, r.top + r.height / 2, 96, stampT, CREAM); }
    shakes.push({ el: bdR.v, t0: stampT, amp: 14 });
    punch(stampT, 0.05); cue(stampT, 'stamp', 1.0); cue(stampT + 0.02, 'thud', 0.5);
    rbS.nos.push(stampT, stampT + 1.0, stampT + 2.0);
    cue(stampT + 1.0, 'glitch', 0.3);
    bS.shouts = [stampT, stampT + 1.25];
    bS.sweats = [[stampT, T.bonus]];
    bS.hopH = (t) => (t >= stampT ? 22 : 12);
    holds.push({ name: 'split: boards', words: 2 + MT.wordCount(owesLabel) + 1, start: boardLand + 0.2, end: T.bonus });
    holds.push({ name: 'split: payment slips', words: 1, start: drops[n - 1] + 0.1, end: T.bonus });
    holds.push({ name: 'split: stamp', words: MT.wordCount(stack.stamp || 'Unchanged'), start: stampT + 0.1, end: T.bonus });
    keyframes.push({ t: +(drops[1] + 0.12).toFixed(3), name: 'split: payments drop' });
    keyframes.push({ t: +(stampT + 1.6).toFixed(3), name: 'split: stamped' });

    /* ======================= BONUS ROUND ======================= */
    const sB = scene('bonus', [{ x0: 0, x1: W, set: SET.bo, pattern: 'rays', cx: W / 2, cy: 760, speed: 16 }], [[T.bonus, T.loop]]);
    const fixName = fix.label || 'Pay instead';
    const c2 = roundCard(sB, 'Bonus round', fixName, SET.bo);
    cardIn(c2, T.bonus);
    keyframes.push({ t: +(T.bonus + 1.2).toFixed(3), name: 'bonus card' });
    const bB = bean(sB, { x: beanX, podium: true });
    nameTag(sB, beanX);
    const rbB = robot(sB, { x: X1 - 90 });
    const t2X = X0 + 420, t2Y = TOP, t2W = X1 - t2X, t2H = 222;
    const pt2 = priceTag(sB, SET.bo, t2X, t2Y, t2W, t2H, stack.unit, fix.pay, fix.unit || rise.unit || 'a month', 128);
    const extra = typeof fix.extra === 'number' ? fix.extra : fix.pay - stack.unit;
    const chipW = abs(sB.ui, 'jw', 0, 0, '');
    const chip = telop(chipW, money(extra, { sign: true }), { size: 84, color: SET.bo.judge });
    chip.style.position = 'relative';
    const b2Y = Math.round(t2Y + t2H + 40), b2H = 190;
    { const r = R(chip); chipW.style.left = Math.round(X0 + 24) + 'px'; chipW.style.top = Math.round(Math.max(TOP + c2.h * c2.k + 14, b2Y - r.height - 2)) + 'px'; chipW.style.width = r.width + 'px'; chipW.style.height = r.height + 'px'; }
    const b2v = fitTo([money(stack.balance), money(fix.balanceEnd)], CW - 60, 120);
    const bd2 = board(sB, X0, b2Y, CW, b2H, owesLabel, b2v);
    const balCnt = MT.counter(bd2.v, { from: stack.balance, to: fix.balanceEnd });
    roleWhenSettled(balCnt, [Math.round(fix.balanceEnd)]);
    if (b2Y + b2H + 12 > floorY - 250 * 0.82) warnings.push('bonus: balance board reaches the contestant');
    const series = V.series && Array.isArray(V.series.shown) && V.series.shown.length === n + 1 && V.series.shown[0] === stack.balance && V.series.shown[n] === fix.balanceEnd ? V.series.shown : null;
    const balAt = (k) => (series ? series[k] : Math.round(stack.balance + ((fix.balanceEnd - stack.balance) * k) / n));
    if (!series) warnings.push('bonus: values.series missing or mismatched; balance steps are linear');
    const presses = rhythm(at(10, 1), n);
    const slam2 = ceilBeat(presses[n - 1] + 0.22);
    const flight = 0.2;
    const [d2x, d2y] = domeXY(bB);
    const flyers = presses.map(() => {
      const f = abs(sB.ui, 'slip gs', 0, 0, `<span class="num">${esc(money(fix.pay))}</span>`, { width: '118px', height: '56px' });
      f.firstChild.style.fontSize = Math.max(28, Math.min(32, fitTo([money(fix.pay)], 104, 32))) + 'px';
      f.firstChild.dataset.role = 'label';
      f.style.left = Math.round(d2x - 59) + 'px'; f.style.top = Math.round(d2y - 28) + 'px';
      return f;
    });
    // flyers go behind the board (they are swallowed by it)
    sB.ui.insertBefore(bd2.el, null);
    const subText = fix.note || (V.months ? `in ${V.months.text} months` : '');
    const j2w = abs(sB.ui, 'jw', 0, 0, '');
    const j2 = telop(j2w, money(-Math.abs(fix.off)), { size: 170, color: SET.bo.judge });
    j2.style.position = 'relative';
    fitW(j2, CW * 0.8, 170, 100);
    let j2top;
    { const r = R(j2); j2top = Math.round(TOP + 10); j2w.style.left = Math.round(W / 2 - r.width / 2) + 'px'; j2w.style.top = j2top + 'px'; j2w.style.width = r.width + 'px'; j2w.style.height = r.height + 'px'; }
    const sub = subText ? abs(sB.ui, 'plate gs', 0, 0, esc(typo(subText))) : null;
    if (sub) { sub.dataset.role = 'display'; const r = R(sub), jr = R(j2w); sub.style.left = Math.round(clamp(W / 2 - r.width / 2 + 120, X0, X1 - r.width)) + 'px'; sub.style.top = Math.round(jr.bottom - 10) + 'px'; if (R(sub).bottom > b2Y - 6) warnings.push('bonus: judgement plate touches the board'); }
    const tag2Land = T.bonusPlay, steps2 = [at(9, 1), at(9, 2), at(9, 3), at(10, 0)];
    const board2Land = at(9, 0.5);
    tl.set(pt2.tag, { y: -(t2Y + t2H + 60), scaleX: 1, scaleY: 1, autoAlpha: 1 }, 0);
    pt2.cnt.set(tl, stack.unit, 0);
    tl.set(chipW, { autoAlpha: 0, scale: 0.2, rotation: 10 }, 0);
    tl.set(bd2.el, { y: -(b2Y + b2H + 60) }, 0);
    balCnt.set(tl, stack.balance, 0);
    flyers.forEach((f) => tl.set(f, { autoAlpha: 0, x: 0, y: 0, scale: 1, rotation: 0 }, 0));
    tl.set(j2w, { autoAlpha: 0, scale: 0.2, rotation: -20 }, 0);
    if (sub) tl.set(sub, { autoAlpha: 0, scale: 0.4, rotation: 0 }, 0);
    tl.fromTo(pt2.tag, { y: -(t2Y + t2H + 60) }, { y: 0, duration: 0.4, ease: 'power2.in', ...IR }, tag2Land - 0.4);
    tl.fromTo(pt2.tag, { scaleY: 0.82, scaleX: 1.06 }, { scaleY: 1, scaleX: 1, duration: 0.3, ease: 'back.out(3)', ...IR }, tag2Land);
    punch(tag2Land, 0.03); cue(tag2Land, 'thud', 0.7); cue(tag2Land, 'pop', 0.4);
    tl.fromTo(bd2.el, { y: -(b2Y + b2H + 60) }, { y: 0, duration: 0.3, ease: 'power2.in', ...IR }, board2Land - 0.3);
    punch(board2Land, 0.022); cue(board2Land, 'thud', 0.5);
    steps2.forEach((s, i) => {
      const a = Math.round(stack.unit + ((fix.pay - stack.unit) * i) / steps2.length), b = Math.round(stack.unit + ((fix.pay - stack.unit) * (i + 1)) / steps2.length);
      tl.fromTo(pt2.cnt.proxy, { v: a }, { v: b, duration: 0.08, ease: 'power1.out', ...IR }, s);
      tl.fromTo(pt2.tag, { scaleX: 1, scaleY: 1 }, { scaleX: 1.045, scaleY: 1.045, duration: 0.06, ease: 'power2.out', ...IR }, s);
      tl.fromTo(pt2.tag, { scaleX: 1.045, scaleY: 1.045 }, { scaleX: 1, scaleY: 1, duration: 0.22, ease: 'back.out(3)', ...IR }, s + 0.06);
      burst(sB, t2X + t2W - 30, t2Y + 20, 34, s, CANDY.pink);
      punch(s, 0.012); cue(s, 'click', 0.6); cue(s, 'tick', 0.3);
    });
    const chipT = steps2[steps2.length - 1];
    tl.fromTo(chipW, { autoAlpha: 0, scale: 0.2, rotation: 10 }, { autoAlpha: 1, scale: 1, rotation: -7, duration: 0.26, ease: 'back.out(3)', ...IR }, chipT + 0.04);
    cue(chipT + 0.04, 'pop', 0.6);
    keyframes.push({ t: +(presses[0] - 0.18).toFixed(3), name: 'bonus: new payment' });
    // every press now lands: the slip flies into the board and the balance steps down a month
    const bx = X0 + CW / 2, by = b2Y + b2H - 30;
    presses.forEach((p, i) => {
      const f = flyers[i];
      const land = p + flight;
      tl.set(f, { autoAlpha: 1 }, p);
      tl.fromTo(f, { x: 0 }, { x: bx - d2x, duration: flight, ease: 'none', ...IR }, p);
      tl.fromTo(f, { y: 0 }, { y: by - d2y, duration: flight, ease: 'power2.out', ...IR }, p);
      tl.fromTo(f, { scale: 1, rotation: 0 }, { scale: 0.55, rotation: -14, duration: flight, ease: 'power1.in', ...IR }, p);
      tl.set(f, { autoAlpha: 0 }, land);
      tl.fromTo(balCnt.proxy, { v: balAt(i) }, { v: balAt(i + 1), duration: 0.06, ease: 'power1.out', ...IR }, land);
      shakes.push({ el: bd2.v, t0: land, amp: 5 });
      rbB.nods.push(land);
      cue(p, 'thud', 0.32); cue(land, i % 2 ? 'tick' : 'pop', 0.4); cue(land, 'click', 0.28);
      punch(land, 0.008);
    });
    bB.presses = presses;
    bB.quiet = [[presses[0] - 0.35, presses[n - 1] + 0.3]];
    // slam: the tag, chip and banner clear the stage; the judgement is the amount off
    tl.fromTo([pt2.tag, chipW], { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.12, ease: 'power2.in', ...IR }, slam2 - 0.12);
    tl.fromTo(c2.wrap, { scale: c2.k }, { scale: 0, duration: 0.14, ease: 'power3.in', ...IR }, slam2 - 0.14);
    tl.fromTo(j2w, { autoAlpha: 0, scale: 0.2, rotation: -20 }, { autoAlpha: 1, scale: 1, rotation: -6, duration: 0.28, ease: 'back.out(3)', ...IR }, slam2);
    if (sub) { tl.fromTo(sub, { autoAlpha: 0, scale: 0.4, rotation: 0 }, { autoAlpha: 1, scale: 1, rotation: 3, duration: 0.24, ease: 'back.out(2.6)', ...IR }, slam2 + 0.12); cue(slam2 + 0.12, 'pop', 0.4); }
    { const r = R(j2w); burst(sB, r.left + r.width / 2, j2top + r.height / 2, 170, slam2); }
    punch(slam2, 0.05); cue(slam2, 'stamp', 0.7); cue(slam2, 'cash', 0.9); cue(slam2, 'pop', 0.5);
    pulses.push({ el: j2, times: [slam2 + 0.5, slam2 + 1.0, slam2 + 1.5, slam2 + 2.0] });
    bB.shouts = [slam2, slam2 + 1.0, slam2 + 1.75];
    rbB.nods.push(slam2, slam2 + 0.5, slam2 + 1.0);
    cue(slam2 + 1.0, 'pop', 0.3); cue(slam2 + 1.75, 'swish', 0.35);
    // confetti: flat candy pieces with ink outlines, seeded
    const confetti = [];
    { const cr2 = MT.rng('confetti'), cols2 = [CANDY.yellow, CANDY.pink, CANDY.lime, CANDY.sky, CREAM, CANDY.orange];
      for (let i = 0; i < 30; i++) {
        const el = P(sB.art, 'rect', { x: -13, y: -7, width: 26, height: 14, rx: 3, fill: cols2[i % cols2.length], ...OL(4) });
        el.style.display = 'none';
        confetti.push({ el, x: X0 + cr2() * CW, y0: TOP - 120 - cr2() * 260, v: 280 + cr2() * 260, spin: (cr2() - 0.5) * 900, sway: 20 + cr2() * 30, ph: cr2() * 6.28, t0: slam2 + cr2() * 0.3 });
      } }
    holds.push({ name: 'bonus card', words: 2 + MT.wordCount(fixName), start: T.bonus + 0.5, end: slam2 });
    holds.push({ name: 'bonus: tag (settled) + unit + chip', words: 3, start: chipT + 0.3, end: slam2 });
    holds.push({ name: 'bonus: balance board (settled)', words: MT.wordCount(owesLabel) + 1, start: presses[n - 1] + flight + 0.06, end: T.loop });
    holds.push({ name: 'bonus: judgement + plate', words: 1 + MT.wordCount(subText), start: slam2 + 0.36, end: T.loop });
    keyframes.push({ t: +(slam2 + 1.7).toFixed(3), name: 'bonus: judged' });

    /* ======================= cuts, flash, beat ======================= */
    const flash = MT.el('div', 'flash', layer);
    const order = [[sH, 0], [sR, T.r1], [sS, T.split], [sB, T.bonus], [sH, T.loop]];
    scenes.forEach((sc) => tl.set(sc.s, { autoAlpha: sc === sH ? 1 : 0 }, 0));
    tl.set(stage, { backgroundColor: SET.hook.bg }, 0);
    tl.set(flash, { opacity: 0 }, 0);
    const looks = { hook: SET.hook.bg, r1: SET.r1.bg, split: SET.sL.bg, bonus: SET.bo.bg };
    for (let i = 1; i < order.length; i++) {
      const [sc, t] = order[i], prev = order[i - 1][0];
      tl.set(prev.s, { autoAlpha: 0 }, t);
      tl.set(sc.s, { autoAlpha: 1 }, t);
      tl.set(stage, { backgroundColor: looks[sc.name] }, t);
      if (t < T.loop) {
        tl.fromTo(flash, { opacity: 0.92 }, { opacity: 0, duration: 0.1, ease: 'power1.out', ...IR }, t);
        cue(t - 0.08, 'whoosh-short', 0.6); cue(t, 'thud', 0.85);
      } else {
        // the loop cut: the flash peaks on the frame before the bar line, frame 1 lands clean
        tl.fromTo(flash, { opacity: 0 }, { opacity: 0.9, duration: 2 * FR, ease: 'none', ...IR }, t - 2 * FR);
        tl.set(flash, { opacity: 0 }, t);
        cue(t - 0.12, 'whoosh-short', 0.55);
      }
    }
    // jingles into the two round cards (rising sweep landing on the bar line); a glitch into the split
    cue(T.r1 - 0.85, 'rise', 0.5); cue(T.bonus - 0.85, 'rise', 0.5); cue(T.split, 'glitch', 0.5);
    // the beat itself: kick on 1 and 3, hats on the off-beats (quiet under the foley)
    for (let b = 0; b * BEAT < T.loop - 1e-6; b++) {
      const t = b * BEAT;
      if (b % 2 === 0 && ![T.r1, T.split, T.bonus].includes(t)) cue(t, 'thud', 0.26);
      cue(t + BEAT / 2, 'tick', 0.09);
    }
    keyframes.push({ t: +T.loop.toFixed(3), name: 'last frame (= frame 1)' });

    /* ======================= the pure-of-t pose pass ======================= */
    const poseBean = (a, t, tau) => {
      const quiet = a.quiet.some(([q0, q1]) => t >= q0 && t < q1);
      const hh = quiet ? 0 : a.hopH(t);
      const k = ((tau % BEAT) + BEAT) % BEAT, u = k / BEAT;
      const y = -4 * hh * u * (1 - u);
      let sy = 1, sx = 1;
      if (tau >= BEAT - 1e-6 && hh > 0) { const e = 0.07 * Math.exp(-k * 18); sy -= e; sx += e * 0.7; }
      for (const h of a.hits) { const d = t - h; if (d >= 0 && d < 0.4) { const w = 0.09 * Math.exp(-d * 8) * Math.cos(30 * d); sy -= w; sx += w * 0.6; } }
      a.hop.setAttribute('transform', `translate(0,${y.toFixed(2)}) scale(${sx.toFixed(4)},${sy.toFixed(4)})`);
      let aL = 18, aR = -18, open = false;
      const ps = a.presses;
      if (ps.length && t >= ps[0] - 0.35 && t < ps[ps.length - 1] + 0.3) {
        let prev = null, next = null;
        for (const p of ps) { if (p <= t + 1e-9) prev = p; else { next = p; break; } }
        const DOWN = -72;
        const upFor = (gapS) => (gapS >= 0.4 ? -158 : gapS >= 0.2 ? -128 : -104);
        if (prev === null) {
          const q = clamp((t - (next - 0.35)) / 0.2, 0, 1);
          aR = lerp(-18, -158, eo(q));
          if (t > next - 0.07) aR = lerp(-158, DOWN, (t - (next - 0.07)) / 0.07);
        } else if (next === null) {
          aR = t - prev < 0.06 ? DOWN : lerp(DOWN, -18, eo(clamp((t - prev - 0.06) / 0.2, 0, 1)));
        } else {
          const gapS = next - prev, d = t - prev, UP = upFor(gapS);
          const hold = Math.min(0.05, gapS * 0.3), down = Math.min(0.07, gapS * 0.4);
          if (d < hold) aR = DOWN;
          else if (d < gapS - down) aR = lerp(DOWN, UP, eo((d - hold) / (gapS - down - hold)));
          else aR = lerp(UP, DOWN, (d - (gapS - down)) / down);
        }
        open = prev !== null && t - prev < 0.08;
      }
      for (const sh of a.shouts) {
        const d = t - sh;
        if (d >= -0.06 && d < 0.32) { const q = d < 0 ? (d + 0.06) / 0.06 : d > 0.26 ? (0.32 - d) / 0.06 : 1; aL = lerp(aL, 156, q); aR = lerp(aR, -156, q); open = open || q > 0.5; }
      }
      a.armL.setAttribute('transform', `rotate(${aL.toFixed(2)})`);
      a.armR.setAttribute('transform', `rotate(${aR.toFixed(2)})`);
      a.mouthC.style.display = open ? 'none' : '';
      a.mouthO.style.display = open ? '' : 'none';
      const sw = a.sweats.some(([s0, s1]) => t >= s0 && t < s1);
      a.sweat.style.display = sw ? '' : 'none';
      if (sw) a.sweat.setAttribute('transform', `translate(0,${(4 * Math.sin(t * 12.566)).toFixed(2)})`);
      if (a.dome) {
        let dsq = 1;
        for (const p of ps) { const d = t - p; if (d >= 0 && d < 0.16) dsq = Math.min(dsq, 1 - 0.42 * (1 - d / 0.16)); }
        a.dome.setAttribute('transform', `translate(0,-68) scale(1,${dsq.toFixed(4)}) translate(0,68)`);
      }
    };
    const poseRobot = (a, t, tau) => {
      const k = (((tau + BEAT / 2) % BEAT) + BEAT) % BEAT, u = k / BEAT; // neighbours hop on the off-beat
      let y = -4 * 9 * u * (1 - u), rot = 0, sq = 1, spread = 0;
      for (const nT of a.nos) { const d = t - nT; if (d >= 0 && d < 0.5) { rot += 9 * Math.exp(-d * 6) * Math.sin(d * 34); spread = Math.max(spread, Math.exp(-d * 5)); if (d < 0.18) sq = 0.3; } }
      for (const nT of a.nods) { const d = t - nT; if (d >= 0 && d < 0.2) y += 12 * Math.sin((Math.PI * d) / 0.2); }
      rot = clamp(rot, -12, 12);
      a.body.setAttribute('transform', `translate(0,${y.toFixed(2)}) rotate(${rot.toFixed(2)})`);
      a.eyes.setAttribute('transform', `translate(0,-111) scale(1,${sq}) translate(0,111)`);
      a.armL.setAttribute('transform', `rotate(${(20 + 60 * spread).toFixed(2)})`);
      a.armR.setAttribute('transform', `rotate(${(-20 - 60 * spread).toFixed(2)})`);
    };
    MT.after((t) => {
      const pz = punchAt(t);
      for (const sc of scenes) {
        const w = winOf(sc, t);
        if (!w) continue;
        const tau = t - w[0];
        sc.cam.style.transform = pz !== 1 ? `scale(${pz.toFixed(5)})` : 'none';
        for (const p of sc.pats) {
          if (p.kind === 'rays') p.el.setAttribute('transform', `translate(${p.cx},${p.cy}) rotate(${(tau * p.speed).toFixed(3)})`);
          else { const off = (((tau * p.speed) % p.P) + p.P) % p.P; p.el.setAttribute('patternTransform', `rotate(${p.angle}) translate(${off.toFixed(2)},0)`); }
        }
      }
      for (const a of actors) {
        const w = winOf(a.sc, t);
        if (!w) continue;
        if (a.kind === 'bean') poseBean(a, t, t - w[0]); else poseRobot(a, t, t - w[0]);
      }
      for (const b of bursts) {
        const d = t - b.t0;
        if (d < 0 || d >= 0.34) { b.root.style.display = 'none'; continue; }
        b.root.style.display = '';
        const s = d < 0.1 ? backOut(d / 0.1) : d < 0.22 ? 1 : Math.max(0, 1 - (d - 0.22) / 0.12);
        b.root.setAttribute('transform', `translate(${b.x},${b.y})`);
        b.star.setAttribute('transform', `scale(${s.toFixed(4)}) rotate(${(d * 120).toFixed(2)})`);
        b.ring.setAttribute('r', (b.r * (0.5 + d * 3.2)).toFixed(1));
        b.ring.setAttribute('stroke-width', Math.max(0, 10 * (1 - d / 0.34)).toFixed(2));
        b.lines.setAttribute('transform', `scale(${(0.8 + d * 1.6).toFixed(4)})`);
        b.lines.style.display = d < 0.24 ? '' : 'none';
      }
      const gy = new Map();
      for (const wv of waves) {
        wv.els.forEach((e, i) => {
          const d = t - wv.t0 - i * 0.025;
          if (d >= 0 && d < 0.22) { const q = d / 0.22; gy.set(e, (gy.get(e) || 0) + wv.amp * 4 * q * (1 - q)); }
        });
      }
      for (const wv of waves) for (const e of wv.els) { const v = gy.get(e) || 0; e.style.transform = v ? `translateY(${(-v).toFixed(2)}px)` : ''; }
      for (const pl of pulses) {
        let s = 1;
        for (const pt of pl.times) { const d = t - pt; if (d >= 0 && d < 0.4) s += 0.07 * Math.exp(-d * 11); }
        pl.el.style.transform = s !== 1 ? `scale(${s.toFixed(4)})` : '';
      }
      const sx = new Map();
      for (const sk of shakes) { const d = t - sk.t0; if (d >= 0 && d < 0.4) sx.set(sk.el, (sx.get(sk.el) || 0) + sk.amp * Math.exp(-d * 9) * Math.sin(d * 46)); }
      for (const sk of shakes) { const v = sx.get(sk.el) || 0; sk.el.style.transform = v ? `translateX(${v.toFixed(2)}px)` : ''; }
      for (const c of confetti) {
        const d = t - c.t0;
        if (d < 0 || t >= T.loop) { c.el.style.display = 'none'; continue; }
        const y = c.y0 + c.v * d + 120 * d * d;
        if (y > floorY - 6) { c.el.style.display = 'none'; continue; }
        c.el.style.display = '';
        c.el.setAttribute('transform', `translate(${(c.x + c.sway * Math.sin(c.ph + d * 5)).toFixed(1)},${y.toFixed(1)}) rotate(${(c.spin * d).toFixed(1)})`);
      }
    });

    const duration = END;
    return { duration, keyframes, holds, poster: 0, warnings };
  },
};
