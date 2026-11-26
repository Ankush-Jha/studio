// Bento Ledger (group 1 · Ledger). See library/bento/STYLE.md.
// A ledger-dashboard of unequal, square-cornered tiles on cool stone. One hero tile in the
// client colour, at most one ink tile, the rest paper. Every tile carries one number and a
// micro-visual, and every bar on a slide shares one scale, so tiles can be compared at a glance.
// No shadows, no radius, no gradients: the gutters do the separating.

const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/[=()~*|]/g, '');
function moneyOf(s) {
  const m = strip(s).match(/\$\s?([\d,]+(?:\.\d+)?)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

function head(ctx, kicker) {
  const folio = ctx.folio();
  return `<header class="bn-head" data-noword>
    <span class="bn-kicker" data-role="label">${kicker ? ctx.t(kicker) : ctx.esc(ctx.spec.series || '')}</span>
    ${folio ? `<span class="bn-folio" data-role="label">${folio}</span>` : ''}
  </header>`;
}

function foot(ctx, size = 'line', extra = '') {
  return `<footer class="bn-foot">${ctx.compliance(size)}${extra}</footer>`;
}

// The grid has 12 columns. Area rows are written compactly: 'h:6 a:6' -> six h, six a.
// Plain 4-token rows ('h h a a') are widened x3, so simple layouts stay readable.
function expand(row) {
  const toks = row.trim().split(/\s+/);
  if (toks.some((t) => t.includes(':'))) return toks.flatMap((t) => { const [k, n] = t.split(':'); return Array(+n || 1).fill(k); }).join(' ');
  return toks.flatMap((t) => [t, t, t]).join(' ');
}
const grid = (areas, rows, inner, cls = '') => `<div class="bn-grid ${cls}" style="grid-template-areas:${areas.map((r) => `'${expand(r)}'`).join(' ')};grid-template-rows:${rows}" data-block="grid">${inner}</div>`;
// data-fit="box" with an unreachable minimum turns fit.js into a clip detector: a tile whose
// content doesn't fit is reported as fit-failed instead of being silently cut off.
const tile = (area, tone, inner, cls = '') => `<section class="bn-tile is-${tone} ${cls}" style="grid-area:${area}" data-fit="box" data-fit-min="999">${inner}</section>`;

// Story: the profile grid shows y 240-1680 but text stops at 1248, so the band below carries
// a decorative accent tile with a ghost of the hero figure (aria-hidden, no information).
// Sized so the whole figure fits the band: a cropped "+$54" must never read as "$5".
const ghost = (ctx, fig) => {
  const txt = strip(fig || '').trim();
  if (ctx.format.name !== 'story' || !txt) return '';
  const fs = Math.min(460, Math.floor(860 / (txt.length * 0.74)));
  return `<div class="bn-ghost" aria-hidden="true"><span style="font-size:${fs}px">${ctx.esc(txt)}</span></div>`;
};

// Micro-visuals -----------------------------------------------------------
const bar = (v, max, opts = {}) => {
  const w = Math.max(0, Math.min(1, v / max)) * 100;
  const d = opts.delta ? `<b style="left:${(opts.delta[0] / max) * 100}%;width:${((opts.delta[1] - opts.delta[0]) / max) * 100}%"></b>` : '';
  return `<div class="bn-bar" aria-hidden="true"><i style="width:${w.toFixed(3)}%"></i>${d}</div>`;
};
function ring(n, filled, caption) {
  const r = 46, c = 2 * Math.PI * r, gap = 7;
  const seg = c / n - gap;
  let s = '';
  for (let k = 0; k < n; k++) {
    const on = k < filled;
    s += `<circle cx="60" cy="60" r="${r}" fill="none" stroke-width="16" class="${on ? 'on' : 'off'}" stroke-dasharray="${seg.toFixed(2)} ${(c - seg).toFixed(2)}" stroke-dashoffset="${(-k * (seg + gap)).toFixed(2)}" transform="rotate(-90 60 60)"/>`;
  }
  return `<div class="bn-ring-box"><svg class="bn-ring" width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">${s}</svg>${caption ? `<span class="bn-ring-k" data-role="label">${caption}</span>` : ''}</div>`;
}
const stop = () => `<div class="bn-stop" aria-hidden="true">${'<i></i>'.repeat(6)}<b></b></div>`;

// A micro-visual read from the figure itself (decorative, aria-hidden, no extra words):
// "2 in 3" -> three cells, two filled; "Nov 18" -> that month as a cell calendar, the day
// marked; "15%" -> a 10 x 10 field with 15 cells filled.
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function figVisual(fig, ctx) {
  const f = strip(fig).trim();
  let m = f.match(/^(\d+)\s+in\s+(\d+)$/i);
  if (m && +m[2] <= 10 && +m[1] <= +m[2]) {
    return `<div class="bn-ratio" aria-hidden="true" style="--n:${m[2]}">${Array.from({ length: +m[2] }, (_, k) => `<i class="${k < +m[1] ? 'on' : ''}"></i>`).join('')}</div>`;
  }
  m = f.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})$/);
  if (m && MON.includes(m[1].toLowerCase())) {
    const mi = MON.indexOf(m[1].toLowerCase());
    const year = +(String(ctx.spec.date || '').slice(0, 4)) || 2026;
    const first = new Date(Date.UTC(year, mi, 1)).getUTCDay();
    const days = new Date(Date.UTC(year, mi + 1, 0)).getUTCDate();
    const day = +m[2];
    const cells = Array.from({ length: first }, () => '<i class="pad"></i>').concat(Array.from({ length: days }, (_, k) => `<i class="${k + 1 === day ? 'on' : k + 1 < day ? 'past' : ''}"></i>`));
    return `<div class="bn-cal" aria-hidden="true">${cells.join('')}</div>`;
  }
  m = f.match(/^(\d{1,3})%$/);
  if (m && +m[1] <= 100) return `<div class="bn-field" aria-hidden="true">${Array.from({ length: 100 }, (_, k) => `<i class="${k < +m[1] ? 'on' : ''}"></i>`).join('')}</div>`;
  return '';
}

function calcLabel(ctx, row, k, s) {
  if (s?.rowLabels?.[k]) return s.rowLabels[k];
  const kind = ctx.calc?.kind;
  if (kind === 'payment-compare' || kind === 'payment') return `Payment at ${row.label}`;
  if (kind === 'heloc') return `Interest-only at ${row.label}`;
  return row.label;
}

// ---------- slide types ----------
function cover(s, ctx) {
  const t = ctx.t;
  const rows = ctx.calc?.chart?.rows || [];
  const max = rows.length ? Math.max(...rows.map((r) => r.value)) : 0;
  const hero = tile('h', 'accent', `
      ${s.figure ? `<div class="bn-fig-box"><span class="bn-fig" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 260 : 200}" data-role="display">${t(s.figure)}</span></div>` : ''}
      ${s.figureLabel ? `<p class="bn-hero-k">${t(s.figureLabel)}</p>` : ''}`, 'bn-hero');
  const areas = ctx.variant === 'b'
    ? (rows.length >= 2 ? ['r1 r1 h h', 'r2 r2 h h', 'd d d d'] : ['d d h h', 'd d h h'])
    : (rows.length >= 2 ? ['h h r1 r1', 'h h r2 r2', 'd d d d'] : ['h h d d', 'h h d d']);
  const rowTiles = rows.slice(0, 2).map((r, k) => tile(`r${k + 1}`, k === 1 ? 'ink' : 'paper', `
      <p class="bn-k" data-role="label">${t(calcLabel(ctx, r, k))}</p>
      <p class="bn-v">${ctx.esc(r.shortShown)}${ctx.calc.chart.unit === 'money' && ctx.calc.kind !== 'lump-sum' ? '<small data-role="label">/mo</small>' : ''}</p>
      ${bar(r.value, max * 1.04, k === 1 && rows[0] ? { delta: [rows[0].value * 1, r.value] } : {})}`)).join('');
  const dek = s.dek ? tile('d', 'paper', `<p class="bn-dek">${t(s.dek)}</p>`, 'bn-dek-tile') : tile('d', 'paper', '', 'bn-empty');
  return {
    bg: ghost(ctx, s.figure),
    html: `<div class="stage bn-cover">
      ${head(ctx, s.kicker)}
      <h1 class="bn-h1" data-block="headline" data-fit="box" data-max-lines="4" data-fit-min="56" data-role="display">${t(s.headline)}</h1>
      ${grid(areas, rows.length >= 2 ? '1fr 1fr auto' : '1fr 1fr', hero + rowTiles + dek)}
      ${foot(ctx, 'line', `<span class="bn-cue" data-role="label">${ctx.esc(s.cue || 'Swipe')} <b aria-hidden="true">→</b></span>`)}
    </div>`,
  };
}

function point(s, ctx) {
  const t = ctx.t;
  const b = ctx.variant === 'b';
  const fig = !!s.figure;
  const areas = fig ? (b ? ['t t t t', 'f f n n'] : ['f f t t', 'n n n n']) : (b ? ['n n n n', 't t t t'] : ['t t t t', 'n n n n']);
  const rows = fig ? (b ? 'minmax(0,1fr) minmax(0,0.95fr)' : 'minmax(0,1fr) auto') : (b ? 'auto minmax(0,1fr)' : 'minmax(0,1fr) auto');
  const tone = ctx.index % 2 ? 'ink' : 'accent';
  const vis = fig ? figVisual(s.figure, ctx) : '';
  const inner = [
    fig ? tile('f', tone, `${vis}<div class="bn-fig-box"><span class="bn-fig" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 200 : 160}" data-role="display">${t(s.figure)}</span></div>`, 'bn-hero bn-figtile') : '',
    tile('t', 'paper', `<p class="bn-statement" data-role="display">${t(s.text)}</p>`, 'bn-text'),
    s.note ? tile('n', fig && b ? 'paper' : 'paper', `<p class="bn-note">${t(s.note)}</p>`, 'bn-note-tile') : tile('n', 'paper', '', 'bn-empty'),
  ].join('');
  return {
    bg: '',
    html: `<div class="stage bn-point">
      ${head(ctx, s.eyebrow)}
      ${grid(areas, rows, inner, 'is-tall')}
      ${foot(ctx)}
    </div>`,
  };
}

// Number: a chart tile with zero-based columns, one value tile per row, a callout tile.
function number(s, ctx) {
  const t = ctx.t;
  const ch = ctx.calc?.chart;
  if (!ch) throw new Error('bento number slide needs a calc with a chart');
  const rows = ch.rows.slice(0, 3);
  const hi = Math.min(ch.highlight ?? rows.length - 1, rows.length - 1);
  const max = Math.max(...rows.map((r) => r.value)) * 1.06;
  const colsHTML = rows.map((r, k) => {
    const h = (r.value / max) * 100;
    const base = rows[0].value;
    const delta = k === hi && k > 0 && r.value > base ? ((r.value - base) / r.value) * 100 : 0;
    return `<div class="bn-col ${k === hi ? 'is-hi' : k > hi ? 'is-next' : ''}" style="height:${h.toFixed(3)}%">${delta ? `<b style="height:${Math.max(delta, 1.2).toFixed(3)}%"></b>` : ''}<span class="bn-col-k" data-role="label">${String.fromCharCode(65 + k)}</span></div>`;
  }).join('');
  const b = ctx.variant === 'b';
  const n = rows.length;
  const vAreas = n === 1 ? ['c:7 v1:5', 'c:7 v1:5'] : n === 2 ? ['c:7 v1:5', 'c:7 v2:5'] : ['c:7 v1:5', 'c:7 v2:5', 'c:7 v3:5'];
  const areas = (b ? vAreas.map((r) => r.split(' ').reverse().join(' ')) : vAreas).concat(['k:12']);
  const vTiles = rows.map((r, k) => tile(`v${k + 1}`, k === hi ? 'accent' : 'paper', `
      <p class="bn-k" data-role="label"><span class="bn-key" aria-hidden="true">${String.fromCharCode(65 + k)}</span> ${t(calcLabel(ctx, r, k, s))}</p>
      <p class="bn-v bn-v-s">${ctx.esc(r.shown)}</p>`, 'bn-val')).join('');
  const chart = tile('c', 'paper', `<div class="bn-cols" style="--n:${n}">${colsHTML}</div><span class="bn-zero" data-role="label">${ch.unit === 'months' ? '0 months' : '$0'}</span>`, 'bn-chart');
  const callout = tile('k', 'ink', `<p class="bn-call"><span class="bn-call-v">${t(s.callout || rows[hi].shown)}</span><span class="bn-call-s">${t(s.calloutSub || '')}</span></p>`, 'bn-callout');
  return {
    bg: '',
    html: `<div class="stage bn-number">
      ${head(ctx, s.label)}
      <h2 class="bn-h2" data-block="title" data-role="display">${t(s.title)}</h2>
      ${grid(areas, `${'1fr '.repeat(vAreas.length)}auto`, chart + vTiles + callout)}
      <p class="bn-fine" data-role="fine" data-block="fine">${t(s.assumptions)}</p>
      ${foot(ctx)}
    </div>`,
  };
}

function compare(s, ctx) {
  const t = ctx.t;
  const b = ctx.variant === 'b';
  const side = (o, area, tone) => tile(area, tone, `
      <p class="bn-k" data-role="label">${t(o.label)}</p>
      <p class="bn-cmp-v" data-role="display">${t(o.value)}</p>
      ${o.note ? `<p class="bn-cmp-n">${t(o.note)}</p>` : ''}`, 'bn-side');
  const areas = b ? ['l l l l', 'r r r r'] : ['l l r r', 'l l r r'];
  return {
    bg: '',
    html: `<div class="stage bn-compare">
      ${head(ctx, s.label)}
      <h2 class="bn-h2" data-block="title" data-role="display">${t(s.title)}</h2>
      ${grid(areas, '1fr 1fr', side(s.left, 'l', 'paper') + side(s.right, 'r', 'accent'), b ? 'is-stacked' : '')}
      ${s.verdict ? `<p class="bn-verdict" data-block="verdict">${t(s.verdict)}</p>` : ''}
      ${foot(ctx)}
    </div>`,
  };
}

function list(s, ctx, numbered) {
  const t = ctx.t;
  const items = (s.items || []).slice(0, 6);
  const n = items.length;
  const b = ctx.variant === 'b';
  // First item is the big tile; the rest share the other half.
  let areas;
  if (n <= 1) areas = ['i1 i1 i1 i1'];
  else if (n === 2) areas = b ? ['i2 i2 i1 i1'] : ['i1 i1 i2 i2'];
  else if (n === 3) areas = b ? ['i2 i2 i1 i1', 'i3 i3 i1 i1'] : ['i1 i1 i2 i2', 'i1 i1 i3 i3'];
  else if (n === 4) areas = b ? ['i2 i2 i1 i1', 'i3 i3 i1 i1', 'i4 i4 i4 i4'] : ['i1 i1 i2 i2', 'i1 i1 i3 i3', 'i4 i4 i4 i4'];
  else areas = Array.from({ length: Math.ceil(n / 2) }, (_, r) => `i${r * 2 + 1} i${r * 2 + 1} i${Math.min(n, r * 2 + 2)} i${Math.min(n, r * 2 + 2)}`);
  const tiles = items.map((it, i) => tile(`i${i + 1}`, i === 0 ? 'ink' : 'paper', `
      <span class="bn-num" aria-hidden="true">${numbered ? String(i + 1) : '✓'}</span>
      <p class="bn-item">${t(it.text)}${it.tag ? ` <em class="bn-tag" data-role="label">${t(it.tag)}</em>` : ''}</p>`, `bn-li ${i === 0 ? 'is-first' : ''}`)).join('');
  return {
    bg: '',
    html: `<div class="stage bn-list">
      ${head(ctx, s.label)}
      <h2 class="bn-h2" data-block="title" data-role="display">${t(s.title)}</h2>
      ${grid(areas, areas.map(() => '1fr').join(' '), tiles)}
      ${s.note ? `<p class="bn-verdict" data-block="note">${t(s.note)}</p>` : ''}
      ${foot(ctx)}
    </div>`,
  };
}

function myth(s, ctx) {
  const t = ctx.t;
  const areas = ctx.variant === 'b' ? ['f f f f', 'f f f f', 'm m m m'] : ['m m m m', 'f f f f', 'f f f f'];
  return {
    bg: '',
    html: `<div class="stage bn-myth">
      ${head(ctx, s.label || 'Myth, checked')}
      ${grid(areas, '1fr 1fr 1fr', tile('m', 'paper', `<p class="bn-k" data-role="label">Heard</p><p class="bn-myth-t"><span class="bn-struck">${t(s.myth)}</span></p>`) + tile('f', 'ink', `<p class="bn-k" data-role="label">The numbers</p><p class="bn-statement" data-role="display">${t(s.fact)}</p>`, 'bn-text'), 'is-tall')}
      ${s.note ? `<p class="bn-verdict">${t(s.note)}</p>` : ''}
      ${foot(ctx)}
    </div>`,
  };
}

function quote(s, ctx) {
  const t = ctx.t;
  return {
    bg: '',
    html: `<div class="stage bn-quote">
      ${head(ctx)}
      ${grid(['q q q q', 'q q q q', 'b b b b'], '1fr 1fr auto', tile('q', 'accent', `<p class="bn-q" data-role="display">${t(s.quote)}</p>`, 'bn-text') + tile('b', 'paper', `<p class="bn-k" data-role="label">${s.by ? t(s.by) : ''}</p>`), 'is-tall')}
      ${foot(ctx)}
    </div>`,
  };
}

// The home layout: a single static dashboard. Facts become tiles; their money values share
// one scale (bars), the largest becomes a segmented ring when it divides into whole units.
function stat(s, ctx) {
  const t = ctx.t;
  const facts = (s.facts || []).slice(0, 5);
  const vals = facts.map((f) => moneyOf(f.value));
  const money = vals.filter((v) => v != null && v > 0);
  const max = money.length ? Math.max(...money) : 0;
  const unit = money.length ? Math.min(...money) : 0;
  const emph = facts.findIndex((f) => f.emphasis);
  const emphVal = emph >= 0 ? vals[emph] : null;
  const ringN = unit && max / unit >= 2 && max / unit <= 8 && Number.isInteger(max / unit) ? max / unit : 0;
  const b = ctx.variant === 'b';
  const keys = ['a', 'b', 'c', 'd', 'e'];
  const areasA = { 5: ['h:6 a:6', 'h:6 b:6', 'c:4 d:4 e:4'], 4: ['h h a a', 'h h b b', 'c c d d'], 3: ['h h a a', 'h h b b', 'c c c c'], 2: ['h h a a', 'h h b b'], 1: ['h h a a', 'h h a a'], 0: ['h h h h', 'h h h h'] };
  const areasB = { 5: ['a:6 h:6', 'b:6 h:6', 'd:4 e:4 c:4'], 4: ['a a h h', 'b b h h', 'd d c c'], 3: ['a a h h', 'b b h h', 'c c c c'], 2: ['a a h h', 'b b h h'], 1: ['a a h h', 'a a h h'], 0: ['h h h h', 'h h h h'] };
  // Square has no height to spare: hero and facts share one 3 x 2 grid.
  const sq = ctx.format.name === 'square' && facts.length === 5 ? (b ? ['a:4 b:4 h:4', 'e:4 c:4 d:4'] : ['h:4 a:4 b:4', 'c:4 d:4 e:4']) : null;
  const areas = sq || (b ? areasB : areasA)[facts.length];
  const tiles = facts.map((f, i) => {
    const v = vals[i];
    let vis = '';
    if (v != null && v === max && ringN && emphVal && Number.isInteger(emphVal / unit)) vis = ring(ringN, emphVal / unit, `${ctx.money(unit)} per&nbsp;segment`);
    else if (v != null && max) vis = bar(v, max);
    else vis = stop();
    const tone = f.emphasis ? 'ink' : 'paper';
    const span = areas.map(expand).join(' ').split(' ').filter((x) => x === keys[i]).length / areas.filter((r) => expand(r).split(' ').includes(keys[i])).length;
    const wide = span >= 6;
    return tile(keys[i], tone, `
      <p class="bn-k" data-role="label">${t(f.label)}</p>
      ${vis.includes('bn-ring') ? vis : ''}
      <p class="bn-v ${wide ? '' : 'bn-v-s'}">${t(f.value)}</p>
      ${vis.includes('bn-ring') ? '' : vis}
      ${f.note ? `<p class="bn-n">${t(f.note)}</p>` : ''}`, `bn-fact ${wide ? 'is-wide' : 'is-narrow'}`);
  }).join('');
  const hero = tile('h', 'accent', `
      ${s.figure ? `<div class="bn-fig-box"><span class="bn-fig" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 300 : 230}" data-role="display">${t(s.figure)}</span></div>` : ''}
      ${s.figureLabel ? `<p class="bn-hero-k">${t(s.figureLabel)}</p>` : ''}`, 'bn-hero');
  return {
    bg: ghost(ctx, s.figure),
    html: `<div class="stage bn-stat">
      ${head(ctx, s.kicker)}
      <h1 class="bn-h1 bn-stat-h" data-block="headline" data-fit="box" data-max-lines="3" data-fit-min="48" data-role="display">${t(s.headline)}</h1>
      ${grid(areas, areas.length === 3 ? 'minmax(0,1fr) minmax(0,1fr) auto' : areas.map(() => 'minmax(0,1fr)').join(' '), hero + tiles)}
      ${s.note ? `<p class="bn-verdict" data-block="note">${t(s.note)}</p>` : ''}
      ${foot(ctx, 'block')}
    </div>`,
  };
}

function cta(s, ctx) {
  const t = ctx.t;
  const kw = s.keyword ? `<span class="bn-kw">${ctx.esc(s.keyword)}</span>` : '';
  const b = ctx.variant === 'b';
  const areas = b ? ['s s s s', 'c c c c', 'c c c c'] : ['c c c c', 'c c c c', 's s s s'];
  return {
    bg: '',
    html: `<div class="stage bn-cta">
      ${head(ctx)}
      ${grid(areas, b ? 'auto 1fr 1fr' : '1fr 1fr auto', tile('c', 'accent', `<h2 class="bn-cta-h" data-fit="box" data-max-lines="5" data-fit-min="56" data-role="display">${t(s.headline).replace('{keyword}', kw)}</h2>`, 'bn-text') + tile('s', 'paper', s.sub ? `<p class="bn-dek">${t(s.sub)}</p>` : '', s.sub ? 'bn-dek-tile' : 'bn-empty'), 'is-tall')}
      ${foot(ctx, 'block')}
    </div>`,
  };
}

const TYPES = { cover, point, number, compare, steps: (s, c) => list(s, c, true), recap: (s, c) => list(s, c, false), myth, quote, stat, cta };

export function render(slide, ctx) {
  const fn = TYPES[slide.type];
  if (!fn) throw new Error(`bento: no layout for slide type "${slide.type}" (has ${Object.keys(TYPES).join(', ')})`);
  return fn(slide, ctx);
}
