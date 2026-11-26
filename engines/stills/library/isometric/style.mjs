// Iso Blocks (group 3 · Riso). See library/isometric/STYLE.md.
// A three.js isometric model in matte clay (page.js) sits in a designed box on a flat ground;
// type is live HTML around it, joined to the model by hairline leaders. Every volume that
// stands for a number is sized from calc.chart, from zero. Scenes are described here (Node)
// as plain data: objects placed on a (u, v) grid where u runs screen-right and v toward you.

const fmtSize = (ctx, feed, story, square) => ({ feed, story, square }[ctx.format.name]);

function head(ctx) {
  const folio = ctx.folio();
  return `<header class="io-head" data-role="label" data-noword>
    <span class="io-series">${ctx.esc(ctx.spec.series || '')}</span>
    ${folio ? `<span class="io-folio">${folio}</span>` : ''}
  </header>`;
}
const foot = (ctx, size = 'line', extra = '') => `<footer class="io-foot" data-block="foot">${extra}${ctx.compliance(size)}</footer>`;
const cue = (s, ctx) => `<span class="io-cue" data-role="label">${ctx.esc(s.cue || 'Swipe')}<i aria-hidden="true"></i></span>`;

// A label joined to the model: text in the layout, a leader drawn by page.js to `anchor`.
const lab = (ctx, id, anchor, side, inner, cls = '', auto = false) => `<div class="io-lab ${cls}" id="${id}" data-role="label" data-anchor="${anchor}" data-side="${side}"${auto ? ' data-place="auto"' : ''}>${inner}</div>`;

function page(ctx, cls, inner, scene) {
  // An accent too light to carry text (it had to be darkened to reach 4.5:1) stays in the
  // model and in rules; big figures then set in ink.
  const soft = String(ctx.palette['accent-ink']).toLowerCase() !== String(ctx.palette.accent).toLowerCase();
  return {
    classes: soft ? 'io-soft-accent' : '',
    bg: '<canvas class="io-gl"></canvas>',
    html: `<svg class="io-leaders" aria-hidden="true" viewBox="0 0 ${ctx.format.w} ${ctx.format.h}" width="${ctx.format.w}" height="${ctx.format.h}"></svg><div class="stage ${cls}">${inner}</div>`,
    data: { scene, palette: ctx.palette, seed: `${ctx.client.seed}:${ctx.spec.id}:${ctx.index}` },
  };
}

// ---------- scene builders (world units; ground at y = 0) ----------
// Two households on two plinths: a gift letter leaning on one, the whole loan standing on the other.
function houses(labels = ['A', 'B']) {
  return {
    objects: [
      { id: 'pl-l', kind: 'plinth', u: -2.3, v: 0, w: 2.9, d: 2.9, h: 0.3, color: 'stone-2' },
      { id: 'pl-r', kind: 'plinth', u: 2.3, v: 0, w: 2.9, d: 2.9, h: 0.3, color: 'stone-2' },
      { id: 'h-l', kind: 'house', u: -2.7, v: -0.45, y: 0.3, s: 1.5, color: 'stone' },
      { id: 'h-r', kind: 'house', u: 1.9, v: -0.45, y: 0.3, s: 1.5, color: 'stone' },
      { id: 'gift', kind: 'envelope', u: -1.45, v: 0.8, y: 0.3, s: 1.25, color: 'stone', seal: 'accent' },
      { id: 'loan', kind: 'box', u: 3.1, v: 0.55, y: 0.3, w: 1.0, d: 1.0, h: 2.7, color: 'accent' },
    ],
    labels,
  };
}

// Columns from calc.chart: heights in exact proportion to the values, from zero.
function columns(ctx, rows, highlight) {
  const max = Math.max(...rows.map((r) => r.value));
  const H = rows.length === 1 ? 4.2 : 5.4;
  const gap = 2.2;
  if (rows.length === 1) {
    // One value has no scale of its own: stand it next to the house it pays for.
    return { objects: [
      { id: 'base', kind: 'plinth', u: 0, v: 0, w: 3.6, d: 3.6, h: 0.24, color: 'stone-2' },
      { id: 'house', kind: 'house', u: -1.05, v: -0.35, y: 0.24, s: 1.55, color: 'stone' },
      { id: 'col0', kind: 'box', u: 1.15, v: 0.25, y: 0.24, w: 1.1, d: 1.1, h: H, color: highlight === 0 ? 'accent' : 'stone' },
    ], scale: { max, H } };
  }
  const u0 = -((rows.length - 1) * gap) / 2;
  const objs = [{ id: 'base', kind: 'plinth', u: 0, v: 0, w: rows.length * gap + 1.4, d: 2.6, h: 0.22, color: 'stone-2' }];
  rows.forEach((r, k) => {
    objs.push({ id: `col${k}`, kind: 'box', u: u0 + k * gap, v: 0, y: 0.22, w: 1.35, d: 1.35, h: Math.max(0.02, (H * r.value) / max), color: k === highlight ? 'accent' : 'stone', exact: r.value });
  });
  return { objects: objs, scale: { max, H } };
}

function stairs(n) {
  const objs = [];
  for (let i = 0; i < n; i++) objs.push({ id: `st${i}`, kind: 'box', u: -1.6 + i * 1.6, v: 0, w: 1.6, d: 2.4, h: 0.9 + i * 1.1, color: i === n - 1 ? 'accent' : 'stone' });
  return { objects: objs };
}

function token(kind, ctx) {
  const k = kind ?? ['slabs', 'coins', 'house'][ctx.index % 3];
  if (k === 'house') return { objects: [{ id: 'pl', kind: 'plinth', u: 0, v: 0, w: 3, d: 3, h: 0.3, color: 'stone-2' }, { id: 'obj', kind: 'house', u: -0.1, v: -0.2, y: 0.3, s: 1.7, color: 'stone' }] };
  if (k === 'coins') return { objects: [0, 1, 2].map((s) => ({ id: s === 1 ? 'obj' : `cs${s}`, kind: 'coins', u: -1.3 + s * 1.3, v: s === 1 ? -0.5 : 0.35, n: [6, 11, 4][s], r: 0.55, color: s === 1 ? 'accent' : 'stone' })) };
  return { objects: [0, 1, 2, 3].map((i) => ({ id: i === 3 ? 'obj' : `sl${i}`, kind: 'box', u: 0, v: 0, y: i * 0.42, w: 2.6 - i * 0.42, d: 2.6 - i * 0.42, h: 0.36, color: i === 3 ? 'accent' : i % 2 ? 'stone-2' : 'stone' })) };
}

function actionObject(action) {
  if (action === 'save') return { objects: [{ id: 'pl', kind: 'plinth', u: 0, v: 0, w: 3, d: 3, h: 0.28, color: 'stone-2' }, { id: 'obj', kind: 'bookmark', u: 0, v: 0, y: 0.28, s: 2.4, color: 'accent' }] };
  if (action === 'comment') return { objects: [{ id: 'pl', kind: 'plinth', u: 0, v: 0, w: 3, d: 3, h: 0.28, color: 'stone-2' }, { id: 'obj', kind: 'bubble', u: 0, v: 0, y: 0.28, s: 2.2, color: 'accent' }] };
  return { objects: [
    { id: 'pl', kind: 'plinth', u: -1.6, v: 0.5, w: 2.8, d: 2.8, h: 0.26, color: 'stone-2' },
    { id: 'house', kind: 'house', u: -1.8, v: 0.3, y: 0.26, s: 1.45, color: 'stone' },
    { id: 'trail', kind: 'trail', from: [-0.7, 0.5, 1.85], via: [0.35, 0.25, 3.0], to: [1.45, 0, 2.45] },
    { id: 'obj', kind: 'plane', u: 1.95, v: -0.1, y: 2.45, s: 1.0, color: 'accent' },
  ] };
}

// ---------- slide types ----------
function cover(s, ctx) {
  const t = ctx.t;
  const b = ctx.variant === 'b';
  const sc = s.scene?.kind === 'two-houses' ? houses(s.scene.labels) : token('coins', ctx);
  const labs = s.scene?.kind === 'two-houses'
    ? `${lab(ctx, 'lab-l', 'gift', 'top', `<span class="io-tag">${t(sc.labels[0])}</span>`, 'io-lab-l', true)}${lab(ctx, 'lab-r', 'loan', 'top', `<span class="io-tag">${t(sc.labels[1])}</span>`, 'io-lab-r', true)}`
    : '';
  const showFig = s.figure && !String(s.headline).includes(String(s.figure));
  return page(ctx, `io-cover`, `
    ${head(ctx)}
    <div class="io-cover-text" data-block="headline">
      ${s.kicker && s.kicker !== ctx.spec.series ? `<p class="io-kicker" data-role="label">${t(s.kicker)}</p>` : ''}
      <h1 class="io-h1" data-fit="box" data-max-lines="5" data-fit-min="${fmtSize(ctx, 62, 62, 54)}" data-role="display">${t(s.headline)}</h1>
      ${s.dek ? `<p class="io-dek">${t(s.dek)}</p>` : ''}
    </div>
    ${showFig ? `<p class="io-fig io-fig-cover" data-role="display" data-block="figure">${t(s.figure)}${s.figureLabel ? ` <span class="io-fig-l">${t(s.figureLabel)}</span>` : ''}</p>` : ''}
    <div class="io-scene io-scene-cover" data-scene>${labs}</div>
    ${foot(ctx, 'line', cue(s, ctx))}`, { ...sc, frame: 'cover' });
}

function point(s, ctx) {
  const t = ctx.t;
  return page(ctx, `io-point${s.figure ? ' has-fig' : ''}`, `
    ${head(ctx)}
    ${s.eyebrow ? `<p class="io-kicker" data-role="label">${t(s.eyebrow)}</p>` : ''}
    ${s.figure ? `<p class="io-fig io-fig-point" data-block="figure" data-role="display">${t(s.figure)}</p>` : ''}
    <p class="io-statement" data-block="statement" data-role="display">${t(s.text)}</p>
    ${s.note ? `<p class="io-note" data-block="note">${t(s.note)}</p>` : ''}
    <div class="io-scene io-scene-small" data-scene></div>
    ${foot(ctx)}`, token(null, ctx));
}

function number(s, ctx) {
  const t = ctx.t;
  const ch = ctx.calc?.chart;
  if (!ch) throw new Error('isometric number slide needs a calc with a chart');
  const labels = s.rowLabels || ch.rows.map((r) => r.label);
  const sc = columns(ctx, ch.rows, ch.highlight);
  const side = (k) => (ch.rows.length === 1 ? 'right' : k < (ch.rows.length - 1) / 2 ? 'left' : k > (ch.rows.length - 1) / 2 ? 'right' : 'top');
  const solo = ch.rows.length === 1 && s.callout;
  const labs = ch.rows.map((r, k) => lab(ctx, `lab-c${k}`, `col${k}`, side(k), `${solo ? '' : `<span class="io-lab-v" data-role="display">${ctx.esc(r.shortShown || r.shown)}${ch.unit === 'months' ? ' mo' : ''}</span>`}<span class="io-lab-k" data-role="label">${t(labels[k] || r.label)}</span>`, `io-lab-col io-lab-${side(k)} n${ch.rows.length}-${k}`, true)).join('');
  return page(ctx, `io-number n-${ch.rows.length}`, `
    ${head(ctx)}
    ${s.label ? `<p class="io-kicker" data-role="label">${t(s.label)}</p>` : ''}
    <h2 class="io-h2" data-block="title" data-role="display">${t(s.title)}</h2>
    <div class="io-scene io-scene-chart" data-scene>${labs}</div>
    ${s.callout ? `<div class="io-callout" data-block="callout"><p class="io-callout-v" data-role="display">${t(s.callout)}</p><p class="io-callout-s">${t(s.calloutSub || '')}</p></div>` : ''}
    <p class="io-fine" data-role="fine" data-block="fine">${t(s.assumptions || '')}</p>
    ${foot(ctx)}`, { ...sc, frame: 'chart' });
}

function compare(s, ctx) {
  const t = ctx.t;
  const sc = {
    objects: [
      { id: 'pl-l', kind: 'plinth', u: -2.45, v: 0, w: 3.1, d: 3.1, h: 0.3, color: 'stone-2' },
      { id: 'pl-r', kind: 'plinth', u: 2.45, v: 0, w: 3.1, d: 3.1, h: 0.3, color: 'stone-2' },
      { id: 'ob-l', kind: 'house', u: -2.45, v: -0.1, y: 0.3, s: 1.85, color: 'stone' },
      { id: 'ob-r', kind: 'house', u: 2.45, v: -0.1, y: 0.3, s: 1.85, color: 'stone', roof: 'accent' },
    ],
  };
  const side = (o, k) => `<div class="io-side io-side-${k}" data-block="side-${k}">
      ${lab(ctx, `lab-${k}`, k === 'l' ? 'ob-l' : 'ob-r', 'top', `<span class="io-tag">${t(o.label)}</span>`, `io-lab-side io-lab-side-${k}`)}
      <p class="io-side-v" data-role="display">${t(o.value)}</p>
      ${o.note ? `<p class="io-side-n">${t(o.note)}</p>` : ''}
    </div>`;
  return page(ctx, 'io-compare', `
    ${head(ctx)}
    ${s.label ? `<p class="io-kicker" data-role="label">${t(s.label)}</p>` : ''}
    <h2 class="io-h2" data-block="title" data-role="display">${t(s.title)}</h2>
    <div class="io-scene io-scene-compare" data-scene></div>
    <div class="io-sides">${side(s.left, 'l')}${side(s.right, 'r')}</div>
    ${s.verdict ? `<p class="io-note io-verdict">${t(s.verdict)}</p>` : ''}
    ${foot(ctx)}`, { ...sc, frame: 'compare' });
}

function list(s, ctx, numbered) {
  const t = ctx.t;
  const n = (s.items || []).length;
  // Steps climb a staircase, one numbered tread per item; a recap stacks one slab per item.
  const sc = numbered ? stairs(n) : { objects: (s.items || []).map((_, i) => ({ id: `st${i}`, kind: 'box', u: 0, v: 0, y: i * 0.62, w: 2.9 - i * 0.5, d: 2.9 - i * 0.5, h: 0.56, color: i === n - 1 ? 'accent' : i % 2 ? 'stone-2' : 'stone' })) };
  const treads = numbered ? (s.items || []).map((_, i) => lab(ctx, `lab-t${i}`, `st${i}`, 'top', `<span class="io-tread">${String(i + 1).padStart(2, '0')}</span>`, 'io-lab-tread', true)).join('') : '';
  const items = (s.items || []).map((it, i) => `<li class="io-item"><span class="io-item-n" aria-hidden="true">${numbered ? String(i + 1).padStart(2, '0') : ''}</span><span class="io-item-t">${t(it.text)}${it.tag ? ` <em class="io-tag2" data-role="label">${t(it.tag)}</em>` : ''}</span></li>`).join('');
  return page(ctx, `io-list ${numbered ? 'is-steps' : 'is-recap'}`, `
    ${head(ctx)}
    ${s.label ? `<p class="io-kicker" data-role="label">${t(s.label)}</p>` : ''}
    <h2 class="io-h2" data-block="title" data-role="display">${t(s.title)}</h2>
    <div class="io-list-body">
      <ol class="io-items" data-block="items">${items}</ol>
      <div class="io-scene io-scene-stairs" data-scene>${treads}</div>
    </div>
    ${s.note ? `<p class="io-note">${t(s.note)}</p>` : ''}
    ${foot(ctx)}`, { ...sc, frame: 'stairs' });
}

function myth(s, ctx) {
  const t = ctx.t;
  return page(ctx, 'io-myth', `
    ${head(ctx)}
    <p class="io-kicker" data-role="label">${t(s.label || 'Myth')}</p>
    <p class="io-myth-t" data-block="myth"><span class="mk" data-mark="strike">${t(s.myth)}</span></p>
    <p class="io-kicker io-fact-k" data-role="label">${ctx.esc(s.factLabel || 'Fact')}</p>
    <p class="io-statement" data-block="fact" data-role="display">${t(s.fact)}</p>
    ${s.note ? `<p class="io-note">${t(s.note)}</p>` : ''}
    <div class="io-scene io-scene-small" data-scene></div>
    ${foot(ctx)}`, token('slabs', ctx));
}

function quote(s, ctx) {
  const t = ctx.t;
  return page(ctx, 'io-quote', `
    ${head(ctx)}
    <p class="io-q" data-block="quote" data-role="display">“${t(s.quote)}”</p>
    ${s.by ? `<p class="io-by" data-role="label">${t(s.by)}</p>` : ''}
    <div class="io-scene io-scene-small" data-scene></div>
    ${foot(ctx)}`, token('house', ctx));
}

function stat(s, ctx) {
  const t = ctx.t;
  const facts = (s.facts || []).map((f, i) => `<div class="io-fact${f.emphasis ? ' is-em' : ''}" data-block="fact-${i}">
      <p class="io-fact-l" data-role="label">${t(f.label)}</p>
      <p class="io-fact-v" data-role="display">${t(f.value)}</p>
      ${f.note ? `<p class="io-fact-n" data-role="label">${t(f.note)}</p>` : ''}
    </div>`).join('');
  const ch = ctx.calc?.chart;
  const sc = ch ? columns(ctx, ch.rows, ch.highlight) : token('slabs', ctx);
  return page(ctx, 'io-stat', `
    ${head(ctx)}
    ${s.kicker && s.kicker !== ctx.spec.series ? `<p class="io-kicker" data-role="label">${t(s.kicker)}</p>` : ''}
    <h1 class="io-h2" data-block="headline" data-role="display">${t(s.headline)}</h1>
    <div class="io-stat-body">
      <div class="io-facts">${s.figure ? `<p class="io-fig io-fig-stat" data-role="display">${t(s.figure)}${s.figureLabel ? ` <span class="io-fig-l">${t(s.figureLabel)}</span>` : ''}</p>` : ''}${facts}</div>
      <div class="io-scene io-scene-stat" data-scene></div>
    </div>
    ${s.note ? `<p class="io-fine" data-role="fine">${t(s.note)}</p>` : ''}
    ${foot(ctx, 'block')}`, { ...sc, frame: 'stat' });
}

function cta(s, ctx) {
  const t = ctx.t;
  const kw = s.keyword ? `<span class="io-kw">${ctx.esc(s.keyword)}</span>` : '';
  return page(ctx, 'io-cta', `
    ${head(ctx)}
    <div class="io-scene io-scene-cta" data-scene></div>
    <h2 class="io-cta-h" data-block="cta" data-fit="box" data-max-lines="5" data-fit-min="60" data-role="display">${t(s.headline).replace('{keyword}', kw)}</h2>
    ${s.sub ? `<p class="io-dek">${t(s.sub)}</p>` : ''}
    ${foot(ctx, 'block')}`, actionObject(s.action));
}

const TYPES = { cover, point, number, compare, steps: (s, c) => list(s, c, true), recap: (s, c) => list(s, c, false), myth, quote, stat, cta };

export function render(slide, ctx) {
  const fn = TYPES[slide.type];
  if (!fn) throw new Error(`isometric: no layout for slide type "${slide.type}" (has ${Object.keys(TYPES).join(', ')})`);
  return fn(slide, ctx);
}
