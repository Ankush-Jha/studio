/* film-pop-art timeline: Studio Films "Pop Art" for a broker story.
 *
 * Every frame is one whole printed poster: a flat process-plate ground, Ben-Day dots fixed
 * to the paper at 45°, props drawn in code with heavy key lines (heavier lower right, light
 * from the upper left) and colour fills that never quite register. Headlines are printed in:
 * colour lands from an offset, the key snaps on. Labels are paper slips. No fades: prints
 * are stamped, flipped like cards or pushed through.
 *
 * Rhythm (about 18 s; every 1-2 s something visibly changes):
 *   HOOK   client-accent poster. Kicker slip, headline (caption line 1), the HELOC
 *          statement carrying caption line 2 (label + giant balance). Frame 1 is fully
 *          legible; the plates are still sliding into register and the print settles from
 *          a stamp, so it moves from frame 0. Twelve payment ticks stamp onto the statement;
 *          a misregistration kick; a slow push.
 *   RISE   stamped over: cash register. The display counts from -> to on ticks, ka-ching,
 *          the receipt slides out with the note, the delta is rubber-stamped on it.
 *   STACK  PATTERN INTERRUPT (~40%): push into the receipt, cut to one payment print at
 *          coin-sized dots; pull back while copies are stamped faster and faster into a
 *          wall (one per payment); the paid total ticks up; the balance strip will not
 *          move: shake, rubber stamp.
 *   FIX    card flip to paper. Headline with the new payment counting up, a wallet pushes
 *          out the extra, the statement balance counts down, the paydown line prints.
 *   LOOP   card flip back into the hook; the last frame is frame 1.
 *
 * All copy and numbers come from M.block (story) and M.values; client colours from the
 * token CSS vars. Determinism: one paused timeline, fromTo + MT.IR, t=0 states via
 * tl.set(..., 0), MT.rng for misregistration, MT.counter for every changing number.
 */
window.TEMPLATE = {
  build(MT, M, tl) {
    const B = M.block;
    const IR = MT.IR;
    const cue = MT.cue;
    const money = MT.fmt.money;
    const FPS = M.fps;
    const stage = document.getElementById('stage');
    const layer = document.getElementById('layer');
    const beats = B.beats || [];
    const beat = (id) => beats.find((b) => b.id === id) || {};
    const hk = B.hook || {}, rise = beat('rise'), stack = beat('stack'), fix = beat('fix');
    const warnings = [], keyframes = [], holds = [];
    const rr = MT.rng('film-pop-art:register');

    /* ---------------- colour: plates around the client accent ---------------- */
    const probe = MT.el('span', null, document.body);
    const norm = (c) => {
      probe.style.color = ''; probe.style.color = c;
      const m = getComputedStyle(probe).color.match(/[\d.]+/g) || [0, 0, 0];
      return '#' + m.slice(0, 3).map((v) => Math.round(+v).toString(16).padStart(2, '0')).join('');
    };
    const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
    const toHex = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (c) => { const [r, g, b] = hex(c); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
    const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const mix = (a, b, t) => { const A = hex(a), Bv = hex(b); return toHex(A.map((v, i) => v + (Bv[i] - v) * t)); };
    const hue = (c) => {
      const [r, g, b] = hex(c).map((v) => v / 255);
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (!d) return 0;
      const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    const hd = (a, b) => { const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d); };

    const ACC = norm(css('--color-accent'));
    const INK0 = norm(css('--color-ink'));
    const PAP0 = norm(css('--color-paper'));
    probe.remove();
    // Paper stays a warm off-white (clean print); key is near-black, tinted by the client ink.
    const PAP = lum(PAP0) > 0.62 ? PAP0 : '#F8F2E2';
    const KEY = lum(INK0) < 0.08 ? mix(INK0, '#141414', 0.55) : '#141414';
    // The client accent takes the place of the process plate nearest to it in hue; the
    // other two process plates stay (STYLE: three process colours + key + paper).
    const PROC = { yellow: '#FFD21F', blue: '#1E62B0', red: '#E4232B' };
    const nearest = Object.keys(PROC).sort((a, b) => hd(ACC, PROC[a]) - hd(ACC, PROC[b]))[0];
    const [k1, k2] = ['yellow', 'blue', 'red'].filter((k) => k !== nearest);
    const P1 = PROC[k1], P2 = PROC[k2];
    const fillOn = (bg) => (cr(PAP, bg) >= 3.2 ? PAP : KEY);                       // big type on a ground
    const emOn = (bg, avoid = []) => [ACC, P2, P1, PAP, KEY].find((c) => c !== bg && !avoid.includes(c) && cr(c, bg) >= 3) || fillOn(bg);
    const plateOn = (bg, avoid = []) => [P2, ACC, P1].find((c) => c !== bg && !avoid.includes(c) && cr(c, bg) >= 1.25) || KEY;
    stage.style.setProperty('--key', KEY);
    stage.style.setProperty('--pap', PAP);

    // One ground per poster; never a colour on itself.
    const G = { hook: ACC, rise: P1, stack: P2, fix: PAP };

    /* ---------------- svg helpers ---------------- */
    const S = (tag, attrs, parent) => MT.svgEl(tag, attrs, parent);
    const defsSvg = S('svg', { class: 'defs', width: 0, height: 0 }, stage);
    const defs = S('defs', {}, defsSvg);
    let pid = 0;
    // Ben-Day screen as a pattern: in the user space of the print it fills (so the dots are
    // fixed to that print's paper), rotated 45°. dens = ink coverage; above 0.5 it becomes
    // round holes of the ground colour.
    const pattern = (color, dens, cell = 13, bg = null) => {
      const id = `ocp${pid++}`;
      const p = S('pattern', { id, patternUnits: 'userSpaceOnUse', width: cell, height: cell, patternTransform: 'rotate(45)' }, defs);
      if (bg) S('rect', { width: cell, height: cell, fill: bg }, p);
      S('circle', { cx: cell / 2, cy: cell / 2, r: (cell * Math.sqrt(Math.min(0.72, dens) / Math.PI)).toFixed(2), fill: color }, p);
      return `url(#${id})`;
    };
    // Dot field with a gradient of dot sizes (a front): r(x,y) returns coverage 0..0.7.
    const dotField = (parent, { x0 = 0, y0 = 0, x1 = 1080, y1 = 1920, cell = 22, color, dens }) => {
      const s = cell / Math.SQRT2;
      let d = '';
      const u0 = Math.floor((x0 + y0) / (2 * s)) - 1, u1 = Math.ceil((x1 + y1) / (2 * s)) + 1;
      const v0 = Math.floor((y0 - x1) / (2 * s)) - 1, v1 = Math.ceil((y1 - x0) / (2 * s)) + 1;
      for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) {
        const x = (u - v) * s, y = (u + v) * s;
        if (x < x0 - cell || x > x1 + cell || y < y0 - cell || y > y1 + cell) continue;
        const c = Math.max(0, Math.min(0.7, dens(x, y)));
        const r = cell * Math.sqrt(c / Math.PI);
        if (r < 0.7) continue;
        d += `M${(x - r).toFixed(1)},${y.toFixed(1)}a${r.toFixed(1)},${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)},0a${r.toFixed(1)},${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)},0`;
      }
      return S('path', { d, fill: color }, parent);
    };
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const rectD = (x, y, w, h) => `M${x},${y}H${x + w}V${y + h}H${x}Z`;
    const rrD = (x, y, w, h, r) => `M${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x + r}Q${x},${y + h} ${x},${y + h - r}V${y + r}Q${x},${y} ${x + r},${y}Z`;
    const polyD = (pts) => 'M' + pts.map((p) => `${p[0]},${p[1]}`).join('L') + 'Z';
    const circD = (cx, cy, r) => `M${cx - r},${cy}a${r},${r} 0 1 0 ${2 * r},0a${r},${r} 0 1 0 ${-2 * r},0`;
    const fill = (g, d, color, extra = {}) => S('path', { d, fill: color, ...extra }, g);
    // Key line: a variable-width ribbon, heavier on the side away from the light.
    const key = (g, d, w = 6, extra = {}) => {
      S('path', { d, fill: 'none', stroke: KEY, 'stroke-width': w, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...extra }, g);
      S('path', { d, fill: 'none', stroke: KEY, 'stroke-width': (w * 0.62).toFixed(2), 'stroke-linejoin': 'round', 'stroke-linecap': 'round', transform: `translate(${(w * 0.34).toFixed(2)},${(w * 0.34).toFixed(2)})`, ...extra }, g);
    };

    /* ---------------- caption parsing (==x== marks the key number) ---------------- */
    const parseLine = (src) => {
      const s = String(src || '').replace(/~~|\(\(|\)\)|\^\^|\*/g, '');
      const segs = [];
      const re = /==(.+?)==/g;
      let last = 0, m;
      while ((m = re.exec(s))) {
        if (m.index > last) segs.push({ text: s.slice(last, m.index), em: false });
        segs.push({ text: m[1], em: true });
        last = re.lastIndex;
      }
      if (last < s.length) segs.push({ text: s.slice(last), em: false });
      const words = [];
      let cur = null;
      segs.forEach((sg) => sg.text.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { cur = null; return; }
        if (!cur) { cur = []; words.push(cur); }
        cur.push({ text: MT.typo(part), em: sg.em });
      }));
      return words;
    };
    const lines = (cap) => String(cap || '').split('|').map(parseLine).filter((w) => w.length);
    const splitEm = (words) => {
      const i = words.findIndex((w) => w.some((p) => p.em));
      if (i < 0) return { pre: words, em: null, post: [] };
      return { pre: words.slice(0, i), em: words[i], post: words.slice(i + 1) };
    };
    const wtext = (ws) => ws.map((w) => w.map((p) => p.text).join('')).join(' ');
    const nwords = (ws) => ws.length;
    const bare = (s) => String(s).replace(/[.:;!?,]+$/, '');
    const W1 = (text) => [[{ text, em: true }]];

    /* ---------------- type ---------------- */
    // Counter whose text only counts as readable once it has landed (Studio Films readcheck
    // times every distinct string; a rolling number is not meant to be read mid-roll).
    const live = (node, from, to, format = 'money') => {
      const c = MT.counter(node, { from, to, format });
      node.dataset.role = 'display';
      MT.after(() => { node.dataset.role = Math.abs(c.proxy.v - to) < 0.5 ? 'display' : 'label'; });
      return c;
    };
    /* Headline: words printed as one condensed line, fitted to width. o.counter(text) may
       return {from, to, format} to make an emphasised number count. */
    const headline = (parent, words, o) => {
      const box = MT.el('div', 'hl abs', parent);
      box.dataset.role = 'display';
      box.style.left = o.x + 'px'; box.style.top = o.y + 'px';
      box.style.setProperty('--fill', o.fill);
      box.style.setProperty('--emc', o.em || o.fill);
      box.style.setProperty('--plate', o.plate);
      const spans = [], nums = [];
      words.forEach((w, i) => {
        if (i) box.appendChild(document.createTextNode(' '));
        const sp = MT.el('span', 'hw', box);
        if (o.qbg) { sp.classList.add('qbg'); sp.style.setProperty('--qbg', o.qbg); }
        w.forEach((p) => {
          if (p.em) {
            const e = MT.el('span', 'em num', sp, MT.esc(p.text));
            if (o.qbg) { e.classList.add('qbg'); e.style.setProperty('--qbg', o.qbg); }
            const c = o.counter ? o.counter(bare(p.text)) : null;
            if (c) nums.push({ node: e, ...c });
          } else sp.appendChild(document.createTextNode(p.text));
        });
        spans.push(sp);
      });
      let fs = o.size;
      box.style.fontSize = fs + 'px';
      for (let k = 0; k < 8 && box.scrollWidth > o.w; k++) { fs = Math.max(o.min || 30, fs * (o.w / box.scrollWidth) * 0.995); box.style.fontSize = fs.toFixed(1) + 'px'; }
      if (box.scrollWidth > o.w + 1) warnings.push(`headline "${wtext(words)}" is wider than its box`);
      const sw = Math.max(2.5, fs * 0.034), off = Math.max(4, Math.round(fs * 0.045));
      box.style.setProperty('--sw', sw.toFixed(1) + 'px');
      spans.forEach((sp) => { sp.style.setProperty('--sx', off + 'px'); sp.style.setProperty('--sy', off + 'px'); });
      if (o.align === 'center') box.style.left = (o.x + (o.w - box.scrollWidth) / 2) + 'px';
      if (o.align === 'right') box.style.left = (o.x + o.w - box.scrollWidth) + 'px';
      const counters = nums.map((n) => ({ ...n, c: live(n.node, n.from, n.to, n.format) }));
      return { box, spans, fs, off, counters, h: box.offsetHeight, w: box.scrollWidth, words: nwords(words), text: wtext(words) };
    };
    const hideH = (H, at = 0) => tl.set(H.spans, { opacity: 0, scale: 1, '--sx': H.off + 'px', '--sy': H.off + 'px' }, at);
    const showH = (H, at = 0, k = 1) => tl.set(H.spans, { opacity: 1, scale: 1, '--sx': H.off * k + 'px', '--sy': H.off * k + 'px' }, at);
    // Printed in: each word lands from a step back with its colour plate off-register, then
    // the plate slides into register (a thunk per word).
    const printIn = (H, at, o = {}) => {
      const per = o.per ?? 0.085;
      H.spans.forEach((sp, i) => {
        const t = at + i * per;
        tl.set(sp, { opacity: 1 }, t);
        tl.fromTo(sp, { scale: 1.16, '--sx': H.off * 3.4 + 'px', '--sy': H.off * 2.4 + 'px' }, { scale: 1, '--sx': H.off + 'px', '--sy': H.off + 'px', duration: 0.28, ease: 'power3.out', ...IR }, t);
        cue(t, 'thud', o.gain ?? 0.28);
      });
      return at + (H.spans.length - 1) * per + 0.28;
    };
    // A plate jumps out of register and settles back (a misregistration kick).
    const kick = (H, at, k = 3) => {
      tl.fromTo(H.spans, { '--sx': H.off + 'px', '--sy': H.off + 'px' }, { '--sx': H.off * k + 'px', '--sy': -H.off * 0.6 + 'px', duration: 0.05, ease: 'none', ...IR }, at);
      tl.fromTo(H.spans, { '--sx': H.off * k + 'px', '--sy': -H.off * 0.6 + 'px' }, { '--sx': H.off + 'px', '--sy': H.off + 'px', duration: 0.32, ease: 'back.out(2.2)', ...IR }, at + 0.05);
    };
    const slip = (parent, text, o) => {
      const s = MT.el('div', 'slip abs', parent, MT.esc(MT.typo(text)));
      s.dataset.role = o.role || 'display';
      s.style.left = o.x + 'px'; s.style.top = o.y + 'px'; s.style.fontSize = o.size + 'px';
      return s;
    };
    const printSlip = (s, at, rot) => {
      tl.set(s, { opacity: 1 }, at);
      tl.fromTo(s, { scale: 1.14, rotation: rot * 2.2, '--bx': '28px' }, { scale: 1, rotation: rot, '--bx': '12px', duration: 0.3, ease: 'power3.out', ...IR }, at);
      cue(at, 'swish', 0.5); cue(at + 0.2, 'thud', 0.3);
      return at + 0.3;
    };
    const ptext = (parent, cls, x, y, html, o = {}) => {
      const e = MT.el('div', `pt abs ${cls}`, parent, html);
      e.style.left = x + 'px'; e.style.top = y + 'px';
      if (o.size) e.style.fontSize = o.size + 'px';
      if (o.color) e.style.color = o.color;
      if (o.qbg) { e.classList.add('qbg'); e.style.setProperty('--qbg', o.qbg); }
      e.dataset.role = o.role || 'display';
      return e;
    };
    const shake = (el, at, amp = 12, n = 6, step = 0.045) => {
      let x = 0;
      for (let i = 0; i < n; i++) {
        const nx = i === n - 1 ? 0 : (i % 2 ? 1 : -1) * amp * (1 - i / n);
        tl.fromTo(el, { x }, { x: nx, duration: step, ease: 'sine.inOut', ...IR }, at + i * step);
        x = nx;
      }
    };
    const ticks = (from, to, n, gain = 0.3) => { for (let i = 0; i < n; i++) cue(from + ((to - from) * i) / Math.max(1, n - 1), 'tick', gain); };

    /* ---------------- props: printed objects in their own page space ---------------- */
    // outer div (animated) > inner div (static scale) > svg layers (back, fill, key) + text
    const mkProp = (parent, w, h, x, y, s) => {
      const el = MT.el('div', 'prop', parent);
      el.style.left = x + 'px'; el.style.top = y + 'px';
      el.style.width = (w * s) + 'px'; el.style.height = (h * s) + 'px';
      const inner = MT.el('div', 'abs', el);
      inner.style.left = '0px'; inner.style.top = '0px'; inner.style.width = w + 'px'; inner.style.height = h + 'px';
      inner.style.transform = `scale(${s})`; inner.style.transformOrigin = '0 0';
      const svg = S('svg', { class: 'pv', width: w, height: h, viewBox: `0 0 ${w} ${h}` }, inner);
      const back = S('g', {}, svg), fillG = S('g', {}, svg), keyG = S('g', {}, svg);
      const reg = { x: Math.round((rr() - 0.5) * 10), y: Math.round((rr() - 0.5) * 8) };
      return { el, inner, svg, back, fill: fillG, key: keyG, w, h, x, y, s, reg, cx: x + (w * s) / 2, cy: y + (h * s) / 2 };
    };
    const regSet = (P, at = 0, k = 0) => tl.set(P.fill, { x: P.reg.x + 26 * k, y: P.reg.y - 18 * k }, at);
    const regIn = (P, at, dur = 0.42, k = 1) => tl.fromTo(P.fill, { x: P.reg.x + 26 * k, y: P.reg.y - 18 * k }, { x: P.reg.x, y: P.reg.y, duration: dur, ease: 'power3.out', ...IR }, at);

    /* HELOC statement: paper sheet with a dog-ear, a coloured header band with a house mark,
       ledger rows. Carries a label and a big number (and optionally payment ticks). */
    const statement = (parent, o) => {
      const { w, h } = o;
      const P = mkProp(parent, w, h, o.x, o.y, o.s);
      const ear = Math.round(w * 0.07), band = Math.round(h * 0.17);
      fill(P.back, polyD([[16, 16], [w - ear + 16, 16], [w + 16, ear + 16], [w + 16, h + 16], [16, h + 16]]), pattern(o.shadow, 0.5, 12));
      const sheet = polyD([[0, 0], [w - ear, 0], [w, ear], [w, h], [0, h]]);
      fill(P.fill, sheet, PAP);
      fill(P.fill, rectD(0, 0, w - ear, band), o.band);
      fill(P.fill, polyD([[w - ear, 0], [w - ear, ear], [w, ear]]), pattern(o.band, 0.42, 9, PAP));
      // house mark + text bars in the band
      const hx = 24, hy = Math.round(band * 0.18), hs = Math.round(band * 0.64);
      const house = polyD([[hx, hy + hs * 0.48], [hx + hs * 0.5, hy], [hx + hs, hy + hs * 0.48], [hx + hs, hy + hs], [hx, hy + hs]]);
      fill(P.fill, house, PAP);
      fill(P.fill, rectD(hx + hs + 24, hy + 4, w * 0.24, hs * 0.22), PAP);
      fill(P.fill, rectD(hx + hs + 24, hy + hs * 0.56, w * 0.15, hs * 0.22), PAP);
      fill(P.fill, rectD(w - ear - w * 0.2 - 20, hy + hs * 0.3, w * 0.2, hs * 0.3), PAP);
      key(P.key, house, 4);
      key(P.key, `M0,${band}H${w - ear}`, 5);
      key(P.key, polyD([[w - ear, 0], [w - ear, ear], [w, ear]]), 4);
      key(P.key, sheet, 7);
      // ledger rows (bottom)
      if (o.rows) for (let i = 0; i < 2; i++) S('path', { d: `M28,${h - 30 - i * 18}H${w - 28}`, stroke: KEY, 'stroke-width': 3, 'stroke-dasharray': i ? '4 10' : 'none' }, P.key);
      // label + number
      const lab = ptext(P.inner, 'pt-l', 30, band + Math.round(h * 0.05), MT.esc(o.label || ''), { size: o.labelSize, color: KEY, qbg: PAP });
      const labH = o.label ? o.labelSize * 1.0 : 0;
      const numY = band + Math.round(h * 0.05) + labH + Math.round(h * 0.03);
      const tickTop = o.ticks ? h - Math.min(34, (w - 60) / o.ticks - 10) - 22 : h - (o.rows ? 52 : 18);
      const numMax = Math.min(o.numSize, (tickTop - numY - 12) / 1.1);
      const N = headline(P.inner, o.number, { x: 26, y: numY, w: w - 70, size: numMax, fill: o.numFill, em: o.numFill, plate: o.plate, qbg: PAP, counter: o.counter });
      // payment ticks
      const tk = [];
      if (o.ticks) {
        const n = o.ticks, size = Math.min(34, (w - 60) / n - 10), gap = (w - 60 - n * size) / (n - 1);
        const ty = h - size - 22;
        for (let i = 0; i < n; i++) {
          const g = S('g', {}, P.svg);
          const x = 30 + i * (size + gap);
          fill(g, rectD(x + 3, ty - 2, size, size), o.tick);
          key(g, rectD(x, ty, size, size), 3.5);
          tk.push(g);
        }
      }
      return { P, lab, N, ticks: tk };
    };

    /* Cash register: display casing with a paper window (the counter), body with keys and a
       drawer, overprinted dot shading on the side away from the light. */
    const register = (parent, o) => {
      const w = 540, h = 440;
      const P = mkProp(parent, w, h, o.x, o.y, o.s);
      const body = o.body;
      fill(P.back, polyD([[36, 248], [534, 248], [556, 456], [16, 456]]), pattern(o.shadow, 0.5, 12));
      const casing = rrD(40, 0, 460, 212, 12);
      fill(P.fill, casing, body);
      fill(P.fill, rectD(232, 212, 76, 24), body);
      const bodyD = polyD([[22, 234], [518, 234], [540, 440], [0, 440]]);
      fill(P.fill, bodyD, body);
      fill(P.fill, polyD([[350, 234], [518, 234], [540, 440], [372, 440]]), pattern(o.shade, 0.42, 11));
      fill(P.fill, polyD([[392, 14], [486, 14], [486, 198], [392, 198]]), pattern(o.shade, 0.3, 11));
      const drawer = rectD(36, 388, 468, 40);
      fill(P.fill, drawer, o.drawer);
      key(P.key, casing, 7);
      key(P.key, rectD(232, 212, 76, 24), 5);
      key(P.key, bodyD, 7);
      key(P.key, drawer, 5);
      key(P.key, `M230,408H310`, 6);
      const keysG = [];
      for (let i = 0; i < 5; i++) {
        const cx = 76 + i * 97, cy = 340;
        const g = S('g', {}, P.svg);
        fill(g, circD(cx + 2, cy + 2, 21), PAP);
        key(g, circD(cx, cy, 21), 4);
        keysG.push(g);
      }
      // the window: real paper, a key frame
      const win = MT.el('div', 'window', P.inner);
      Object.assign(win.style, { left: '60px', top: '18px', width: '420px', height: '176px' });
      return { P, win, keys: keysG, suffixAt: { x: 34, y: 250 }, w, h };
    };

    /* Receipt: paper strip with a torn zigzag foot, perforation, the delta and the note. */
    const receipt = (parent, o) => {
      const w = 310, h = 420;
      const P = mkProp(parent, w, h, o.x, o.y, o.s);
      const teeth = 10, tw = w / teeth;
      const pts = [[0, 0], [w, 0], [w, h - 18]];
      for (let i = 0; i < teeth; i++) { pts.push([w - (i + 0.5) * tw, h]); pts.push([w - (i + 1) * tw, h - 18]); }
      const d = polyD(pts);
      fill(P.back, d, pattern(o.shadow, 0.5, 12), { transform: 'translate(14,14)' });
      fill(P.fill, d, PAP);
      key(P.key, d, 6);
      S('path', { d: `M18,168H${w - 18}`, stroke: KEY, 'stroke-width': 4, 'stroke-dasharray': '10 9' }, P.key);
      return { P, w, h };
    };

    /* One payment print for the wall: a paper frame, an inner plate, a dot band, the amount. */
    const tile = (parent, o) => {
      const w = 200, h = 124;
      const P = mkProp(parent, w, h, o.x, o.y, o.s);
      fill(P.back, rectD(10, 10, w, h), pattern(o.shadow, 0.55, 10));
      fill(P.fill, rectD(0, 0, w, h), PAP);
      fill(P.fill, rectD(12, 12, w - 24, h - 24), o.plate);
      fill(P.fill, rectD(12, h - 34, w - 24, 22), pattern(o.shade, 0.45, 8));
      key(P.key, rectD(0, 0, w, h), 5);
      key(P.key, rectD(12, 12, w - 24, h - 24), 3);
      const N = headline(P.inner, o.number, { x: 20, y: 0, w: w - 40, size: 74, fill: o.text, em: o.text, plate: o.tplate, qbg: o.plate });
      N.box.style.top = ((h - 22 - N.h) / 2 + 4) + 'px';
      N.box.style.left = ((w - N.w) / 2) + 'px';
      return { P, N, w, h };
    };

    /* Wallet: back panel, the bill (slides out with the extra), front pocket with stitching,
       a strap with a snap. */
    const wallet = (parent, o) => {
      const w = 380, h = 340;
      const el = MT.el('div', 'prop', parent);
      el.style.left = o.x + 'px'; el.style.top = o.y + 'px'; el.style.width = (w * o.s) + 'px'; el.style.height = (h * o.s) + 'px';
      const inner = MT.el('div', 'abs', el);
      Object.assign(inner.style, { left: '0px', top: '0px', width: w + 'px', height: h + 'px', transform: `scale(${o.s})`, transformOrigin: '0 0' });
      const reg = { x: Math.round((rr() - 0.5) * 10), y: Math.round((rr() - 0.5) * 8) };
      const layer3 = (cls) => { const s = S('svg', { class: 'pv', width: w, height: h, viewBox: `0 0 ${w} ${h}` }, inner); const b = S('g', {}, s), f = S('g', {}, s), k = S('g', {}, s); return { s, back: b, fill: f, key: k }; };
      const back = layer3();
      const panel = rrD(0, 64, w, 276, 30);
      fill(back.back, rrD(14, 78, w, 276, 30), pattern(o.shadow, 0.5, 12));
      fill(back.fill, panel, o.body);
      key(back.key, panel, 7);
      // bill
      const bill = MT.el('div', 'abs', inner);
      Object.assign(bill.style, { left: '0px', top: '0px', width: w + 'px', height: '200px' });
      const bs = S('svg', { class: 'pv', width: w, height: 200, viewBox: `0 0 ${w} 200` }, bill);
      const bf = S('g', {}, bs), bk = S('g', {}, bs);
      const note = rectD(36, 0, w - 72, 190);
      fill(bf, note, o.bill);
      fill(bf, rectD(36, 150, w - 72, 40), pattern(o.shade, 0.4, 9));
      const oval = `M${w / 2 - 118},88a118,62 0 1 0 236,0a118,62 0 1 0 -236,0`;
      fill(bf, oval, PAP);
      key(bk, note, 6);
      key(bk, oval, 4);
      [[62, 26], [w - 62, 26]].forEach(([cx, cy]) => { fill(bf, circD(cx, cy, 11), PAP); key(bk, circD(cx, cy, 11), 3); });
      const N = headline(bill, o.number, { x: 0, y: 0, w: 200, size: 92, fill: KEY, em: KEY, plate: o.tplate, qbg: PAP });
      N.box.style.left = ((w - N.w) / 2) + 'px';
      N.box.style.top = (88 - N.h / 2 + 2) + 'px';
      // front pocket
      const front = layer3();
      const pocket = rrD(0, 150, w, 190, 30);
      fill(front.fill, pocket, o.body);
      fill(front.fill, rrD(0, 262, w, 78, 30), pattern(o.shade, 0.42, 11));
      S('path', { d: rrD(18, 168, w - 36, 154, 20), fill: 'none', stroke: PAP, 'stroke-width': 4, 'stroke-dasharray': '12 10' }, front.fill);
      key(front.key, pocket, 7);
      const strap = rrD(250, 196, 150, 86, 34);
      fill(front.fill, strap, o.strap);
      key(front.key, strap, 6);
      fill(front.fill, circD(360, 239, 16), PAP);
      key(front.key, circD(360, 239, 16), 4);
      return { el, inner, bill, billN: N, back, front, reg, w, h, s: o.s, x: o.x, y: o.y };
    };

    /* ---------------- set: scenes, chrome ---------------- */
    const scene = (name, ground) => {
      const s = MT.el('div', `scene sc-${name}`, layer);
      s.style.backgroundColor = ground;
      const cam = MT.el('div', 'cam', s);
      const bg = S('svg', { class: 'pv', width: 1080, height: 1920, viewBox: '0 0 1080 1920' }, cam);
      return { s, cam, bg, ground };
    };
    const ch = MT.chrome(stage, { series: M.series, tag: M.tag, fine: M.fine });
    const chromeBottom = ch.top.getBoundingClientRect().bottom - stage.getBoundingClientRect().top;
    const footTop = ch.foot.getBoundingClientRect().top - stage.getBoundingClientRect().top;
    const X0 = M.safe.x0 + 30, X1 = M.safe.x1 - 30, CW = X1 - X0;
    const ZT = Math.round(chromeBottom + 30);
    const ZB = Math.round(footTop - 30);
    if (ZB - ZT < 600) warnings.push(`content area is only ${ZB - ZT}px tall (long fine line?)`);
    const unit = stack.unit, nPay = stack.n;

    /* ================= HOOK ================= */
    const sH = scene('hook', G.hook);
    dotField(sH.bg, { color: P1, dens: (x, y) => Math.max(clamp01((y - 1010) / 760) * 0.62, clamp01(1 - Math.hypot(1080 - x, y - 40) / 470) * 0.5, clamp01(1 - Math.hypot(x + 40, y - 1240) / 520) * 0.45) });
    const hookCap = lines(hk.caption || `${hk.sticker || money(hk.paid)}|${hk.label || 'Balance'} ==${money(hk.balance)}==`);
    const hookSplit = hookCap[1] ? splitEm(hookCap[1]) : { pre: parseLine(hk.label || 'Balance'), em: W1(money(hk.balance))[0], post: [] };
    let y = ZT + 6;
    // (story.hook.kicker is not part of this template's data: byClient merges objects, so a
    // base-story kicker would leak into every client's reel.)
    const hSlip = null;
    const hookLabel = hk.label || wtext(hookSplit.pre);
    y += 14;
    const hHead = headline(sH.cam, hookCap[0], { x: X0, y, w: CW, size: 200, fill: fillOn(G.hook), em: emOn(G.hook), plate: plateOn(G.hook) });
    y += hHead.h + 30;
    const stW = 860, stH = 430;
    const stS = Math.min(1, CW / (stW + 20), (ZB - y) / (stH + 16));
    const hookNum = [[...hookSplit.em, ...hookSplit.post.flat()]];
    const hSt = statement(sH.cam, {
      x: X0 + (CW - stW * stS) / 2 - 6, y, s: stS, w: stW, h: stH, band: P2, shadow: P2, plate: plateOn(PAP, [emOn(PAP)]),
      label: hookLabel, labelSize: 50, number: hookNum, numSize: 230, numFill: emOn(PAP), rows: false, ticks: nPay, tick: P1,
    });
    if (stS < 0.8) warnings.push(`hook statement scaled to ${stS.toFixed(2)}`);
    sH.cam.style.transformOrigin = `${hSt.P.cx}px ${hSt.P.cy}px`;

    /* ================= RISE ================= */
    const sR = scene('rise', G.rise);
    dotField(sR.bg, { color: ACC, dens: (x, y) => Math.max(clamp01((y - 1030) / 720 + (x - 540) / 2200) * 0.6, clamp01(1 - Math.hypot(x + 30, y - 80) / 430) * 0.45) });
    const riseCap = lines(rise.caption || `${rise.label || 'Interest only'}|==${money(rise.to)}== a month`);
    const riseSplit = riseCap[1] ? splitEm(riseCap[1]) : { pre: [], em: W1(money(rise.to))[0], post: parseLine('a month') };
    y = ZT + 6;
    let rSlip = null;
    if (rise.label && rise.caption) { rSlip = slip(sR.cam, rise.label, { x: X0 + 4, y, size: 40 }); y += rSlip.offsetHeight + 24; }
    const rHead = headline(sR.cam, riseCap[0], { x: X0, y, w: CW, size: 170, fill: fillOn(G.rise), em: emOn(G.rise), plate: plateOn(G.rise) });
    y += rHead.h + 34;
    const rS = Math.min(1, CW / (540 + 40 + 310), (ZB - y) / 456);
    const reg = register(sR.cam, { x: X0, y, s: rS, body: ACC, shade: P2, drawer: P2, shadow: P2 });
    const rcp = receipt(sR.cam, { x: X0 + (540 + 40) * rS, y: y + 8 * rS, s: rS, shadow: P2 });
    // register is printed above the receipt (the receipt slides out from behind it)
    sR.cam.appendChild(reg.P.el);
    // display counter
    const dispWords = [[...riseSplit.em]];
    const rDisp = headline(reg.win, dispWords, { x: 14, y: 0, w: 380, size: 150, fill: KEY, em: KEY, plate: plateOn(PAP, [ACC]), counter: (t) => (t === money(rise.to) ? { from: rise.from, to: rise.to } : null) });
    rDisp.box.style.top = ((164 - rDisp.h) / 2 + 2) + 'px';
    rDisp.box.style.left = ((408 - rDisp.w) / 2) + 'px';
    const rCnt = rDisp.counters[0] ? rDisp.counters[0].c : null;
    if (!rCnt) warnings.push('rise: the emphasised number in caption line 2 is not rise.to; it will not count');
    const suffixText = [wtext(riseSplit.pre), wtext(riseSplit.post)].filter(Boolean).join(' ');
    const rSuffix = suffixText ? ptext(reg.P.inner, 'pt-l', reg.suffixAt.x, reg.suffixAt.y, MT.esc(suffixText), { size: 46, color: fillOn(ACC), qbg: ACC }) : null;
    if (rSuffix && rSuffix.offsetWidth > 300) rSuffix.style.fontSize = (46 * 300 / rSuffix.offsetWidth).toFixed(1) + 'px';
    // receipt contents: delta, note
    const rDelta = headline(rcp.P.inner, [[{ text: String(rise.delta || money(rise.to - rise.from, { sign: true })), em: true }]], { x: 20, y: 22, w: 270, size: 140, fill: emOn(PAP), em: emOn(PAP), plate: plateOn(PAP, [emOn(PAP)]), qbg: PAP });
    rDelta.box.style.left = ((310 - rDelta.w) / 2) + 'px';
    const rNote = MT.el('div', 'note abs qbg', rcp.P.inner, MT.esc(MT.typo(rise.note || '')));
    rNote.dataset.role = 'display';
    Object.assign(rNote.style, { left: '22px', top: '186px', width: '266px', fontSize: '42px', color: KEY });
    rNote.style.setProperty('--qbg', PAP);
    for (let fs = 42; rNote.offsetHeight > 190 && fs > 28; fs -= 2) rNote.style.fontSize = fs + 'px';
    { // a printed barcode in the space left under the note
      const by0 = Math.max(186 + rNote.offsetHeight + 22, 300), by1 = 420 - 46;
      if (by1 - by0 >= 28) {
        let bx = 24, d = '';
        while (bx < 286) { const bw = 3 + Math.floor(rr() * 3) * 3; if (bx + bw > 286) break; d += rectD(bx, by0, bw, by1 - by0); bx += bw + 4 + Math.floor(rr() * 3) * 3; }
        S('path', { d, fill: KEY }, rcp.P.key);
      }
    }
    sR.cam.style.transformOrigin = `${rcp.P.x + 155 * rS}px ${rcp.P.y + 90 * rS}px`;

    /* ================= STACK (pattern interrupt) ================= */
    const sS = scene('stack', G.stack);
    const wallCam = MT.el('div', 'cam', sS.s);
    sS.s.insertBefore(wallCam, sS.cam.nextSibling);
    sS.cam.appendChild(sS.bg);
    // the ground is screened (paper holes) and the holes grow toward the edges: at the
    // zoomed-in start the dots are coin-sized
    const wallBg = S('svg', { class: 'pv', width: 1080, height: 1920, viewBox: '0 0 1080 1920' }, wallCam);
    dotField(wallBg, { color: PAP, cell: 20, dens: (x, y) => 0.12 + Math.max(clamp01((330 - y) / 330) * 0.4, clamp01((y - 1120) / 700) * 0.55) });
    const stackCap = lines(stack.caption || `${nPay} payments|Balance: ==${money(stack.balance)}==`);
    const stackSplit = stackCap[1] ? splitEm(stackCap[1]) : { pre: parseLine('Balance'), em: W1(money(stack.balance))[0], post: [] };
    // paid slip (top right): generic label + the running total
    const paidSlip = MT.el('div', 'slip abs', sS.s);
    paidSlip.dataset.role = 'label';
    paidSlip.style.fontSize = '26px';
    paidSlip.innerHTML = `<span class="pl">Paid</span> <span class="pvv num">${MT.esc(money(stack.total))}</span>`;
    const paidV = paidSlip.querySelector('.pvv');
    paidV.style.fontSize = '64px'; paidV.style.fontStretch = '70%'; paidV.style.verticalAlign = '-6px';
    paidSlip.querySelector('.pl').dataset.role = 'label';
    const paidCnt = live(paidV, 0, stack.total);
    paidSlip.style.top = (ZT + 8) + 'px';
    paidSlip.style.left = (X1 - paidSlip.offsetWidth - 8) + 'px';
    const sHead = headline(sS.s, stackCap[0], { x: X0, y: ZT + 6, w: CW - paidSlip.offsetWidth - 40, size: 160, fill: fillOn(G.stack), em: emOn(G.stack), plate: plateOn(G.stack) });
    // balance strip (bottom)
    const strip = MT.el('div', 'abs', sS.s);
    const stripH = 176;
    Object.assign(strip.style, { left: X0 + 'px', top: (ZB - stripH) + 'px', width: (CW - 12) + 'px', height: stripH + 'px', background: PAP, border: `6px solid ${KEY}`, boxShadow: `14px 14px 0 ${emOn(G.stack)}` });
    const stripLab = ptext(strip, 'pt-l', 22, 16, MT.esc(wtext(stackSplit.pre)), { size: 34, color: KEY, qbg: PAP });
    const stampText = MT.typo(stack.stamp || 'Unchanged');
    const stamp = MT.el('div', 'stamp abs qbg', strip, MT.esc(stampText));
    stamp.dataset.role = 'display';
    const stampC = emOn(PAP);
    Object.assign(stamp.style, { fontSize: '46px', color: stampC, fontStretch: '82%' });
    stamp.style.setProperty('--qbg', PAP);
    const stampW = stamp.offsetWidth;
    stamp.style.left = (CW - 12 - 12 - stampW - 18) + 'px';
    stamp.style.top = ((stripH - 12 - stamp.offsetHeight) / 2 + 4) + 'px';
    const sNum = headline(strip, [[...stackSplit.em, ...stackSplit.post.flat()]], { x: 20, y: 60, w: CW - 12 - 12 - stampW - 80, size: 120, fill: KEY, em: KEY, plate: plateOn(PAP, [stampC]), qbg: PAP });
    sNum.box.style.top = (stripH - 12 - sNum.h - 10) + 'px';
    // the wall of copies
    const wallTop = ZT + 6 + sHead.h + 34, wallBot = ZB - stripH - 34;
    const cols = nPay % 4 === 0 || nPay > 12 ? 4 : nPay % 3 === 0 ? 3 : 4;
    const rows = Math.ceil(nPay / cols);
    const gapK = 0.12;
    const tS = Math.min((CW - 10) / (cols * 200 + (cols - 1) * 200 * gapK), (wallBot - wallTop) / (rows * 124 + (rows - 1) * 124 * gapK + 10));
    const tw = 200 * tS, th = 124 * tS, gx = 200 * gapK * tS, gy = 124 * gapK * tS;
    const wallW = cols * tw + (cols - 1) * gx, wallH = rows * th + (rows - 1) * gy;
    const wx0 = X0 + (CW - wallW) / 2 - 5, wy0 = wallTop + (wallBot - wallTop - wallH) / 2;
    const tiles = [];
    for (let i = 0; i < nPay; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const T = tile(wallCam, { x: wx0 + c * (tw + gx), y: wy0 + r * (th + gy), s: tS, plate: ACC, shade: P1, shadow: P1, text: fillOn(ACC), tplate: plateOn(ACC), number: W1(money(unit)) });
      T.rot = (rr() - 0.5) * 3;
      tiles.push(T);
    }
    // stamp order: start at the copy nearest the wall's centre, then outward in rings
    const wcx = wx0 + wallW / 2, wcy = wy0 + wallH / 2;
    const order = tiles.map((T, i) => ({ i, d: Math.hypot(T.P.cx - wcx, T.P.cy - wcy) + i * 0.01 })).sort((a, b) => a.d - b.d).map((o) => o.i);
    const first = tiles[order[0]];
    wallCam.style.transformOrigin = `${first.P.cx}px ${first.P.cy}px`;
    sS.cam.style.transformOrigin = `540px ${ZB - stripH / 2}px`;

    /* ================= FIX ================= */
    const sF = scene('fix', G.fix);
    dotField(sF.bg, { color: ACC, dens: (x, y) => Math.max(clamp01((y - 1080) / 640) * 0.62, clamp01(1 - Math.hypot(1100 - x, y - 260) / 380) * 0.4) });
    const fixCap = lines(fix.caption || `${fix.label || 'Pay'} ==${money(fix.pay)}==|==${money(fix.off)}== off in a year`);
    y = ZT + 6;
    let fSlip = null;
    if (fix.label && fix.caption) { fSlip = slip(sF.cam, fix.label, { x: X0 + 4, y, size: 40 }); y += fSlip.offsetHeight + 24; }
    const fixCounter = (t) => (t === money(fix.pay) ? { from: unit, to: fix.pay } : t === money(fix.off) ? { from: 0, to: fix.off } : t === money(fix.balanceEnd) ? { from: stack.balance, to: fix.balanceEnd } : null);
    const fHead = headline(sF.cam, fixCap[0], { x: X0, y, w: CW, size: 170, fill: fillOn(G.fix), em: emOn(G.fix), plate: plateOn(G.fix, [emOn(G.fix)]), counter: fixCounter });
    y += fHead.h + 30;
    const fLine2 = fixCap[1] ? headline(sF.cam, fixCap[1], { x: X0, y: 0, w: CW, size: 150, fill: fillOn(G.fix), em: emOn(G.fix), plate: plateOn(G.fix, [emOn(G.fix)]), counter: fixCounter }) : null;
    const l2y = fLine2 ? ZB - fLine2.h : ZB;
    if (fLine2) fLine2.box.style.top = l2y + 'px';
    const fpTop = y, fpBot = l2y - 30;
    const fS = Math.min(1, CW / (380 + 34 + 520), (fpBot - fpTop) / 372);
    const wlt = wallet(sF.cam, { x: X0, y: fpTop + (fpBot - fpTop - 340 * fS) / 2 + 10 * fS, s: fS, body: P2, bill: ACC, shade: P2 === PROC.blue ? PROC.red : PROC.blue, strap: P1, shadow: P1, tplate: P1, number: W1(money(fix.extra ?? fix.pay - unit, { sign: true })) });
    const fSt = statement(sF.cam, {
      x: X0 + (380 + 34) * fS, y: fpTop + (fpBot - fpTop - 360 * fS) / 2, s: fS, w: 520, h: 360, band: P1, shadow: P2, plate: P1,
      label: 'Balance', labelSize: 40, number: W1(money(fix.balanceEnd)), numSize: 140, numFill: KEY, rows: true,
      counter: (t) => (t === money(fix.balanceEnd) ? { from: stack.balance, to: fix.balanceEnd } : null),
    });
    const fBalCnt = fSt.N.counters[0] ? fSt.N.counters[0].c : null;
    sF.cam.style.transformOrigin = `540px ${l2y}px`;
    const headCnt = fHead.counters[0] || null;
    const l2Cnt = fLine2 && fLine2.counters[0] ? fLine2.counters[0] : null;

    /* ---------------- per-scene look (chrome plate colour) ---------------- */
    const look = (k, at) => tl.set(stage, { '--slip-plate': plateOn(G[k]) }, at);

    /* ================= TIMELINE ================= */
    const scenes = [sH, sR, sS, sF];
    // t = 0 states
    scenes.forEach((sc, i) => tl.set(sc.s, { opacity: i === 0 ? 1 : 0, scale: 1, scaleX: 1, x: 0 }, 0));
    scenes.forEach((sc) => tl.set(sc.cam, { scale: 1 }, 0));
    look('hook', 0);
    // hook: frame 1 = the print just stamped, plates still sliding into register
    const hookT0 = (at) => {
      tl.set(sH.cam, { scale: 1.035 }, at);
      showH(hHead, at, 2.2);
      showH(hSt.N, at, 2.0);
      regSet(hSt.P, at, 0.7);
      if (hSlip) tl.set(hSlip, { opacity: 1, scale: 1, rotation: -2, '--bx': '24px' }, at);
      tl.set(hSt.ticks, { opacity: 0, scale: 1, transformOrigin: '50% 50%' }, at);
      tl.set(hSt.P.el, { x: 0 }, at);
    };
    hookT0(0);
    // rise
    if (rSlip) tl.set(rSlip, { opacity: 0 }, 0);
    hideH(rHead, 0);
    regSet(reg.P, 0, 1); regSet(rcp.P, 0, 0);
    if (rCnt) rCnt.set(tl, rise.from, 0);
    if (rSuffix) tl.set(rSuffix, { opacity: 0 }, 0);
    tl.set(rcp.P.el, { x: -(40 + 200) * rS, opacity: 0 }, 0);
    hideH(rDelta, 0);
    tl.set(reg.keys, { y: 0 }, 0);
    // stack
    tl.set(wallCam, { scale: 2.6 }, 0);
    tiles.forEach((T) => { tl.set(T.P.el, { opacity: 0, scale: 1, rotation: T.rot }, 0); regSet(T.P, 0, 0.9); });
    tl.set(paidSlip, { opacity: 0, rotation: 2 }, 0);
    paidCnt.set(tl, unit, 0);
    hideH(sHead, 0);
    tl.set(strip, { opacity: 0, x: 0, rotation: -1 }, 0);
    hideH(sNum, 0);
    tl.set(stripLab, { opacity: 0 }, 0);
    tl.set(stamp, { opacity: 0, scale: 2.2, rotation: -16 }, 0);
    // fix
    if (fSlip) tl.set(fSlip, { opacity: 0 }, 0);
    hideH(fHead, 0);
    if (headCnt) headCnt.c.set(tl, headCnt.from, 0);
    if (fLine2) hideH(fLine2, 0);
    if (l2Cnt) l2Cnt.c.set(tl, l2Cnt.from, 0);
    tl.set(wlt.bill, { y: 130 }, 0);
    tl.set(wlt.billN.box, { opacity: 0 }, 0);
    regSet(fSt.P, 0, 0);
    if (fBalCnt) fBalCnt.set(tl, stack.balance, 0);
    tl.set(fSt.lab, { opacity: 0 }, 0);
    hideH(fSt.N, 0);

    const flip = (from, to, at) => {
      cue(at, 'click', 0.8); cue(at + 0.02, 'whoosh-short', 0.45);
      tl.fromTo(from.s, { scaleX: 1 }, { scaleX: 0, duration: 0.13, ease: 'power2.in', ...IR }, at);
      tl.set(from.s, { opacity: 0 }, at + 0.13);
      tl.set(to.s, { opacity: 1 }, at + 0.13);
      tl.fromTo(to.s, { scaleX: 0 }, { scaleX: 1, duration: 0.17, ease: 'power2.out', ...IR }, at + 0.13);
      return at + 0.3;
    };

    /* ---- HOOK ---- */
    keyframes.push({ t: 0, name: 'frame 1 (hook)' });
    cue(0, 'stamp', 0.85); cue(0.02, 'thud', 0.5);
    tl.fromTo(sH.cam, { scale: 1.035 }, { scale: 1, duration: 0.6, ease: 'expo.out', ...IR }, 0);
    hHead.spans.forEach((sp, i) => tl.fromTo(sp, { '--sx': hHead.off * 2.2 + 'px', '--sy': hHead.off * 2.2 + 'px' }, { '--sx': hHead.off + 'px', '--sy': hHead.off + 'px', duration: 0.42, ease: 'power3.out', ...IR }, 0.02 + i * 0.05));
    tl.fromTo(hSt.N.spans, { '--sx': hSt.N.off * 2.0 + 'px', '--sy': hSt.N.off * 2.0 + 'px' }, { '--sx': hSt.N.off + 'px', '--sy': hSt.N.off + 'px', duration: 0.5, ease: 'power3.out', ...IR }, 0.1);
    regIn(hSt.P, 0.04, 0.5, 0.7);
    if (hSlip) tl.fromTo(hSlip, { '--bx': '24px' }, { '--bx': '12px', duration: 0.4, ease: 'power3.out', ...IR }, 0.06);
    cue(0.12, 'thud', 0.3);
    // payment ticks stamped onto the statement, one per payment
    const tk0 = 0.9;
    hSt.ticks.forEach((g, i) => {
      const t = tk0 + i * 0.075;
      tl.set(g, { opacity: 1 }, t);
      tl.fromTo(g, { scale: 1.8 }, { scale: 1, duration: 0.12, ease: 'power3.in', ...IR }, t);
      cue(t + 0.1, 'tick', 0.32);
    });
    const tkEnd = tk0 + (hSt.ticks.length - 1) * 0.075 + 0.12;
    keyframes.push({ t: +(tkEnd + 0.15).toFixed(3), name: 'hook settled' });
    // misregistration kick on the balance, then a slow push
    const kT = Math.max(2.0, tkEnd + 0.35);
    kick(hSt.N, kT, 3.2);
    tl.fromTo(hSt.P.fill, { x: hSt.P.reg.x, y: hSt.P.reg.y }, { x: hSt.P.reg.x + 12, y: hSt.P.reg.y - 7, duration: 0.05, ease: 'none', ...IR }, kT);
    tl.fromTo(hSt.P.fill, { x: hSt.P.reg.x + 12, y: hSt.P.reg.y - 7 }, { x: hSt.P.reg.x, y: hSt.P.reg.y, duration: 0.32, ease: 'back.out(2)', ...IR }, kT + 0.05);
    shake(hSt.P.el, kT, 7, 5, 0.04);
    cue(kT, 'thud', 0.55); cue(kT + 0.01, 'glitch', 0.2);
    const hookOut = kT + 1.0;
    tl.fromTo(sH.cam, { scale: 1 }, { scale: 1.045, duration: hookOut - (kT + 0.15), ease: 'sine.inOut', ...IR }, kT + 0.15);
    holds.push({ name: 'hook', words: hHead.words + MT.wordCount(hookLabel) + 1, start: 0, end: hookOut });

    /* ---- RISE: stamped over the hook ---- */
    let c = hookOut;
    tl.set(sR.s, { opacity: 1 }, c);
    tl.fromTo(sR.s, { scale: 1.09 }, { scale: 1, duration: 0.18, ease: 'power4.in', ...IR }, c);
    tl.set(sH.s, { opacity: 0 }, c + 0.18);
    look('rise', c + 0.18);
    cue(c - 0.05, 'whoosh-short', 0.5); cue(c + 0.16, 'stamp', 0.9);
    regIn(reg.P, c + 0.18, 0.4, 1);
    let t1 = c + 0.36;
    if (rSlip) t1 = printSlip(rSlip, t1, -2) - 0.12;
    const rHeadEnd = printIn(rHead, t1);
    if (rSuffix) { tl.set(rSuffix, { opacity: 1 }, rHeadEnd); cue(rHeadEnd, 'pop', 0.4); }
    const cnt0 = rHeadEnd + 0.12;
    if (rCnt) { rCnt.run(tl, rise.from, rise.to, cnt0, 0.85, 'power2.inOut'); ticks(cnt0, cnt0 + 0.8, 8, 0.32); }
    tl.fromTo(reg.keys, { y: 0 }, { y: 5, duration: 0.06, ease: 'none', stagger: 0.09, yoyo: true, repeat: 1, ...IR }, cnt0);
    const cash = cnt0 + 0.85;
    cue(cash, 'cash', 0.85);
    // receipt slides out from behind the register
    const rcpIn = cash - 0.2;
    tl.set(rcp.P.el, { opacity: 1 }, rcpIn);
    tl.fromTo(rcp.P.el, { x: -(40 + 200) * rS }, { x: 0, duration: 0.4, ease: 'power3.out', ...IR }, rcpIn);
    cue(rcpIn, 'paper', 0.7);
    // the delta is rubber-stamped onto the receipt
    const dT = rcpIn + 0.55;
    tl.set(rDelta.spans, { opacity: 1 }, dT);
    tl.fromTo(rDelta.spans, { scale: 1.6, '--sx': rDelta.off * 4 + 'px', '--sy': rDelta.off * 3 + 'px' }, { scale: 1, '--sx': rDelta.off + 'px', '--sy': rDelta.off + 'px', duration: 0.17, ease: 'power4.in', ...IR }, dT);
    cue(dT + 0.15, 'stamp', 0.75);
    shake(rcp.P.el, dT + 0.17, 5, 4, 0.04);
    keyframes.push({ t: +(dT + 0.7).toFixed(3), name: 'rise' });
    // later: plate kick on the delta, slow push into the receipt
    const riseOut = Math.max(c + 4.2, rcpIn + 2.9);
    kick(rDelta, dT + 1.25, 3);
    cue(dT + 1.25, 'thud', 0.4);
    tl.fromTo(sR.cam, { scale: 1 }, { scale: 1.05, duration: riseOut - 0.25 - (dT + 1.3), ease: 'sine.inOut', ...IR }, dT + 1.3);
    holds.push({ name: 'rise: headline + display', words: rHead.words + 1 + (suffixText ? MT.wordCount(suffixText) : 0) + (rSlip ? MT.wordCount(rise.label) : 0), start: cash, end: riseOut });
    holds.push({ name: 'rise: receipt (delta + note)', words: 1 + MT.wordCount(rise.note || ''), start: rcpIn + 0.4, end: riseOut });

    /* ---- STACK: push into the receipt, cut to one print at coin-sized dots ---- */
    c = riseOut;
    tl.fromTo(sR.cam, { scale: 1.05 }, { scale: 2.6, duration: 0.25, ease: 'power3.in', ...IR }, c - 0.25);
    cue(c - 0.3, 'whoosh', 0.9);
    tl.set(sR.s, { opacity: 0 }, c);
    tl.set(sS.s, { opacity: 1 }, c);
    look('stack', c);
    keyframes.push({ t: +(c + 0.12).toFixed(3), name: 'pattern interrupt (dot pull)' });
    const firstT = c;
    tl.set(first.P.el, { opacity: 1 }, firstT);
    tl.fromTo(first.P.el, { scale: 1.25 }, { scale: 1, duration: 0.14, ease: 'power4.in', ...IR }, firstT);
    regIn(first.P, firstT, 0.3, 0.8);
    cue(firstT + 0.12, 'stamp', 0.95);
    // the pull: logarithmic-feeling zoom from inside the dots to the whole wall
    const pull0 = c + 0.32, pullD = 1.25;
    tl.fromTo(wallCam, { scale: 2.6 }, { scale: 1, duration: pullD, ease: 'expo.inOut', ...IR }, pull0);
    cue(pull0 + 0.1, 'whoosh', 0.45);
    // copies stamped in rings, faster and faster
    // a copy is only stamped once the pull has brought it (at its stamp size) inside the safe zone
    const pe = gsap.parseEase('expo.inOut');
    const camS = (t) => (t <= pull0 ? 2.6 : t >= pull0 + pullD ? 1 : 2.6 - 1.6 * pe((t - pull0) / pullD));
    const ox = first.P.cx, oy = first.P.cy, SF = M.safe;
    const tIn = (T) => {
      const pad = (1.32 - 1) / 2, tw0 = T.w * T.P.s, th0 = T.h * T.P.s;
      const bx0 = T.P.x - tw0 * pad, bx1 = T.P.x + tw0 * (1 + pad), by0 = T.P.y - th0 * pad, by1 = T.P.y + th0 * (1 + pad);
      for (let t = pull0; t <= pull0 + pullD + 1e-6; t += 1 / 120) {
        const k = camS(t);
        if (ox + (bx0 - ox) * k >= SF.x0 + 4 && ox + (bx1 - ox) * k <= SF.x1 - 4 && oy + (by0 - oy) * k >= SF.y0 + 4 && oy + (by1 - oy) * k <= SF.y1 - 4) return t;
      }
      return pull0 + pullD;
    };
    let ts = c + 0.42, dt = 0.2;
    const landed = [firstT + 0.14];
    order.slice(1).forEach((idx, k) => {
      const T = tiles[idx];
      ts = Math.max(ts, tIn(T));
      tl.set(T.P.el, { opacity: 1 }, ts);
      tl.fromTo(T.P.el, { scale: 1.32 }, { scale: 1, duration: 0.13, ease: 'power4.in', ...IR }, ts);
      regIn(T.P, ts, 0.26, 0.9);
      cue(ts + 0.12, k % 2 ? 'tick' : 'pop', k % 2 ? 0.34 : 0.3);
      landed.push(ts + 0.13);
      ts += dt;
      dt = Math.max(0.055, dt * 0.84);
    });
    const wallDone = Math.max(ts, pull0 + pullD);
    // the paid total climbs one payment per landed copy
    const paidIn = c + 0.36;
    tl.set(paidSlip, { opacity: 1 }, paidIn);
    tl.fromTo(paidSlip, { scale: 1.14, '--bx': '26px' }, { scale: 1, '--bx': '12px', duration: 0.3, ease: 'power3.out', ...IR }, paidIn);
    cue(paidIn, 'swish', 0.4);
    landed.slice(1).forEach((tt, k) => tl.fromTo(paidCnt.proxy, { v: unit * (k + 1) }, { v: unit * (k + 2), duration: 0.05, ease: 'none', ...IR }, Math.max(tt, paidIn + 0.05)));
    const sHeadEnd = printIn(sHead, wallDone - 0.15);
    // balance strip printed; the number will not move
    const stripT = sHeadEnd + 0.15;
    tl.set(strip, { opacity: 1 }, stripT);
    tl.fromTo(strip, { scale: 1.06, y: 16 }, { scale: 1, y: 0, duration: 0.24, ease: 'power3.out', ...IR }, stripT);
    tl.set(stripLab, { opacity: 1 }, stripT);
    cue(stripT, 'swish', 0.45);
    const sNumEnd = printIn(sNum, stripT + 0.12, { gain: 0.4 });
    const refuse = sNumEnd + 0.45;
    shake(sNum.box, refuse, 14, 7);
    cue(refuse, 'glitch', 0.45);
    const stT = refuse + 0.36;
    tl.set(stamp, { opacity: 1 }, stT);
    tl.fromTo(stamp, { scale: 2.2, rotation: -16 }, { scale: 1, rotation: -7, duration: 0.17, ease: 'power4.in', ...IR }, stT);
    shake(sS.s, stT + 0.17, 8, 5, 0.04);
    cue(stT + 0.15, 'stamp', 1.0);
    keyframes.push({ t: +(stT + 0.6).toFixed(3), name: 'stack' });
    const stackOut = stT + 0.17 + Math.max(2.2, 1.6 + stampText.replace(/\s/g, '').length / 15 + 0.05);
    tl.fromTo(wallCam, { scale: 1 }, { scale: 1.035, duration: stackOut - (stT + 0.5), ease: 'sine.inOut', ...IR }, stT + 0.5);
    tl.fromTo(stamp, { x: 0, y: 0 }, { x: 6, y: -4, duration: 0.05, ease: 'none', ...IR }, stT + 1.3);
    tl.fromTo(stamp, { x: 6, y: -4 }, { x: 0, y: 0, duration: 0.3, ease: 'back.out(2)', ...IR }, stT + 1.35);
    cue(stT + 1.3, 'thud', 0.35);
    holds.push({ name: 'stack: headline + paid', words: sHead.words + 2, start: sHeadEnd, end: stackOut });
    holds.push({ name: 'stack: balance + stamp', words: nwords(stackSplit.pre) + 1 + MT.wordCount(stampText), start: stT + 0.17, end: stackOut });

    /* ---- FIX: card flip to paper ---- */
    c = flip(sS, sF, stackOut);
    look('fix', stackOut + 0.13);
    let t2 = c + 0.04;
    if (fSlip) t2 = printSlip(fSlip, t2, -2) - 0.12;
    const fHeadEnd = printIn(fHead, t2);
    if (headCnt) { headCnt.c.run(tl, headCnt.from, headCnt.to, fHeadEnd - 0.05, 0.6, 'power2.inOut'); ticks(fHeadEnd - 0.05, fHeadEnd + 0.5, 6, 0.3); }
    // the wallet pushes the extra out
    const billT = fHeadEnd + 0.45;
    tl.set(wlt.billN.box, { opacity: 1 }, billT);
    tl.fromTo(wlt.bill, { y: 130 }, { y: -44, duration: 0.36, ease: 'back.out(1.6)', ...IR }, billT);
    cue(billT, 'paper', 0.65); cue(billT + 0.04, 'swish', 0.35);
    // statement balance counts down
    const balT = billT + 0.35;
    tl.set(fSt.lab, { opacity: 1 }, balT - 0.1);
    showH(fSt.N, balT - 0.1);
    regIn(fSt.P, balT - 0.1, 0.3, 0.8);
    cue(balT - 0.1, 'thud', 0.35);
    if (fBalCnt) { fBalCnt.run(tl, stack.balance, fix.balanceEnd, balT, 0.95, 'power2.inOut'); ticks(balT, balT + 0.9, 8, 0.28); }
    // paydown line printed
    const l2T = balT + 1.0;
    let l2End = l2T;
    if (fLine2) {
      l2End = printIn(fLine2, l2T, { gain: 0.35 });
      if (l2Cnt) l2Cnt.c.run(tl, l2Cnt.from, l2Cnt.to, l2T, 0.6, 'power2.out');
    }
    const landT = Math.max(l2End, l2T + 0.6);
    cue(landT, 'cash', 0.9);
    keyframes.push({ t: +(landT + 0.5).toFixed(3), name: 'fix' });
    const fixOut = landT + 1.95;
    tl.fromTo(sF.cam, { scale: 1 }, { scale: 1.035, duration: fixOut - (landT + 0.3), ease: 'sine.inOut', ...IR }, landT + 0.3);
    if (fLine2) kick(fLine2, landT + 1.0, 2.6);
    cue(landT + 1.0, 'thud', 0.35);
    holds.push({ name: 'fix: headline', words: fHead.words + (fSlip ? MT.wordCount(fix.label) : 0), start: fHeadEnd + 0.6, end: fixOut });
    holds.push({ name: 'fix: wallet + statement', words: 3, start: balT + 0.95, end: fixOut });
    if (fLine2) holds.push({ name: 'fix: paydown line', words: fLine2.words, start: landT, end: fixOut });

    /* ---- LOOP: card flip back into the hook; land exactly on frame 1 ---- */
    hookT0(fixOut);
    tl.set(sH.s, { scale: 1, scaleX: 1 }, fixOut);
    const L = flip(sF, sH, fixOut);
    look('hook', fixOut + 0.13);
    cue(L - 0.02, 'stamp', 0.6);
    const end = L + 2 / FPS;
    keyframes.push({ t: +(end - 1 / FPS).toFixed(3), name: 'last frame (= frame 1)' });
    return { duration: end, keyframes, holds, poster: keyframes[1].t, warnings };
  },
};
