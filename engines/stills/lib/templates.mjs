// Slide templates. Each returns semantic HTML for <main> plus optional hand-drawn
// "draws" (arrows, brackets) that hand.js places after layout. Layout, type and
// decoration come from the family stylesheet (styles/family-*.css), so one template
// renders four clearly different group looks.
import { inline, esc, words } from './markup.mjs';
import { paymentCompare, rateStep, downPayment, fhsaRoom } from './charts.mjs';
import { money } from './mortgage.mjs';

const pad2 = (n) => String(n).padStart(2, '0');

// Chart kinds beyond payment-compare. Each returns { html, data (audit), fills }.
// fills replace {name} tokens in the slide's text fields, so computed numbers are
// never typed into copy.
const CHART_KINDS = { 'down-payment': downPayment, 'fhsa-room': fhsaRoom };
const fillWith = (fills = {}) => (str) => String(str || '').replace(/\{(\w+)\}/g, (m, k) => (k in fills ? fills[k] : m));
function chartOf(c) {
  const fn = CHART_KINDS[c?.kind];
  if (!fn) throw new Error(`Unknown chart kind: ${c?.kind}. Known: payment-compare, ${Object.keys(CHART_KINDS).join(', ')}`);
  return fn(c);
}

function ctxHelpers(tk) {
  const emphasis = tk.annotation.emphasis || 'highlight';
  return { t: (s) => inline(s || '', { emphasis }), fam: tk.family, v: tk.client.layoutVariant };
}

// ---------- cover / hook ----------
function cover(s, tk, ctx) {
  const { t, fam } = ctxHelpers(tk);
  const longFig = s.figure && String(s.figure).length > 3;
  const figure = !s.figure ? ''
    : longFig ? `<div class="figure fig-long" data-role="display" data-block="figure"><span>${t(s.figure)}</span></div>`
    : `<div class="figure" aria-hidden="true" data-bleed><span>${esc(s.figure)}</span></div>`;
  const memo = fam === 'dossier' && s.memo
    ? `<dl class="memo" data-role="label">${Object.entries(s.memo).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${t(v)}</dd></div>`).join('')}</dl>`
    : '';
  const quote = s.quote ? `<p class="quote" data-block="quote">${t(s.quote)}</p>` : '';
  return {
    main: `
      ${memo}
      <div class="cover-text" data-block="cover-text">
        ${s.kicker ? `<p class="kicker" data-role="label">${t(s.kicker)}</p>` : ''}
        ${quote}
        <h1 class="headline" data-role="display">${t(s.headline)}</h1>
        ${s.dek ? `<p class="dek">${t(s.dek)}</p>` : ''}
      </div>
      ${figure}`,
    footer: 'line',
    cue: true,
  };
}

// ---------- content: one idea ----------
// Length class so a family can set short statements bigger: s <= 10 words, m <= 16, l above.
const lenClass = (txt) => { const n = words(txt); return n <= 10 ? 's' : n <= 16 ? 'm' : 'l'; };
function content(s, tk) {
  const { t } = ctxHelpers(tk);
  return {
    main: `
      ${s.eyebrow ? `<p class="eyebrow" data-role="label">${t(s.eyebrow)}</p>` : ''}
      <p class="statement len-${lenClass(s.text)}" data-role="display" data-block="statement">${t(s.text)}</p>
      ${s.note ? `<p class="note" id="note" data-block="note">${t(s.note)}</p>` : ''}`,
    footer: 'line',
    cue: !!s.cue,
    draws: [],
  };
}

// ---------- numbered list ----------
function list(s, tk) {
  const { t } = ctxHelpers(tk);
  const items = (s.items || []).map((it, i) => `
      <li class="item">
        <span class="num" aria-hidden="true">${tk.family === 'kitchen' ? `${i + 1}.` : pad2(i + 1)}</span>
        <span class="q">${t(it.text)}</span>
        ${it.tag ? `<span class="tag" data-role="label">${t(it.tag)}</span>` : ''}
      </li>`).join('');
  return {
    main: `
      ${s.label ? `<p class="eyebrow" data-role="label">${t(s.label)}</p>` : ''}
      <h2 class="title" data-role="display">${t(s.title)}</h2>
      <ol class="items" data-block="items">${items}</ol>`,
    footer: 'line',
  };
}

// ---------- data / number slide ----------
function data(s, tk) {
  const { t, fam, v } = ctxHelpers(tk);
  const c = s.chart;
  if (c.kind !== 'payment-compare') return dataKind(s, tk, chartOf(c));
  const ch = paymentCompare(c, { family: fam, variant: v });
  const fill = (str) => String(str || '')
    .replace(/\{delta\}/g, money(ch.delta))
    .replace(/\{yearly\}/g, money(ch.yearly))
    .replace(/\{a\}/g, money(ch.data.rows[0].shown))
    .replace(/\{b\}/g, money(ch.data.rows[1].shown));
  const sub = t(fill(s.calloutSub || 'a month')).replace(/(\$[\d,]+) a year/, '$1&nbsp;a&nbsp;year');
  const callout = `<p class="callout" id="callout" data-block="callout"><span class="callout-big">+${money(ch.delta)}</span><span class="callout-sub">${sub}</span></p>`;
  const draws = [];
  if (ch.horizontal && fam === 'ledger') draws.push({ shape: 'arrow', from: { sel: '#callout .callout-sub', at: 'bottom', dx: -40, dy: 18 }, to: { sel: '#delta-top', at: 'center', dy: -8 }, bend: 0.22 });
  else if (ch.horizontal) draws.push({ shape: 'arrow', from: { sel: '#callout', at: 'left', dx: -16, dy: 4 }, to: { sel: '#delta-anchor', at: 'bottom', dy: 10 }, bend: -0.28 });
  else if (fam !== 'riso') draws.push({ shape: 'arrow', from: { sel: '#callout .callout-sub', at: 'bottom-left', dx: -18, dy: 34 }, to: { sel: '#delta-anchor', at: 'right', dx: 10, dy: 4 }, bend: -0.22 });
  draws.push({ shape: 'bracket', sel: '#delta-anchor', gap: -26 });
  return {
    main: `
      ${s.label ? `<p class="eyebrow" data-role="label">${t(s.label)}</p>` : ''}
      <h2 class="title" data-role="display">${t(fill(s.title))}</h2>
      <div class="chart-wrap">${ch.svg}${callout}</div>
      ${s.takeaway ? `<p class="takeaway">${t(fill(s.takeaway))}</p>` : ''}
      <p class="assumptions" data-role="fine">${t(fill(s.assumptions))}</p>`,
    footer: 'line',
    draws: draws.filter((d) => !(d.shape === 'bracket')),
    audit: ch.data,
  };
}

// Data slide for the CHART_KINDS: title + chart + optional takeaway + assumptions.
function dataKind(s, tk, ch) {
  const { t } = ctxHelpers(tk);
  const fill = fillWith(ch.fills);
  return {
    main: `
      ${s.label ? `<p class="eyebrow" data-role="label">${t(fill(s.label))}</p>` : ''}
      <h2 class="title" data-role="display" data-block="title">${t(fill(s.title))}</h2>
      <div class="chart-wrap chart-${s.chart.kind} view-${s.chart.view || 'compare'}">${ch.html}</div>
      ${s.takeaway ? `<p class="takeaway" data-block="takeaway">${t(fill(s.takeaway))}</p>` : ''}
      <p class="assumptions" data-role="fine">${t(fill(s.assumptions))}</p>`,
    footer: 'line',
    draws: [],
    audit: ch.data,
  };
}

// ---------- myth vs fact ----------
function myth(s, tk) {
  const { t } = ctxHelpers(tk);
  return {
    main: `
      ${s.label ? `<p class="eyebrow" data-role="label">${t(s.label)}</p>` : ''}
      <section class="myth" data-block="myth">
        <p class="mf-label" data-role="label"><span class="mk" data-mark="${tk.family === 'dossier' ? 'box' : 'none'}">${esc(s.mythLabel || 'Myth')}</span></p>
        <p class="myth-text"><span class="mk" data-mark="strike">${t(s.myth)}</span></p>
      </section>
      <section class="fact" data-block="fact">
        <p class="mf-label" data-role="label">${tk.family === 'dossier' ? '<span class="fact-tick mk" data-mark="tick" data-mark-color="accent-ink">&#x2003;</span>' : ''}${esc(s.factLabel || 'Fact')}</p>
        <p class="fact-text">${t(s.fact)}</p>
        ${s.status ? `<p class="status" data-role="label"><span class="status-k">Status</span> <span class="status-v mk" data-mark="${tk.family === 'riso' ? 'none' : 'circle'}" data-mark-pad="10">${t(s.status)}</span></p>` : ''}
      </section>`,
    footer: 'line',
  };
}

// ---------- recap / checklist ----------
function checklist(s, tk) {
  const { t } = ctxHelpers(tk);
  const items = (s.items || []).map((it, i) => {
    const mark = it.mark || 'tick';
    return `
      <li class="row">
        <span class="box" aria-hidden="true"><span class="mk" data-mark="${mark}">&#x2003;</span></span>
        <span class="r-q">${t(it.text)}</span>
        ${it.answer ? `<span class="r-a">${t(it.answer)}</span>` : ''}
        ${it.status ? `<span class="r-s" data-role="label"><span class="mk" data-mark="${it.highlight ? 'circle' : 'none'}" data-mark-pad="8">${t(it.status)}</span></span>` : ''}
      </li>`;
  }).join('');
  return {
    main: `
      ${s.label ? `<p class="eyebrow" data-role="label">${t(s.label)}</p>` : ''}
      <h2 class="title" data-role="display">${t(s.title)}</h2>
      <ul class="rows ${s.items?.some((i) => i.status) ? 'has-status' : ''}" data-block="rows">${items}</ul>`,
    footer: 'line',
  };
}

// ---------- CTA ----------
function cta(s, tk) {
  const { t, fam } = ctxHelpers(tk);
  const keyword = s.keyword ? `<span class="kw mk" data-mark="circle" data-mark-pad="9">${esc(s.keyword)}</span>` : '';
  const anchor = s.sub ? '.cta-sub' : '#cta-head';
  // Instagram's send (paper-plane) icon sits under the post, about a quarter of the way in.
  const sendArrow = { shape: 'arrow', from: { sel: anchor, at: 'bottom-left', dx: fam === 'riso' ? 90 : 70, dy: 46 }, to: [fam === 'riso' ? 300 : 250, fam === 'dossier' ? 1120 : 1190], bend: fam === 'dossier' ? -0.2 : 0.28 };
  return {
    main: `
      ${s.label ? `<p class="eyebrow" data-role="label">${t(s.label)}</p>` : ''}
      <h2 class="cta-head" id="cta-head" data-role="display" data-block="cta">${t(s.headline).replace('{keyword}', keyword)}</h2>
      ${s.sub ? `<p class="cta-sub">${t(s.sub)}</p>` : ''}`,
    footer: 'block',
    draws: s.keyword || s.noArrow || tk.client.layoutVariant === 'b' ? [] : [sendArrow],
  };
}

// ---------- single static: tip card ----------
function tip(s, tk) {
  const { t } = ctxHelpers(tk);
  if (s.chart) return tipChart(s, tk);
  return {
    main: `
      <p class="eyebrow" data-role="label">${t(s.label || 'Tip')}</p>
      ${s.figure ? `<div class="figure" aria-hidden="true"><span>${esc(s.figure)}</span>${s.figureUnit ? `<em>${esc(s.figureUnit)}</em>` : ''}</div>` : ''}
      <h1 class="headline" data-role="display" data-block="headline">${t(s.headline)}</h1>
      ${s.support ? `<p class="support" data-block="support">${t(s.support)}</p>` : ''}`,
    ...(s.note ? { footNote: t(s.note) } : {}),
    footer: 'block',
  };
}

// Tip card with a chart: figure and headline share the top band, chart beneath.
// `figureMark` puts a hand mark (e.g. "circle") on the figure.
function tipChart(s, tk) {
  const { t } = ctxHelpers(tk);
  const ch = chartOf(s.chart);
  const fill = fillWith(ch.fills);
  const mark = s.figureMark ? ` class="mk" data-mark="${esc(s.figureMark)}" data-mark-pad="${Number(s.figureMarkPad) || 22}"` : '';
  return {
    main: `
      <p class="eyebrow" data-role="label">${t(fill(s.label || 'Tip'))}</p>
      <div class="tip-top">
        ${s.figure ? `<div class="figure" aria-hidden="true"><span${mark}>${esc(s.figure)}</span>${s.figureUnit ? `<em>${esc(s.figureUnit)}</em>` : ''}</div>` : ''}
        <h1 class="headline" data-role="display" data-block="headline">${t(fill(s.headline))}</h1>
      </div>
      <div class="chart-wrap chart-${s.chart.kind}">${ch.html}</div>
      ${s.support ? `<p class="support" data-block="support">${t(fill(s.support))}</p>` : ''}`,
    ...(s.note ? { footNote: t(fill(s.note)) } : {}),
    footer: 'block',
    audit: ch.data,
  };
}

// ---------- Bank of Canada rate day ----------
function rateday(s, tk) {
  const { t, fam } = ctxHelpers(tk);
  const r = s.rates;
  const verb = { hike: 'raised', hold: 'held', cut: 'cut' }[r.decision] || 'set';
  const delta = +(r.current - r.previous).toFixed(2);
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  const headline = s.headline || `The Bank of Canada ${verb} its rate${r.decision === 'hold' ? ' at' : ' to'} ${r.current.toFixed(2)}%.`;
  const chart = rateStep(r, { family: fam });
  return {
    main: `
      <p class="eyebrow" data-role="label">${t(s.label || 'Bank of Canada · rate day')}</p>
      <h1 class="headline" data-role="display" data-block="headline">${t(headline)}</h1>
      <div class="rate-grid" data-block="rates">
        <div class="rate rate-policy">
          <p class="r-k" data-role="label">Policy rate</p>
          <p class="r-v">${r.current.toFixed(2)}<span>%</span></p>
          <p class="r-d">${sign}${Math.abs(delta).toFixed(2)} on ${esc(r.changedOn)}</p>
        </div>
        <div class="rate rate-prime">
          <p class="r-k" data-role="label">Prime</p>
          <p class="r-v">${r.prime.toFixed(2)}<span>%</span></p>
          <p class="r-d">${esc(r.primeNote || '')}</p>
        </div>
      </div>
      <div class="chart-wrap">${chart}</div>
      <p class="next" id="next"><span class="next-k" data-role="label">Next decision</span> <span class="next-v mk" data-mark="${fam === 'riso' ? 'swash' : 'circle'}"${fam === 'riso' ? ' data-mark-color="paper"' : ' data-mark-layer="over"'}>${t(r.next)}</span></p>`,
    footNote: s.note ? t(s.note) : '',
    footer: 'block',
  };
}

export const TEMPLATES = { cover, content, list, data, myth, checklist, cta, tip, rateday };
