/* hand.js: seeded, hand-drawn annotation marks for static slides.
 *
 * Marks are variable-width filled outlines (not constant-width strokes), built from a
 * centre-line with low-frequency wobble, pen pressure and tapered ends, so they read as
 * one quick pass of a real pen. Same seed in, same marks out (deterministic renders);
 * each client gets its own seed, so two clients never share identical marks.
 *
 * Reads:  window.HAND = { seed, pen, color, emphasis, strike, weight, wobble }
 *         [data-mark] spans in the page, and a JSON list in <script id="draws">.
 * Writes: paths into svg.marks.under (highlighter) and svg.marks.over (everything else).
 */
(function () {
  'use strict';
  const TAU = Math.PI * 2;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // Smooth 1-D noise in roughly [-1, 1]: a few sines with random frequency and phase.
  function noise(rng, octaves = 3, base = 1) {
    const c = [];
    for (let i = 0; i < octaves; i++) c.push({ f: base * (i + 1) * (0.55 + rng() * 0.9), p: rng() * TAU, a: 1 / (i + 1) });
    const n = c.reduce((s, k) => s + k.a, 0);
    return (t) => c.reduce((s, k) => s + k.a * Math.sin(t * k.f * TAU + k.p), 0) / n;
  }
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  // Pen models. Units are CSS px at 1080 width. taperIn/Out = fraction of length.
  const PENS = {
    fine:   { w: 4.4, tin: 0.05, tout: 0.25, press: 0.18, min: 0.3, alpha: 1, filter: 'ink' },
    marker: { w: 7.0, tin: 0.02, tout: 0.06, press: 0.08, min: 0.72, alpha: 0.94, filter: 'ink' },
    brush:  { w: 15, tin: 0.10, tout: 0.32, press: 0.38, min: 0.12, alpha: 1, filter: 'brush' },
    pencil: { w: 3.8, tin: 0.08, tout: 0.14, press: 0.22, min: 0.5, alpha: 0.95, filter: 'pencil' },
    highlighter: { w: 30, tin: 0.004, tout: 0.012, press: 0.05, min: 0.9, alpha: 0.85, filter: 'hl', square: true },
  };

  function resample(pts, step) {
    const out = [pts[0]];
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const d = Math.hypot(x1 - x0, y1 - y0);
      let t = step - carry;
      while (t <= d) { out.push([x0 + ((x1 - x0) * t) / d, y0 + ((y1 - y0) * t) / d]); t += step; }
      carry = d - (t - step);
    }
    const last = pts[pts.length - 1];
    const tail = out[out.length - 1];
    if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > step * 0.3) out.push(last);
    return out;
  }

  // Catmull-Rom through points -> cubic bezier path commands (no initial M).
  function crPath(p) {
    let d = '';
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
    }
    return d;
  }

  // Centre-line -> filled outline with pressure-varying width.
  function outline(pts, pen, rng, scale = 1) {
    const P = resample(pts, 2.5);
    if (P.length < 3) return '';
    const n = P.length;
    const pr = noise(rng, 2, 1.3);
    const W = pen.w * scale;
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = P[Math.max(0, i - 2)], b = P[Math.min(n - 1, i + 2)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;
      let prof = smooth(0, pen.tin + 1e-6, t) * (1 - smooth(1 - pen.tout - 1e-6, 1, t));
      prof = pen.min + (1 - pen.min) * prof;
      if (pen.square) prof = 1;
      const w = Math.max(0.35, (W / 2) * prof * (1 + pen.press * pr(t)));
      L.push([P[i][0] + nx * w, P[i][1] + ny * w]);
      R.push([P[i][0] - nx * w, P[i][1] - ny * w]);
    }
    R.reverse();
    const f = (q) => `${q[0].toFixed(2)},${q[1].toFixed(2)}`;
    if (pen.square) {
      // Chisel tip: slanted flat ends.
      return `M${f(L[0])}${crPath(L)}L${f(R[0])}${crPath(R)}Z`;
    }
    const capA = P[n - 1], capB = P[0];
    return `M${f(L[0])}${crPath(L)}Q${f(capA)} ${f(R[0])}${crPath(R)}Q${f(capB)} ${f(L[0])}Z`;
  }

  // ---------- shape generators: return arrays of centre-lines ----------
  function wobblyLine(x1, y1, x2, y2, rng, o = {}) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(12, Math.round(len / 6));
    const amp = (o.amp ?? 1.4) * (o.wobble ?? 1);
    const nz = noise(rng, 3, Math.max(0.6, len / 380));
    const bow = o.bow ?? 0;
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len, nx = -uy, ny = ux;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const off = nz(t) * amp + bow * Math.sin(Math.PI * t);
      pts.push([x1 + ux * len * t + nx * off, y1 + uy * len * t + ny * off]);
    }
    return pts;
  }

  function ellipse(r, rng, o = {}) {
    const pad = o.pad ?? 16;
    const cx = r.x + r.w / 2 + (rng() - 0.5) * 6;
    const cy = r.y + r.h / 2 + (rng() - 0.5) * 4;
    // Hug the word horizontally (so the loop doesn't eat the neighbours), give it air vertically.
    const rx = r.w / 2 + pad * 0.62 + 4;
    const ry = r.h / 2 + pad * 0.95;
    const tilt = ((rng() - 0.5) * 7 * Math.PI) / 180;
    const th0 = -Math.PI * (0.55 + rng() * 0.25);
    const sweep = TAU + 0.35 + rng() * 0.45;
    const nz = noise(rng, 3, 1.1);
    const drift = (0.05 + rng() * 0.05) * (rng() > 0.5 ? 1 : -1);
    const pts = [];
    const N = 140;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const th = th0 - sweep * t;
      const k = 1 + drift * (t - 0.5) + 0.028 * (o.wobble ?? 1) * nz(t);
      const ex = Math.cos(th) * rx * k, ey = Math.sin(th) * ry * k * (1 + 0.04 * Math.cos(th * 2));
      pts.push([cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), cy + ex * Math.sin(tilt) + ey * Math.cos(tilt)]);
    }
    return [pts];
  }

  function underline(r, rng, o = {}) {
    const y = r.y + r.h + (o.gap ?? 4) + (rng() - 0.5) * 3;
    const x1 = r.x - 4 - rng() * 6, x2 = r.x + r.w + 4 + rng() * 10;
    const rise = (rng() - 0.65) * 7;
    const lines = [wobblyLine(x1, y, x2, y + rise, rng, { wobble: o.wobble, bow: -2 - rng() * 3 })];
    if (o.double) {
      const y2 = y + 9 + rng() * 3;
      lines.push(wobblyLine(x1 + r.w * 0.12, y2 + rise * 0.6, x2 - r.w * 0.05, y2 + rise, rng, { wobble: o.wobble, bow: -1 - rng() * 2 }));
    }
    return lines;
  }

  function swash(r, rng, o = {}) {
    // Brush swoosh: one confident stroke under the words with a flick at the end.
    const y = r.y + r.h * 0.98 + (o.gap ?? 6);
    const x1 = r.x - 10, x2 = r.x + r.w + 18;
    const pts = [];
    const nz = noise(rng, 2, 1);
    const N = 60;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = x1 + (x2 - x1) * t;
      const yy = y + Math.sin(t * Math.PI) * 9 - t * t * 16 + nz(t) * 2.5;
      pts.push([x, yy]);
    }
    return [pts];
  }

  function strike(r, rng, o = {}) {
    const mid = r.y + r.h * (o.at ?? 0.54);
    const x1 = r.x - 8 - rng() * 8, x2 = r.x + r.w + 8 + rng() * 8;
    const dy = (rng() - 0.3) * Math.min(14, r.h * 0.2);
    const lines = [wobblyLine(x1, mid + dy, x2, mid - dy * 0.6 - 2, rng, { wobble: o.wobble, amp: 1.2, bow: (rng() - 0.5) * 4 })];
    if (o.double) {
      const d2 = (rng() - 0.5) * 8;
      lines.push(wobblyLine(x1 + 14 + rng() * 10, mid + 8 + d2, x2 - rng() * 12, mid + 2 + d2 * 0.4, rng, { wobble: o.wobble, amp: 1.0, bow: (rng() - 0.5) * 3 }));
    }
    return lines;
  }

  function scribble(r, rng, o = {}) {
    // Tight zig-zag cross-out, as one continuous stroke.
    const pts = [];
    const x0 = r.x - 6, x1 = r.x + r.w + 6;
    const top = r.y + r.h * 0.22, bot = r.y + r.h * 0.8;
    const step = 20 + rng() * 6;
    let x = x0, up = true;
    while (x < x1) {
      pts.push([x + (rng() - 0.5) * 4, (up ? top : bot) + (rng() - 0.5) * 6]);
      x += step * (0.8 + rng() * 0.4); up = !up;
    }
    pts.push([x1, (up ? top : bot)]);
    return [pts];
  }

  function arrow(a, b, rng, o = {}) {
    const bend = o.bend ?? 0.18;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    const c = [mx + nx * len * bend, my + ny * len * bend];
    const nz = noise(rng, 2, 1);
    const shaft = [];
    const N = Math.max(20, Math.round(len / 5));
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0];
      const y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1];
      const w = nz(t) * 1.6 * (o.wobble ?? 1);
      shaft.push([x + nx * w, y + ny * w]);
    }
    // Head direction = tangent at the end.
    const e = shaft[shaft.length - 1], p = shaft[shaft.length - 4];
    const ang = Math.atan2(e[1] - p[1], e[0] - p[0]);
    const hl = o.head ?? 26 + rng() * 6;
    const spread = ((24 + rng() * 8) * Math.PI) / 180;
    const barb = (s) => {
      const a2 = ang + Math.PI + s * spread;
      const tip = [e[0] + Math.cos(a2) * hl, e[1] + Math.sin(a2) * hl];
      return wobblyLine(tip[0], tip[1], e[0] + (rng() - 0.5) * 2, e[1] + (rng() - 0.5) * 2, rng, { amp: 0.6, bow: s * 2 });
    };
    return [shaft, barb(1), barb(-1)];
  }

  function tick(x, y, s, rng) {
    // Short stroke down, long stroke up: one motion.
    const p0 = [x, y + s * 0.45], p1 = [x + s * 0.34 + rng() * 3, y + s * 0.82], p2 = [x + s * 0.98, y + rng() * 4];
    return [[...wobblyLine(p0[0], p0[1], p1[0], p1[1], rng, { amp: 0.6 }), ...wobblyLine(p1[0], p1[1], p2[0], p2[1], rng, { amp: 1, bow: -3 }).slice(1)]];
  }

  function cross(x, y, s, rng) {
    return [wobblyLine(x, y, x + s, y + s * 0.95, rng, { amp: 0.8, bow: 2 }), wobblyLine(x + s * 0.95, y + rng() * 3, x + rng() * 4, y + s, rng, { amp: 0.8, bow: -2 })];
  }

  function box(r, rng, o = {}) {
    const pad = o.pad ?? 12;
    const x0 = r.x - pad, y0 = r.y - pad, x1 = r.x + r.w + pad, y1 = r.y + r.h + pad;
    const j = () => (rng() - 0.5) * 6;
    return [
      wobblyLine(x0 - 6, y0 + j(), x1 + 8, y0 + j(), rng, { amp: 1 }),
      wobblyLine(x1 + j(), y0 - 6, x1 + j(), y1 + 8, rng, { amp: 1 }),
      wobblyLine(x1 + 6, y1 + j(), x0 - 8, y1 + j(), rng, { amp: 1 }),
      wobblyLine(x0 + j(), y1 + 6, x0 + j(), y0 - 8, rng, { amp: 1 }),
    ];
  }

  function bracket(r, rng, o = {}) {
    // Margin bracket on the left of a block.
    const x = r.x - (o.gap ?? 26), y0 = r.y, y1 = r.y + r.h, d = 14;
    return [[
      [x + d, y0], [x + 2, y0 + 6], [x, (y0 + y1) / 2 - 8], [x - d * 0.8, (y0 + y1) / 2], [x, (y0 + y1) / 2 + 8], [x + 2, y1 - 6], [x + d, y1],
    ].map(([px, py]) => [px + (rng() - 0.5) * 2, py])];
  }

  function asterisk(cx, cy, s, rng) {
    const out = [];
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3 + (rng() - 0.5) * 0.3 + 0.2;
      out.push(wobblyLine(cx - Math.cos(a) * s, cy - Math.sin(a) * s, cx + Math.cos(a) * s, cy + Math.sin(a) * s, rng, { amp: 0.8 }));
    }
    return out;
  }

  function highlight(r, rng, o = {}) {
    const h = r.h * (o.cover ?? 0.66);
    const y = r.y + r.h * 0.56 + (rng() - 0.5) * 3;
    const x1 = r.x - 6 - rng() * 6, x2 = r.x + r.w + 6 + rng() * 8;
    const rise = (rng() - 0.5) * 6;
    return { lines: [wobblyLine(x1, y + rise * 0.5, x2, y - rise * 0.5, rng, { amp: 0.8, bow: (rng() - 0.5) * 3 })], width: h };
  }

  // ---------- DOM wiring ----------
  const NS = 'http://www.w3.org/2000/svg';
  function defs(svg) {
    const d = document.createElementNS(NS, 'defs');
    d.innerHTML = `
      <filter id="f-ink" x="-5%" y="-20%" width="110%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
      <filter id="f-pencil" x="-5%" y="-20%" width="110%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="1.8" numOctaves="2" seed="3" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.62" result="a"/>
        <feComposite in="d" in2="a" operator="in"/>
      </filter>
      <filter id="f-brush" x="-5%" y="-30%" width="110%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035 0.9" numOctaves="2" seed="11" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.02 0.55" numOctaves="1" seed="5" result="s"/>
        <feColorMatrix in="s" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.6 2.35" result="a"/>
        <feComposite in="d" in2="a" operator="in"/>
      </filter>
      <filter id="f-hl" x="-5%" y="-30%" width="110%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.02 0.4" numOctaves="2" seed="2" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/>
      </filter>`;
    svg.appendChild(d);
  }

  function addPaths(svg, lines, pen, color, rng, scale, extra = {}) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('fill', color);
    g.setAttribute('opacity', String(extra.alpha ?? pen.alpha));
    if (pen.filter) g.setAttribute('filter', `url(#f-${pen.filter})`);
    for (const ln of lines) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', outline(ln, pen, rng, scale));
      g.appendChild(p);
    }
    svg.appendChild(g);
    return g;
  }

  function rectsOf(el, slide) {
    const o = slide.getBoundingClientRect();
    return Array.from(el.getClientRects())
      .filter((r) => r.width > 1 || r.height > 1)
      .map((r) => ({ x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height }));
  }
  function union(rs) {
    const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y));
    const x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  // Use the ink box of the glyphs rather than the font's full ascent/descent box.
  function tighten(r, el) {
    const fs = parseFloat(getComputedStyle(el).fontSize) || r.h;
    const capTop = r.y + (r.h - fs) / 2 + fs * 0.18;
    return { x: r.x, y: capTop, w: r.w, h: fs * 0.74 };
  }

  function anchorPoint(spec, slide) {
    if (Array.isArray(spec)) return spec;
    const el = document.querySelector(spec.sel);
    if (!el) return null;
    const rs = rectsOf(el, slide);
    if (!rs.length) return null;
    const r = union(rs);
    const at = spec.at || 'center';
    const map = {
      center: [r.x + r.w / 2, r.y + r.h / 2], left: [r.x, r.y + r.h / 2], right: [r.x + r.w, r.y + r.h / 2],
      top: [r.x + r.w / 2, r.y], bottom: [r.x + r.w / 2, r.y + r.h],
      'top-left': [r.x, r.y], 'top-right': [r.x + r.w, r.y], 'bottom-left': [r.x, r.y + r.h], 'bottom-right': [r.x + r.w, r.y + r.h],
    };
    const p = map[at] || map.center;
    return [p[0] + (spec.dx || 0), p[1] + (spec.dy || 0)];
  }

  function run() {
    const cfg = window.HAND || {};
    const slide = document.querySelector('.slide');
    const under = document.querySelector('svg.marks.under');
    const over = document.querySelector('svg.marks.over');
    if (!slide || !under || !over) return;
    defs(over); defs(under);
    const css = getComputedStyle(slide);
    const colorOf = (name) => {
      if (!name) return css.getPropertyValue('--color-mark-ink').trim() || '#c33';
      if (name.startsWith('#')) return name;
      return css.getPropertyValue(`--color-${name}`).trim() || name;
    };
    const basePen = PENS[cfg.pen] || PENS.marker;
    const scale = (cfg.weight || basePen.w) / basePen.w;
    const wob = cfg.wobble ?? 1;
    let idx = 0;

    document.querySelectorAll('[data-mark]').forEach((el) => {
      const kind = el.dataset.mark;
      const rng = mulberry32(hashStr(`${cfg.seed}:${idx++}:${kind}:${el.textContent}`));
      const rs = rectsOf(el, slide).map((r) => tighten(r, el));
      if (!rs.length) return;
      const color = colorOf(el.dataset.markColor || cfg.color);
      const pen = PENS[el.dataset.markPen] || basePen;
      // Bigger type gets a bolder mark, as if drawn with the same pen at arm's length.
      const fsz = parseFloat(getComputedStyle(el).fontSize) || 40;
      const sizeK = Math.min(1.75, Math.max(0.85, fsz / 64));
      const sc = (el.dataset.markPen ? 1 : scale) * sizeK;
      switch (kind) {
        case 'highlight': {
          const hlColor = colorOf(el.dataset.markColor || 'accent-tint');
          rs.forEach((r) => {
            const h = highlight(r, rng, { cover: cfg.highlightCover });
            const p = Object.assign({}, PENS.highlighter, { w: h.width });
            const g = addPaths(under, h.lines, p, hlColor, rng, 1);
            g.style.mixBlendMode = 'multiply';
          });
          break;
        }
        case 'circle': addPaths(over, ellipse(union(rs), rng, { wobble: wob, pad: +el.dataset.markPad || undefined }), pen, color, rng, sc); break;
        case 'underline': rs.forEach((r) => addPaths(over, underline(r, rng, { wobble: wob, double: cfg.underlineDouble }), pen, color, rng, sc)); break;
        case 'swash': {
          const c2 = colorOf(el.dataset.markColor || cfg.swashColor || 'accent');
          rs.forEach((r) => addPaths(el.dataset.markLayer === 'over' ? over : under, swash(r, rng), pen, c2, rng, sc));
          break;
        }
        case 'strike': {
          const style = el.dataset.markStyle || cfg.strike || 'single';
          rs.forEach((r) => {
            const lines = style === 'scribble' ? scribble(r, rng) : strike(r, rng, { wobble: wob, double: style === 'double' });
            addPaths(over, lines, pen, color, rng, sc);
          });
          break;
        }
        case 'box': addPaths(over, box(union(rs), rng), pen, color, rng, sc); break;
        case 'bracket': addPaths(over, bracket(union(rs), rng), pen, color, rng, sc); break;
        case 'tick': { const r = union(rs); const s = r.h * 1.05; addPaths(over, tick(r.x + (r.w - s) / 2, r.y + (r.h - s) / 2, s, rng), pen, color, rng, sc); break; }
        case 'cross': { const r = union(rs); const s = r.h * 0.8; addPaths(over, cross(r.x + (r.w - s) / 2, r.y + (r.h - s) / 2, s, rng), pen, color, rng, sc); break; }
        default: break;
      }
    });

    const drawsEl = document.getElementById('draws');
    const draws = drawsEl ? JSON.parse(drawsEl.textContent || '[]') : [];
    draws.forEach((d, i) => {
      const rng = mulberry32(hashStr(`${cfg.seed}:draw:${i}:${d.shape}`));
      const pen = PENS[d.pen] || basePen;
      const sc = d.pen ? (d.weight ? d.weight / pen.w : 1) : scale;
      const color = colorOf(d.color || cfg.color);
      const layer = d.layer === 'under' ? under : over;
      let lines = [];
      if (d.shape === 'arrow') {
        const a = anchorPoint(d.from, slide), b = anchorPoint(d.to, slide);
        if (a && b && [...a, ...b].every(Number.isFinite)) lines = arrow(a, b, rng, { bend: d.bend, wobble: wob, head: d.head });
        else console.warn('hand.js: arrow anchor missing', JSON.stringify(d));
      } else if (d.shape === 'line') {
        lines = [wobblyLine(d.x1, d.y1, d.x2, d.y2, rng, { wobble: wob, bow: d.bow || 0 })];
      } else if (d.shape === 'asterisk') {
        lines = asterisk(d.x, d.y, d.size || 20, rng);
      } else if (d.shape === 'circle' || d.shape === 'box' || d.shape === 'underline' || d.shape === 'bracket') {
        const el = d.sel ? document.querySelector(d.sel) : null;
        const r = el ? union(rectsOf(el, slide)) : { x: d.x, y: d.y, w: d.w, h: d.h };
        lines = { circle: ellipse, box, underline, bracket }[d.shape](r, rng, { wobble: wob, pad: d.pad, gap: d.gap });
      } else if (d.shape === 'tick') {
        lines = tick(d.x, d.y, d.size || 30, rng);
      }
      if (lines.length) addPaths(layer, lines, pen, color, rng, sc, { alpha: d.alpha });
    });
    document.documentElement.dataset.handDone = '1';
  }

  window.HAND_RUN = run;
})();
