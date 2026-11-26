// Front Page (group 4 · Dossier). See library/broadsheet/STYLE.md.
// Newspaper grammar, made honest: the nameplate is the post's own series name (never a real
// paper), the dateline says "Illustrative edition", the chart stands where the news photo would
// be and is credited "computed, illustrative". Slide 1 is the front page; inner slides are page
// sections (wood headline, graphic, point/counterpoint, in brief, correction, notice), each
// with a jump line that points to the next slide. Type: UnifrakturMaguntia (nameplate only),
// Libre Franklin (heads, labels, figures), Newsreader (body and decks).

const PROV = { ON: 'Ont.', QC: 'Que.', BC: 'B.C.', AB: 'Alta.', MB: 'Man.', SK: 'Sask.', NS: 'N.S.', NB: 'N.B.', NL: 'N.L.', PE: 'P.E.I.' };

const titleCase = (s) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
function nameplate(ctx) {
  const s = titleCase(String(ctx.spec.series || 'The Ledger').trim());
  return /^the\s/i.test(s) ? s : `The ${s}`;
}
function dateLong(iso) {
  const d = new Date(`${iso || '2026-11-16'}T12:00:00Z`);
  return d.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
const place = (ctx) => [ctx.client.city, PROV[ctx.client.province] || ctx.client.province].filter(Boolean).join(', ');

// Newspapers don't hand-mark their headlines: inline marks become type, strikes stay strikes.
const T = (ctx, s) => ctx.t(s).replace(/data-mark="strike"/g, 'data-mark="bs-strike"').replace(/data-mark="(circle|underline|highlight|swash|box|tick|plain)"/g, 'data-mark="bs-em"');

function mast(ctx) {
  const n = ctx.folio();
  return `<header class="bs-mast">
      <div class="bs-ear bs-ear-l" data-role="label" data-noword><b>Illustrative</b><span>edition</span></div>
      <div class="bs-name-box"><p class="bs-name" data-role="display" data-noword data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 104 : 88}">${ctx.esc(nameplate(ctx))}</p></div>
      <div class="bs-ear bs-ear-r" data-role="label" data-noword>${n ? `<b>No. ${n.split('/')[0]}</b><span>of ${n.split('/')[1]} · Free</span>` : '<b>Single copy</b><span>Free</span>'}</div>
    </header>
    <div class="bs-dateline" data-role="label" data-noword><span>${dateLong(ctx.spec.date)}</span><span>${ctx.esc(place(ctx))}</span><span>${ctx.isSingle ? 'One page' : `Slide ${ctx.index + 1} of ${ctx.total}`}</span></div>`;
}

function pageHead(ctx) {
  return `<header class="bs-phead" data-role="label" data-noword>
      <span class="bs-pname">${ctx.esc(nameplate(ctx))}</span>
      <span class="bs-pdate">${dateLong(ctx.spec.date).replace(/^\w+, /, '')}</span>
      <span class="bs-pno">Slide ${ctx.index + 1}</span>
    </header>`;
}

function foot(ctx, { block = false, nojump = false } = {}) {
  const next = nojump || ctx.isLast || ctx.isSingle ? '' : `<span class="bs-jump" data-role="label" data-noword>Continued on slide ${ctx.index + 2}<b aria-hidden="true"></b></span>`;
  return `<footer class="bs-foot"><div class="bs-imprint">${ctx.compliance(block ? 'block' : 'line')}</div>${next}</footer>`;
}

function flag(ctx, text) {
  return text ? `<p class="bs-flag" data-role="label">${T(ctx, text)}</p>` : '';
}

// ---------- art: the chart stands where the photo would be ----------
let uid = 0;
function halftone(id, color, step = 7, r = 2.1) {
  return `<pattern id="${id}" width="${step}" height="${step}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="${step / 2}" cy="${step / 2}" r="${r}" fill="${color}"/></pattern>`;
}

function chartArt(ctx, s) {
  const ch = ctx.calc.chart;
  const rows = ch.rows;
  const max = Math.max(...rows.map((r) => r.value));
  const labels = s.rowLabels || rows.map((r) => r.label);
  const id = `ht${uid++}`;
  const W = 1000, BH = 120;
  const bars = rows.map((r, k) => {
    const w = Math.max(6, (r.value / max) * W);
    const hi = k === ch.highlight && rows.length > 1;
    return `<div class="bs-bar-row ${hi ? 'is-hi' : ''}">
        <p class="bs-bar-k" data-role="label">${T(ctx, labels[k] || r.label)}</p>
        <div class="bs-bar-line"><svg class="bs-bar" viewBox="0 0 ${W} ${BH}" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width="${w.toFixed(1)}" height="${BH}" fill="${hi ? ctx.palette.accent : `url(#${id})`}"/>${hi ? '' : `<rect x="0" y="0" width="${w.toFixed(1)}" height="${BH}" fill="none" stroke="${ctx.palette.ink}" stroke-width="3" vector-effect="non-scaling-stroke"/>`}</svg>
        <span class="bs-bar-v" style="left:${((w / W) * 100).toFixed(2)}%">${ctx.esc(r.shown)}</span></div>
      </div>`;
  }).join('');
  return `<figure class="bs-art bs-chart" data-block="chart" style="--bh:${rows.length > 2 ? 96 : rows.length === 2 ? 132 : 170}px">
      <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${halftone(id, ctx.palette.ink)}</defs></svg>
      <p class="bs-art-h" data-role="label">${ch.unit === 'months' ? 'Months to pay it off' : 'Per month'}</p>
      <div class="bs-bars">${bars}<span class="bs-zero" data-role="label">${ch.unit === 'months' ? '0' : '$0'}</span></div>
      <figcaption class="bs-cap" data-role="fine">Chart: computed, illustrative. Bars start at ${ch.unit === 'months' ? 'zero' : '$0'}.</figcaption>
    </figure>`;
}

function figureArt(ctx, s) {
  return `<figure class="bs-art bs-figbox" data-block="figure">
      <div class="bs-fig-wrap"><div class="bs-fig-in"><p class="bs-fig" data-role="display" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 230 : 190}">${T(ctx, s.figure)}</p></div></div>
      ${s.figureLabel ? `<p class="bs-fig-k">${T(ctx, s.figureLabel)}</p>` : ''}
      <figcaption class="bs-cap" data-role="fine">Graphic: illustrative.</figcaption>
    </figure>`;
}

function clippingArt(ctx, s) {
  const d = s.doc || {};
  return `<figure class="bs-art bs-clip" data-block="clip">
      <div class="bs-clip-paper" data-role="label">
        <p class="bs-clip-h"><span>Chequing statement</span><span>Acct ···· 0000</span></p>
        <p class="bs-clip-r"><span>Oct 08</span><span>Phone bill</span><span class="num">65.40</span></p>
        <p class="bs-clip-r is-hi"><span>${ctx.esc(d.date || 'Oct 14')}</span><span>${ctx.esc(d.label || 'Deposit')}</span><span class="num">${ctx.esc(String(d.amount || '8,000.00').replace(/^\$/, ''))}</span></p>
        <p class="bs-clip-r"><span>Oct 15</span><span>Payroll deposit</span><span class="num">2,410.00</span></p>
      </div>
      <figcaption class="bs-cap" data-role="fine">One line on a chequing statement. Graphic: illustrative, no real account.</figcaption>
    </figure>`;
}

function coverArt(ctx, s) {
  if (s.figure) return figureArt(ctx, s);
  if (ctx.calc?.chart) return chartArt(ctx, s);
  if (s.doc) return clippingArt(ctx, s);
  return '';
}

// ---------- slide types ----------
const sameAsSeries = (ctx, k) => String(k || '').trim().toLowerCase() === String(ctx.spec.series || '').trim().toLowerCase();
const jump = (ctx) => (ctx.isLast || ctx.isSingle ? '' : `<span class="bs-jump" data-role="label" data-noword>Continued on slide ${ctx.index + 2}<b aria-hidden="true"></b></span>`);

function cover(s, ctx) {
  const art = coverArt(ctx, s);
  const long = s.dek && ctx.words(s.dek) > 22;
  return {
    html: `<div class="stage bs-stage bs-front ${art ? 'has-art' : ''}">
      ${mast(ctx)}
      ${s.kicker && !sameAsSeries(ctx, s.kicker) ? `<p class="bs-kicker" data-role="label">${T(ctx, s.kicker)}</p>` : ''}
      <h1 class="bs-head" data-block="headline" data-role="display" data-grow data-grow-min="66" data-grow-max="${ctx.format.name === 'feed' ? 168 : 112}" data-max-lines="5" data-fit="box" data-fit-min="62">${T(ctx, s.headline)}</h1>
      <div class="bs-below">
        ${art}
        <div class="bs-col">${s.dek ? `<p class="${long ? 'bs-lead' : 'bs-standfirst'}" data-block="lead">${T(ctx, s.dek)}</p>` : ''}${ctx.variant === 'b' ? '' : jump(ctx)}</div>
      </div>
      ${foot(ctx, { nojump: ctx.variant !== 'b' })}
    </div>`,
  };
}

function point(s, ctx) {
  return {
    html: `<div class="stage bs-stage bs-page bs-wood ${s.figure ? 'has-fig' : ''}">
      ${pageHead(ctx)}
      ${flag(ctx, s.eyebrow)}
      ${s.figure ? `<div class="bs-pfig-box"><p class="bs-pfig" data-role="display" data-block="figure" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 260 : 200}">${T(ctx, s.figure)}</p></div>` : ''}
      <h2 class="bs-wood-h" data-block="text" data-role="display" data-grow data-grow-min="52" data-grow-max="${s.figure ? 104 : 156}" data-max-lines="${s.figure ? 5 : 7}" data-fit="box" data-fit-min="48">${T(ctx, s.text)}</h2>
      ${s.note ? `<p class="bs-deck" data-block="note">${T(ctx, s.note)}</p>` : ''}
      ${foot(ctx)}
    </div>`,
  };
}

function number(s, ctx) {
  if (!ctx.calc?.chart) throw new Error('broadsheet number slide needs a calc with a chart');
  return {
    html: `<div class="stage bs-stage bs-page bs-graphic">
      ${pageHead(ctx)}
      ${flag(ctx, s.label)}
      <h2 class="bs-h2" data-block="title" data-role="display" data-fit="box" data-max-lines="3" data-fit-min="48">${T(ctx, s.title)}</h2>
      <div class="bs-graphic-grid">
        ${chartArt(ctx, s)}
        ${s.callout ? `<div class="bs-callout" data-block="callout"><div class="bs-callout-in"><p class="bs-callout-v" data-fit="width" data-fit-max="74">${T(ctx, s.callout)}</p></div><p class="bs-callout-k">${T(ctx, s.calloutSub || '')}</p></div>` : ''}
      </div>
      ${s.takeaway ? `<p class="bs-deck">${T(ctx, s.takeaway)}</p>` : ''}
      <p class="bs-source" data-role="fine" data-block="source"><b>Source and assumptions.</b> ${T(ctx, s.assumptions || '')}</p>
      ${foot(ctx)}
    </div>`,
    audit: ctx.calc.audit,
  };
}

function compare(s, ctx) {
  const side = (o, k) => `<div class="bs-side ${k ? 'is-r' : 'is-l'}">
      <p class="bs-side-k" data-role="label">${T(ctx, o.label)}</p>
      <div class="bs-side-vbox"><p class="bs-side-v" data-role="display" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 150 : 110}">${T(ctx, o.value)}</p></div>
      ${o.note ? `<p class="bs-side-n">${T(ctx, o.note)}</p>` : ''}
    </div>`;
  return {
    html: `<div class="stage bs-stage bs-page bs-pcp">
      ${pageHead(ctx)}
      ${flag(ctx, s.label || 'Point, counterpoint')}
      <h2 class="bs-h2" data-block="title" data-role="display" data-fit="box" data-max-lines="3" data-fit-min="48">${T(ctx, s.title)}</h2>
      <div class="bs-sides" data-block="sides">${side(s.left, 0)}${side(s.right, 1)}</div>
      ${s.verdict ? `<p class="bs-deck bs-verdict" data-block="verdict">${T(ctx, s.verdict)}</p>` : ''}
      ${foot(ctx)}
    </div>`,
  };
}

function list(s, ctx, numbered) {
  const items = (s.items || []).map((it, i) => `<li><b class="bs-li-n" aria-hidden="true">${numbered ? `${i + 1}.` : ''}</b><span>${T(ctx, it.text)}${it.tag ? ` <em>${T(ctx, it.tag)}</em>` : ''}</span></li>`).join('');
  return {
    html: `<div class="stage bs-stage bs-page bs-brief ${numbered ? 'is-steps' : 'is-recap'}">
      ${pageHead(ctx)}
      <div class="bs-briefbox" data-block="brief">
        <p class="bs-brief-h" data-role="label">${T(ctx, s.label || 'In brief')}</p>
        <h2 class="bs-h2" data-role="display">${T(ctx, s.title)}</h2>
        <ol class="bs-ol" data-grow data-grow-min="30" data-grow-max="54">${items}</ol>
      </div>
      ${s.note ? `<p class="bs-deck">${T(ctx, s.note)}</p>` : ''}
      ${foot(ctx)}
    </div>`,
  };
}

function myth(s, ctx) {
  return {
    html: `<div class="stage bs-stage bs-page bs-correction">
      ${pageHead(ctx)}
      <div class="bs-corrbox" data-block="correction">
        <p class="bs-brief-h" data-role="label">${T(ctx, s.label || 'Correction')}</p>
        <p class="bs-corr-myth"><span class="bs-label-inline">You may have heard:</span> <span data-mark="bs-strike">${T(ctx, s.myth)}</span></p>
        <p class="bs-corr-fact" data-role="display">${T(ctx, s.fact)}</p>
        ${s.note ? `<p class="bs-deck">${T(ctx, s.note)}</p>` : ''}
      </div>
      ${foot(ctx)}
    </div>`,
  };
}

function quote(s, ctx) {
  return {
    html: `<div class="stage bs-stage bs-page bs-pull">
      ${pageHead(ctx)}
      <blockquote class="bs-q" data-block="quote" data-role="display">${T(ctx, s.quote)}</blockquote>
      ${s.by ? `<p class="bs-q-by" data-role="label">${T(ctx, s.by)}</p>` : ''}
      ${foot(ctx)}
    </div>`,
  };
}

function stat(s, ctx) {
  const facts = (s.facts || []).map((f) => `<div class="bs-fact ${f.emphasis ? 'is-hi' : ''}"><dt>${T(ctx, f.label)}</dt><dd>${T(ctx, f.value)}</dd>${f.note ? `<p>${T(ctx, f.note)}</p>` : ''}</div>`).join('');
  return {
    html: `<div class="stage bs-stage bs-front bs-statpage">
      ${mast(ctx)}
      ${s.kicker ? `<p class="bs-kicker" data-role="label">${T(ctx, s.kicker)}</p>` : ''}
      <h1 class="bs-head" data-block="headline" data-role="display" data-fit="box" data-max-lines="4" data-fit-min="60">${T(ctx, s.headline)}</h1>
      <div class="bs-below">
        ${s.figure ? figureArt(ctx, s) : ''}
        <dl class="bs-col bs-facts" data-block="facts"><p class="bs-brief-h" data-role="label">By the numbers</p>${facts}</dl>
      </div>
      ${s.note ? `<p class="bs-source" data-role="fine">${T(ctx, s.note)}</p>` : ''}
      ${foot(ctx, { block: true })}
    </div>`,
  };
}

function cta(s, ctx) {
  const kw = s.keyword ? `<b class="bs-kw">${ctx.esc(s.keyword)}</b>` : '';
  return {
    // The client seed picks one of two notice treatments, so two accounts never close alike.
    classes: [...ctx.client.id].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 2 ? 'notice-field' : '',
    html: `<div class="stage bs-stage bs-page bs-notice">
      ${pageHead(ctx)}
      <div class="bs-noticebox" data-block="notice">
        <p class="bs-notice-k" data-role="label">Notice to readers</p>
        <h2 class="bs-notice-h" data-role="display" data-grow data-grow-min="56" data-grow-max="156" data-max-lines="6" data-fit="box" data-fit-min="52">${T(ctx, s.headline).replace('{keyword}', kw)}</h2>
        ${s.sub ? `<p class="bs-deck">${T(ctx, s.sub)}</p>` : ''}
      </div>
      <div class="bs-imprint-block"><p class="bs-imprint-k" data-role="label">Published by</p>${ctx.compliance('block')}</div>
    </div>`,
  };
}

const TYPES = { cover, point, number, compare, steps: (s, c) => list(s, c, true), recap: (s, c) => list(s, c, false), myth, quote, stat, cta };

function bg(ctx) {
  // Newsprint: grain, a slow mottle, and in the story format the page fold below the safe box.
  const mottle = `<svg class="bs-mottle" width="${ctx.format.w}" height="${ctx.format.h}" aria-hidden="true"><filter id="bsm"><feTurbulence type="fractalNoise" baseFrequency="0.0035 0.006" numOctaves="3" seed="${ctx.client.seed % 50}"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#bsm)"/></svg>`;
  return `<div class="bs-paper"></div>${mottle}${ctx.format.name === 'story' ? '<div class="bs-fold"></div><div class="bs-cols-ghost"></div>' : ''}`;
}

export function render(slide, ctx) {
  uid = 0;
  const fn = TYPES[slide.type];
  if (!fn) throw new Error(`broadsheet: no layout for slide type "${slide.type}"`);
  return { bg: bg(ctx), ...fn(slide, ctx) };
}
