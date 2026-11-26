// Poster Type (group 3 · Riso). See library/bold-type/STYLE.md.
// One condensed gothic (Big Shoulders). Display copy is set as stacks: flush-left lines, each
// scaled to the full measure (page.js plans the breaks). Each slide is one flat colour field
// (accent / ink / paper) and the field flips as you swipe. The line that matters is printed on
// a full-bleed band. Every line and block carries data-k so a motion version can sequence it.

// ---------- colour maths (Node side, for field decisions) ----------
const hex = (h) => { const s = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (h) => { const [r, g, b] = hex(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase(); };
const best = (bg, list) => list.reduce((m, c) => (cr(c, bg) > cr(m, bg) ? c : m), list[0]);

function fieldVars(field, p) {
  const { ink, paper, accent } = p;
  const onAcc = best(accent, [ink, paper]);
  if (field === 'ink') {
    return { bg: ink, fg: paper, sm: paper, band: accent, bandFg: best(accent, [ink, paper]), bar: mix(ink, paper, 0.26), barFg: paper, hi: accent, hiFg: onAcc, rule: paper, num: cr(accent, ink) >= 3 ? accent : paper };
  }
  if (field === 'acc') {
    const fg = onAcc;
    return { bg: accent, fg, sm: fg, band: ink, bandFg: cr(accent, ink) >= 3.2 ? accent : paper, bar: mix(accent, fg, 0.3), barFg: fg, hi: ink, hiFg: cr(accent, ink) >= 3 ? accent : paper, rule: fg, num: fg };
  }
  return { bg: paper, fg: ink, sm: ink, band: ink, bandFg: cr(accent, ink) >= 3.2 ? accent : paper, bar: mix(paper, ink, 0.2), barFg: ink, hi: cr(accent, paper) >= 2.2 ? accent : ink, hiFg: cr(accent, paper) >= 2.2 ? onAcc : paper, rule: ink, num: cr(accent, paper) >= 3 ? accent : ink };
}
const varStyle = (v) => `--f-bg:${v.bg};--f-fg:${v.fg};--f-sm:${v.sm};--f-band:${v.band};--f-band-fg:${v.bandFg};--f-bar:${v.bar};--f-bar-fg:${v.barFg};--f-hi:${v.hi};--f-hi-fg:${v.hiFg};--f-rule:${v.rule};--f-num:${v.num};`;

const SEQ = { a: ['acc', 'ink', 'paper'], b: ['ink', 'paper', 'acc'] };
function fieldOf(s, ctx) {
  if (s.field) return s.field;
  const seq = SEQ[ctx.variant] || SEQ.a;
  if (ctx.isLast && !ctx.isSingle) return seq[0];
  return seq[ctx.index % 3];
}
const other = (f) => ({ acc: 'ink', ink: 'paper', paper: 'acc' }[f]);

// ---------- copy -> stack words ----------
function typeset(s) {
  return String(s)
    .replace(/(^|[\s(\[{"])'/g, '$1‘').replace(/'/g, '’')
    .replace(/(^|[\s(\[{])"/g, '$1“').replace(/"/g, '”')
    .replace(/\.\.\./g, '…').replace(/ - /g, ' – ')
    .replace(/\b(Dec|Jan|Feb|Nov|Oct|Sept?|Mar|Apr|Jun|Jul|Aug|May) (\d)/g, '$1 $2')
    .replace(/(\d) (months?|days?|years?)\b/g, '$1 $2');
}
function segments(raw) {
  const segs = [];
  // Punctuation that opens a segment (", with no penalty") belongs to the previous word.
  const glue = (w) => {
    if (segs.length && /^[,.;:!?’”)]+$/.test(w[0] || '')) { const prev = segs[segs.length - 1].w; prev[prev.length - 1] += w.shift(); }
    else if (segs.length && /^[,.;:!?’”)]/.test(w[0] || '')) { const m = w[0].match(/^[,.;:!?’”)]+/)[0]; const prev = segs[segs.length - 1].w; prev[prev.length - 1] += m; w[0] = w[0].slice(m.length); }
    return w.filter(Boolean);
  };
  String(raw || '').split('|').forEach((chunk) => {
    chunk.split(/(==.+?==)/).forEach((part) => {
      if (!part.trim()) return;
      const em = /^==.+==$/.test(part);
      const clean = typeset(part.replace(/^==|==$/g, '').replace(/\(\(|\)\)|~~|\*/g, '').trim());
      const w = glue(clean.split(/ +/).filter(Boolean));
      if (w.length) segs.push({ w, em });
    });
  });
  return segs;
}

// ---------- shared pieces ----------
function head(ctx) {
  const folio = ctx.folio();
  return `<header class="bt-head bt-txt" data-role="label" data-noword data-k="0">
    <span>${ctx.esc(ctx.spec.series || '')}</span>${folio ? `<span class="tnum">${folio}</span>` : ''}
  </header>`;
}
const foot = (ctx, size = 'line', extra = '') => `<footer class="bt-foot bt-txt" data-k="90">${ctx.compliance(size)}${extra}</footer>`;

function frame(s, ctx, inner, { stacks = {}, panel = '', cls = '', field } = {}) {
  const f = field || fieldOf(s, ctx);
  const v = fieldVars(f, ctx.palette);
  const vs = varStyle(v);
  let panelHTML = '';
  if (panel) {
    const pv = fieldVars(other(f), ctx.palette);
    panelHTML = `<div class="bt-panel bt-panel-${panel}" style="${varStyle(pv)}"></div>`;
  }
  return {
    bg: `<div class="bt-bg" style="${vs}"></div>${panelHTML}<div class="bt-grain"></div>`,
    html: `<div class="stage bt-stage bt-${s.type} ${cls}" style="${vs}" data-field="${f}">${inner}</div>`,
    data: { stacks },
    classes: `bt-field-${f}`,
  };
}

let stackId = 0;
function stack(stacks, raw, { cap = 360, cls = '', block = 'stack', k0 = 1, maxLines = 7, role = 'display' } = {}) {
  const id = `s${++stackId}`;
  stacks[id] = { segs: segments(raw), cap, maxLines };
  return `<div class="bt-stack ${cls}" data-stack="${id}" data-block="${block}" data-role="${role}" data-k0="${k0}"></div>`;
}

const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9$%]/g, '');

// ---------- slide types ----------
function cover(s, ctx) {
  const stacks = {};
  const t = ctx.t;
  const showFig = s.figure && !norm(s.headline).includes(norm(s.figure));
  const fig = showFig ? `<div class="bt-figrow" data-block="figure" data-k="20">
      <div class="bt-figbox"><span class="bt-fig tnum" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 300 : 230}">${t(s.figure)}</span></div>
      ${s.figureLabel ? `<p class="bt-figlabel bt-txt">${t(s.figureLabel)}</p>` : ''}
    </div>` : '';
  const capH = ctx.format.name === 'feed' ? 330 : 270;
  const inner = `${head(ctx)}
    ${s.kicker ? `<p class="bt-kicker bt-txt" data-role="label" data-k="1">${t(s.kicker)}</p>` : ''}
    ${stack(stacks, s.headline, { cap: capH, block: 'headline', k0: 2, cls: 'bt-grow' })}
    ${fig}
    ${s.dek ? `<p class="bt-dek bt-txt" data-block="dek" data-k="30">${t(s.dek)}</p>` : ''}
    ${foot(ctx, 'line', `<span class="bt-cue" data-role="label">${ctx.esc(s.cue || 'Swipe')}<b aria-hidden="true"></b></span>`)}`;
  return frame(s, ctx, inner, { stacks, cls: showFig ? 'has-fig' : '' });
}

function point(s, ctx) {
  const stacks = {};
  const t = ctx.t;
  let inner;
  if (s.figure) {
    inner = `${head(ctx)}
      ${s.eyebrow ? `<p class="bt-kicker bt-txt" data-role="label" data-k="1">${t(s.eyebrow)}</p>` : ''}
      <div class="bt-figbox bt-figpoint" data-block="figure" data-k="2"><span class="bt-fig tnum" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 470 : 360}">${t(s.figure)}</span></div>
      <div class="bt-fillwrap"><p class="bt-statement bt-txt" data-block="statement" data-role="display" data-k="3" data-fill data-fill-min="52" data-fill-max="${ctx.format.name === 'feed' ? 112 : 84}" data-max-lines="5">${t(s.text)}</p></div>
      ${s.note ? `<p class="bt-note bt-txt" data-block="note" data-k="4">${t(s.note)}</p>` : ''}
      ${foot(ctx)}`;
  } else {
    inner = `${head(ctx)}
      ${s.eyebrow ? `<p class="bt-kicker bt-txt" data-role="label" data-k="1">${t(s.eyebrow)}</p>` : ''}
      ${stack(stacks, s.text, { cap: ctx.format.name === 'feed' ? 300 : 240, block: 'statement', k0: 2, cls: 'bt-grow' })}
      ${s.note ? `<p class="bt-note bt-txt" data-block="note" data-k="20">${t(s.note)}</p>` : ''}
      ${foot(ctx)}`;
  }
  return frame(s, ctx, inner, { stacks, cls: s.figure ? 'has-fig' : 'no-fig' });
}

// Bars as full-measure bands: length from zero, highlight row on the band colour.
function number(s, ctx) {
  const stacks = {};
  const t = ctx.t;
  const ch = ctx.calc?.chart;
  if (!ch) throw new Error('bold-type number slide needs a calc with a chart');
  const rows = ch.rows;
  const max = Math.max(...rows.map((r) => r.value));
  const labels = s.rowLabels || rows.map((r) => r.label);
  const hiIdx = ch.highlight ?? rows.length - 1;
  const base = rows[0].value;
  const bars = rows.map((r, k) => {
    const w = (r.value / max) * 100;
    const isHi = k === hiIdx && rows.length > 1;
    const gap = isHi && r.value < base ? ((base - r.value) / max) * 100 : 0;
    return `<div class="bt-row ${isHi ? 'is-hi' : ''}" data-k="${10 + k}">
        <p class="bt-row-k bt-txt" data-role="label">${t(labels[k] || r.label)}</p>
        <div class="bt-track">
          <div class="bt-bar" style="width:${w.toFixed(3)}%"><span class="bt-bar-v tnum">${ctx.esc(ch.unit === 'months' ? `${r.shortShown} mo` : r.shortShown)}</span></div>
          ${gap ? `<div class="bt-gap" style="left:${w.toFixed(3)}%;width:${gap.toFixed(3)}%" aria-hidden="true"></div>` : ''}
        </div>
      </div>`;
  }).join('');
  const inner = `${head(ctx)}
    ${s.label ? `<p class="bt-kicker bt-txt" data-role="label" data-k="1">${t(s.label)}</p>` : ''}
    ${stack(stacks, s.title, { cap: 150, block: 'title', k0: 2, cls: 'bt-title', maxLines: 4 })}
    <div class="bt-chart" data-block="chart">${bars}<span class="bt-zero bt-txt tnum" data-role="label" data-k="9">0</span></div>
    ${s.callout ? `<div class="bt-callout" data-block="callout" data-k="20">
        <div class="bt-callout-box"><span class="bt-callout-v tnum" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 230 : 170}">${t(s.callout)}</span></div>
        ${s.calloutSub ? `<p class="bt-callout-s bt-txt">${t(s.calloutSub)}</p>` : ''}
      </div>` : ''}
    <p class="bt-fine bt-txt" data-role="fine" data-block="fine" data-k="40">${t(s.assumptions || '')}</p>
    ${foot(ctx)}`;
  return frame(s, ctx, inner, { stacks, cls: rows.length === 1 ? 'one-row' : '' });
}

function compare(s, ctx) {
  const stacks = {};
  const t = ctx.t;
  const side = (o, cls, k) => `<div class="bt-side ${cls}" data-k="${k}">
      <p class="bt-side-k bt-txt" data-role="label">${t(o.label)}</p>
      <div class="bt-side-box"><span class="bt-side-v tnum" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 240 : 190}" data-role="display">${t(o.value)}</span></div>
      ${o.note ? `<p class="bt-side-n bt-txt">${t(o.note)}</p>` : ''}
    </div>`;
  const panel = ctx.variant === 'b' ? 'v' : 'h';
  const inner = `${head(ctx)}
    ${s.label ? `<p class="bt-kicker bt-txt" data-role="label" data-k="1">${t(s.label)}</p>` : ''}
    ${stack(stacks, s.title, { cap: 150, block: 'title', k0: 2, cls: 'bt-title', maxLines: 3 })}
    <div class="bt-sides" data-block="sides">${side(s.left, 'is-l', 10)}${side(s.right, 'is-r', 11)}</div>
    ${s.verdict ? `<p class="bt-note bt-verdict bt-txt" data-block="verdict" data-k="20">${t(s.verdict)}</p>` : ''}
    ${foot(ctx)}`;
  const out = frame(s, ctx, inner, { stacks, panel });
  // The second side sits on the contrasting field; page.js aligns the panel to it.
  out.html = out.html.replace('class="bt-side is-r"', `class="bt-side is-r" data-split style="${varStyle(fieldVars(other(fieldOf(s, ctx)), ctx.palette))}"`);
  return out;
}

function list(s, ctx, numbered) {
  const stacks = {};
  const t = ctx.t;
  const items = (s.items || []).map((it, i) => `<li class="bt-item" data-k="${10 + i}">
      <span class="bt-item-n tnum" aria-hidden="true">${numbered ? i + 1 : ''}</span>
      <span class="bt-item-t bt-txt">${t(it.text)}${it.tag ? ` <em class="bt-tag">${t(it.tag)}</em>` : ''}</span>
    </li>`).join('');
  const inner = `${head(ctx)}
    ${s.label ? `<p class="bt-kicker bt-txt" data-role="label" data-k="1">${t(s.label)}</p>` : ''}
    ${stack(stacks, s.title, { cap: 200, block: 'title', k0: 2, cls: 'bt-title', maxLines: 4 })}
    <div class="bt-fillwrap bt-listwrap"><ol class="bt-items ${numbered ? 'is-steps' : 'is-recap'}" data-block="items" data-fill data-fill-min="40" data-fill-max="${ctx.format.name === 'feed' ? 72 : 56}" data-max-lines="14">${items}</ol></div>
    ${s.note ? `<p class="bt-note bt-txt" data-k="30">${t(s.note)}</p>` : ''}
    ${foot(ctx)}`;
  return frame(s, ctx, inner, { stacks });
}

function myth(s, ctx) {
  const stacks = {};
  const t = ctx.t;
  const inner = `${head(ctx)}
    <p class="bt-kicker bt-txt" data-role="label" data-k="1">${t(s.label || 'Myth')}</p>
    ${stack(stacks, s.myth, { cap: 260, block: 'myth', k0: 2, cls: 'bt-mythstack', maxLines: 4 })}
    <p class="bt-fact-k bt-txt" data-role="label" data-k="20">Fact</p>
    <p class="bt-statement bt-txt" data-block="fact" data-role="display" data-k="21">${t(s.fact)}</p>
    ${s.note ? `<p class="bt-note bt-txt" data-k="30">${t(s.note)}</p>` : ''}
    ${foot(ctx)}`;
  return frame(s, ctx, inner, { stacks });
}

function quote(s, ctx) {
  const stacks = {};
  const t = ctx.t;
  const inner = `${head(ctx)}
    <span class="bt-qmark" aria-hidden="true">“</span>
    ${stack(stacks, s.quote, { cap: 220, block: 'quote', k0: 2, cls: 'bt-grow' })}
    ${s.by ? `<p class="bt-kicker bt-txt bt-by" data-role="label" data-k="30">${t(s.by)}</p>` : ''}
    ${foot(ctx)}`;
  return frame(s, ctx, inner, { stacks });
}

function stat(s, ctx) {
  const stacks = {};
  const t = ctx.t;
  const facts = (s.facts || []).map((f, i) => `<div class="bt-fact ${f.emphasis ? 'is-em' : ''}" data-k="${20 + i}">
      <span class="bt-fact-l bt-txt">${t(f.label)}${f.note ? `<em>${t(f.note)}</em>` : ''}</span>
      <span class="bt-fact-v tnum">${t(f.value)}</span>
    </div>`).join('');
  const showFig = s.figure && !norm(s.headline).includes(norm(s.figure));
  const inner = `${head(ctx)}
    ${s.kicker ? `<p class="bt-kicker bt-txt" data-role="label" data-k="1">${t(s.kicker)}</p>` : ''}
    ${showFig ? `<div class="bt-statfig" data-k="2"><span class="bt-fig tnum">${t(s.figure)}</span>${s.figureLabel ? `<span class="bt-figlabel bt-txt">${t(s.figureLabel)}</span>` : ''}</div>` : ''}
    ${stack(stacks, s.headline, { cap: 180, block: 'headline', k0: 3, cls: 'bt-title', maxLines: 5 })}
    <div class="bt-facts" data-block="facts">${facts}</div>
    ${s.note ? `<p class="bt-note bt-txt" data-k="40">${t(s.note)}</p>` : ''}
    ${foot(ctx, 'block')}`;
  return frame(s, ctx, inner, { stacks });
}

function cta(s, ctx) {
  const stacks = {};
  const t = ctx.t;
  const head2 = s.keyword ? String(s.headline).replace('{keyword}', `==${s.keyword}==`) : s.headline;
  const inner = `${head(ctx)}
    ${stack(stacks, head2, { cap: ctx.format.name === 'feed' ? 280 : 230, block: 'cta', k0: 2, cls: 'bt-grow bt-bottom' })}
    ${s.sub ? `<p class="bt-dek bt-txt" data-k="30">${t(s.sub)}</p>` : ''}
    ${foot(ctx, 'block')}`;
  return frame(s, ctx, inner, { stacks });
}

const TYPES = { cover, point, number, compare, steps: (s, c) => list(s, c, true), recap: (s, c) => list(s, c, false), myth, quote, stat, cta };

export function render(slide, ctx) {
  const fn = TYPES[slide.type];
  if (!fn) throw new Error(`bold-type: no layout for slide type "${slide.type}"`);
  return fn(slide, ctx);
}
