// Riso Two-Ink (group 3 · Riso). See library/riso/STYLE.md.
// Two translucent spot inks on warm paper. Plate A is the dark ink: it carries every word
// (live DOM type, multiplied onto the print). Plate B is the bright field ink. Art is declared
// here as invisible `.rz-shape` boxes laid out by CSS; page.js reads their positions, paints
// each plate as a density field, halftones it on its own screen angle, misregisters plate B
// by a seeded offset and multiplies both inks over the paper. Where they overlap: a third colour.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const META = JSON.parse(fs.readFileSync(path.join(DIR, 'style.json'), 'utf8'));
const TOKENS = path.resolve(DIR, '..', '..', 'tokens', 'clients');

// ---------- ink pairing ----------
const hex = (h) => { const s = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
function lab(h) {
  const [r, g, b] = hex(h).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, y = r * 0.2126 + g * 0.7152 + b * 0.0722, z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const dist = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const nearest = (h, names) => names.reduce((best, n) => (dist(h, META.inks[n]) < dist(h, META.inks[best]) ? n : best), names[0]);
const multiply = (a, b) => '#' + hex(a).map((v, i) => Math.round((v * hex(b)[i]) / 255).toString(16).padStart(2, '0')).join('');

// The client's accent picks the pair. A dark accent becomes the text plate and gets a bright
// partner; a bright accent becomes the field plate over federal blue (or black for cool fields).
export function inkPair(accent, seed = 1) {
  if (!accent) return { a: 'federal-blue', b: 'bright-red' };
  const all = Object.keys(META.inks);
  const n = nearest(accent, all);
  if (META.textInks.includes(n)) {
    const partners = ['sunflower', 'fluorescent-orange', 'bright-red'];
    return { a: n, b: partners[seed % partners.length] };
  }
  const cool = ['teal', 'green', 'blue', 'aqua'].includes(n);
  return { a: cool ? 'black' : 'federal-blue', b: n };
}

function clientAccent(id) {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(TOKENS, `${id}.json`), 'utf8'));
    const own = c.byStyle?.riso?.color?.accent;
    const v = own || c.color?.accent;
    return v && typeof v === 'object' ? v.$value : v;
  } catch { return null; }
}

// ---------- helpers ----------
// An invisible box that page.js paints into a plate. d = ink density 0..1; ramp = "d0,d1"
// steps from d0 to d1 along dir (down|up|right|left) in `steps` bands; kind rect|disc|path.
function shape({ plate = 'b', kind = 'rect', d = 1, ramp, dir = 'down', steps = 4, cls = '', style = '', path: p, vb, knock, rough }) {
  return `<div class="rz-shape ${cls}" data-plate="${plate}" data-kind="${kind}" data-d="${d}"${ramp ? ` data-ramp="${ramp}" data-dir="${dir}" data-steps="${steps}"` : ''}${p ? ` data-path="${p}" data-vb="${vb}"` : ''}${knock ? ` data-knock="${knock}"` : ''}${rough ? ' data-rough="1"' : ''} style="${style}"></div>`;
}

// A numeral printed twice: plate A (readable) over a plate-B echo offset like a double hit.
function dbl(ctx, text, cls = '', fitMax = 0) {
  const t = ctx.t(text);
  const fit = fitMax ? ` data-fit="width" data-fit-max="${fitMax}"` : '';
  return `<span class="rz-dbl ${cls}${fitMax ? ' rz-dbl-fit' : ''}"><span class="rz-echo" aria-hidden="true">${t}</span><span class="rz-fig rz-ink"${fit} data-role="display">${t}</span></span>`;
}

function head(ctx) {
  const folio = ctx.folio();
  return `<header class="rz-head" data-role="label" data-noword>
    <span class="rz-series rz-win">${KNOCK}${ctx.esc(ctx.spec.series || '')}</span>
    ${folio ? `<span class="rz-folio rz-win">${KNOCK}${folio}</span>` : ''}
  </header>`;
}
const KNOCK = '<i class="rz-knock" aria-hidden="true"><b class="rz-shape" data-plate="a" data-kind="rect" data-d="0" data-knock="ab"></b></i>';
const foot = (ctx, size = 'line', extra = '') => `<footer class="rz-foot" data-block="foot">${KNOCK}${extra}${ctx.compliance(size)}</footer>`;
const cue = (s, ctx) => `<span class="rz-cue" data-role="label">${ctx.esc(s.cue || 'Swipe')}<i aria-hidden="true">${shape({ plate: 'a', kind: 'path', path: 'M0 9 H54 V0 L80 15 L54 30 V21 H0 Z', vb: '0 0 80 30', cls: 'rz-cue-arrow' })}</i></span>`;

function inkCSS(ctx) {
  const pair = inkPair(clientAccent(ctx.client.id), ctx.client.seed || 1);
  const A = META.inks[pair.a], B = META.inks[pair.b];
  return { pair, A, B, css: `<style>.st-riso{--ink-a:${A};--ink-b:${B};--ink-ab:${multiply(A, B)};}</style>` };
}

// Background art per slide: a small vocabulary of flat riso shapes, chosen by slide index so
// a carousel changes rhythm, re-composed in variant b.
function field(ctx, which) {
  const b = ctx.variant === 'b';
  const k = which ?? ctx.index % 3;
  const L = [
    // 0: sun disc + stepped tint ground
    b ? shape({ kind: 'disc', cls: 'f-disc f-disc-bl' }) + shape({ cls: 'f-ramp f-ramp-top', ramp: '0.55,0.12', dir: 'down', steps: 4 })
      : shape({ kind: 'disc', cls: 'f-disc f-disc-tr' }) + shape({ cls: 'f-ramp f-ramp-low', ramp: '0.14,0.62', dir: 'right', steps: 5 }),
    // 1: tall bar of stepped tint + a plate-A disc crossing it
    b ? shape({ cls: 'f-bar f-bar-l', ramp: '1,0.2', dir: 'down', steps: 5 }) + shape({ plate: 'a', kind: 'disc', cls: 'f-dot f-dot-l' })
      : shape({ cls: 'f-bar f-bar-r', ramp: '0.2,1', dir: 'down', steps: 5 }) + shape({ plate: 'a', kind: 'disc', cls: 'f-dot f-dot-r' }),
    // 2: half disc rising from an edge, plate-A halftone ring echo
    b ? shape({ kind: 'disc', cls: 'f-half f-half-top' }) + shape({ plate: 'a', kind: 'disc', cls: 'f-half-tint f-half-top-t', d: 0.32 })
      : shape({ kind: 'disc', cls: 'f-half f-half-bot' }) + shape({ plate: 'a', kind: 'disc', cls: 'f-half-tint f-half-bot-t', d: 0.32 }),
  ];
  return `<div class="rz-field rz-field-${k}">${L[k]}</div>`;
}

function bgCanvas() {
  return '<canvas class="rz-print"></canvas>';
}

// Story canvases are 1920 tall but words live in y 270-1248; the lower canvas (still visible in
// the 3:4 profile-grid crop) gets its own print: a rising disc over a stepped plate-A ground.
function storyArt(ctx) {
  if (ctx.format.name !== 'story') return '';
  const b = ctx.variant === 'b';
  return `<div class="rz-art-full">${shape({ kind: 'disc', cls: b ? 's-disc-b' : 's-disc' })}${shape({ plate: 'a', cls: 's-ground', ramp: '0.12,0.55', dir: 'down', steps: 5 })}</div>`;
}

function wrap(ctx, cls, inner, art = '') {
  const ink = inkCSS(ctx);
  return {
    bg: bgCanvas(),
    html: `${ink.css}${filterSVG(ctx)}${storyArt(ctx)}<div class="rz-art">${art}</div><div class="stage ${cls}">${inner}</div>`,
    data: { inks: ink, seed: `${ctx.client.seed}:${ctx.spec.id}:${ctx.index}`, paper: ctx.palette.paper },
  };
}

// Ink texture for live type: slight edge wobble and a few pinholes, seeded per slide.
function filterSVG(ctx) {
  const s1 = Math.floor(ctx.rng() * 90) + 3, s2 = Math.floor(ctx.rng() * 90) + 3;
  return `<svg class="rz-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
    <filter id="rz-ink" x="-2%" y="-4%" width="104%" height="108%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="${s1}" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.7" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="1" seed="${s2}" result="s"/>
      <feColorMatrix in="s" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -14 10.2" result="m"/>
      <feComposite in="d" in2="m" operator="in"/>
    </filter></defs></svg>`;
}

// ---------- chart (any calc.chart: money or months, 1-3 rows, from zero) ----------
function chart(s, ctx) {
  const ch = ctx.calc?.chart;
  if (!ch) return '';
  const rows = ch.rows;
  const max = Math.max(...rows.map((r) => r.value));
  const labels = s.rowLabels || rows.map((r) => r.label);
  const refK = ch.highlight === 0 ? 1 : 0;
  const ref = rows[refK];
  const bars = rows.map((r, k) => {
    const hi = k === ch.highlight;
    const pctH = (r.value / max) * 100;
    // The change, drawn to scale: where the highlighted bar is taller, its extra prints as the
    // overprint (third colour); where it is shorter, the missing part stays as a ghost tint.
    let extra = '', ghost = '';
    if (hi && ref && rows.length > 1) {
      if (r.value > ref.value) extra = shape({ plate: 'a', d: 1, cls: 'rz-col-delta', style: `--dv:${(((r.value - ref.value) / max) * 100).toFixed(3)}` });
      else if (r.value < ref.value) ghost = `<div class="rz-col-ghost" style="--gv:${(((ref.value - r.value) / max) * 100).toFixed(3)}">${shape({ plate: 'b', d: 0.3, cls: 'rz-col-ghost-ink' })}</div>`;
    }
    return `<div class="rz-col${hi ? ' is-hi' : ''}" style="--v:${pctH.toFixed(3)}">
        <p class="rz-col-v" data-role="display">${ctx.esc(r.shortShown || r.shown)}${ch.unit === 'months' ? '<small> mo</small>' : ''}</p>
        ${ghost}<div class="rz-col-bar">${shape({ plate: hi ? 'b' : 'a', d: hi ? 1 : 0.42, cls: 'rz-col-ink' })}${extra}</div>
        <p class="rz-col-k" data-role="label">${ctx.t(labels[k] || r.label)}</p>
      </div>`;
  }).join('');
  return `<div class="rz-chart n-${rows.length}" data-block="chart">${bars}${shape({ plate: 'a', d: 1, cls: 'rz-base' })}<span class="rz-zero" data-role="label">${ch.unit === 'months' ? '0' : '$0'}</span></div>`;
}

// ---------- slide types ----------
function cover(s, ctx) {
  const t = ctx.t;
  const b = ctx.variant === 'b';
  const fig = s.figure ? `<div class="rz-cover-fig" data-block="figure">${dbl(ctx, s.figure, 'rz-dbl-xl', { feed: 470, story: 380, square: 250 }[ctx.format.name])}${s.figureLabel ? `<p class="rz-fig-label">${t(s.figureLabel)}</p>` : ''}</div>` : '';
  const art = b
    ? shape({ kind: 'disc', cls: 'c-disc-b' }) + shape({ plate: 'a', kind: 'disc', cls: 'c-ramp-b', ramp: '0.55,0.12', dir: 'down', steps: 5 }) + coins(ctx, 'c-coins-b')
    : shape({ kind: 'disc', cls: 'c-disc-a' }) + shape({ cls: 'c-ramp-a', ramp: '0.12,0.6', dir: 'right', steps: 5 }) + coins(ctx, 'c-coins-a');
  return wrap(ctx, 'rz-cover', `
    ${head(ctx)}
    ${s.kicker && s.kicker !== ctx.spec.series ? `<p class="rz-kicker rz-win" data-role="label">${KNOCK}${t(s.kicker)}</p>` : ''}
    ${fig}
    <h1 class="rz-h1 rz-ink${s.figure ? ' with-fig' : ''}" data-block="headline" data-fit="box" data-max-lines="${s.figure ? 4 : 5}" data-fit-min="64" data-role="display">${t(s.headline)}</h1>
    ${s.dek ? `<p class="rz-dek" data-block="dek">${t(s.dek)}</p>` : ''}
    ${foot(ctx, 'line', cue(s, ctx))}`, art);
}

// Stacked coins in plate A (solid rims, tint faces) knocked out of the plate-B field beneath.
function coins(ctx, cls) {
  const stacks = [7, 11, 4];
  let out = '';
  stacks.forEach((n, si) => {
    for (let i = 0; i < n; i++) {
      out += `<div class="coin" style="--s:${si};--i:${i}">${shape({ plate: 'a', kind: 'disc', cls: 'coin-rim', knock: 'b' })}${shape({ plate: 'a', kind: 'disc', d: 0.34, cls: 'coin-face', knock: 'b' })}</div>`;
    }
  });
  return `<div class="rz-coins ${cls}">${out}</div>`;
}

function point(s, ctx) {
  const t = ctx.t;
  return wrap(ctx, `rz-point${s.figure ? ' has-fig' : ''}`, `
    ${head(ctx)}
    ${s.eyebrow ? `<p class="rz-kicker rz-win" data-role="label">${KNOCK}${t(s.eyebrow)}</p>` : ''}
    ${s.figure ? `<div class="rz-point-fig" data-block="figure">${dbl(ctx, s.figure, 'rz-dbl-l', ctx.format.name === 'feed' ? 330 : 250)}</div>` : ''}
    <p class="rz-statement rz-ink" data-block="statement" data-role="display">${t(s.text)}</p>
    ${s.note ? `<p class="rz-note" data-block="note">${t(s.note)}</p>` : ''}
    ${foot(ctx)}`, field(ctx));
}

function number(s, ctx) {
  const t = ctx.t;
  return wrap(ctx, 'rz-number', `
    ${head(ctx)}
    ${s.label ? `<p class="rz-kicker rz-win" data-role="label">${KNOCK}${t(s.label)}</p>` : ''}
    <h2 class="rz-h2 rz-ink" data-block="title" data-role="display">${t(s.title)}</h2>
    <div class="rz-num-body">
      ${chart(s, ctx)}
      ${s.callout ? `<div class="rz-callout" data-block="callout">${dbl(ctx, s.callout, 'rz-dbl-m', 150)}<p class="rz-callout-s">${t(s.calloutSub || '')}</p></div>` : ''}
    </div>
    ${s.takeaway ? `<p class="rz-note">${t(s.takeaway)}</p>` : ''}
    <p class="rz-fine rz-win" data-role="fine" data-block="fine">${KNOCK}${t(s.assumptions || '')}</p>
    ${foot(ctx)}`);
}

function compare(s, ctx) {
  const t = ctx.t;
  const side = (o, k) => `<div class="rz-side rz-side-${k}" data-block="side-${k}">
      ${shape({ plate: k === 'r' ? 'b' : 'a', d: k === 'r' ? 1 : 0, cls: 'rz-side-ink', knock: k === 'l' ? 'b' : '' })}
      <p class="rz-side-k" data-role="label">${t(o.label)}</p>
      <p class="rz-side-v rz-ink" data-role="display">${t(o.value)}</p>
      ${o.note ? `<p class="rz-side-n">${t(o.note)}</p>` : ''}
    </div>`;
  return wrap(ctx, 'rz-compare', `
    ${head(ctx)}
    ${s.label ? `<p class="rz-kicker rz-win" data-role="label">${KNOCK}${t(s.label)}</p>` : ''}
    <h2 class="rz-h2 rz-ink" data-block="title" data-role="display">${t(s.title)}</h2>
    <div class="rz-sides">${side(s.left, 'l')}${side(s.right, 'r')}${shape({ plate: 'a', kind: 'disc', cls: 'rz-vs-dot' })}<span class="rz-vs" aria-hidden="true">vs</span></div>
    ${s.verdict ? `<p class="rz-note rz-verdict">${t(s.verdict)}</p>` : ''}
    ${foot(ctx)}`, shape({ plate: 'a', cls: 'cmp-tint', d: 0.0 }));
}

function list(s, ctx, numbered) {
  const t = ctx.t;
  const items = (s.items || []).map((it, i) => `<li class="rz-item">
      <span class="rz-item-n" aria-hidden="true">${shape({ plate: 'b', kind: 'disc', cls: 'rz-item-dot' })}${numbered ? `<b>${i + 1}</b>` : shape({ plate: 'a', kind: 'path', path: 'M2 30 L12 20 L22 31 L46 4 L56 14 L22 52 Z', vb: '0 0 58 56', cls: 'rz-item-tick' })}</span>
      <span class="rz-item-t">${t(it.text)}${it.tag ? ` <em class="rz-tag" data-role="label">${t(it.tag)}</em>` : ''}</span>
    </li>`).join('');
  return wrap(ctx, `rz-list ${numbered ? 'is-steps' : 'is-recap'}`, `
    ${head(ctx)}
    ${s.label ? `<p class="rz-kicker rz-win" data-role="label">${KNOCK}${t(s.label)}</p>` : ''}
    <h2 class="rz-h2 rz-ink" data-block="title" data-role="display">${t(s.title)}</h2>
    <ol class="rz-items" data-block="items">${items}</ol>
    ${s.note ? `<p class="rz-note">${t(s.note)}</p>` : ''}
    ${foot(ctx)}`, ctx.variant === 'b' ? shape({ kind: 'disc', cls: 'l-sun-b' }) + shape({ plate: 'a', kind: 'disc', d: 0.3, cls: 'l-tint-b' }) : shape({ cls: 'l-strip', ramp: '0.75,0.15', dir: 'down', steps: 5 }) + shape({ plate: 'a', kind: 'disc', cls: 'l-dot' }));
}

function myth(s, ctx) {
  const t = ctx.t;
  return wrap(ctx, 'rz-myth', `
    ${head(ctx)}
    <p class="rz-kicker rz-win" data-role="label">${KNOCK}${t(s.label || 'Myth')}</p>
    <p class="rz-myth-t rz-ink" data-block="myth"><span class="rz-struck" data-rz-strike>${t(s.myth)}</span></p>
    <p class="rz-fact-k" data-role="label">${ctx.esc(s.factLabel || 'Fact')}</p>
    <p class="rz-fact-t rz-ink" data-block="fact" data-role="display">${t(s.fact)}</p>
    ${s.note ? `<p class="rz-note">${t(s.note)}</p>` : ''}
    ${foot(ctx)}`, field(ctx, 2));
}

function quote(s, ctx) {
  const t = ctx.t;
  const q = 'M0 60 C0 25 18 4 46 0 L50 12 C34 18 28 30 28 42 L48 42 L48 96 L0 96 Z M62 60 C62 25 80 4 108 0 L112 12 C96 18 90 30 90 42 L110 42 L110 96 L62 96 Z';
  return wrap(ctx, 'rz-quote', `
    ${head(ctx)}
    <p class="rz-q rz-ink" data-block="quote" data-role="display">${t(s.quote)}</p>
    ${s.by ? `<p class="rz-by" data-role="label">${t(s.by)}</p>` : ''}
    ${foot(ctx)}`, shape({ kind: 'path', path: q, vb: '0 0 112 96', cls: 'q-marks' }) + shape({ cls: 'q-ramp', ramp: '0.1,0.5', dir: 'right', steps: 4 }));
}

function stat(s, ctx) {
  const t = ctx.t;
  const facts = (s.facts || []).map((f, i) => `<div class="rz-fact${f.emphasis ? ' is-em' : ''}" data-block="fact-${i}">
      ${f.emphasis ? shape({ plate: 'b', cls: 'rz-fact-ink' }) : ''}
      <p class="rz-fact-l" data-role="label">${t(f.label)}</p>
      <p class="rz-fact-v rz-ink" data-role="display">${t(f.value)}</p>
      ${f.note ? `<p class="rz-fact-n" data-role="label">${t(f.note)}</p>` : ''}
    </div>`).join('');
  return wrap(ctx, 'rz-stat', `
    ${head(ctx)}
    ${s.kicker && s.kicker !== ctx.spec.series ? `<p class="rz-kicker rz-win" data-role="label">${KNOCK}${t(s.kicker)}</p>` : ''}
    <div class="rz-stat-top">
      ${s.figure ? `<div class="rz-stat-fig" data-block="figure">${dbl(ctx, s.figure, 'rz-dbl-l')}${s.figureLabel ? `<p class="rz-fig-label">${t(s.figureLabel)}</p>` : ''}</div>` : ''}
      <h1 class="rz-h2 rz-ink" data-block="headline" data-role="display">${t(s.headline)}</h1>
    </div>
    <div class="rz-facts">${facts}</div>
    ${s.note ? `<p class="rz-fine rz-win" data-role="fine">${KNOCK}${t(s.note)}</p>` : ''}
    ${foot(ctx, 'block')}`, ctx.variant === 'b' ? shape({ plate: 'a', kind: 'disc', d: 0.3, cls: 'st-moon-b' }) + shape({ kind: 'disc', cls: 'st-sun-b' }) : shape({ plate: 'a', kind: 'disc', d: 0.3, cls: 'st-moon' }) + shape({ kind: 'disc', cls: 'st-sun' }));
}

function cta(s, ctx) {
  const t = ctx.t;
  const kw = s.keyword ? `<span class="rz-kw" data-mark="riso">${ctx.esc(s.keyword)}</span>` : '';
  const b = ctx.variant === 'b';
  return wrap(ctx, 'rz-cta', `
    ${head(ctx)}
    <h2 class="rz-cta-h rz-ink" data-block="cta" data-fit="box" data-max-lines="5" data-fit-min="64" data-role="display">${t(s.headline).replace('{keyword}', kw)}</h2>
    ${s.sub ? `<p class="rz-dek">${t(s.sub)}</p>` : ''}
    ${foot(ctx, 'block')}`, b ? shape({ kind: 'disc', cls: 'cta-disc-b' }) + shape({ plate: 'a', kind: 'disc', cls: 'cta-tint-b', ramp: '0.12,0.5', dir: 'down', steps: 4 })
    : shape({ kind: 'disc', cls: 'cta-disc' }) + shape({ plate: 'a', kind: 'disc', cls: 'cta-tint', ramp: '0.5,0.12', dir: 'down', steps: 4 }));
}

const TYPES = { cover, point, number, compare, steps: (s, c) => list(s, c, true), recap: (s, c) => list(s, c, false), myth, quote, stat, cta };

export function render(slide, ctx) {
  const fn = TYPES[slide.type];
  if (!fn) throw new Error(`riso: no layout for slide type "${slide.type}" (has ${Object.keys(TYPES).join(', ')})`);
  return fn(slide, ctx);
}
