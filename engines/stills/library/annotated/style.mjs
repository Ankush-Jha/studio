// Marker Markup (group 2 · Kitchen Table). See library/annotated/STYLE.md.
// The broker's own photo (a letter on their table, their street, their desk) marked up the way
// a person explains something across a table: one felt-tip, circles, arrows, a hand-drawn
// timeline, and two or three short notes in handwriting on strips of tape. Words that carry
// facts are always set type (Familjen Grotesk); handwriting (Nanum Pen Script) only says where
// to look. Inner slides drop the photo and mark up big set type instead.

// Nanum Pen Script covers ASCII and curly quotes only (no accents, dashes, ellipsis, middle
// dot): anything else, or a French post, falls back to a set-type note.
const PEN_OK = /^[\x20-\x7E‘’“”]*$/;

function note(ctx, text, { id = '', cls = '' } = {}) {
  const hand = ctx.lang !== 'fr' && PEN_OK.test(text);
  return `<p class="an-note ${hand ? 'is-hand' : 'is-set'} ${cls}" ${id ? `id="${id}"` : ''} data-block="${id || 'note'}">${ctx.esc(text)}</p>`;
}

function grain() { return '<div class="an-grain"></div>'; }

function head(ctx) {
  const folio = ctx.folio();
  return `<header class="an-head" data-role="label" data-noword>
      <span class="an-series">${ctx.esc(ctx.spec.series || '')}</span>
      ${folio ? `<span class="an-folio tnum">${folio}</span>` : ''}
    </header>`;
}

// Circles from ((markup)) get room so the felt-tip never crosses the letters.
// Pad scales with the type size (about 0.42 em) so the loop clears the lines above and below.
const loose = (html, px = 86) => html.replace(/data-mark="circle"(?! data-mark-pad)/g, `data-mark="circle" data-mark-pad="${Math.round(px * 0.42)}"`);
const HEAD_PX = { feed: 86, story: 80, square: 68 };
const circled = (str) => /\(\(.+?\)\)/.test(String(str || '')) ? 'has-circle' : '';
// "mid-March" never breaks at its hyphen (word joiners are invisible).
const joinHyphens = (s) => String(s || '').replace(/([\p{L}\p{N}])-(\p{L})/gu, '$1\u2060-\u2060$2');
const plain = (s) => String(s || '').replace(/==|\(\(|\)\)|~~|\*|\|/g, '');

// Geometry of the photo band and the hand-drawn timeline, per format and variant.
function coverGeom(ctx) {
  const f = ctx.format.name, v = ctx.variant;
  if (f === 'story') return { photo: [736, 1920], line: 1076, x0: 140, x1: 930 };
  if (f === 'square') return v === 'b' ? { photo: [470, 1080], line: 760, x0: 150, x1: 920 } : { photo: [0, 520], line: 400, x0: 150, x1: 920 };
  return v === 'b' ? { photo: [500, 1214], line: 1000, x0: 150, x1: 920 } : { photo: [0, 770], line: 620, x0: 150, x1: 920 };
}

// Annotation targets -> positions on the timeline. "day-120" style targets are placed in
// proportion (a countdown to the due date at the right end); anything else is spaced evenly.
function timeline(anns, g) {
  const days = anns.map((a) => (/^day-(\d+)$/.exec(a.target || '') || [])[1]).map(Number);
  const prop = days.every((d) => Number.isFinite(d) && d >= 0);
  const max = prop ? Math.max(...days) : 0;
  return anns.map((a, k) => {
    const x = prop ? g.x0 + ((max - days[k]) / max) * (g.x1 - g.x0) * 0.86 : g.x0 + ((k + 0.5) / anns.length) * (g.x1 - g.x0);
    const label = prop ? `Day ${days[k]}` : String(a.label || a.target || '');
    return { ...a, x: Math.round(x), label, day: days[k] };
  }).concat(prop ? [{ end: true, x: g.x1, label: 'Due date' }] : []);
}

// A generic phone lock screen with one notification (no real bank or app names), the broker's
// felt-tip circle on the number that matters and one handwritten note on tape.
function phoneCover(s, ctx, g) {
  const t = ctx.t;
  const o = s.object;
  const f = ctx.format.name, v = ctx.variant;
  const region = { top: g.photo[0], h: g.photo[1] - g.photo[0] };
  const note1 = (s.annotations || []).find((a) => a.text);
  const draws = [];
  if (note1) draws.push({ shape: 'arrow', from: { sel: '#an-ph-note', at: v === 'b' ? 'top-left' : 'top-right', dx: v === 'b' ? 40 : -60, dy: -8 }, to: { sel: '#an-ph-hit', at: v === 'b' ? 'top' : 'bottom', dx: 0, dy: v === 'b' ? -26 : 30 }, bend: v === 'b' ? 0.3 : -0.35, color: 'on-accent', pen: 'marker', weight: 8 });
  draws.push({ shape: 'arrow', from: { sel: '.an-cue', at: 'right', dx: 12, dy: 2 }, to: { sel: '.an-cue', at: 'right', dx: 120, dy: -6 }, bend: 0.18, pen: 'marker', weight: 6, color: 'on-accent' });
  return {
    bg: `<div class="an-field"></div>${grain()}`,
    classes: 'is-cover is-phone',
    html: `<div class="an-phone-wrap" style="top:${region.top}px;height:${region.h}px">
        <div class="an-phone" aria-hidden="true"><div class="an-screen"><p class="an-clock">9:41</p><p class="an-date">Monday, November 16</p></div></div>
        <div class="an-notif" data-block="notification">
          <p class="an-notif-app" data-role="label"><b>${ctx.esc(o.app || 'Your lender')}</b><span>now</span></p>
          <p class="an-notif-title">${t(o.title || '')}</p>
          <p class="an-notif-body">${t(o.body || '').replace('data-mark="circle"', 'data-mark="circle" data-mark-color="accent" id="an-ph-hit" data-mark-pad="16"')}</p>
          <p class="an-notif-ill" data-illustrative data-role="label">Illustrative</p>
        </div>
        ${note1 ? `<div class="an-ph-pin">${note(ctx, note1.text, { id: 'an-ph-note', cls: 'on-tape' })}</div>` : ''}
      </div>
      <div class="stage an-cover an-cover-phone">
        <div class="an-cover-text" data-block="headline">
          ${s.kicker ? `<p class="an-kicker" data-role="label">${t(s.kicker)}</p>` : ''}
          <h1 class="an-h1 ${circled(s.headline)}" data-fit="box" data-max-lines="${f === 'square' ? 3 : 4}" data-fit-min="60" data-role="display">${loose(t(joinHyphens(s.headline)), HEAD_PX[f]).replace(/data-mark="circle"/g, 'data-mark="circle" data-mark-color="on-accent"')}</h1>
          ${s.dek ? `<p class="an-dek">${t(s.dek)}</p>` : ''}
        </div>
        <footer class="an-foot">
          <span class="an-cue" data-role="label" data-noword>${ctx.esc(s.cue || 'Swipe')}</span>
          <div class="an-comp">${ctx.compliance('line')}</div>
        </footer>
      </div>`,
    draws,
  };
}

// ---------- slide types ----------
function cover(s, ctx) {
  const t = ctx.t;
  const g = coverGeom(ctx);
  const anns = s.annotations || [];
  const pts = anns.length ? timeline(anns, g).sort((a, b) => a.x - b.x) : [];
  const noted = pts.filter((p) => p.text);
  const draws = [];
  let marks = '';
  if (pts.length) {
    draws.push({ shape: 'line', x1: g.x0 - 40, y1: g.line, x2: g.x1 + 30, y2: g.line + 4, bow: 4 });
    pts.forEach((p, k) => {
      draws.push({ shape: 'line', x1: p.x, y1: g.line - 24, x2: p.x + 2, y2: g.line + 22 });
      marks += `<span class="an-tick ${p.end ? 'is-end' : ''}" id="an-tick-${k}" style="left:${p.x}px;top:${g.line + 38}px" data-role="label">${ctx.esc(p.label)}</span>`;
      if (p.text) {
        const j = noted.indexOf(p);
        const first = j === 0, last = j === noted.length - 1 && noted.length > 1;
        const align = first ? 'is-left' : last ? 'is-right' : 'is-mid';
        const top = g.line - (j % 2 ? 150 : 252);
        marks += `<div class="an-pin ${align}" style="--x:${p.x}px;top:${top}px">${note(ctx, p.text, { id: `an-note-${k}`, cls: 'on-tape' })}</div>`;
        draws.push({ shape: 'arrow', from: { sel: `#an-note-${k}`, at: first ? 'bottom-left' : 'bottom-right', dx: first ? 40 : -40, dy: 6 }, to: [p.x + (first ? -4 : 4), g.line - 32], bend: first ? -0.25 : 0.25 });
      }
    });
  }
  const photoStyle = `top:${g.photo[0]}px;height:${g.photo[1] - g.photo[0]}px`;
  const photoHTML = s.photo ? ctx.photo(s.photo, { label: s.photoLabel || 'Broker photo' }) : ctx.photo('cover', { label: 'Broker photo' });
  // No client photo yet + a code-drawn object in the spec: the object is the hero (phone with a
  // generic notification, marked up), on a full accent field. The photo takes over once supplied.
  if (s.object && /data-photo-placeholder/.test(photoHTML)) return phoneCover(s, ctx, g);
  return {
    bg: `<div class="an-photo" style="${photoStyle}">${s.photo ? ctx.photo(s.photo, { label: s.photoLabel || 'Broker photo' }) : ctx.photo('cover', { label: 'Broker photo' })}</div>${grain()}`,
    classes: 'is-cover',
    html: `${marks}
      <div class="stage an-cover">
        <div class="an-cover-text" data-block="headline">
          ${s.kicker ? `<p class="an-kicker" data-role="label">${t(s.kicker)}</p>` : ''}
          <h1 class="an-h1 ${circled(s.headline)}" data-fit="box" data-max-lines="${ctx.format.name === 'square' ? 3 : 4}" data-fit-min="60" data-role="display">${loose(t(joinHyphens(s.headline)), HEAD_PX[ctx.format.name])}</h1>
          ${s.dek ? `<p class="an-dek">${t(s.dek)}</p>` : ''}
        </div>
        <footer class="an-foot">
          <span class="an-cue" data-role="label" data-noword>${ctx.esc(s.cue || 'Swipe')}</span>
          <div class="an-comp">${ctx.compliance('line')}</div>
        </footer>
      </div>`,
    draws: draws.concat([{ shape: 'arrow', from: { sel: '.an-cue', at: 'right', dx: 12, dy: 2 }, to: { sel: '.an-cue', at: 'right', dx: 120, dy: -6 }, bend: 0.18, pen: 'marker', weight: 6 }]),
  };
}

function point(s, ctx) {
  const t = ctx.t;
  const draws = [];
  // A loop only closes cleanly around short marks; long ones get a felt-tip underline.
  const shortFig = s.figure && plain(s.figure).replace(/\s/g, '').length <= 5;
  if (s.figure) draws.push(shortFig ? { shape: 'circle', sel: '#an-fig', pad: 34 } : { shape: 'underline', sel: '#an-fig', gap: -6, pen: 'marker', weight: 11 });
  // The arrow never crosses copy: in variant a (figure above the text) it runs up the free
  // right-hand margin to the figure's corner; otherwise it points at the nearest block.
  if (s.note) {
    if (s.figure && ctx.variant !== 'b') draws.push({ shape: 'arrow', from: { sel: '#an-pnote', at: 'top-right', dx: -70, dy: -10 }, to: { sel: '#an-fig', at: 'bottom-right', dx: 18, dy: 30 }, bend: 0.16 });
    else draws.push({ shape: 'arrow', from: { sel: '#an-pnote', at: ctx.variant === 'b' ? 'top-right' : 'top-left', dx: ctx.variant === 'b' ? -30 : 30, dy: -10 }, to: { sel: s.figure ? '#an-fig' : '#an-text', at: 'bottom', dx: ctx.variant === 'b' ? 60 : -60, dy: s.figure ? 34 : 18 }, bend: ctx.variant === 'b' ? 0.3 : -0.3 });
  }
  return {
    bg: grain(),
    classes: s.figure ? 'has-fig' : 'no-fig',
    html: `<div class="stage an-point">
      ${head(ctx)}
      ${s.eyebrow ? `<p class="an-kicker" data-role="label">${t(s.eyebrow)}</p>` : ''}
      ${s.figure ? `<div class="an-fig-box"><span class="an-fig" id="an-fig" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 250 : 200}" data-role="display">${t(s.figure)}</span></div>` : ''}
      <p class="an-text ${circled(s.text)}" id="an-text" data-block="text" data-role="display">${loose(t(joinHyphens(s.text)), s.figure ? 62 : 80)}</p>
      ${s.note ? `<div class="an-note-row">${note(ctx, plain(s.note), { id: 'an-pnote' })}</div>` : ''}
      <footer class="an-foot">${ctx.compliance('line')}</footer>
    </div>`,
    draws,
  };
}

function number(s, ctx) {
  const t = ctx.t;
  const ch = ctx.calc?.chart;
  if (!ch) throw new Error('annotated number slide needs a calc with a chart');
  const max = Math.max(...ch.rows.map((r) => r.value));
  const labels = s.rowLabels || ch.rows.map((r) => r.label);
  const rows = ch.rows.map((r, k) => `<div class="an-row ${k === ch.highlight ? 'is-hi' : ''}">
      <p class="an-row-k" data-role="label">${t(String(labels[k] ?? r.label))}</p>
      <div class="an-row-bar"><i style="--w:${((r.value / max) * 100).toFixed(3)}"></i><span class="an-row-v tnum" ${k === ch.highlight ? 'id="an-hi-v"' : ''}>${ctx.esc(r.shortShown ?? r.shown)}</span></div>
    </div>`).join('');
  return {
    bg: grain(),
    html: `<div class="stage an-number">
      ${head(ctx)}
      ${s.label ? `<p class="an-kicker" data-role="label">${t(s.label)}</p>` : ''}
      <h2 class="an-h2" data-block="title" data-role="display">${loose(t(joinHyphens(s.title)), 64)}</h2>
      <div class="an-chart rows-${ch.rows.length}" data-block="chart">${rows}<span class="an-zero tnum" data-role="label">${ch.unit === 'months' ? '0' : '$0'}</span></div>
      ${s.callout ? `<div class="an-callout" data-block="callout"><span class="an-callout-v tnum" id="an-callout">${t(s.callout)}</span>${s.calloutSub ? `<span class="an-callout-s">${t(s.calloutSub)}</span>` : ''}</div>` : ''}
      <p class="an-fine" data-role="fine" data-block="fine">${t(s.assumptions)}</p>
      <footer class="an-foot">${ctx.compliance('line')}</footer>
    </div>`,
    draws: [{ shape: 'circle', sel: '#an-hi-v', pad: 14 }, ...(s.callout ? [{ shape: 'underline', sel: '#an-callout' }] : [])],
  };
}

function compare(s, ctx) {
  const t = ctx.t;
  const side = (o, k) => `<div class="an-side is-${k}">
      <p class="an-side-k" data-role="label">${t(o.label)}</p>
      <div class="an-side-vbox"><span class="an-side-v tnum" id="an-${k}-v" data-fit="width" data-fit-max="${ctx.format.name === 'feed' ? 150 : 120}" data-role="display">${t(o.value)}</span></div>
      ${o.note ? `<p class="an-side-n">${t(o.note)}</p>` : ''}
    </div>`;
  const draws = [plain(s.right?.value).replace(/\s/g, '').length <= 5 ? { shape: 'circle', sel: '#an-r-v', pad: 26 } : { shape: 'underline', sel: '#an-r-v', gap: -6, pen: 'marker', weight: 11 }];
  return {
    bg: grain(),
    html: `<div class="stage an-compare">
      ${head(ctx)}
      ${s.label ? `<p class="an-kicker" data-role="label">${t(s.label)}</p>` : ''}
      <h2 class="an-h2" data-block="title" data-role="display">${loose(t(joinHyphens(s.title)), 64)}</h2>
      <div class="an-sides" data-block="sides">${side(s.left, 'l')}${side(s.right, 'r')}</div>
      ${s.verdict ? `<div class="an-note-row">${note(ctx, plain(s.verdict), { id: 'an-verdict' })}</div>` : ''}
      <footer class="an-foot">${ctx.compliance('line')}</footer>
    </div>`,
    draws,
  };
}

function list(s, ctx, numbered) {
  const t = ctx.t;
  const items = (s.items || []).map((it, i) => `<li class="an-item">
      ${numbered ? `<span class="an-item-n tnum" aria-hidden="true"><span class="mk" data-mark="circle" data-mark-pad="10">${i + 1}</span></span>`
        : '<span class="an-box" aria-hidden="true"><span class="mk" data-mark="box">&#x2003;</span><span class="mk an-tickmark" data-mark="tick">&#x2003;</span></span>'}
      <span class="an-item-t">${t(it.text)}${it.tag ? ` <em class="an-tag">${t(it.tag)}</em>` : ''}</span>
    </li>`).join('');
  return {
    bg: grain(),
    html: `<div class="stage an-list">
      ${head(ctx)}
      ${s.label ? `<p class="an-kicker" data-role="label">${t(s.label)}</p>` : ''}
      <h2 class="an-h2" data-block="title" data-role="display">${loose(t(joinHyphens(s.title)), 64)}</h2>
      <ol class="an-items" data-block="items">${items}</ol>
      ${s.note ? `<div class="an-note-row">${note(ctx, plain(s.note), { id: 'an-lnote' })}</div>` : ''}
      <footer class="an-foot">${ctx.compliance('line')}</footer>
    </div>`,
  };
}

function myth(s, ctx) {
  const t = ctx.t;
  return {
    bg: grain(),
    html: `<div class="stage an-myth">
      ${head(ctx)}
      <p class="an-kicker" data-role="label">${t(s.label || 'Heard this?')}</p>
      <p class="an-myth-t" data-block="myth"><span class="mk" data-mark="strike" data-mark-style="single">${t(plain(s.myth))}</span></p>
      <p class="an-text an-fact" id="an-fact" data-block="fact" data-role="display">${t(s.fact)}</p>
      ${s.note ? `<div class="an-note-row">${note(ctx, plain(s.note), { id: 'an-mnote' })}</div>` : ''}
      <footer class="an-foot">${ctx.compliance('line')}</footer>
    </div>`,
    draws: [{ shape: 'bracket', sel: '#an-fact', gap: -26 }],
  };
}

function quote(s, ctx) {
  const t = ctx.t;
  return {
    bg: grain(),
    html: `<div class="stage an-quote">
      ${head(ctx)}
      <p class="an-q" id="an-q" data-block="quote" data-role="display">“${t(s.quote)}”</p>
      ${s.by ? `<p class="an-by" data-role="label">${t(s.by)}</p>` : ''}
      <footer class="an-foot">${ctx.compliance('line')}</footer>
    </div>`,
    draws: [{ shape: 'bracket', sel: '#an-q', gap: -30 }],
  };
}

function stat(s, ctx) {
  const t = ctx.t;
  const facts = (s.facts || []).map((f, k) => `<li class="${f.emphasis ? 'is-hi' : ''}"><span class="an-fact-v tnum" ${f.emphasis ? 'id="an-stat-hi"' : ''}>${t(f.value)}</span><span class="an-fact-k" data-role="label">${t(f.label)}${f.note ? `<em> ${t(f.note)}</em>` : ''}</span></li>`).join('');
  return {
    bg: grain(),
    html: `<div class="stage an-stat">
      ${s.kicker ? `<p class="an-kicker" data-role="label">${t(s.kicker)}</p>` : ''}
      <h1 class="an-h1" data-block="headline" data-fit="box" data-max-lines="4" data-fit-min="56" data-role="display">${t(s.headline)}</h1>
      ${facts ? `<ul class="an-facts" data-block="facts">${facts}</ul>` : ''}
      ${s.note ? `<div class="an-note-row">${note(ctx, plain(s.note), { id: 'an-snote' })}</div>` : ''}
      <footer class="an-foot">${ctx.compliance('block')}</footer>
    </div>`,
    draws: facts.includes('an-stat-hi') ? [{ shape: 'underline', sel: '#an-stat-hi', gap: 6, pen: 'marker', weight: 9 }] : [],
  };
}

function cta(s, ctx) {
  const t = ctx.t;
  const kw = s.keyword ? `<span class="an-kw mk mk-circle" data-mark="circle" data-mark-pad="44">${ctx.esc(s.keyword)}</span>` : '';
  // Instagram's send icon sits under the post, about a quarter of the way in: point at it.
  const draws = s.action === 'send' && !s.keyword ? [{ shape: 'arrow', from: { sel: s.sub ? '#an-cta-sub' : '#an-cta', at: 'bottom-left', dx: 90, dy: 34 }, to: [250, ctx.format.safe.y1 - 10], bend: ctx.variant === 'b' ? -0.3 : 0.3, color: ctx.variant === 'b' ? 'paper' : 'on-accent', pen: 'marker', weight: 9 }] : [];
  return {
    bg: `<div class="an-field"></div>${grain()}`,
    classes: 'is-field',
    html: `<div class="stage an-cta">
      ${head(ctx)}
      <h2 class="an-cta-h ${circled(s.headline)} ${s.keyword ? 'has-circle' : ''}" id="an-cta" data-block="cta" data-fit="box" data-max-lines="5" data-fit-min="60" data-role="display">${loose(t(joinHyphens(s.headline)), 112).replace('{keyword}', kw)}</h2>
      ${s.sub ? `<p class="an-dek an-cta-sub" id="an-cta-sub">${t(s.sub)}</p>` : ''}
      <footer class="an-foot">${ctx.compliance('block')}</footer>
    </div>`,
    draws,
  };
}

const TYPES = { cover, point, number, compare, steps: (s, c) => list(s, c, true), recap: (s, c) => list(s, c, false), myth, quote, stat, cta };

export function render(slide, ctx) {
  const fn = TYPES[slide.type];
  if (!fn) throw new Error(`annotated: no layout for slide type "${slide.type}" (has ${Object.keys(TYPES).join(', ')})`);
  return fn(slide, ctx);
}
