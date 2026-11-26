// Paper Cut-out (group 2 · Kitchen Table). See library/cutout/STYLE.md.
// Everything visual is construction paper built in SVG: deckled torn edges (displacement
// noise) with a white fibre core showing at the tear, paper fibre, and tight neutral shadows.
// Display copy (Young Serif) is pasted on torn card strips that page.js cuts to each set line;
// the emphasised phrase gets its own accent patch. Objects are flat cut shapes. Scraps cross
// the slide edges and continue on the next slide, so a swipe reveals one long collage.

// ---------- colour helpers ----------
const hex = (h) => { const s = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const toHex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));

// ---------- seeded random (independent of ctx.rng so geometry is stable per post) ----------
function rngOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const f1 = (n) => Number(n).toFixed(1);

// ---------- SVG filters: torn edge + fibre core, scissor cut, fibre, shadows ----------
function defs(P, seed) {
  const shadow = (src) => `
    <feGaussianBlur in="${src}" stdDeviation="1.6" result="sb1"/><feOffset in="sb1" dx="0" dy="2.2" result="so1"/>
    <feFlood flood-color="#15130E" flood-opacity="0.34"/><feComposite in2="so1" operator="in" result="s1"/>
    <feGaussianBlur in="${src}" stdDeviation="5" result="sb2"/><feOffset in="sb2" dx="0" dy="7" result="so2"/>
    <feFlood flood-color="#15130E" flood-opacity="0.12"/><feComposite in2="so2" operator="in" result="s2"/>`;
  const fibre = (src, out) => `
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.5" numOctaves="3" seed="${seed + 5}" result="fib"/>
    <feColorMatrix in="fib" type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.17  0 0 0 0 0.12  0 0 0 -0.32 0.15" result="fibA"/>
    <feComposite in="fibA" in2="${src}" operator="in" result="fibIn"/>
    <feMerge result="${out}"><feMergeNode in="${src}"/><feMergeNode in="fibIn"/></feMerge>`;
  const torn = (id, s1, s2, scale, freq) => `
  <filter id="${id}" x="-12%" y="-12%" width="124%" height="130%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="4" seed="${s1}" result="n1"/>
    <feDisplacementMap in="SourceGraphic" in2="n1" scale="${scale * 1.35}" xChannelSelector="R" yChannelSelector="G" result="a"/>
    <feFlood flood-color="${P.card}" result="w"/><feComposite in="w" in2="a" operator="in" result="core"/>
    <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="4" seed="${s2}" result="n2"/>
    <feDisplacementMap in="SourceGraphic" in2="n2" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="b"/>
    <feMerge result="paper0"><feMergeNode in="core"/><feMergeNode in="b"/></feMerge>
    ${fibre('paper0', 'paper')}
    ${shadow('paper')}
    <feMerge><feMergeNode in="s2"/><feMergeNode in="s1"/><feMergeNode in="paper"/></feMerge>
  </filter>`;
  return `<svg class="ct-defs" width="0" height="0" aria-hidden="true"><defs>
    ${torn('ct-torn-a', seed + 1, seed + 2, 9, '0.045 0.05')}
    ${torn('ct-torn-b', seed + 3, seed + 4, 11, '0.03 0.07')}
    ${torn('ct-strip', seed + 6, seed + 7, 8, '0.025 0.11')}
    <filter id="ct-cut" x="-8%" y="-8%" width="116%" height="122%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="${seed + 8}" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G" result="paper0"/>
      ${fibre('paper0', 'paper')}
      ${shadow('paper')}
      <feMerge><feMergeNode in="s2"/><feMergeNode in="s1"/><feMergeNode in="paper"/></feMerge>
    </filter>
    <filter id="ct-board" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.004 0.006" numOctaves="2" seed="${seed + 9}" result="m"/>
      <feColorMatrix in="m" type="matrix" values="0 0 0 0 0.1  0 0 0 0 0.09  0 0 0 0 0.07  0 0 0 -0.16 0.1" result="mot"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.035 0.25" numOctaves="3" seed="${seed + 10}" result="f"/>
      <feColorMatrix in="f" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.98  0 0 0 -0.34 0.17" result="fib"/>
      <feMerge><feMergeNode in="mot"/><feMergeNode in="fib"/></feMerge>
    </filter>
  </defs></svg>`;
}

const piece = (shape, filter = 'ct-cut') => `<g filter="url(#${filter})">${shape}</g>`;
const rot = (deg, cx, cy) => `transform="rotate(${f1(deg)} ${f1(cx)} ${f1(cy)})"`;

// ---------- cut-paper objects (all flat shapes; size = width in px) ----------
const ART = {
  house(x, y, S, P, r) {
    const bw = S * 0.74, bh = S * 0.5, bx = x + (S - bw) / 2, by = y + S * 0.44;
    const roof = `M${f1(x)},${f1(by + 4)} L${f1(x + S / 2)},${f1(y + S * 0.06)} L${f1(x + S)},${f1(by + 4)} Z`;
    const ch = `<rect x="${f1(x + S * 0.66)}" y="${f1(y + S * 0.12)}" width="${f1(S * 0.1)}" height="${f1(S * 0.26)}" fill="${P.kraft}"/>`;
    const win = (wx) => `<rect x="${f1(wx)}" y="${f1(by + bh * 0.2)}" width="${f1(bw * 0.2)}" height="${f1(bw * 0.2)}" fill="${P.card}"/>`;
    const door = `<rect x="${f1(bx + bw * 0.56)}" y="${f1(by + bh * 0.42)}" width="${f1(bw * 0.2)}" height="${f1(bh * 0.58)}" fill="${P.kraft}"/>`;
    return piece(ch, 'ct-torn-b') + piece(`<rect x="${f1(bx)}" y="${f1(by)}" width="${f1(bw)}" height="${f1(bh)}" fill="${P.deep}" ${rot((r() - 0.5) * 1.2, bx + bw / 2, by + bh / 2)}/>`, 'ct-torn-a')
      + piece(`<path d="${roof}" fill="${P.accent}"/>`, 'ct-torn-b') + piece(win(bx + bw * 0.14)) + piece(door);
  },
  coins(x, y, S, P, r, n = 4) {
    // A loose row of flat coins, each overlapping the last.
    const rad = S * 0.2;
    let g = '';
    for (let i = 0; i < n; i++) {
      const cx = x + rad + i * rad * 1.18 + (r() - 0.5) * 8, cy = y + S - rad - (i % 2) * rad * 0.28 + (r() - 0.5) * 6;
      g += piece(`<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rad)}" fill="${P.kraft}"/><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rad * 0.72)}" fill="none" stroke="${mix(P.kraft, P.ink, 0.25)}" stroke-width="${f1(rad * 0.07)}"/>`, i % 2 ? 'ct-cut' : 'ct-torn-a');
    }
    return g;
  },
  calendar(x, y, S, P, r) {
    const w = S, h = S * 0.92;
    let cells = '';
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
      cells += `<rect x="${f1(x + w * 0.1 + col * w * 0.21)}" y="${f1(y + h * 0.38 + row * h * 0.18)}" width="${f1(w * 0.15)}" height="${f1(h * 0.12)}" fill="${mix(P.card, P.ink, 0.12)}"/>`;
    }
    const mark = `<circle cx="${f1(x + w * 0.1 + 2 * w * 0.21 + w * 0.075)}" cy="${f1(y + h * 0.38 + h * 0.18 + h * 0.06)}" r="${f1(w * 0.11)}" fill="none" stroke="${P.accent}" stroke-width="${f1(w * 0.03)}"/>`;
    return piece(`<g ${rot((r() - 0.5) * 3, x + w / 2, y + h / 2)}><rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${P.card}"/>${cells}${mark}</g>`, 'ct-torn-a')
      + piece(`<rect x="${f1(x - 4)}" y="${f1(y - 4)}" width="${f1(w + 8)}" height="${f1(h * 0.24)}" fill="${P.accent}" ${rot((r() - 0.5) * 2, x + w / 2, y)}/>`, 'ct-torn-b')
      + piece(`<circle cx="${f1(x + w * 0.28)}" cy="${f1(y + h * 0.04)}" r="${f1(w * 0.035)}" fill="${P.deep}"/><circle cx="${f1(x + w * 0.72)}" cy="${f1(y + h * 0.04)}" r="${f1(w * 0.035)}" fill="${P.deep}"/>`);
  },
  envelope(x, y, S, P, r) {
    const w = S, h = S * 0.64;
    return piece(`<g ${rot((r() - 0.5) * 4, x + w / 2, y + h / 2)}><rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${P.card}"/></g>`, 'ct-torn-a')
      + piece(`<path d="M${f1(x)},${f1(y + 2)} L${f1(x + w / 2)},${f1(y + h * 0.58)} L${f1(x + w)},${f1(y + 2)} Z" fill="${P.kraft}" ${rot((r() - 0.5) * 4, x + w / 2, y + h / 2)}/>`, 'ct-cut')
      + piece(`<circle cx="${f1(x + w / 2)}" cy="${f1(y + h * 0.56)}" r="${f1(w * 0.07)}" fill="${P.accent}"/>`);
  },
  plane(x, y, S, P) {
    const a = `M${f1(x)},${f1(y + S * 0.42)} L${f1(x + S)},${f1(y)} L${f1(x + S * 0.42)},${f1(y + S * 0.62)} Z`;
    const b = `M${f1(x + S * 0.42)},${f1(y + S * 0.62)} L${f1(x + S)},${f1(y)} L${f1(x + S * 0.62)},${f1(y + S * 0.88)} Z`;
    return piece(`<path d="${a}" fill="${P.accent}"/>`, 'ct-torn-a') + piece(`<path d="${b}" fill="${mix(P.accent, P.ink, 0.28)}"/>`, 'ct-cut');
  },
  bookmark(x, y, S, P) {
    const w = S * 0.5, h = S;
    return piece(`<path d="M${f1(x)},${f1(y)} H${f1(x + w)} V${f1(y + h)} L${f1(x + w / 2)},${f1(y + h * 0.78)} L${f1(x)},${f1(y + h)} Z" fill="${P.accent}"/>`, 'ct-torn-a');
  },
  bubble(x, y, S, P) {
    const w = S, h = S * 0.62;
    return piece(`<path d="M${f1(x)},${f1(y)} H${f1(x + w)} V${f1(y + h)} H${f1(x + w * 0.42)} L${f1(x + w * 0.2)},${f1(y + h * 1.32)} L${f1(x + w * 0.24)},${f1(y + h)} H${f1(x)} Z" fill="${P.accent}"/>`, 'ct-torn-a');
  },
  arrow(x, y, S, P) {
    const h = S * 0.34;
    return piece(`<path d="M${f1(x)},${f1(y + h * 0.36)} H${f1(x + S * 0.66)} V${f1(y)} L${f1(x + S)},${f1(y + h / 2)} L${f1(x + S * 0.66)},${f1(y + h)} V${f1(y + h * 0.64)} H${f1(x)} Z" fill="${P.accent}"/>`, 'ct-cut');
  },
};

// Choose a motif from the copy. Specs may also set `motif`.
function motifOf(s) {
  if (s.motif) return s.motif;
  const txt = JSON.stringify([s.headline, s.text, s.title, s.kicker, s.dek, s.eyebrow]).toLowerCase();
  if (/renew|letter|offer|statement|document|gift letter/.test(txt)) return 'envelope';
  if (/deadline|dec \d|nov \d|calendar|date|days/.test(txt)) return 'calendar';
  if (/heloc|kitchen|home|house|balance|owe|mortgage/.test(txt)) return 'house';
  if (/deposit|down payment|\$/.test(txt)) return 'coins';
  return 'house';
}

// Scraps that cross slide edges: defined in panorama coordinates, so the scrap leaving
// slide i on the right enters slide i+1 on the left.
function edgeScraps(ctx, P, specId) {
  const W = ctx.format.w, H = ctx.format.h, s = ctx.format.safe;
  const colours = [P.deep, P.kraft, P.accent, P.card];
  let g = '';
  for (let b = ctx.index; b <= ctx.index + 1; b++) {
    if (ctx.isSingle || b < 1 || b > ctx.total - 1) continue;
    const r = rngOf(`${specId}:${ctx.client.seed}:edge:${b}`);
    const off = (b - ctx.index) * W; // boundary x in this slide's coordinates (0 or W)
    const reach = Math.min(s.x0, W - s.x1) - 14;
    const n = 1 + (r() > 0.55 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const h = H * (0.06 + r() * 0.1);
      const y = s.y0 + 120 + r() * (s.y1 - s.y0 - h - 240);
      const w = reach * 2 - r() * 16;
      const fill = colours[Math.floor(r() * 3)];
      const a = (r() - 0.5) * 10;
      g += piece(`<rect x="${f1(off - w / 2)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}" ${rot(a, off, y + h / 2)}/>`, k ? 'ct-torn-b' : 'ct-torn-a');
    }
  }
  return g;
}

// ---------- shared HTML pieces ----------
function head(ctx) {
  const folio = ctx.folio();
  return `<header class="ct-head" data-role="label" data-noword><span>${ctx.esc(ctx.spec.series || '')}</span>${folio ? `<span class="tnum">${folio}</span>` : ''}</header>`;
}
const tab = (ctx, txt, cls = '') => `<p class="ct-tab ${cls}" data-role="label"><span>${ctx.t(txt)}</span></p>`;
const foot = (ctx, size = 'line', extra = '') => `<footer class="ct-foot">${ctx.compliance(size)}${extra}</footer>`;
const strips = (ctx, txt, cls, attrs = '') => `<h2 class="ct-strips ${cls}" data-role="display" ${attrs}>${ctx.t(txt)}</h2>`;

function frame(s, ctx, { inner, art = '', cls = '' }) {
  const P = { ...ctx.palette };
  const W = ctx.format.w, H = ctx.format.h;
  const seed = 11 + (ctx.client.seed % 50) + ctx.index * 3;
  const ground = ctx.variant === 'b' ? (P.ground2 || '#C7AC84') : P.paper;
  const svg = `<svg class="ct-art" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
      <rect width="${W}" height="${H}" fill="${ground}"/>
      <rect width="${W}" height="${H}" filter="url(#ct-board)"/>
      ${edgeScraps(ctx, P, ctx.spec.id)}
      ${art}
    </svg>`;
  return {
    bg: `${defs(P, seed)}${svg}<div class="ct-grain"></div>`,
    html: `<svg class="ct-layer" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"></svg>
      <div class="stage ct-stage ct-${s.type} ${s.type === 'steps' || s.type === 'recap' ? 'ct-t-list' : ''} ${cls}">${inner}</div>`,
    data: { seed },
    classes: `ct-v-${ctx.variant}`,
  };
}

// Art box helpers (canvas coordinates) per format.
function artBox(ctx, where) {
  const W = ctx.format.w, H = ctx.format.h, s = ctx.format.safe, f = ctx.format.name;
  if (f === 'story') return where === 'top' ? { x: W * 0.5, y: 0, S: 300 } : { x: W * 0.42, y: 1262, S: 420 };
  if (f === 'square') return where === 'top' ? { x: W - 360, y: 110, S: 280 } : { x: W - 400, y: H - 480, S: 280 };
  return where === 'top' ? { x: W - 580, y: 120, S: 500 } : { x: W - 640, y: H - 700, S: 520 };
}
function motifArt(m, b, P, r) {
  if (m === 'house') return ART.house(b.x, b.y, b.S, P, r) + ART.coins(b.x + b.S * 0.52, b.y + b.S * 0.58, b.S * 0.5, P, r, 3);
  if (m === 'coins') return ART.coins(b.x, b.y, b.S, P, r, 5);
  return ART[m](b.x, b.y, b.S, P, r);
}

// ---------- slide types ----------
function cover(s, ctx) {
  const t = ctx.t;
  const P = ctx.palette;
  const r = rngOf(`${ctx.spec.id}:cover:${ctx.client.seed}`);
  const top = ctx.variant === 'b';
  const box = artBox(ctx, top ? 'top' : 'bottom');
  const art = motifArt(motifOf(s), box, P, r) + (ctx.isSingle ? '' : '');
  const inner = `${head(ctx)}
    <div class="ct-cover-body" data-block="headline">
      ${s.kicker ? tab(ctx, s.kicker) : ''}
      ${strips(ctx, s.headline, 'ct-h1', 'data-fit="box" data-max-lines="5" data-fit-min="62"')}
    </div>
    ${s.dek ? `<p class="ct-dek" data-block="dek">${t(s.dek)}</p>` : ''}
    ${foot(ctx, 'line', `<span class="ct-cue" data-role="label">${ctx.esc(s.cue || 'Swipe')}<svg viewBox="0 0 80 30" aria-hidden="true"><path d="M0,11 H52 V0 L80,15 L52,30 V19 H0 Z"/></svg></span>`)}`;
  return frame(s, ctx, { inner, art, cls: top ? 'is-top-art' : 'is-bottom-art' });
}

function point(s, ctx) {
  const t = ctx.t;
  const inner = s.figure ? `${head(ctx)}
      ${s.eyebrow ? tab(ctx, s.eyebrow) : ''}
      <div class="ct-figwrap" data-block="figure"><p class="ct-fig tnum" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 230 : 170}" data-paper="${ctx.variant === 'b' ? 'deep' : 'accent'}" data-paper-pad="0.04em">${t(s.figure)}</p></div>
      <div class="ct-card" data-paper="card" data-block="statement">
        <p class="ct-statement" data-role="display">${t(s.text)}</p>
        ${s.note ? `<p class="ct-note">${t(s.note)}</p>` : ''}
      </div>
      ${foot(ctx)}`
    : `${head(ctx)}
      ${s.eyebrow ? tab(ctx, s.eyebrow) : ''}
      ${strips(ctx, s.text, 'ct-h2 ct-big', 'data-block="statement" data-fit="box" data-max-lines="6" data-fit-min="52"')}
      ${s.note ? `<p class="ct-note" data-block="note">${t(s.note)}</p>` : ''}
      ${foot(ctx)}`;
  return frame(s, ctx, { inner, cls: s.figure ? 'has-fig' : 'no-fig' });
}

function number(s, ctx) {
  const t = ctx.t;
  const P = ctx.palette;
  const ch = ctx.calc?.chart;
  if (!ch) throw new Error('cutout number slide needs a calc with a chart');
  const rows = ch.rows;
  const max = Math.max(...rows.map((x) => x.value));
  const labels = s.rowLabels || rows.map((x) => x.label);
  const hi = ch.highlight ?? rows.length - 1;
  const cols = rows.map((x, k) => `<div class="ct-col ${k === hi && rows.length > 1 ? 'is-hi' : ''}" style="--h:${((x.value / max) * 100).toFixed(3)}">
      <p class="ct-col-v tnum">${ctx.esc(ch.unit === 'months' ? `${x.shortShown} months` : x.shortShown)}</p>
      <div class="ct-col-bar" data-paper="${k === hi && rows.length > 1 ? 'accent' : 'deep'}"></div>
      <p class="ct-col-k" data-role="label">${t(labels[k] || x.label)}</p>
    </div>`).join('');
  const inner = `${head(ctx)}
    ${s.label ? tab(ctx, s.label) : ''}
    ${strips(ctx, s.title, 'ct-h2 ct-title', 'data-block="title" data-fit="box" data-max-lines="3" data-fit-min="44"')}
    <div class="ct-chart n${rows.length}" data-block="chart">
      <div class="ct-cols">${cols}</div>
      ${s.callout ? `<div class="ct-callout" data-paper="card"><p class="ct-callout-v tnum">${t(s.callout)}</p>${s.calloutSub ? `<p class="ct-callout-s">${t(s.calloutSub)}</p>` : ''}</div>` : ''}
    </div>
    <p class="ct-fine" data-role="fine" data-block="fine">${t(s.assumptions || '')}</p>
    ${foot(ctx)}`;
  return frame(s, ctx, { inner, cls: rows.length === 1 ? 'one-col' : '' });
}

function compare(s, ctx) {
  const t = ctx.t;
  const sheet = (o, cls) => `<div class="ct-sheet ${cls}" data-paper="${cls === 'is-r' ? 'accent' : 'card'}">
      <p class="ct-sheet-k" data-role="label">${t(o.label)}</p>
      <div class="ct-sheet-vbox"><p class="ct-sheet-v tnum" data-role="display" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 104 : 80}">${t(o.value)}</p></div>
      ${o.note ? `<p class="ct-sheet-n">${t(o.note)}</p>` : ''}
    </div>`;
  const inner = `${head(ctx)}
    ${s.label ? tab(ctx, s.label) : ''}
    ${strips(ctx, s.title, 'ct-h2 ct-title', 'data-block="title" data-fit="box" data-max-lines="3" data-fit-min="44"')}
    <div class="ct-sheets" data-block="sheets">${sheet(s.left, 'is-l')}${sheet(s.right, 'is-r')}</div>
    ${s.verdict ? `<p class="ct-note ct-verdict" data-block="verdict">${t(s.verdict)}</p>` : ''}
    ${foot(ctx)}`;
  return frame(s, ctx, { inner });
}

function list(s, ctx, numbered) {
  const t = ctx.t;
  const items = (s.items || []).map((it, i) => `<li class="ct-item" style="--i:${i}">
      <span class="ct-dot tnum" aria-hidden="true">${numbered ? i + 1 : ''}</span>
      <span class="ct-slip" data-paper="card">${t(it.text)}${it.tag ? ` <em class="ct-tag" data-role="label">${t(it.tag)}</em>` : ''}</span>
    </li>`).join('');
  const inner = `${head(ctx)}
    ${s.label ? tab(ctx, s.label) : ''}
    ${strips(ctx, s.title, 'ct-h2 ct-title', 'data-block="title" data-fit="box" data-max-lines="3" data-fit-min="44"')}
    <ol class="ct-items ${numbered ? 'is-steps' : 'is-recap'}" data-block="items">${items}</ol>
    ${s.note ? `<p class="ct-note">${t(s.note)}</p>` : ''}
    ${foot(ctx)}`;
  return frame(s, ctx, { inner });
}

function myth(s, ctx) {
  const t = ctx.t;
  const inner = `${head(ctx)}
    ${tab(ctx, s.label || 'Myth')}
    ${strips(ctx, s.myth, 'ct-h2 ct-mythline', 'data-block="myth"')}
    <p class="ct-fact-k" data-role="label">Fact</p>
    <p class="ct-statement ct-fact" data-block="fact" data-role="display">${t(s.fact)}</p>
    ${s.note ? `<p class="ct-note">${t(s.note)}</p>` : ''}
    ${foot(ctx)}`;
  return frame(s, ctx, { inner });
}

function quote(s, ctx) {
  const t = ctx.t;
  const P = ctx.palette;
  const s0 = ctx.format.safe;
  const q = (x) => `<path d="M${x},0 h44 v44 c0,40 -14,66 -44,78 l-8,-16 c18,-10 26,-26 26,-46 h-18 z" fill="${P.accent}"/>`;
  // An opening quote mark: the closing shape turned 180°.
  const art = piece(`<g transform="translate(${s0.x0 + 160} ${s0.y0 + 250}) scale(1.5) rotate(180 0 0)">${q(0)}${q(62)}</g>`, 'ct-torn-a');
  const inner = `${head(ctx)}
    ${strips(ctx, s.quote, 'ct-h2 ct-quoteline', 'data-block="quote" data-fit="box" data-max-lines="6" data-fit-min="46"')}
    ${s.by ? `<p class="ct-by" data-role="label">${t(s.by)}</p>` : ''}
    ${foot(ctx)}`;
  return frame(s, ctx, { inner, art });
}

function stat(s, ctx) {
  const t = ctx.t;
  const P = ctx.palette;
  const r = rngOf(`${ctx.spec.id}:stat:${ctx.client.seed}`);
  const facts = (s.facts || []).map((f) => `<div class="ct-fact-tag ${f.emphasis ? 'is-em' : ''}" data-paper="${f.emphasis ? 'accent' : 'card'}">
      <span class="ct-fact-v tnum">${t(f.value)}</span><span class="ct-fact-l" data-role="label">${t(f.label)}${f.note ? ` <em>${t(f.note)}</em>` : ''}</span>
    </div>`).join('');
  const box = artBox(ctx, 'top');
  const art = ART[motifOf(s) === 'house' ? 'calendar' : motifOf(s)](box.x + box.S * 0.2, box.y, box.S * 0.7, P, r);
  const inner = `${head(ctx)}
    ${s.kicker ? tab(ctx, s.kicker) : ''}
    ${s.figure ? `<div class="ct-statfig"><span class="ct-fig tnum" data-paper="${ctx.variant === 'b' ? 'deep' : 'accent'}" data-paper-pad="0.04em">${t(s.figure)}</span>${s.figureLabel ? `<span class="ct-figlabel">${t(s.figureLabel)}</span>` : ''}</div>` : ''}
    ${strips(ctx, s.headline, 'ct-h2 ct-title', 'data-block="headline" data-fit="box" data-max-lines="4" data-fit-min="44"')}
    <div class="ct-facts" data-block="facts">${facts}</div>
    ${s.note ? `<p class="ct-note">${t(s.note)}</p>` : ''}
    ${foot(ctx, 'block')}`;
  return frame(s, ctx, { inner, art });
}

function cta(s, ctx) {
  const t = ctx.t;
  const P = ctx.palette;
  const W = ctx.format.w, H = ctx.format.h, sf = ctx.format.safe;
  const which = { send: 'plane', save: 'bookmark', comment: 'bubble' }[s.action || 'send'] || 'plane';
  const vb = ctx.variant === 'b';
  const size = ctx.format.name === 'story' ? 400 : ctx.format.name === 'square' ? 250 : vb ? 360 : 420;
  const ax = vb ? sf.x0 + 20 : W - size - 90;
  const ay = ctx.format.name === 'story' ? (vb ? 40 : 1380) : ctx.format.name === 'square' ? sf.y0 + 60 : vb ? sf.y0 + 70 : H - size - 150;
  const art = ART[which](ax, ay, size, P);
  const kw = s.keyword ? `<span class="ct-kw">${ctx.esc(s.keyword)}</span>` : '';
  const inner = `${head(ctx)}
    ${strips(ctx, String(s.headline).replace('{keyword}', s.keyword || ''), 'ct-h1 ct-cta-h', 'data-block="cta" data-fit="box" data-max-lines="5" data-fit-min="56"')}
    ${s.sub ? `<p class="ct-dek">${t(s.sub)}</p>` : ''}
    ${foot(ctx, 'block')}`;
  return frame(s, ctx, { inner, art, cls: kw ? 'has-kw' : '' });
}

const TYPES = { cover, point, number, compare, steps: (s, c) => list(s, c, true), recap: (s, c) => list(s, c, false), myth, quote, stat, cta };

export function render(slide, ctx) {
  const fn = TYPES[slide.type];
  if (!fn) throw new Error(`cutout: no layout for slide type "${slide.type}"`);
  return fn(slide, ctx);
}
