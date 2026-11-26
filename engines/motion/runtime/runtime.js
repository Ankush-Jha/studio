/* motion runtime: the in-page half of the renderer.
 *
 * Contract with render.mjs:
 *   window.__ready  -> Promise<{ duration, keyframes, holds, poster, warnings }>
 *   window.__seek(t) -> puts the page in the exact state for time t (seconds)
 *   window.__qa()    -> measures the current frame (safe zone, crop, size, contrast)
 *
 * Determinism rules (every template follows them):
 *   - All motion lives on ONE paused GSAP timeline that is only ever seeked.
 *   - Every tween is fromTo with immediateRender:false, and every element's t=0 state
 *     is declared with tl.set(..., 0). So any frame can be rendered first, by any worker.
 *   - No Math.random, no Date, no CSS transitions/animations, no rAF loops.
 *     Randomness comes from MT.rng(key), seeded by client seed + data id.
 *   - Text that changes over time (counters) is written by MT.after() hooks that run
 *     after every seek and read tweened proxy values.
 */
(function () {
  'use strict';
  const M = window.MOTION;
  const W = M.width, H = M.height;
  const SAFE = M.safe; // {x0,x1,y0,y1}
  const S = M.style;
  const afterFns = [];

  /* ---------- eases ---------- */
  gsap.registerPlugin(CustomEase);
  CustomEase.create('settle', 'M0,0 C0.16,1 0.3,1 1,1');
  CustomEase.create('soft', 'M0,0 C0.22,0.9 0.24,1 1,1');
  CustomEase.create('lift', 'M0,0 C0.55,0 0.75,0.2 1,1');
  CustomEase.create('swap', 'M0,0 C0.76,0 0.24,1 1,1');
  CustomEase.create('draw', 'M0,0 C0.45,0 0.2,1 1,1');
  gsap.ticker.lagSmoothing(0);
  gsap.config({ force3D: false });

  /* ---------- seeded randomness ---------- */
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = (key) => mulberry32(hashStr(`${M.seed}:${key}`));

  /* ---------- DOM helpers ---------- */
  const el = (tag, cls, parent, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  };
  const svgEl = (tag, attrs, parent) => {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const typo = (s) => String(s)
    .replace(/(^|[\s(\[{"])'/g, '$1‘').replace(/'/g, '’')
    .replace(/(^|[\s(\[{])"/g, '$1“').replace(/"/g, '”')
    .replace(/(\d) ?- ?(\d)/g, '$1–$2');
  const stageRect = () => document.getElementById('stage').getBoundingClientRect();
  const rel = (r) => { const s = stageRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height }; };

  /* ---------- formatting ---------- */
  const fmt = {
    money: (n, o = {}) => {
      const v = Math.round(n * (o.cents ? 100 : 1)) / (o.cents ? 100 : 1);
      const s = '$' + Math.abs(v).toLocaleString('en-CA', { minimumFractionDigits: o.cents ? 2 : 0, maximumFractionDigits: o.cents ? 2 : 0 });
      return v < 0 ? '−' + s : o.sign ? '+' + s : s;
    },
    int: (n) => Math.round(n).toLocaleString('en-CA'),
    pct: (n, d = 2) => `${n.toFixed(d)}%`,
  };
  const formatter = (f) => (typeof f === 'function' ? f
    : f === 'int' ? fmt.int
    : f === 'pct' ? (n) => fmt.pct(n)
    : f === 'money+' ? (n) => fmt.money(n, { sign: true })
    : f === 'money.c' ? (n) => fmt.money(n, { cents: true })
    : f === 'money.c+' ? (n) => fmt.money(n, { cents: true, sign: true })
    : (n) => fmt.money(n));
  const fractional = (f) => f === 'pct' || f === 'money.c' || f === 'money.c+';

  /* ---------- inline markup ----------
   *  ==w== emphasis (family mark)   ~~w~~ strike   ((w)) circle   *w* italic
   *  ^^w^^ accent ink               |  line break
   */
  function parse(src) {
    const out = [];
    const marks = [];
    let mid = 0;
    const re = /(==|~~|\(\(|\)\)|\^\^|\*|\|)/g;
    const open = { '==': null, '~~': null, '((': null, '^^': false, '*': false };
    let last = 0, m;
    const state = { emph: null, strike: null, circle: null, accent: false, italic: false };
    const push = (text) => {
      text.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { out.push({ type: 'space' }); return; }
        out.push({ type: 'word', text: typo(part), marks: [state.emph, state.strike, state.circle].filter((x) => x != null), accent: state.accent, italic: state.italic });
      });
    };
    while ((m = re.exec(src))) {
      push(src.slice(last, m.index));
      last = m.index + m[0].length;
      const tok = m[0];
      if (tok === '|') { out.push({ type: 'br' }); continue; }
      if (tok === '==' || tok === '~~') {
        const key = tok === '==' ? 'emph' : 'strike';
        if (state[key] == null) { state[key] = mid; marks.push({ id: mid++, kind: key }); } else state[key] = null;
      } else if (tok === '((') { state.circle = mid; marks.push({ id: mid++, kind: 'circle' }); }
      else if (tok === '))') state.circle = null;
      else if (tok === '^^') state.accent = !state.accent;
      else if (tok === '*') state.italic = !state.italic;
    }
    push(src.slice(last));
    return { tokens: out, marks };
  }
  const plain = (src) => String(src || '').replace(/==|~~|\(\(|\)\)|\^\^|\*/g, '').replace(/\|/g, ' ');
  const wordCount = (src) => plain(src).split(/\s+/).filter((w) => /[\p{L}\p{N}$]/u.test(w)).length;

  /* Build rich text into `box`, auto-fit, then wrap each visual line in a mask.
   * opts: { size, minSize, maxLines, width, height, align, role, cls } */
  function rich(box, src, opts = {}) {
    box.classList.add('rich');
    if (opts.cls) box.classList.add(...opts.cls.split(' '));
    box.dataset.role = opts.role || 'display';
    if (opts.width) box.style.width = opts.width + 'px';
    if (opts.align) box.style.textAlign = opts.align;
    const { tokens, marks } = parse(String(src || ''));
    const words = [];
    const build = () => {
      box.innerHTML = '';
      words.length = 0;
      let spaced = false;
      tokens.forEach((t) => {
        if (t.type === 'space') { box.appendChild(document.createTextNode(' ')); spaced = true; return; }
        if (t.type === 'br') spaced = false;
        if (t.type === 'br') { box.appendChild(document.createElement('br')); return; }
        {
          const w = el('span', 'w' + (t.italic ? ' it' : '') + (t.accent ? ' ac' : '') + (t.marks.length ? ' mk' : ''), box);
          const wi = el('span', 'wi', w, esc(t.text));
          el('span', 'bl', wi);
          w._marks = t.marks;
          w._space = spaced;
          spaced = false;
          if (t.marks.some((id) => marks[id] && marks[id].kind === 'emph')) w.classList.add('em');
          words.push(w);
        }
      });
    };
    build();
    // Auto-fit: shrink until no word overflows the width, height fits and lines <= maxLines.
    let size = opts.size || parseFloat(getComputedStyle(box).fontSize);
    const min = opts.minSize || size * 0.5;
    const fits = () => {
      const bw = box.clientWidth;
      if (words.some((w) => w.offsetWidth > bw + 0.5)) return false;
      if (opts.height && box.scrollHeight > opts.height + 0.5) return false;
      if (opts.maxLines) {
        const tops = new Set(words.map((w) => Math.round(w.offsetTop)));
        if (tops.size > opts.maxLines) return false;
      }
      return true;
    };
    box.style.fontSize = size + 'px';
    while (!fits() && size > min) { size = Math.max(min, size * 0.97); box.style.fontSize = size.toFixed(2) + 'px'; }
    const fitted = fits();
    // Balance: find the narrowest width that keeps the same number of lines, so lines
    // are even and no paragraph ends on a lone short word.
    if (opts.balance !== false) {
      const count = () => new Set(words.map((w) => Math.round(w.offsetTop))).size;
      const full = box.clientWidth;
      const n0 = count();
      const lastTop = Math.max(...words.map((w) => Math.round(w.offsetTop)));
      const orphan = words.filter((w) => Math.round(w.offsetTop) === lastTop).length === 1 && words.length > 2;
      if (n0 > 1 && (orphan || opts.balance === 'always')) {
        let lo = full * 0.45, hi = full;
        for (let k = 0; k < 14; k++) {
          const mid = (lo + hi) / 2;
          box.style.width = mid + 'px';
          if (count() === n0 && !words.some((w) => w.offsetWidth > mid + 0.5)) hi = mid; else lo = mid;
        }
        box.style.width = Math.ceil(hi + 2) + 'px';
      }
    }
    // Wrap visual lines.
    const lines = [];
    let cur = null, curTop = null;
    // Group by baseline (not top), so a big number and small words on one line stay one line.
    const baseOf = (w) => { const b = w.querySelector('.bl').getBoundingClientRect(); return b.top + b.height; };
    words.forEach((w) => {
      const top = baseOf(w);
      if (curTop === null || Math.abs(top - curTop) > 3) { cur = []; lines.push(cur); curTop = top; }
      cur.push(w);
    });
    box.innerHTML = '';
    const lineEls = lines.map((ws) => {
      const ln = el('span', 'ln', box);
      const inner = el('span', 'lni', ln);
      ws.forEach((w, i) => { if (i && w._space) inner.appendChild(document.createTextNode(' ')); inner.appendChild(w); });
      return { el: ln, inner, words: ws };
    });
    return { box, words, lines: lineEls, marks, size, fitted, words_n: wordCount(src), src };
  }

  /* ---------- hand-drawn marks (seeded, stroke-drawn so they can animate) ---------- */
  function noise(r, oct = 3, base = 1) {
    const c = [];
    for (let i = 0; i < oct; i++) c.push({ f: base * (i + 1) * (0.55 + r() * 0.9), p: r() * Math.PI * 2, a: 1 / (i + 1) });
    const n = c.reduce((s, k) => s + k.a, 0);
    return (t) => c.reduce((s, k) => s + k.a * Math.sin(t * k.f * Math.PI * 2 + k.p), 0) / n;
  }
  function crPath(p) {
    let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }
  function wobbly(x1, y1, x2, y2, r, amp = 1.4, bow = 0) {
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const n = Math.max(8, Math.round(len / 14));
    const nz = noise(r, 3, Math.max(0.6, len / 420));
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len, nx = -uy, ny = ux;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const off = nz(t) * amp + bow * Math.sin(Math.PI * t);
      pts.push([x1 + ux * len * t + nx * off, y1 + uy * len * t + ny * off]);
    }
    return crPath(pts);
  }
  function ellipsePath(cx, cy, rx, ry, r, wob) {
    const start = (-110 + r() * 30) * Math.PI / 180;
    const sweep = (Math.PI * 2) * (1.08 + r() * 0.07);
    const tilt = (r() - 0.5) * 0.07;
    const nz = noise(r, 2, 1.2);
    const pts = [];
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = start + sweep * t;
      const grow = 1 + 0.06 * t + nz(t) * 0.025 * wob;
      let x = Math.cos(a) * rx * grow, y = Math.sin(a) * ry * grow;
      const xr = x * Math.cos(tilt) - y * Math.sin(tilt), yr = x * Math.sin(tilt) + y * Math.cos(tilt);
      pts.push([cx + xr, cy + yr]);
    }
    return crPath(pts);
  }
  // Rects of the words in one mark, merged per line.
  function markRects(words) {
    const byLine = [];
    words.forEach((w) => {
      const r = rel(w.firstChild.getBoundingClientRect());
      const bl = rel(w.querySelector('.bl').getBoundingClientRect()).y + w.querySelector('.bl').getBoundingClientRect().height;
      const fs = parseFloat(getComputedStyle(w).fontSize);
      const last = byLine[byLine.length - 1];
      if (last && Math.abs(last.y - r.y) < 4) { last.x1 = r.x + r.w; last.words.push(w); }
      else byLine.push({ x0: r.x, x1: r.x + r.w, y: r.y, h: r.h, base: bl, fs, words: [w] });
    });
    return byLine;
  }
  /* kind: emph|strike|circle (family decides the look), returns [{d, under, width, color, cap, opacity, blend}] */
  function markStrokes(kind, lr, r, opt = {}) {
    const pen = S.pen;
    const wob = pen.wobble;
    const fs = lr.fs;
    const look = kind === 'emph' ? (opt.emphasis || S.emphasis) : kind === 'strike' ? S.strike : 'circle';
    const color = opt.color || 'var(--color-mark-ink)';
    const out = [];
    const x0 = lr.x0, x1 = lr.x1, w = x1 - x0;
    if (look === 'underline') {
      const y = lr.base + fs * 0.1;
      out.push({ d: wobbly(x0 - fs * 0.04, y + (r() - 0.5) * 3, x1 + fs * 0.08, y - fs * 0.03, r, 1.6 * wob, (r() - 0.3) * 3), width: Math.max(4, fs * 0.055) * (pen.width / 7), color });
      if (opt.double) out.push({ d: wobbly(x0 + fs * 0.1, y + fs * 0.11, x1 - fs * 0.02, y + fs * 0.09, r, 1.4 * wob), width: Math.max(3, fs * 0.04), color });
    } else if (look === 'highlight') {
      const y = lr.base - fs * 0.31;
      out.push({ d: wobbly(x0 - fs * 0.09, y + fs * 0.025, x1 + fs * 0.09, y - fs * 0.02, r, 0.9 * wob), width: fs * 0.6, color: opt.tint || 'var(--color-accent-tint)', cap: 'butt', under: true, opacity: 1, blend: 'multiply' });
    } else if (look === 'swash') {
      const y = lr.base + fs * 0.06;
      out.push({ d: wobbly(x0 - fs * 0.1, y + fs * 0.05, x1 + fs * 0.14, y - fs * 0.07, r, 2.2 * wob, -fs * 0.05), width: fs * 0.2, color: 'var(--color-accent)', under: true, blend: 'multiply' });
    } else if (look === 'box') {
      const p = fs * 0.12;
      const X0 = x0 - p, X1 = x1 + p, Y0 = lr.y + lr.h * 0.08, Y1 = lr.base + fs * 0.16;
      const j = () => (r() - 0.5) * 4 * wob;
      const pts = [[X0 + j(), Y0 + j()], [X1 + j(), Y0 + j()], [X1 + j(), Y1 + j()], [X0 + j(), Y1 + j()], [X0 + j(), Y0 - p * 0.6], [X0 + w * 0.12, Y0 - p * 0.3]];
      out.push({ d: 'M' + pts.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' L'), width: Math.max(3.5, fs * 0.04), color });
    } else if (look === 'single' || look === 'double' || look === 'scribble') {
      const y = lr.base - fs * 0.33;
      if (look === 'scribble') {
        const pts = [];
        const n = Math.max(4, Math.round(w / (fs * 0.22)));
        for (let i = 0; i <= n; i++) pts.push([x0 - fs * 0.05 + (w + fs * 0.1) * (i / n), y + (i % 2 ? -1 : 1) * fs * 0.12 + (r() - 0.5) * 4]);
        out.push({ d: crPath(pts), width: Math.max(5, fs * 0.07), color });
      } else {
        out.push({ d: wobbly(x0 - fs * 0.06, y + fs * 0.04, x1 + fs * 0.06, y - fs * 0.05, r, 1.2 * wob), width: Math.max(4, fs * 0.06), color });
        if (look === 'double') out.push({ d: wobbly(x0 - fs * 0.02, y + fs * 0.13, x1 + fs * 0.1, y + fs * 0.06, r, 1.2 * wob), width: Math.max(4, fs * 0.055), color });
      }
    } else if (look === 'circle') {
      const cx = (x0 + x1) / 2, cy = lr.y + lr.h * 0.52;
      out.push({ d: ellipsePath(cx, cy, w / 2 + fs * 0.24, lr.h * 0.5 + fs * 0.06, r, wob), width: Math.max(4, fs * 0.05), color });
    }
    return out;
  }
  /* Create the SVG paths for every mark in a rich block. Layers are full-stage SVGs. */
  function marksFor(R, layers, key, opt = {}) {
    const paths = [];
    R.marks.forEach((mk) => {
      const ws = R.words.filter((w) => w._marks.includes(mk.id));
      if (!ws.length) return;
      const r = rng(`${key}:${mk.id}`);
      markRects(ws).forEach((lr, li) => {
        markStrokes(mk.kind, lr, r, opt).forEach((s, si) => {
          const p = svgEl('path', {
            d: s.d, fill: 'none', stroke: s.color, 'stroke-width': s.width.toFixed(2),
            'stroke-linecap': s.cap || S.pen.cap || 'round', 'stroke-linejoin': 'round',
          }, s.under ? layers.under : layers.over);
          if (s.opacity != null) p.setAttribute('opacity', s.opacity);
          if (s.under && s.cap === 'butt') lr.words.forEach((w) => { w.dataset.hl = '1'; });
          if (s.blend) p.style.mixBlendMode = s.blend;
          const len = p.getTotalLength() + 2;
          p.style.strokeDasharray = `${len} ${len + 10}`;
          paths.push({ el: p, len, kind: mk.kind, line: li, stroke: si });
        });
      });
    });
    return paths;
  }
  function layersIn(parent) {
    const under = svgEl('svg', { class: 'mk-layer under', viewBox: `0 0 ${W} ${H}`, width: W, height: H }, null);
    const over = svgEl('svg', { class: 'mk-layer over', viewBox: `0 0 ${W} ${H}`, width: W, height: H }, null);
    parent.insertBefore(under, parent.firstChild);
    parent.appendChild(over);
    return { under, over };
  }

  /* ---------- choreography helpers (all fromTo, immediateRender:false) ---------- */
  const IR = { immediateRender: false };
  function hideText(tl, R, at = 0) {
    if (S.enter === 'soft') tl.set(R.words.map((w) => w.firstChild), { yPercent: 0, y: 46, opacity: 0 }, at);
    else tl.set(R.words.map((w) => w.firstChild), { yPercent: 112, y: 0, opacity: 1 }, at);
  }
  function showText(tl, R, at = 0) { tl.set(R.words.map((w) => w.firstChild), { yPercent: 0, y: 0, opacity: 1 }, at); }
  /* Enter: words rise inside their line masks (or soft-rise for serif families). Returns settle time. */
  function enterText(tl, R, at, o = {}) {
    const dur = o.dur ?? S.enterDur;
    const st = o.stagger ?? S.enterStagger;
    const targets = R.words.map((w) => w.firstChild);
    if (S.enter === 'soft') tl.fromTo(targets, { y: 46, opacity: 0, yPercent: 0 }, { y: 0, opacity: 1, duration: dur, ease: S.enterEase, stagger: st, ...IR }, at);
    else tl.fromTo(targets, { yPercent: 112, y: 0, opacity: 1 }, { yPercent: 0, duration: dur, ease: S.enterEase, stagger: st, ...IR }, at);
    return at + dur + st * Math.max(0, targets.length - 1);
  }
  function exitText(tl, R, at, o = {}) {
    const dur = o.dur ?? S.exitDur;
    const st = o.stagger ?? S.exitStagger;
    const targets = R.words.map((w) => w.firstChild);
    if (S.enter === 'soft') tl.fromTo(targets, { y: 0, opacity: 1, yPercent: 0 }, { y: -34, opacity: 0, duration: dur, ease: S.exitEase, stagger: st, ...IR }, at);
    else tl.fromTo(targets, { yPercent: 0, y: 0 }, { yPercent: -112, duration: dur, ease: S.exitEase, stagger: st, ...IR }, at);
    return at + dur + st * Math.max(0, targets.length - 1);
  }
  function hideMarks(tl, paths, at = 0) { paths.forEach((p) => tl.set(p.el, { strokeDashoffset: p.len }, at)); }
  function showMarks(tl, paths, at = 0) { paths.forEach((p) => tl.set(p.el, { strokeDashoffset: 0 }, at)); }
  function drawMarks(tl, paths, at, o = {}) {
    let t = at;
    paths.forEach((p, i) => {
      const d = (o.dur ?? S.markDur) * Math.min(1.5, Math.max(0.7, p.len / 420));
      tl.fromTo(p.el, { strokeDashoffset: p.len }, { strokeDashoffset: 0, duration: d, ease: 'draw', ...IR }, t);
      t += p.stroke ? d * 0.6 : d * 0.35;
    });
    return t + 0.2;
  }
  function eraseMarks(tl, paths, at, o = {}) {
    paths.forEach((p) => tl.fromTo(p.el, { strokeDashoffset: 0 }, { strokeDashoffset: -p.len, duration: o.dur ?? 0.3, ease: 'lift', ...IR }, at));
    return at + (o.dur ?? 0.3);
  }
  /* Simple element in/out (labels, chips, notes): rise + fade. */
  function inEl(tl, els, at, o = {}) {
    const list = [].concat(els).filter(Boolean);
    if (!list.length) return at;
    tl.fromTo(list, { y: o.y ?? 24, opacity: 0 }, { y: 0, opacity: 1, duration: o.dur ?? 0.6, ease: o.ease || S.enterEase, stagger: o.stagger ?? 0.06, ...IR }, at);
    return at + (o.dur ?? 0.6) + (o.stagger ?? 0.06) * (list.length - 1);
  }
  function outEl(tl, els, at, o = {}) {
    const list = [].concat(els).filter(Boolean);
    if (!list.length) return at;
    tl.fromTo(list, { y: 0, opacity: 1 }, { y: o.y ?? -20, opacity: 0, duration: o.dur ?? 0.36, ease: o.ease || S.exitEase, stagger: o.stagger ?? 0.03, ...IR }, at);
    return at + (o.dur ?? 0.36) + (o.stagger ?? 0.03) * (list.length - 1);
  }
  function setShown(tl, els, shown, at = 0) {
    const list = [].concat(els).filter(Boolean);
    if (list.length) tl.set(list, shown ? { y: 0, opacity: 1 } : { y: 24, opacity: 0 }, at);
  }

  /* ---------- counters ---------- */
  function counter(node, o = {}) {
    const f = formatter(o.format || 'money');
    const proxy = { v: o.from ?? 0 };
    node.classList.add('num');
    node.textContent = f(o.to ?? proxy.v);
    const raw = o.round === false || fractional(o.format);
    afterFns.push(() => { node.textContent = f(raw ? proxy.v : Math.round(proxy.v)); });
    return {
      proxy, node,
      set(tl, v, at = 0) { tl.set(proxy, { v }, at); },
      run(tl, from, to, at, dur, ease) {
        tl.fromTo(proxy, { v: from }, { v: to, duration: dur ?? S.countDur, ease: ease || S.countEase, ...IR }, at);
        return at + (dur ?? S.countDur);
      },
    };
  }
  const after = (fn) => afterFns.push(fn);

  /* ---------- sound cues ----------
   * Templates call MT.cue(t, name, gain) where a sound should land. render.mjs turns
   * the list into an SFX bus synthesised with ffmpeg (lib/sfx.mjs). Names:
   *   whoosh, whoosh-short, swish, tick, pop, click, thud, cash, rise, glitch, stamp, paper */
  const cues = [];
  const cue = (t, name, gain = 1) => { cues.push({ t: +t.toFixed(3), name, gain }); };

  /* ---------- word-by-word captions ----------
   * Words pop in one at a time (scale + lift with a little overshoot); key numbers use
   * the ==emphasis== or ^^accent^^ markup. hidePop() declares the t=0 state. */
  function hidePop(tl, R, at = 0) { tl.set(R.words.map((w) => w.firstChild), { scale: 0.55, opacity: 0, y: 26, yPercent: 0, transformOrigin: '50% 90%' }, at); }
  function showPop(tl, R, at = 0) { tl.set(R.words.map((w) => w.firstChild), { scale: 1, opacity: 1, y: 0, yPercent: 0 }, at); }
  function popWords(tl, R, at, o = {}) {
    const per = o.per ?? 0.16;
    const dur = o.dur ?? 0.42;
    R.words.forEach((w, i) => {
      const t0 = at + i * per;
      tl.fromTo(w.firstChild, { scale: 0.55, opacity: 0, y: 26, yPercent: 0 }, { scale: 1, opacity: 1, y: 0, duration: dur, ease: o.ease || 'back.out(2.4)', ...IR }, t0);
      if (o.sound) cue(t0, o.sound, o.gain ?? 0.5);
    });
    return at + (R.words.length - 1) * per + dur;
  }
  function unpopWords(tl, R, at, o = {}) {
    const targets = R.words.map((w) => w.firstChild);
    tl.fromTo(targets, { scale: 1, opacity: 1, y: 0 }, { scale: o.scale ?? 0.85, opacity: 0, y: o.y ?? -30, duration: o.dur ?? 0.24, ease: 'power2.in', stagger: o.stagger ?? 0.02, ...IR }, at);
    return at + (o.dur ?? 0.24) + (o.stagger ?? 0.02) * (targets.length - 1);
  }

  /* ---------- reading time ----------
   * PLAYBOOK: about 2 words a second on screen, only settled text counts; brief floor 0.25 s/word. */
  const readTime = (words, extra = 0) => Math.max(1.2, 0.28 * words + 0.75) + extra;

  /* ---------- chrome: label row, fine line, compliance ---------- */
  function chrome(stage, o = {}) {
    const c = M.client;
    const top = el('header', 'chrome', stage);
    top.dataset.role = 'label';
    const badge = el('span', 'badge', top, esc(c.initials || ''));
    badge.dataset.role = 'label';
    el('span', 'series', top, esc(typo(o.series || '')));
    el('span', 'sp', top);
    const right = el('span', 'tag', top, esc(typo(o.tag || '')));
    let folio = null;
    if (o.folio) { folio = el('span', 'folio', top); }
    const foot = el('footer', 'foot', stage);
    let fine = null;
    if (o.fine) { fine = el('p', 'fine', foot); fine.dataset.role = 'fine'; fine.innerHTML = o.fine; }
    const comp = el('p', 'compliance', foot);
    comp.dataset.role = 'fine';
    comp.innerHTML = M.complianceHTML;
    return { top, foot, fine, comp, folio, right };
  }
  /* Rolling folio digits ("02 / 05"): one column of digits per position. */
  function rollingFolio(host, total) {
    const pad = (n) => String(n).padStart(2, '0');
    host.innerHTML = '';
    const cur = el('span', 'roll', host);
    const col = el('span', 'roll-col', cur);
    for (let i = 1; i <= total; i++) el('span', 'roll-n', col, pad(i));
    el('span', 'roll-of', host, `<i>/</i>${pad(total)}`);
    return {
      set(tl, i, at = 0) { tl.set(col, { yPercent: -(100 / total) * i }, at); },
      to(tl, i, at, from) { tl.fromTo(col, { yPercent: -(100 / total) * from }, { yPercent: -(100 / total) * i, duration: 0.5, ease: 'swap', ...IR }, at); },
    };
  }

  /* ---------- QA: measure the current frame ---------- */
  function effOpacity(node) {
    let o = 1;
    for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return 0;
      o *= parseFloat(cs.opacity);
    }
    return o;
  }
  function parseColor(s) {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const cratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  let tintRGB = null;
  function bgOf(node) {
    // Words sitting on a highlighter swipe are read against the tint, not the paper.
    if (node.closest('[data-hl]')) {
      if (!tintRGB) tintRGB = parseColor(toRgb(getComputedStyle(document.documentElement).getPropertyValue('--color-accent-tint').trim()));
      return tintRGB;
    }
    for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.5) return c;
    }
    return parseColor(getComputedStyle(document.getElementById('stage')).backgroundColor);
  }
  function toRgb(css) { const d = el('span', null, document.body); d.style.color = css; const v = getComputedStyle(d).color; d.remove(); return v; }
  function qa() {
    const issues = [];
    const runs = [];
    const minPx = { display: 28, body: 28, label: 20, fine: 18 };
    const walker = document.createTreeWalker(document.getElementById('stage'), NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      const host = n.parentElement;
      if (host.closest('[data-qa-skip]')) continue;
      const op = effOpacity(host);
      if (op < 0.5) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
      if (!rects.length) continue;
      // Clip by masking ancestors (.ln): text pushed out of its mask is not on screen.
      let mask = host.closest('.ln');
      if (!mask) for (let a = host.parentElement; a && a.id !== 'stage'; a = a.parentElement) { const ov = getComputedStyle(a).overflow; if (ov === 'hidden' || ov === 'clip') { mask = a; break; } }
      const mr = mask ? mask.getBoundingClientRect() : null;
      const visible = rects.map((r) => {
        if (!mr) return r;
        const x0 = Math.max(r.left, mr.left), x1 = Math.min(r.right, mr.right), y0 = Math.max(r.top, mr.top), y1 = Math.min(r.bottom, mr.bottom);
        return { left: x0, right: x1, top: y0, bottom: y1, width: x1 - x0, height: y1 - y0, full: r };
      }).filter((r) => r.width > 0.5 && r.height > 0.5);
      if (!visible.length) continue;
      const cs = getComputedStyle(host);
      const role = (host.closest('[data-role]') || {}).dataset?.role || 'body';
      const size = parseFloat(cs.fontSize);
      const text = n.nodeValue.trim();
      const fg = parseColor(cs.color);
      const bg = bgOf(host);
      const contrast = fg && bg ? +cratio(fg, bg).toFixed(2) : null;
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const need = large ? 3 : 4.5;
      const s = stageRect();
      const box = visible.reduce((a, r) => ({ x0: Math.min(a.x0, r.left - s.left), x1: Math.max(a.x1, r.right - s.left), y0: Math.min(a.y0, r.top - s.top), y1: Math.max(a.y1, r.bottom - s.top) }), { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 });
      // Glyph boxes include line-height padding; allow a small tolerance on the vertical.
      const tol = Math.max(0, (parseFloat(cs.lineHeight) || size) - size) / 2 + 2;
      runs.push({ text: text.slice(0, 40), role, size: +size.toFixed(1), contrast, box });
      if (box.x0 < SAFE.x0 - 1 || box.x1 > SAFE.x1 + 1 || box.y0 + tol < SAFE.y0 - 1 || box.y1 - tol > SAFE.y1 + 1) issues.push({ kind: 'outside-safe', text: text.slice(0, 40), box });
      if (box.x0 < 0 || box.x1 > W || box.y0 < 0 || box.y1 > H) issues.push({ kind: 'off-canvas', text: text.slice(0, 40) });
      if (size < (minPx[role] || 18) - 0.05) issues.push({ kind: 'small-text', text: text.slice(0, 40), size, role });
      if (contrast != null && contrast < need) issues.push({ kind: 'low-contrast', text: text.slice(0, 40), contrast, need });
      // Rolling digit columns clip by design; only count a digit that is mostly in view.
      if (mask && !mask.classList.contains('ln') && visible.every((r) => r.full && r.height < r.full.height * 0.6)) continue;
      if (mask && mask.classList.contains('ln') && visible.some((r) => r.full && (r.full.top < mr.top - 0.5 || r.full.bottom > mr.bottom + 0.5) && op > 0.95)) {
        // A settled word partly outside its mask = cropped glyphs.
        issues.push({ kind: 'cropped', text: text.slice(0, 40) });
      }
    }
    document.querySelectorAll('[data-fit]').forEach((b) => {
      if (effOpacity(b) < 0.5) return;
      const br = b.parentElement.getBoundingClientRect();
      const over = [...b.querySelectorAll('.w')].some((w) => w.getBoundingClientRect().right > br.right + 1);
      if (over) issues.push({ kind: 'overflow-x', text: b.textContent.trim().slice(0, 40) });
    });
    return { issues, runs };
  }

  /* ---------- shared visual components (used by explainer + carousel) ---------- */
  const viz = {};
  /* delta: old value (struck) -> new value (counts up), chip with the change. */
  viz.delta = function (host, d, key, o = {}) {
    const root = el('div', 'viz viz-delta', host);
    const a = el('div', 'dv dv-a', root);
    const aL = el('div', 'dv-l', a, esc(typo(d.fromLabel || 'Before')));
    aL.dataset.role = 'label';
    const aV = el('div', 'dv-v', a);
    const RA = rich(aV, `~~${fmt.money(d.from)}~~`, { role: 'display', size: o.fromSize || 104 });
    const arrow = svgEl('svg', { class: 'dv-arrow', viewBox: '0 0 120 60', width: 120, height: 60 }, root);
    const r = rng(`${key}:arrow`);
    const ap = svgEl('path', { d: wobbly(6, 34, 104, 30, r, 1.2) + ' M86,14 L108,30 L88,48', fill: 'none', stroke: 'var(--color-ink)', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, arrow);
    const b = el('div', 'dv dv-b', root);
    const bL = el('div', 'dv-l', b, esc(typo(d.toLabel || 'Now')));
    bL.dataset.role = 'label';
    const bV = el('div', 'dv-v dv-big', b);
    bV.dataset.role = 'display';
    const cnt = counter(bV, { from: d.from, to: d.to, format: d.format || 'money' });
    let chip = null;
    if (d.chip) { chip = el('div', 'chip', root, esc(typo(d.chip))); chip.dataset.role = 'label'; }
    return {
      root, words: wordCount(`${d.fromLabel} ${d.toLabel} ${d.chip || ''}`) + 2,
      measure(layers) { this.marks = marksFor(RA, layers, `${key}:from`); const al = ap.getTotalLength() + 2; ap.style.strokeDasharray = `${al} ${al + 10}`; this.alen = al; },
      hide(tl, at = 0) { setShown(tl, [aL, bL, chip], false, at); hideText(tl, RA, at); tl.set(ap, { strokeDashoffset: this.alen }, at); cnt.set(tl, d.from, at); tl.set(bV, { opacity: 0, y: 30 }, at); hideMarks(tl, this.marks, at); },
      show(tl, at = 0) { setShown(tl, [aL, bL, chip], true, at); showText(tl, RA, at); tl.set(ap, { strokeDashoffset: 0 }, at); cnt.set(tl, d.to, at); tl.set(bV, { opacity: 1, y: 0 }, at); showMarks(tl, this.marks, at); },
      enter(tl, at) {
        inEl(tl, [aL], at);
        let t = enterText(tl, RA, at + 0.05);
        tl.fromTo(ap, { strokeDashoffset: this.alen }, { strokeDashoffset: 0, duration: 0.5, ease: 'draw', ...IR }, at + 0.35);
        inEl(tl, [bL], at + 0.45);
        tl.fromTo(bV, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.55, ease: S.enterEase, ...IR }, at + 0.5);
        const tc = cnt.run(tl, d.from, d.to, at + 0.6, 1.0);
        const tm = drawMarks(tl, this.marks, at + 0.75);
        const tch = chip ? inEl(tl, [chip], tc - 0.15) : 0;
        return Math.max(t, tc, tm, tch);
      },
      exit(tl, at) {
        eraseMarks(tl, this.marks, at, { dur: 0.25 });
        outEl(tl, [aL, bL, chip, bV], at + 0.04);
        exitText(tl, RA, at);
        tl.fromTo(ap, { opacity: 1 }, { opacity: 0, duration: 0.3, ease: 'lift', ...IR }, at);
        tl.set(ap, { opacity: 1, strokeDashoffset: this.alen }, at + 0.5);
        return at + 0.5;
      },
    };
  };
  /* units: n payment blocks fill in sequence; a running total; a readout that does not move. */
  viz.units = function (host, d, key, o = {}) {
    const root = el('div', 'viz viz-units', host);
    const left = el('div', 'un-grid', root);
    left.style.setProperty('--cols', d.cols || 4);
    const blocks = [];
    for (let i = 0; i < d.n; i++) {
      const b = el('div', 'un-b', left);
      const t = el('span', 'un-t', b, esc(fmt.money(d.unit)));
      t.dataset.role = 'label';
      b.dataset.bg = '1';
      blocks.push(b);
    }
    const side = el('div', 'un-side', root);
    const tl1 = el('div', 'un-k', side, esc(typo(d.totalLabel || 'Paid')));
    tl1.dataset.role = 'label';
    const tv = el('div', 'un-v', side);
    tv.dataset.role = 'display';
    const cnt = counter(tv, { from: 0, to: d.unit * d.n });
    const rk = el('div', 'un-k un-k2', side, esc(typo(d.readoutLabel || 'Balance')));
    rk.dataset.role = 'label';
    const rv = el('div', 'un-v un-v2', side);
    rv.dataset.role = 'display';
    const RR = rich(rv, `((${fmt.money(d.readout)}))`, { role: 'display', size: o.readoutSize || 76 });
    let stamp = null;
    if (d.stamp) { stamp = el('div', 'un-stamp', side, esc(typo(d.stamp))); stamp.dataset.role = 'label'; }
    const per = d.stepDur ?? 0.16;
    return {
      root, words: wordCount(`${d.totalLabel} ${d.readoutLabel} ${d.stamp || ''}`) + 2,
      measure(layers) { this.marks = marksFor(RR, layers, `${key}:readout`); },
      hide(tl, at = 0) { tl.set(blocks, { opacity: 0, scale: 0.6 }, at); setShown(tl, [tl1, rk, stamp, tv], false, at); hideText(tl, RR, at); cnt.set(tl, 0, at); hideMarks(tl, this.marks, at); },
      show(tl, at = 0) { tl.set(blocks, { opacity: 1, scale: 1 }, at); setShown(tl, [tl1, rk, stamp, tv], true, at); showText(tl, RR, at); cnt.set(tl, d.unit * d.n, at); showMarks(tl, this.marks, at); },
      enter(tl, at) {
        inEl(tl, [tl1, tv, rk], at, { stagger: 0.08 });
        enterText(tl, RR, at + 0.2);
        const t0 = at + 0.45;
        blocks.forEach((b, i) => tl.fromTo(b, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.42, ease: 'settle', ...IR }, t0 + i * per));
        // Total ticks up with each block landing (steps of one payment), not a smooth blur.
        for (let i = 0; i < d.n; i++) tl.fromTo(cnt.proxy, { v: d.unit * i }, { v: d.unit * (i + 1), duration: 0.14, ease: 'power1.out', ...IR }, t0 + i * per + 0.08);
        const tEnd = t0 + (d.n - 1) * per + 0.5;
        const tm = drawMarks(tl, this.marks, tEnd);
        const ts = stamp ? inEl(tl, [stamp], tEnd + 0.15) : tEnd;
        return Math.max(tm, ts);
      },
      exit(tl, at) {
        eraseMarks(tl, this.marks, at, { dur: 0.25 });
        tl.fromTo(blocks, { opacity: 1, scale: 1 }, { opacity: 0, scale: 0.8, duration: 0.3, ease: 'lift', stagger: { each: 0.015, from: 'end' }, ...IR }, at);
        outEl(tl, [tl1, tv, rk, stamp], at);
        exitText(tl, RR, at);
        return at + 0.5;
      },
    };
  };
  /* bars: horizontal bars from $0 (stacked segments allowed), values count up as bars grow. */
  viz.bars = function (host, d, key, o = {}) {
    const root = el('div', 'viz viz-bars', host);
    const max = d.max || Math.max(...d.rows.map((r) => r.segments.reduce((s, x) => s + x.value, 0)));
    const rows = d.rows.map((row) => {
      const r = el('div', 'br-row', root);
      const lab = el('div', 'br-l', r, esc(typo(row.label)));
      lab.dataset.role = 'label';
      const track = el('div', 'br-track', r);
      const segs = row.segments.map((s, i) => {
        const seg = el('div', `br-seg tone-${s.tone || (i ? 'b' : 'a')}`, track);
        seg.style.width = `${(s.value / max) * 100}%`;
        return { el: seg, s };
      });
      const vals = el('div', 'br-vals', r);
      const items = row.segments.map((s, i) => {
        const it = el('div', `br-v tone-${s.tone || (i ? 'b' : 'a')}`, vals);
        const k = el('span', 'br-vk', it, esc(typo(s.label)));
        k.dataset.role = 'label';
        const v = el('span', 'br-vv', it);
        v.dataset.role = 'body';
        const c = counter(v, { from: 0, to: s.value });
        return { it, c, s };
      });
      return { r, lab, segs, items, row };
    });
    const zero = el('div', 'br-zero', root, '$0');
    zero.dataset.role = 'label';
    return {
      root, words: d.rows.reduce((n, r) => n + wordCount(r.label) + r.segments.reduce((m, s) => m + wordCount(s.label) + 1, 0), 0),
      measure() {},
      hide(tl, at = 0) { rows.forEach((R) => { setShown(tl, [R.lab, ...R.items.map((x) => x.it)], false, at); tl.set(R.segs.map((x) => x.el), { scaleX: 0 }, at); R.items.forEach((x) => x.c.set(tl, 0, at)); }); setShown(tl, zero, false, at); },
      show(tl, at = 0) { rows.forEach((R) => { setShown(tl, [R.lab, ...R.items.map((x) => x.it)], true, at); tl.set(R.segs.map((x) => x.el), { scaleX: 1 }, at); R.items.forEach((x) => x.c.set(tl, x.s.value, at)); }); setShown(tl, zero, true, at); },
      enter(tl, at) {
        let t = at;
        inEl(tl, zero, at);
        rows.forEach((R, ri) => {
          const t0 = at + ri * 0.9;
          inEl(tl, R.lab, t0);
          let ts = t0 + 0.2;
          R.segs.forEach((x, si) => {
            const dur = 0.5 + 0.6 * (x.s.value / max);
            if (x.s.value > 0) tl.fromTo(x.el, { scaleX: 0 }, { scaleX: 1, duration: dur, ease: 'swap', ...IR }, ts);
            else tl.set(x.el, { scaleX: 1 }, ts);
            inEl(tl, R.items[si].it, ts + 0.1);
            R.items[si].c.run(tl, 0, x.s.value, ts + 0.1, dur, 'swap');
            ts += dur * 0.85;
          });
          t = Math.max(t, ts + 0.3);
        });
        return t;
      },
      exit(tl, at) {
        rows.forEach((R, ri) => {
          tl.fromTo(R.segs.map((x) => x.el), { scaleX: 1 }, { scaleX: 0, duration: 0.4, ease: 'lift', stagger: 0.04, ...IR }, at + ri * 0.05);
          outEl(tl, [R.lab, ...R.items.map((x) => x.it)], at + ri * 0.05);
        });
        outEl(tl, zero, at);
        return at + 0.55;
      },
    };
  };
  /* readouts: two or three labelled figures side by side (hook frames). */
  viz.readouts = function (host, d, key, o = {}) {
    const root = el('div', 'viz viz-readouts', host);
    const items = d.items.map((it, i) => {
      const c = el('div', `ro ro-${it.tone || (i ? 'b' : 'a')}`, root);
      const k = el('div', 'ro-k', c, esc(typo(it.label)));
      k.dataset.role = 'label';
      const v = el('div', 'ro-v', c);
      v.dataset.role = 'display';
      const R = rich(v, it.mark ? `${it.mark === 'circle' ? '((' : '=='}${fmt.money(it.value)}${it.mark === 'circle' ? '))' : '=='}` : fmt.money(it.value), { role: 'display', size: o.size || 112 });
      let sub = null;
      if (it.sub) { sub = el('div', 'ro-s', c, esc(typo(it.sub))); sub.dataset.role = 'label'; }
      return { c, k, v, R, sub, it };
    });
    return {
      root, words: d.items.reduce((n, it) => n + wordCount(it.label) + 1 + wordCount(it.sub || ''), 0),
      measure(layers) { this.marks = items.flatMap((x, i) => marksFor(x.R, layers, `${key}:ro${i}`)); },
      hide(tl, at = 0) { items.forEach((x) => { setShown(tl, [x.k, x.sub], false, at); hideText(tl, x.R, at); }); hideMarks(tl, this.marks, at); },
      show(tl, at = 0) { items.forEach((x) => { setShown(tl, [x.k, x.sub], true, at); showText(tl, x.R, at); }); showMarks(tl, this.marks, at); },
      enter(tl, at) {
        let t = at;
        items.forEach((x, i) => { inEl(tl, [x.k], at + i * 0.18); t = Math.max(t, enterText(tl, x.R, at + 0.08 + i * 0.18)); if (x.sub) inEl(tl, x.sub, at + 0.3 + i * 0.18); });
        return drawMarks(tl, this.marks, t - 0.15);
      },
      exit(tl, at) {
        eraseMarks(tl, this.marks, at, { dur: 0.25 });
        items.forEach((x, i) => { outEl(tl, [x.k, x.sub], at + i * 0.04); exitText(tl, x.R, at + i * 0.04); });
        return at + 0.55;
      },
    };
  };
  /* figure: one big number with a caption (count-up). */
  viz.figure = function (host, d, key, o = {}) {
    const root = el('div', 'viz viz-figure', host);
    const k = d.label ? el('div', 'fg-k', root, esc(typo(d.label))) : null;
    if (k) k.dataset.role = 'label';
    const v = el('div', 'fg-v', root);
    v.dataset.role = 'display';
    const cnt = counter(v, { from: d.from ?? 0, to: d.value, format: d.format || 'money' });
    const cap = d.caption ? el('div', 'fg-c', root, esc(typo(d.caption))) : null;
    if (cap) cap.dataset.role = 'body';
    return {
      root, words: wordCount(`${d.label || ''} ${d.caption || ''}`) + 1,
      measure() {},
      hide(tl, at = 0) { setShown(tl, [k, v, cap], false, at); cnt.set(tl, d.from ?? 0, at); },
      show(tl, at = 0) { setShown(tl, [k, v, cap], true, at); cnt.set(tl, d.value, at); },
      enter(tl, at) { inEl(tl, [k, v], at); const tc = cnt.run(tl, d.from ?? 0, d.value, at + 0.2, 1.1); inEl(tl, cap, at + 0.5); return tc + 0.1; },
      exit(tl, at) { outEl(tl, [k, v, cap], at); return at + 0.5; },
    };
  };

  window.MT = {
    M, W, H, SAFE, S, el, svgEl, esc, typo, rng, parse, plain, wordCount, rich, marksFor, layersIn, markStrokes, wobbly,
    hideText, showText, enterText, exitText, hideMarks, showMarks, drawMarks, eraseMarks, inEl, outEl, setShown,
    counter, after, cue, cues, hidePop, showPop, popWords, unpopWords, fmt, formatter, readTime, chrome, rollingFolio, qa, viz, IR,
  };

  /* ---------- runner ---------- */
  // Zero-time set() calls at position 0 only render once the playhead is past 0, so
  // every frame is rendered at t + EPS. A backward seek first returns to the start, so
  // a frame never depends on which frame was rendered before it.
  let TL = null, lastT = -1;
  const EPS = 1e-4;
  window.__seek = (t) => {
    const tt = Math.max(0, t) + EPS;
    if (tt < lastT) TL.seek(EPS / 2, false);
    TL.seek(tt, false);
    lastT = tt;
    for (const f of afterFns) f(t);
    return true;
  };
  window.__qa = () => qa();
  window.__ready = (async () => {
    await Promise.all([...document.fonts].map((f) => f.load().catch(() => null)));
    await document.fonts.ready;
    const failed = [...document.fonts].filter((f) => f.status !== 'loaded').map((f) => `${f.family} ${f.style} ${f.weight}`);
    if (failed.length) throw new Error('Fonts failed to load: ' + failed.join(', '));
    // Templates may load after the runtime (or build asynchronously, e.g. textures).
    if (!window.TEMPLATE) await new Promise((res) => window.addEventListener('template-ready', res, { once: true }));
    const tl = gsap.timeline({ paused: true });
    const r = await window.TEMPLATE.build(MT, M, tl);
    TL = tl;
    const duration = r.duration ?? tl.duration();
    // Render the whole timeline once forward, then return to the start.
    TL.seek(duration + 1, false); lastT = duration + 1;
    window.__seek(0);
    const out = { duration, keyframes: r.keyframes || [], holds: r.holds || [], poster: r.poster ?? 0, warnings: r.warnings || [], cues: cues.filter((c) => c.t < duration).sort((a, b) => a.t - b.t) };
    // Studio Films page contract (core/render/video.mjs, events.mjs, readcheck.mjs):
    // DUR, render(t), READY, EV (sound events), TEXTS(t) (on-screen text boxes).
    window.DUR = duration;
    window.render = (t) => { window.__seek(t); };
    window.EV = out.cues.map((c) => ({ t: c.t, type: c.name, gain: c.gain }));
    window.TEXTS = (t) => {
      window.__seek(t);
      const q = qa();
      return q.runs.map((r, i) => ({ id: `${r.role}:${r.text}`, text: r.text, x0: r.box.x0, y0: r.box.y0, x1: r.box.x1, y1: r.box.y1, pass: r.role === 'fine' || r.role === 'label' }));
    };
    window.READY = true;
    return out;
  })();
})();
