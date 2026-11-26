// Editorial Cover (group 2 · Kitchen Table). See library/magazine/STYLE.md.
// The carousel is one issue of a fictional magazine named after the post's series. Slide 1 is
// the cover: a full-bleed field in the client's accent, a Bodoni Moda masthead set to the full
// measure, a dateline ("November 2026 · <city> edition"), cover lines that point to the slides
// inside by page number, and one hero (client photo slot or a typographic figure). Inner slides
// are editorial spreads on bright cool paper: running head and folio, a standfirst with a drop
// cap, big didone figures, a footnoted chart. The last slide is the back cover: the field again.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATICS = path.resolve(HERE, '..', '..');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function issueDate(ctx) {
  const d = ctx.spec.date ? new Date(`${ctx.spec.date}T12:00:00Z`) : new Date();
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function dateline(ctx) {
  const city = ctx.client.city;
  return `${issueDate(ctx)}${city ? ` · ${city} edition` : ''}`;
}

// Cover lines: read the post's other slides (spec file) and point to them by page number.
// Only labels with no {tokens} are used, 2-7 words each; the cover still works without them.
function coverLines(ctx) {
  const cands = [path.join(STATICS, 'specs', 'library', `${ctx.spec.id}.json`), path.join(STATICS, 'specs', `${ctx.spec.id}.json`)];
  const file = cands.find((f) => fs.existsSync(f));
  if (!file) return [];
  let spec;
  try { spec = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
  const pick = (s) => {
    const o = { ...s, ...(s.byClient?.[ctx.client.id] || {}) };
    const order = { number: ['label', 'title'], compare: ['title', 'label'], recap: ['title', 'label'], steps: ['title', 'label'], myth: ['label', 'myth'], point: ['eyebrow', 'text'], quote: ['by'] }[o.type] || [];
    for (const k of order) {
      const v = o[k];
      if (typeof v !== 'string' || /[{}]/.test(v)) continue;
      const n = v.replace(/[=()~*|]/g, '').trim().split(/\s+/).length;
      if (n >= 3 && n <= 7) return v.replace(/\.$/, '');
    }
    return null;
  };
  const out = [];
  (spec.slides || []).forEach((s, i) => {
    if (i === 0 || i === spec.slides.length - 1 || out.length >= 3) return;
    const line = pick(s);
    if (line && !out.some((l) => l.text === line)) out.push({ page: i + 1, text: line });
  });
  return out;
}

function runhead(ctx) {
  const folio = ctx.isSingle ? '' : `<span class="mg-folio tnum"><b>${ctx.index + 1}</b></span>`;
  return `<header class="mg-run" data-role="label" data-noword>
      <span class="mg-run-title">${ctx.esc(ctx.spec.series || '')}</span>
      <span class="mg-run-date">${ctx.esc(issueDate(ctx))}</span>
      ${folio}
    </header>`;
}

function grain() { return '<div class="mg-grain"></div>'; }
// Keep short words off line ends ("…$650 a / month"): bind them to the next word.
const bind = (str) => String(str || '').replace(/([\p{L}\p{N}])-(\p{L})/gu, '$1\u2060-\u2060$2').replace(/(^|\s)(a|an|the|to|of|in|on|at|by|is|it|he|I|A|An|The|If|Is|It)\s+/g, (m, sp, w) => `${sp}${w}\u00A0`);
// A leading +/− in a didone numeral is a hairline; set it in the grotesk instead.
const signed = (html) => String(html).replace(/^([+−-])/, '<span class="mg-sign">$1</span>');

function masthead(ctx, cls = '') {
  const desc = /[gjpqy,]/.test(ctx.spec.series || '') ? 'has-desc' : 'no-desc';
  return `<div class="mg-mast-box ${desc} ${cls}"><span class="mg-mast" data-fit="width" data-fit-max="${{ feed: 190, story: 175, square: 140 }[ctx.format.name] || 160}" data-role="display" data-noword>${ctx.esc(ctx.spec.series || 'Notes')}</span></div>`;
}

function hero(s, ctx) {
  if (s.photo) return `<figure class="mg-photo">${ctx.photo(s.photo, { label: s.photoLabel || 'Cover photo' })}</figure>`;
  if (s.figure) return `<div class="mg-hero-fig"><span class="mg-hero-n" data-fit="width" data-fit-max="420" data-role="display">${signed(ctx.t(s.figure))}</span>${s.figureLabel ? `<p class="mg-hero-l">${ctx.t(s.figureLabel)}</p>` : ''}</div>`;
  return '';
}

// ---------- slide types ----------
function cover(s, ctx) {
  const t = ctx.t;
  const lines = coverLines(ctx);
  const lineHTML = lines.length ? `<ul class="mg-lines" data-block="lines">${lines.map((l) => `<li><span class="mg-pg tnum" data-role="label" data-noword>p.${l.page}</span><span class="mg-line">${t(l.text)}</span></li>`).join('')}</ul>` : '';
  const kicker = s.kicker ? `<p class="mg-kicker" data-role="label">${t(s.kicker)}</p>` : '';
  // Story covers: the photo leaves the text column and runs full bleed below the safe box,
  // where it still shows in the 3:4 profile-grid crop; all words stay in y 270-1248.
  const bleedPhoto = ctx.format.name === 'story' && s.photo;
  const hasHero = !!(s.photo || s.figure) && !bleedPhoto;
  return {
    bg: `<div class="mg-field"></div>${bleedPhoto ? `<figure class="mg-photo mg-photo-bleed">${ctx.photo(s.photo, { label: s.photoLabel || 'Cover photo' })}</figure>` : ''}${grain()}`,
    classes: `is-cover ${hasHero ? 'has-hero' : 'no-hero'} ${s.photo ? 'has-photo' : ''} ${bleedPhoto ? 'photo-bleed' : ''}`,
    html: `<div class="stage mg-cover mg-front">
      ${masthead(ctx)}
      <p class="mg-dateline" data-role="label" data-noword><span>${ctx.esc(dateline(ctx))}</span></p>
      <div class="mg-cover-mid">
        <div class="mg-cover-side">${kicker}${lineHTML}</div>
        ${bleedPhoto ? '' : hero(s, ctx)}
      </div>
      <div class="mg-cover-story" data-block="headline">
        <h1 class="mg-h1" data-fit="box" data-max-lines="${ctx.format.name === 'story' ? 4 : 3}" data-fit-min="64" data-role="display">${t(bind(s.headline))}</h1>
        ${s.dek ? `<p class="mg-dek">${t(s.dek)}</p>` : ''}
      </div>
      <footer class="mg-cover-foot">
        <span class="mg-cue" data-role="label" data-noword>${ctx.esc(s.cue || 'Turn the page')}<i aria-hidden="true"></i></span>
        <div class="mg-label">${ctx.compliance('line')}</div>
      </footer>
    </div>`,
  };
}

function point(s, ctx) {
  const t = ctx.t;
  const fig = s.figure ? `<div class="mg-fig-box" data-block="figure"><span class="mg-fig" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 360 : 260}" data-role="display">${signed(t(s.figure))}</span></div>` : '';
  return {
    bg: grain(),
    classes: s.figure ? 'has-fig' : 'no-fig',
    html: `<div class="stage mg-spread mg-point">
      ${runhead(ctx)}
      ${s.eyebrow ? `<p class="mg-section" data-role="label">${t(s.eyebrow)}</p>` : ''}
      ${fig}
      <p class="mg-stand ${s.figure ? '' : 'has-drop'}" data-block="stand" data-role="display">${t(bind(s.text))}</p>
      ${s.note ? `<p class="mg-note" data-block="note">${t(s.note)}</p>` : ''}
      <footer class="mg-foot">${ctx.compliance('line')}</footer>
    </div>`,
  };
}

// Editorial bar chart: one row per value, bars from zero, the highlighted row in the accent.
function chartHTML(s, ctx) {
  const ch = ctx.calc?.chart;
  if (!ch) throw new Error('magazine number slide needs a calc with a chart');
  const rows = ch.rows;
  const max = Math.max(...rows.map((r) => r.value));
  const labels = s.rowLabels || rows.map((r) => r.label);
  return `<div class="mg-chart rows-${rows.length}" data-block="chart">${rows.map((r, k) => `
      <div class="mg-row ${k === ch.highlight ? 'is-hi' : ''}">
        <p class="mg-row-k" data-role="label">${t2(ctx, labels[k] ?? r.label)}</p>
        <div class="mg-row-bar"><i style="--w:${((r.value / max) * 100).toFixed(3)}"></i><span class="mg-row-v">${ctx.esc(r.shortShown ?? r.shown)}</span></div>
      </div>`).join('')}
      <p class="mg-zero tnum" data-role="label">${ch.unit === 'months' ? '0 months' : '$0'}</p>
    </div>`;
}
const t2 = (ctx, s) => ctx.t(String(s));

function number(s, ctx) {
  const t = ctx.t;
  return {
    bg: grain(),
    html: `<div class="stage mg-spread mg-number">
      ${runhead(ctx)}
      ${s.label ? `<p class="mg-section" data-role="label">${t(s.label)}</p>` : ''}
      <h2 class="mg-h2" data-block="title" data-role="display">${t(bind(s.title))}</h2>
      ${chartHTML(s, ctx)}
      ${s.callout ? `<div class="mg-pull" data-block="callout"><span class="mg-pull-v">${signed(t(s.callout))}</span>${s.calloutSub ? `<span class="mg-pull-s">${t(s.calloutSub)}</span>` : ''}</div>` : ''}
      ${s.takeaway ? `<p class="mg-note">${t(s.takeaway)}</p>` : ''}
      <p class="mg-fine" data-role="fine" data-block="fine"><b aria-hidden="true">†</b> ${t(s.assumptions)}</p>
      <footer class="mg-foot">${ctx.compliance('line')}</footer>
    </div>`,
  };
}

function compare(s, ctx) {
  const t = ctx.t;
  const side = (o, cls) => `<div class="mg-side ${cls}">
      <p class="mg-side-k" data-role="label">${t(o.label)}</p>
      <div class="mg-side-vbox"><span class="mg-side-v" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 150 : 120}" data-role="display">${signed(t(o.value))}</span></div>
      ${o.note ? `<p class="mg-side-n">${t(o.note)}</p>` : ''}
    </div>`;
  return {
    bg: grain(),
    html: `<div class="stage mg-spread mg-compare">
      ${runhead(ctx)}
      ${s.label ? `<p class="mg-section" data-role="label">${t(s.label)}</p>` : ''}
      <h2 class="mg-h2" data-block="title" data-role="display">${t(bind(s.title))}</h2>
      <div class="mg-sides" data-block="sides">${side(s.left, 'is-l')}<i class="mg-colrule" aria-hidden="true"></i>${side(s.right, 'is-r')}</div>
      ${s.verdict ? `<p class="mg-caption" data-block="verdict">${t(s.verdict)}</p>` : ''}
      <footer class="mg-foot">${ctx.compliance('line')}</footer>
    </div>`,
  };
}

function list(s, ctx, numbered) {
  const t = ctx.t;
  const items = (s.items || []).map((it, i) => `<li class="mg-item">
      <span class="mg-item-n tnum" aria-hidden="true">${numbered ? i + 1 : ['i', 'ii', 'iii', 'iv', 'v', 'vi'][i] || i + 1}</span>
      <span class="mg-item-t">${t(it.text)}${it.tag ? ` <em class="mg-tag">${t(it.tag)}</em>` : ''}</span>
    </li>`).join('');
  return {
    bg: grain(),
    html: `<div class="stage mg-spread mg-list">
      ${runhead(ctx)}
      ${s.label ? `<p class="mg-section" data-role="label">${t(s.label)}</p>` : ''}
      <h2 class="mg-h2" data-block="title" data-role="display">${t(bind(s.title))}</h2>
      <ol class="mg-items" data-block="items">${items}</ol>
      ${s.note ? `<p class="mg-caption">${t(s.note)}</p>` : ''}
      <footer class="mg-foot">${ctx.compliance('line')}</footer>
    </div>`,
  };
}

function myth(s, ctx) {
  const t = ctx.t;
  return {
    bg: grain(),
    html: `<div class="stage mg-spread mg-myth">
      ${runhead(ctx)}
      <p class="mg-section" data-role="label">${t(s.label || 'Myth, corrected')}</p>
      <p class="mg-myth-t" data-block="myth"><span class="mg-struck">${t(s.myth)}</span></p>
      <p class="mg-stand" data-block="fact" data-role="display">${t(s.fact)}</p>
      ${s.note ? `<p class="mg-note">${t(s.note)}</p>` : ''}
      <footer class="mg-foot">${ctx.compliance('line')}</footer>
    </div>`,
  };
}

function quote(s, ctx) {
  const t = ctx.t;
  return {
    bg: grain(),
    html: `<div class="stage mg-spread mg-quote">
      ${runhead(ctx)}
      <span class="mg-qmark" aria-hidden="true">“</span>
      <p class="mg-q" data-block="quote" data-role="display">${t(s.quote)}</p>
      ${s.by ? `<p class="mg-by" data-role="label">${t(s.by)}</p>` : ''}
      <footer class="mg-foot">${ctx.compliance('line')}</footer>
    </div>`,
  };
}

// Single static: a cover whose cover lines are the facts.
function stat(s, ctx) {
  const t = ctx.t;
  const facts = (s.facts || []).map((f) => `<li class="${f.emphasis ? 'is-hi' : ''}"><span class="mg-fact-v tnum">${t(f.value)}</span><span class="mg-fact-k" data-role="label">${t(f.label)}${f.note ? ` <em>${t(f.note)}</em>` : ''}</span></li>`).join('');
  return {
    bg: `<div class="mg-field"></div>${grain()}`,
    classes: 'is-cover is-stat',
    html: `<div class="stage mg-cover mg-stat">
      ${masthead(ctx)}
      <p class="mg-dateline" data-role="label" data-noword><span>${ctx.esc(dateline(ctx))}</span></p>
      ${s.kicker ? `<p class="mg-kicker" data-role="label">${t(s.kicker)}</p>` : ''}
      <h1 class="mg-h1" data-block="headline" data-fit="box" data-max-lines="4" data-fit-min="56" data-role="display">${t(s.headline)}</h1>
      ${facts ? `<ul class="mg-facts" data-block="facts">${facts}</ul>` : ''}
      ${s.note ? `<p class="mg-dek">${t(s.note)}</p>` : ''}
      <footer class="mg-cover-foot"><div class="mg-label">${ctx.compliance('block')}</div></footer>
    </div>`,
  };
}

function cta(s, ctx) {
  const t = ctx.t;
  const kw = s.keyword ? `<span class="mg-kw">${ctx.esc(s.keyword)}</span>` : '';
  return {
    bg: `<div class="mg-field"></div>${grain()}`,
    classes: 'is-cover is-back',
    html: `<div class="stage mg-cover mg-back">
      <p class="mg-back-mast" data-role="label" data-noword>${ctx.esc(ctx.spec.series || '')} <span>· ${ctx.esc(issueDate(ctx))}</span></p>
      <h2 class="mg-back-h" data-block="cta" data-fit="box" data-max-lines="5" data-fit-min="64" data-role="display">${t(bind(s.headline)).replace('{keyword}', kw)}</h2>
      ${s.sub ? `<p class="mg-dek">${t(s.sub)}</p>` : ''}
      <footer class="mg-cover-foot"><div class="mg-label">${ctx.compliance('block')}</div></footer>
    </div>`,
  };
}

const TYPES = { cover, point, number, compare, steps: (s, c) => list(s, c, true), recap: (s, c) => list(s, c, false), myth, quote, stat, cta };

export function render(slide, ctx) {
  const fn = TYPES[slide.type];
  if (!fn) throw new Error(`magazine: no layout for slide type "${slide.type}" (has ${Object.keys(TYPES).join(', ')})`);
  return fn(slide, ctx);
}
