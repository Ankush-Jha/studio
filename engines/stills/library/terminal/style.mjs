// Terminal Card (group 1 · Ledger). See library/terminal/STYLE.md.
// A generic market-terminal panel on warm near-black: one monospace (Martian Mono) used wide
// for figures and narrow for labels, a command-line headline with a block cursor, dated data
// rows, charts that start at zero with a crosshair readout, and the client accent kept for a
// single reverse-video alert. No window chrome, no glow, no scanlines, no real tickers.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const asOf = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : '';
};
const slug = (s) => String(s || 'desk').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fmtNum = (v, unit, ctx) => (unit === 'months' ? `${Math.round(v)}` : ctx.money(v));

// Round a maximum up to 1, 2, 2.5, 4 or 5 x a power of ten, so axis ticks read cleanly.
function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const DIMS = {
  feed: { fork: [952, 350], meter: [952, 660], cols: [952, 640] },
  story: { fork: [950, 270], meter: [950, 470], cols: [950, 470] },
  square: { fork: [952, 250], meter: [952, 450], cols: [952, 450] },
};

function head(ctx) {
  return `<header class="tm-head" data-role="label" data-noword>
    <span class="tm-path">~/rate-desk/${ctx.esc(slug(ctx.spec.series))}</span>
    <span class="tm-asof">as of ${ctx.esc(asOf(ctx.spec.date))}</span>
  </header>`;
}

function status(ctx, size = 'line', extra = '') {
  const folio = ctx.folio();
  return `<footer class="tm-status">
    ${ctx.compliance(size)}
    <span class="tm-status-r" data-role="label" data-noword>${extra}${folio ? `<span class="tm-folio">${folio}</span>` : ''}</span>
  </footer>`;
}

// Character-cell dot grid, drawn as an SVG pattern (no gradients).
function bg(ctx) {
  const { w, h } = ctx.format;
  return `<svg class="tm-cells" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <defs><pattern id="tm-cell" width="24" height="36" patternUnits="userSpaceOnUse"><rect x="11" y="17" width="2" height="2" fill="${ctx.palette.rule}"/></pattern></defs>
      <rect width="${w}" height="${h}" fill="url(#tm-cell)" opacity="0.55"/>
    </svg>`;
}

const prompt = (html, cls = '') => `<span class="tm-prompt" aria-hidden="true">&gt;</span><span class="tm-line ${cls}">${html}<span class="tm-cursor" aria-hidden="true"></span></span>`;
// Axis step: the smallest of 1, 2, 2.5, 5 x 10^k that gives at most `n` intervals.
function niceStep(raw, n = 5) {
  const t = raw / n;
  const p = 10 ** Math.floor(Math.log10(t));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= t) return m * p;
  return 10 * p;
}

// Cover chart: the change in the monthly payment from today, forked at the decision date.
// Zero-based on purpose: a hold stays on the $0 line, a hike steps up by the exact delta.
function forkChart(ctx, s) {
  const [w, h0] = DIMS[ctx.format.name].fork;
  const h = h0 + (ctx.variant === 'b' && ctx.format.name === 'feed' ? 120 : 0);
  const rows = ctx.calc.values.rows;
  const d = rows[1].exact - rows[0].exact;
  const max = niceMax(d * 1.35);
  const pad = { l: 104, r: 8, t: 22, b: 52 };
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const x0 = pad.l, xD = pad.l + (w - pad.l - pad.r) * 0.44, x1 = w - pad.r;
  const P = ctx.palette;
  const dec = s.forkAt || 'Dec 9';
  let g = '';
  for (const v of [0, max / 2, max]) {
    g += `<line x1="${x0}" x2="${x1}" y1="${y(v)}" y2="${y(v)}" stroke="${P.rule}" stroke-width="2" stroke-dasharray="${v ? '2 8' : '0'}"/>`;
    g += `<text class="tm-tick" x="${x0 - 18}" y="${y(v) + 7}" text-anchor="end">+${ctx.money(v)}</text>`;
  }
  const hike = `M${x0},${y(0)} H${xD} V${y(d)} H${x1}`;
  return `<div class="tm-fork" style="width:${w}px;height:${h}px" data-block="chart">
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" data-role="label">
      ${g}
      <line x1="${xD}" x2="${xD}" y1="${pad.t - 10}" y2="${h - pad.b + 8}" stroke="${P['ink-soft']}" stroke-width="2" stroke-dasharray="6 6"/>
      <path d="M${xD},${y(0)} H${x1}" stroke="${P.amber}" stroke-width="5" fill="none"/>
      <path d="${hike}" stroke="${P['accent-ink']}" stroke-width="6" fill="none" stroke-linejoin="miter"/>
      <path d="M${x0},${y(0)} H${xD}" stroke="${P.ink}" stroke-width="6" fill="none"/>
      <rect x="${xD - 9}" y="${y(d) - 9}" width="18" height="18" fill="${P.paper}" stroke="${P['accent-ink']}" stroke-width="4"/>
      <text class="tm-end" x="${x1}" y="${y(d) - 18}" text-anchor="end" fill="${P['accent-ink']}">hike</text>
      <text class="tm-end" x="${x1}" y="${y(0) - 18}" text-anchor="end" fill="${P.amber}">hold</text>
      <text class="tm-axis" x="${x0}" y="${h - 12}">today</text>
      <text class="tm-axis" x="${xD}" y="${h - 12}" text-anchor="middle">${ctx.esc(dec)}</text>
    </svg>
    <span class="tm-fork-k" data-role="label">change in the monthly payment</span>
  </div>`;
}

// Generic zero-based meter for ctx.calc.chart (1–3 rows, money or months).
// Variant a: horizontal bars with a vertical crosshair. Variant b: columns with a horizontal one.
function meter(ctx, s) {
  const ch = ctx.calc.chart;
  const rows = ch.rows;
  const hi = Math.min(ch.highlight ?? rows.length - 1, rows.length - 1);
  const labels = s.rowLabels || rows.map((r) => r.label);
  const rawMax = Math.max(...rows.map((r) => r.value));
  const tickStep = niceStep(rawMax, 5);
  const maxV = Math.ceil((rawMax * 1.04) / tickStep) * tickStep;
  const base = rows[0].value;
  const P = ctx.palette;
  const cols = ctx.variant === 'b';
  const [w, h] = DIMS[ctx.format.name][cols ? 'cols' : 'meter'];
  const ticks = [];
  for (let v = 0; v <= maxV + 1e-6; v += tickStep) ticks.push(v);
  const tag = s.callout ? `<span class="tm-tag-v">${ctx.t(s.callout)}</span>${s.calloutSub ? `<span class="tm-tag-s">${ctx.t(s.calloutSub)}</span>` : ''}` : '';
  let svg = '';
  let tagPos = '';
  if (!cols) {
    const pad = { l: 0, r: 180, t: 136, b: 54 };
    const bw = w - pad.l - pad.r;
    const x = (v) => pad.l + (bw * v) / maxV;
    const slot = (h - pad.t - pad.b) / rows.length;
    // Leave room above each bar for its label: the label needs ~44px clear of the bar above.
    const bh = Math.max(24, Math.min(84, slot * 0.4, slot - 46));
    for (const v of ticks) {
      svg += `<line x1="${x(v)}" x2="${x(v)}" y1="${pad.t - 8}" y2="${h - pad.b + 8}" stroke="${P.rule}" stroke-width="2" stroke-dasharray="${v ? '2 8' : '0'}"/>`;
      svg += `<text class="tm-tick" x="${x(v)}" y="${h - 12}" text-anchor="${v === 0 ? 'start' : v >= maxV - 1e-6 ? 'end' : 'middle'}">${fmtNum(v, ch.unit, ctx)}</text>`;
    }
    rows.forEach((r, k) => {
      const yTop = pad.t + slot * k + slot - bh - 8;
      const fill = k === hi ? P.amber : k > hi ? 'none' : P['ink-soft'];
      const stroke = k > hi ? `stroke="${P['ink-soft']}" stroke-width="3" stroke-dasharray="8 6"` : '';
      svg += `<text class="tm-row-k" x="${pad.l}" y="${yTop - 18}">${ctx.esc(String(labels[k]).replace(/<[^>]+>/g, ''))}</text>`;
      svg += `<rect x="${pad.l}" y="${yTop}" width="${x(r.value) - pad.l}" height="${bh}" fill="${fill}" ${stroke}/>`;
      if (k === hi && k > 0 && r.value !== base) {
        const a = Math.min(r.value, base), b = Math.max(r.value, base);
        svg += r.value > base
          ? `<rect x="${x(a)}" y="${yTop}" width="${Math.max(6, x(b) - x(a))}" height="${bh}" fill="${P.accent}"/>`
          : `<rect x="${x(a) + 2}" y="${yTop + 2}" width="${Math.max(6, x(b) - x(a) - 4)}" height="${bh - 4}" fill="none" stroke="${P['accent-ink']}" stroke-width="4" stroke-dasharray="10 6"/>`;
      }
      // Values sit outside the highlighted bar (past the crosshair) and inside the others.
      const inside = k < hi && x(r.value) - pad.l > 260;
      // A highlighted row shorter than the base carries the saved span after it: label past that.
      const xr = k === hi && k > 0 && r.value < base ? x(base) : x(r.value);
      svg += inside
        ? `<text class="tm-row-v" x="${x(r.value) - 18}" y="${yTop + bh / 2 + 9}" text-anchor="end" fill="${P.paper}">${ctx.esc(r.shown)}</text>`
        : `<text class="tm-row-v" x="${xr + 18}" y="${yTop + bh / 2 + 9}" fill="${k === hi ? P.amber : P.ink}">${ctx.esc(r.shown)}</text>`;
    });
    const xc = x(rows[hi].value);
    svg += `<line x1="${xc}" x2="${xc}" y1="${pad.t - 46}" y2="${h - pad.b + 8}" stroke="${P.ink}" stroke-width="2" stroke-dasharray="6 5"/>`;
    tagPos = `right:${Math.max(0, w - xc - 1)}px;top:0`;
  } else {
    const pad = { l: 120, r: 0, t: ctx.format.name === 'feed' ? 190 : 160, b: 60 };
    const bh = h - pad.t - pad.b;
    const y = (v) => pad.t + bh * (1 - v / maxV);
    const slot = (w - pad.l - pad.r) / rows.length;
    const cw = Math.min(170, slot * 0.5);
    for (const v of ticks) {
      svg += `<line x1="${pad.l - 10}" x2="${w}" y1="${y(v)}" y2="${y(v)}" stroke="${P.rule}" stroke-width="2" stroke-dasharray="${v ? '2 8' : '0'}"/>`;
      svg += `<text class="tm-tick" x="${pad.l - 22}" y="${y(v) + 7}" text-anchor="end">${fmtNum(v, ch.unit, ctx)}</text>`;
    }
    rows.forEach((r, k) => {
      const xL = pad.l + slot * k + (slot - cw) / 2;
      const fill = k === hi ? P.amber : k > hi ? 'none' : P['ink-soft'];
      const stroke = k > hi ? `stroke="${P['ink-soft']}" stroke-width="3" stroke-dasharray="8 6"` : '';
      svg += `<rect x="${xL}" y="${y(r.value)}" width="${cw}" height="${y(0) - y(r.value)}" fill="${fill}" ${stroke}/>`;
      if (k === hi && k > 0 && r.value !== base) {
        const a = Math.min(r.value, base), b = Math.max(r.value, base);
        svg += r.value > base
          ? `<rect x="${xL}" y="${y(b)}" width="${cw}" height="${Math.max(6, y(a) - y(b))}" fill="${P.accent}"/>`
          : `<rect x="${xL + 2}" y="${y(b) + 2}" width="${cw - 4}" height="${Math.max(6, y(a) - y(b) - 4)}" fill="none" stroke="${P['accent-ink']}" stroke-width="4" stroke-dasharray="10 6"/>`;
      }
      const inside = k < hi && y(0) - y(r.value) > 120;
      const yTopLabel = k === hi && k > 0 && r.value < base ? y(base) : y(r.value);
      svg += inside
        ? `<text class="tm-row-v" x="${xL + cw / 2}" y="${y(r.value) + 44}" text-anchor="middle" fill="${P.paper}">${ctx.esc(r.shown)}</text>`
        : `<text class="tm-row-v" x="${xL + cw / 2}" y="${yTopLabel - 16}" text-anchor="middle" fill="${k === hi ? P.amber : P.ink}">${ctx.esc(r.shown)}</text>`;
      svg += `<text class="tm-row-k" x="${xL + cw / 2}" y="${h - 14}" text-anchor="middle">${ctx.esc(String(labels[k]).replace(/<[^>]+>/g, ''))}</text>`;
    });
    const yc = y(rows[hi].value);
    svg += `<line x1="${pad.l - 10}" x2="${w}" y1="${yc}" y2="${yc}" stroke="${P.ink}" stroke-width="2" stroke-dasharray="6 5"/>`;
    tagPos = `right:0;top:0`;
  }
  return `<div class="tm-meter ${cols ? 'is-cols' : 'is-bars'}" style="width:${w}px;height:${h}px" data-block="chart">
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" data-role="label">${svg}</svg>
    ${tag ? `<div class="tm-tag" style="${tagPos}">${tag}</div>` : ''}
  </div>`;
}

// ---------- slide types ----------
function cover(s, ctx) {
  const t = ctx.t;
  // Story covers: the profile grid shows y 240–1680, but text must stop at 1248. A ghosted,
  // outlined copy of the figure fills the band below so the grid tile isn't half empty.
  const gTxt = String(s.figure || '').replace(/[=()~*|]/g, '').trim();
  const gSize = Math.min(330, Math.floor(900 / (Math.max(1, gTxt.length) * 0.74)));
  const ghost = ctx.format.name === 'story' && gTxt ? `<div class="tm-ghost" aria-hidden="true"><span style="font-size:${gSize}px">${ctx.esc(gTxt)}</span></div>` : '';
  const chart = ctx.calc?.kind === 'payment-compare' && ctx.calc.values.rows.length >= 2 ? forkChart(ctx, s) : '';
  const fig = s.figure ? `<div class="tm-readout" data-block="figure">
      <div class="tm-fig-box"><span class="tm-fig" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 230 : 170}" data-role="display">${t(s.figure)}</span></div>
      ${s.figureLabel ? `<p class="tm-fig-k">${t(s.figureLabel)}</p>` : ''}
    </div>` : '';
  return {
    bg: bg(ctx) + ghost,
    html: `<div class="stage tm-cover">
      ${head(ctx)}
      ${s.kicker ? `<p class="tm-kicker" data-role="label">${t(s.kicker)}</p>` : ''}
      <h1 class="tm-h1 has-prompt" data-block="headline" data-fit="box" data-max-lines="4" data-fit-min="60" data-role="display">${prompt(t(s.headline))}</h1>
      ${fig}
      ${chart}
      ${s.dek ? `<p class="tm-dek" data-block="dek">${t(s.dek)}</p>` : ''}
      ${status(ctx, 'line', `<span class="tm-cue">${ctx.esc(s.cue || 'swipe')} →</span>`)}
    </div>`,
  };
}

function point(s, ctx) {
  const t = ctx.t;
  return {
    bg: bg(ctx),
    html: `<div class="stage tm-point">
      ${head(ctx)}
      ${s.eyebrow ? `<p class="tm-kicker" data-role="label"><span class="tm-hash" aria-hidden="true"># </span>${t(s.eyebrow)}</p>` : ''}
      ${s.figure ? `<div class="tm-fig-box tm-fig-point"><span class="tm-fig" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 250 : 190}" data-role="display">${t(s.figure)}</span></div>` : ''}
      <p class="tm-statement ${s.figure ? 'with-fig' : ''}" data-block="statement" data-role="display">${t(s.text)}</p>
      ${s.note ? `<p class="tm-note" data-block="note"><span class="tm-note-k" aria-hidden="true">note </span>${t(s.note)}</p>` : ''}
      ${status(ctx)}
    </div>`,
  };
}

function number(s, ctx) {
  const t = ctx.t;
  if (!ctx.calc?.chart) throw new Error('terminal number slide needs a calc with a chart');
  return {
    bg: bg(ctx),
    html: `<div class="stage tm-number">
      ${head(ctx)}
      ${s.label ? `<p class="tm-kicker" data-role="label"><span class="tm-hash" aria-hidden="true"># </span>${t(s.label)}</p>` : ''}
      <h2 class="tm-h2" data-block="title" data-role="display">${t(s.title)}</h2>
      ${meter(ctx, s)}
      ${!s.callout && s.calloutSub ? `<p class="tm-sub" data-block="sub">${t(s.calloutSub)}</p>` : ''}
      ${s.takeaway ? `<p class="tm-note">${t(s.takeaway)}</p>` : ''}
      <p class="tm-fine" data-role="fine" data-block="fine">${t(s.assumptions)}</p>
      ${status(ctx)}
    </div>`,
  };
}

function compare(s, ctx) {
  const t = ctx.t;
  const side = (o, cls) => `<div class="tm-side ${cls}">
      <p class="tm-side-k" data-role="label">${t(o.label)}</p>
      <p class="tm-side-v" data-role="display">${t(o.value)}</p>
      ${o.note ? `<p class="tm-side-n">${t(o.note)}</p>` : ''}
    </div>`;
  return {
    bg: bg(ctx),
    html: `<div class="stage tm-compare">
      ${head(ctx)}
      ${s.label ? `<p class="tm-kicker" data-role="label"><span class="tm-hash" aria-hidden="true"># </span>${t(s.label)}</p>` : ''}
      <h2 class="tm-h2" data-block="title" data-role="display">${t(s.title)}</h2>
      <div class="tm-sides" data-block="sides">${side(s.left, 'is-l')}${side(s.right, 'is-r')}</div>
      ${s.verdict ? `<p class="tm-note tm-verdict" data-block="verdict"><span class="tm-note-k" aria-hidden="true">note </span>${t(s.verdict)}</p>` : ''}
      ${status(ctx)}
    </div>`,
  };
}

function list(s, ctx, numbered) {
  const t = ctx.t;
  const items = (s.items || []).map((it, i) => `<li class="tm-item">
      <span class="tm-item-n" aria-hidden="true">${numbered ? String(i + 1).padStart(2, '0') : '<i class="tm-box"></i>'}</span>
      <span class="tm-item-t">${t(it.text)}${it.tag ? ` <em class="tm-tagline" data-role="label">${t(it.tag)}</em>` : ''}</span>
    </li>`).join('');
  return {
    bg: bg(ctx),
    html: `<div class="stage tm-list ${numbered ? 'is-steps' : 'is-recap'}">
      ${head(ctx)}
      ${s.label ? `<p class="tm-kicker" data-role="label"><span class="tm-hash" aria-hidden="true"># </span>${t(s.label)}</p>` : ''}
      <h2 class="tm-h2 has-prompt" data-block="title" data-role="display">${prompt(t(s.title))}</h2>
      <ol class="tm-items" data-block="items">${items}</ol>
      ${s.note ? `<p class="tm-note" data-block="note"><span class="tm-note-k" aria-hidden="true">note </span>${t(s.note)}</p>` : ''}
      ${status(ctx)}
    </div>`,
  };
}

// Myth as a diff: the claim removed, the fact added.
function myth(s, ctx) {
  const t = ctx.t;
  return {
    bg: bg(ctx),
    html: `<div class="stage tm-myth">
      ${head(ctx)}
      <p class="tm-kicker" data-role="label"><span class="tm-hash" aria-hidden="true"># </span>${t(s.label || 'Correction')}</p>
      <div class="tm-diff" data-block="diff">
        <p class="tm-del"><span class="tm-sign" aria-hidden="true">−</span><span class="tm-del-t">${t(s.myth)}</span></p>
        <p class="tm-add" data-role="display"><span class="tm-sign" aria-hidden="true">+</span><span>${t(s.fact)}</span></p>
      </div>
      ${s.note ? `<p class="tm-note"><span class="tm-note-k" aria-hidden="true">note </span>${t(s.note)}</p>` : ''}
      ${status(ctx)}
    </div>`,
  };
}

function quote(s, ctx) {
  const t = ctx.t;
  return {
    bg: bg(ctx),
    html: `<div class="stage tm-quote">
      ${head(ctx)}
      <blockquote class="tm-q has-prompt" data-block="quote" data-role="display">${prompt(t(s.quote))}</blockquote>
      ${s.by ? `<p class="tm-by" data-role="label">${t(s.by)}</p>` : ''}
      ${status(ctx)}
    </div>`,
  };
}

function stat(s, ctx) {
  const t = ctx.t;
  const facts = (s.facts || []).map((f) => `<li class="tm-fact${f.emphasis ? ' is-hi' : ''}">
      <span class="tm-fact-k">${t(f.label)}</span>
      <span class="tm-fact-v">${t(f.value)}</span>
      <span class="tm-fact-n">${f.note ? t(f.note) : ''}</span>
    </li>`).join('');
  return {
    bg: bg(ctx),
    html: `<div class="stage tm-stat">
      ${head(ctx)}
      ${s.kicker ? `<p class="tm-kicker" data-role="label">${t(s.kicker)}</p>` : ''}
      <h1 class="tm-h2 tm-stat-h has-prompt" data-block="headline" data-fit="box" data-max-lines="4" data-fit-min="44" data-role="display">${prompt(t(s.headline))}</h1>
      ${s.figure ? `<div class="tm-readout" data-block="figure"><div class="tm-fig-box"><span class="tm-fig" data-fit="width" data-fit-max="200" data-role="display">${t(s.figure)}</span></div>${s.figureLabel ? `<p class="tm-fig-k">${t(s.figureLabel)}</p>` : ''}</div>` : ''}
      ${facts ? `<ul class="tm-facts" data-block="facts">${facts}</ul>` : ''}
      ${s.note ? `<p class="tm-note" data-block="note"><span class="tm-note-k" aria-hidden="true">note </span>${t(s.note)}</p>` : ''}
      ${status(ctx, 'block')}
    </div>`,
  };
}

function cta(s, ctx) {
  const t = ctx.t;
  const kw = s.keyword ? `<span class="tm-kw">${ctx.esc(s.keyword)}</span>` : '';
  return {
    bg: bg(ctx),
    html: `<div class="stage tm-cta">
      ${head(ctx)}
      <h2 class="tm-cta-h has-prompt" data-block="cta" data-fit="box" data-max-lines="6" data-fit-min="54" data-role="display">${prompt(t(s.headline).replace('{keyword}', kw))}</h2>
      ${s.sub ? `<p class="tm-dek" data-block="sub">${t(s.sub)}</p>` : ''}
      ${status(ctx, 'block')}
    </div>`,
  };
}

const TYPES = { cover, point, number, compare, steps: (s, c) => list(s, c, true), recap: (s, c) => list(s, c, false), myth, quote, stat, cta };

export function render(slide, ctx) {
  const fn = TYPES[slide.type];
  if (!fn) throw new Error(`terminal: no layout for slide type "${slide.type}" (has ${Object.keys(TYPES).join(', ')})`);
  return fn(slide, ctx);
}
