// Swiss Data Poster (group 1 · Ledger). See library/swiss/STYLE.md.
// International Typographic Style pushed to poster loudness: full-bleed colour fields that
// change on every slide (signal colour, black, paper), one grotesk in three widths, a visible
// 12-column grid, and data drawn as exact geometry at poster scale: the cover disc's area is
// today's payment and the ring around it is exactly the increase; slabs start at $0.
import { contrast, ensureContrast, bestOn, mix } from '../../lib/color.mjs';

const COLS = 12;

// Ground sequence per variant: every swipe changes the field.
const SEQ = { a: ['accent', 'ink', 'paper', 'accent', 'ink', 'paper', 'accent'], b: ['ink', 'accent', 'paper', 'ink', 'accent', 'paper', 'accent'] };
const GROUND_BY_TYPE = { cover: null, cta: 'accent' };

function grounds(p) {
  const black = '#000000';
  const sigOnInk = ensureContrast(p.accent, black, 4.5, '#FFFFFF');
  const onAccent = bestOn(p.accent, ['#000000', '#FFFFFF', p.paper]);
  return {
    paper: { gnd: p.paper, fg: p.ink, fg2: p['ink-soft'], sig: p['accent-ink'], sigFill: p.accent, rule: p.ink, tick: p.ink },
    ink: { gnd: black, fg: p.paper, fg2: mix(p.paper, black, 0.32), sig: sigOnInk, sigFill: sigOnInk, rule: p.paper, tick: p.paper },
    accent: { gnd: p.accent, fg: onAccent, fg2: onAccent, sig: onAccent, sigFill: onAccent === '#FFFFFF' ? '#FFFFFF' : '#000000', rule: onAccent, tick: onAccent },
  };
}

function groundOf(s, ctx) {
  if (s.ground) return s.ground;
  if (ctx.isFirst) return ctx.variant === 'b' ? 'ink' : 'accent';
  if (s.type === 'cta' || ctx.isLast) return 'accent';
  const seq = SEQ[ctx.variant] || SEQ.a;
  return seq[ctx.index % seq.length];
}

function vars(g) {
  return `--gnd:${g.gnd};--fg:${g.fg};--fg2:${g.fg2};--sig:${g.sig};--sig-fill:${g.sigFill};--rule:${g.rule};--tick:${g.tick};`;
}

function head(ctx) {
  const folio = ctx.folio();
  return `<header class="sw-head" data-role="label" data-noword>
    <span class="sw-series">${ctx.esc(ctx.spec.series || '')}</span>
    ${folio ? `<span class="sw-folio tnum">${folio}</span>` : ''}
  </header>`;
}

// Walking bar: 3 columns wide, one column further on each slide.
function bar(ctx) {
  const span = 3;
  const steps = Math.max(1, ctx.total - 1);
  const start = ctx.isSingle ? 0 : Math.round(((COLS - span) * ctx.index) / steps);
  const s = ctx.variant === 'b' ? COLS - span - start : start;
  return `<div class="sw-bar" style="--c0:${s};--span:${span}"></div>`;
}

function ticks() {
  let t = '';
  for (let i = 0; i <= COLS; i++) t += `<i style="--i:${i}"></i>`;
  return `<div class="sw-ticks">${t}</div>`;
}

function foot(ctx, size = 'line', extra = '') {
  return `<footer class="sw-foot">${extra}${ctx.compliance(size)}</footer>`;
}

function frame(ctx, g, inner, art = '') {
  return {
    bg: `<div class="sw-field" style="${vars(g)}"></div>${art}${ticks()}${bar(ctx)}<div class="sw-grain"></div>`,
    html: inner,
    classes: '',
  };
}

const cue = (s, ctx) => `<span class="sw-cue" data-role="label">${ctx.esc(s.cue || 'Swipe')}<b aria-hidden="true"></b></span>`;

// Cover disc: area of the disc = first value; outer ring = increase to the second (areas exact).
function disc(ctx, g) {
  const rows = ctx.calc?.chart?.rows;
  if (!rows || rows.length < 2) return '';
  const a = rows[0].value, b = rows[1].value;
  const R = ctx.format.name === 'story' ? 560 : ctx.format.name === 'square' ? 400 : 520;
  const R2 = R * Math.sqrt(b / a);
  const cx = ctx.variant === 'b' ? 200 : ctx.format.w - 150;
  const cy = ctx.format.name === 'story' ? 1500 : ctx.format.name === 'square' ? 900 : 1150;
  const ring = `<circle cx="${cx}" cy="${cy}" r="${((R + R2) / 2).toFixed(2)}" fill="none" stroke="${g.fg}" stroke-width="${(R2 - R).toFixed(2)}"/>`;
  return `<svg class="sw-disc" viewBox="0 0 ${ctx.format.w} ${ctx.format.h}" width="${ctx.format.w}" height="${ctx.format.h}" aria-hidden="true">
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="${ctx.isFirst && ctx.variant !== 'b' ? '#000000' : g.sigFill}" opacity="${ctx.variant === 'b' ? 1 : 1}"/>
      ${ring}
    </svg>`;
}

// ---------- slide types ----------
function cover(s, ctx) {
  const t = ctx.t;
  const G = grounds(ctx.palette);
  const key = groundOf(s, ctx);
  const g = G[key];
  const hasDisc = ctx.calc?.chart?.rows?.length >= 2;
  const fig = s.figure ? `<div class="sw-fig-row" data-block="figure">
      <div class="sw-fig-box"><span class="sw-fig tnum" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 420 : 340}" data-role="display">${t(s.figure)}</span></div>
      ${s.figureLabel ? `<p class="sw-fig-label">${t(s.figureLabel)}</p>` : ''}
    </div>` : '';
  const inner = `<div class="stage sw-cover g-${key} ${hasDisc ? 'has-disc' : ''}" style="${vars(g)}">
      ${head(ctx)}
      <div class="sw-cover-top" data-block="headline">
        ${s.kicker ? `<p class="sw-kicker" data-role="label">${t(s.kicker)}</p>` : ''}
        <h1 class="sw-h1" data-fit="box" data-max-lines="4" data-fit-min="80" data-role="display">${t(s.headline)}</h1>
      </div>
      ${fig}
      ${s.dek ? `<p class="sw-dek" data-block="dek">${t(s.dek)}</p>` : ''}
      ${foot(ctx, 'line', cue(s, ctx))}
    </div>`;
  const r = frame(ctx, g, inner, hasDisc ? disc(ctx, g) : '');
  return r;
}

function point(s, ctx) {
  const t = ctx.t;
  const key = groundOf(s, ctx);
  const g = grounds(ctx.palette)[key];
  const inner = `<div class="stage sw-point g-${key}" style="${vars(g)}">
      ${head(ctx)}
      ${s.eyebrow ? `<p class="sw-kicker" data-role="label">${t(s.eyebrow)}</p>` : ''}
      ${s.figure ? `<div class="sw-fig-box sw-fig-point" data-block="figure"><span class="sw-fig tnum" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 400 : 300}" data-role="display">${t(s.figure)}</span></div>` : ''}
      <p class="sw-statement ${s.figure ? 'with-fig' : 'no-fig'}" data-block="statement" data-role="display" ${s.figure ? '' : 'data-fit="box" data-max-lines="6" data-fit-min="64"'}>${t(s.text)}</p>
      ${s.note ? `<p class="sw-note" data-block="note">${t(s.note)}</p>` : ''}
      ${foot(ctx)}
    </div>`;
  return frame(ctx, g, inner);
}

// Slabs from $0 (or 0 months). Values big; the change is a signal-colour sliver on top.
function number(s, ctx) {
  const t = ctx.t;
  const c = ctx.calc;
  if (!c?.chart) throw new Error('swiss number slide needs a calc with a chart');
  const key = groundOf(s, ctx);
  const g = grounds(ctx.palette)[key];
  const rows = c.chart.rows;
  const max = Math.max(...rows.map((r) => r.value));
  const labels = s.rowLabels || rows.map((r) => r.label);
  const base = rows[0].value;
  const slabs = rows.map((r, k) => {
    const h = (r.value / max) * 100;
    const up = k > 0 && r.value > base ? ((r.value - base) / max) * 100 : 0;
    const ghost = k > 0 && r.value < base ? ((base - r.value) / max) * 100 : 0;
    return `<div class="sw-slab ${k === c.chart.highlight ? 'is-hi' : ''}" style="--h:${h.toFixed(3)};--up:${up.toFixed(3)};--ghost:${ghost.toFixed(3)}">
        <p class="sw-slab-v tnum" data-role="display">${ctx.esc(r.shortShown || r.shown)}</p>
        <div class="sw-slab-body">${up ? '<i class="sw-sliver"></i>' : ''}${ghost ? '<i class="sw-ghost"></i>' : ''}</div>
        <p class="sw-slab-k" data-role="label">${t(labels[k] ?? r.label)}</p>
      </div>`;
  }).join('');
  const inner = `<div class="stage sw-number g-${key} n-${rows.length}" style="${vars(g)}">
      ${head(ctx)}
      ${s.label ? `<p class="sw-kicker" data-role="label">${t(s.label)}</p>` : ''}
      <h2 class="sw-h2" data-block="title" data-role="display">${t(s.title)}</h2>
      <div class="sw-chart" data-block="chart">
        <div class="sw-callout">${s.callout ? `<p class="sw-callout-v tnum">${t(s.callout)}</p>` : ''}<p class="sw-callout-s">${t(s.calloutSub || '')}</p></div>
        <div class="sw-slabs">${slabs}</div>
      </div>
      <p class="sw-fine" data-role="fine" data-block="fine">${t(s.assumptions)}</p>
      ${foot(ctx)}
    </div>`;
  return { ...frame(ctx, g, inner), audit: c.audit };
}

function compare(s, ctx) {
  const t = ctx.t;
  const key = groundOf(s, ctx);
  const g = grounds(ctx.palette)[key];
  const side = (o, cls) => `<div class="sw-side ${cls}">
      <p class="sw-side-k" data-role="label">${t(o.label)}</p>
      <div class="sw-side-vbox"><span class="sw-side-v tnum" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 230 : 180}" data-role="display">${t(o.value)}</span></div>
      ${o.note ? `<p class="sw-side-n">${t(o.note)}</p>` : ''}
    </div>`;
  const inner = `<div class="stage sw-compare g-${key}" style="${vars(g)}">
      ${head(ctx)}
      ${s.label ? `<p class="sw-kicker" data-role="label">${t(s.label)}</p>` : ''}
      <h2 class="sw-h2" data-block="title" data-role="display">${t(s.title)}</h2>
      <div class="sw-sides" data-block="sides">${side(s.left, 'is-l')}${side(s.right, 'is-r')}</div>
      ${s.verdict ? `<p class="sw-note sw-verdict" data-block="verdict">${t(s.verdict)}</p>` : ''}
      ${foot(ctx)}
    </div>`;
  return frame(ctx, g, inner);
}

function list(s, ctx, numbered) {
  const t = ctx.t;
  const key = groundOf(s, ctx);
  const g = grounds(ctx.palette)[key];
  const items = (s.items || []).map((it, i) => `<li class="sw-item">
      <span class="sw-item-n tnum" aria-hidden="true">${i + 1}</span>
      <span class="sw-item-t">${t(it.text)}${it.tag ? ` <em class="sw-tag">${t(it.tag)}</em>` : ''}</span>
    </li>`).join('');
  const inner = `<div class="stage sw-list g-${key} ${numbered ? 'is-steps' : 'is-recap'}" style="${vars(g)}">
      ${head(ctx)}
      ${s.label ? `<p class="sw-kicker" data-role="label">${t(s.label)}</p>` : ''}
      <h2 class="sw-h2 sw-h2-xl" data-block="title" data-role="display">${t(s.title)}</h2>
      <ol class="sw-items" data-block="items">${items}</ol>
      ${s.note ? `<p class="sw-note" data-block="note">${t(s.note)}</p>` : ''}
      ${foot(ctx)}
    </div>`;
  return frame(ctx, g, inner);
}

function myth(s, ctx) {
  const t = ctx.t;
  const key = groundOf(s, ctx);
  const g = grounds(ctx.palette)[key];
  const inner = `<div class="stage sw-myth g-${key}" style="${vars(g)}">
      ${head(ctx)}
      <p class="sw-kicker" data-role="label">${t(s.label || 'Myth, then the numbers')}</p>
      <p class="sw-myth-t" data-block="myth"><span class="sw-struck">${t(s.myth)}</span></p>
      <p class="sw-fact-t" data-block="fact" data-role="display">${t(s.fact)}</p>
      ${s.note ? `<p class="sw-note" data-block="note">${t(s.note)}</p>` : ''}
      ${foot(ctx)}
    </div>`;
  return frame(ctx, g, inner);
}

function quote(s, ctx) {
  const t = ctx.t;
  const key = groundOf(s, ctx);
  const g = grounds(ctx.palette)[key];
  const inner = `<div class="stage sw-quote g-${key}" style="${vars(g)}">
      ${head(ctx)}
      <p class="sw-qmark" aria-hidden="true">“</p>
      <p class="sw-q" data-block="quote" data-role="display" data-fit="box" data-max-lines="7" data-fit-min="56">${t(s.quote)}</p>
      ${s.by ? `<p class="sw-by" data-role="label">${t(s.by)}</p>` : ''}
      ${foot(ctx)}
    </div>`;
  return frame(ctx, g, inner);
}

// Single static: headline + giant figure + a ruled fact table on the grid.
function stat(s, ctx) {
  const t = ctx.t;
  const key = s.ground || 'accent';
  const g = grounds(ctx.palette)[key];
  const facts = (s.facts || []).map((f) => `<li class="sw-fact ${f.emphasis ? 'is-em' : ''}"><span class="sw-fact-k" data-role="label">${t(f.label)}</span><span class="sw-fact-v tnum">${t(f.value)}</span>${f.note ? `<span class="sw-fact-n">${t(f.note)}</span>` : ''}</li>`).join('');
  const inner = `<div class="stage sw-stat g-${key}" style="${vars(g)}">
      ${head(ctx)}
      ${s.kicker ? `<p class="sw-kicker" data-role="label">${t(s.kicker)}</p>` : ''}
      <h1 class="sw-h2 sw-h2-xl" data-block="headline" data-role="display">${t(s.headline)}</h1>
      ${s.figure ? `<div class="sw-fig-row" data-block="figure"><div class="sw-fig-box"><span class="sw-fig tnum" data-role="display">${t(s.figure)}</span></div>${s.figureLabel ? `<p class="sw-fig-label">${t(s.figureLabel)}</p>` : ''}</div>` : ''}
      ${facts ? `<ul class="sw-facts" data-block="facts">${facts}</ul>` : ''}
      ${s.note ? `<p class="sw-note" data-block="note">${t(s.note)}</p>` : ''}
      ${foot(ctx, 'block')}
    </div>`;
  return frame(ctx, g, inner);
}

function cta(s, ctx) {
  const t = ctx.t;
  const key = groundOf(s, ctx);
  const g = grounds(ctx.palette)[key];
  const kw = s.keyword ? `<span class="sw-kw">${ctx.esc(s.keyword)}</span>` : '';
  const verb = { send: 'Send', save: 'Save', comment: 'Comment' }[s.action] || '';
  const inner = `<div class="stage sw-cta g-${key}" style="${vars(g)}">
      ${head(ctx)}
      ${verb ? `<p class="sw-verb" aria-hidden="true" data-bleed>${verb}</p>` : ''}
      <h2 class="sw-cta-h" data-block="cta" data-fit="box" data-max-lines="5" data-fit-min="72" data-role="display">${t(s.headline).replace('{keyword}', kw)}</h2>
      ${s.sub ? `<p class="sw-dek" data-block="sub">${t(s.sub)}</p>` : ''}
      ${foot(ctx, 'block')}
    </div>`;
  return frame(ctx, g, inner);
}

const TYPES = { cover, point, number, compare, steps: (s, c) => list(s, c, true), recap: (s, c) => list(s, c, false), myth, quote, stat, cta };

export function render(slide, ctx) {
  const fn = TYPES[slide.type];
  if (!fn) throw new Error(`swiss: no layout for slide type "${slide.type}" (has ${Object.keys(TYPES).join(', ')})`);
  return fn(slide, ctx);
}
