// Paper Trail (group 4 · Dossier). See library/paper-trail/STYLE.md.
// Document realism, kept honest: every slide is a top-down look at a desk with one rendered
// document on it (statement, gift letter, withdrawal slip, bill of sale, worksheet, index card,
// folder). Documents are generic ("Your lender", "···· 0000"), typed in Courier Prime or set in
// Plex Sans Condensed, and always carry a rotated ILLUSTRATIVE stamp. The broker's red pencil
// marks the line that matters; the post's words sit large on the desk itself, never over the
// document's text. The desk is the client's accent taken almost to black, so two clients in the
// same style read as two different desks.
import { mix, contrast } from '../../lib/color.mjs';

const C = (n) => Math.round(n);
const fmtCents = (c) => (c / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// sRGB mix: keeps a hint of the accent's hue in a near-black desk (a linear-light mix
// would leave the desk far too saturated).
function srgbMix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function deskOf(accent, deskInk = '#F4F1E9') {
  let t = 0.74;
  let d = srgbMix(accent, '#1C1D1F', t);
  while (contrast(deskInk, d) < 11 && t < 0.95) { t += 0.03; d = srgbMix(accent, '#1C1D1F', t); }
  return d;
}

// Copy set on the desk: every mark becomes one yellow china-marker underline, so it reads on
// the dark desk and never crosses the next line of tight display type. Circles belong to the
// red pencil on paper.
const onDesk = (ctx, s) => ctx.t(s)
  .replace(/data-mark="(circle|highlight|swash|box)"/g, 'data-mark="underline"')
  .replace(/data-mark="/g, 'data-mark-color="grease" data-mark-pen="marker" data-mark="');

function stamp(text = 'Illustrative', cls = '') {
  return `<div class="pt-stamp ${cls}" data-illustrative data-role="label" data-noword>${text}</div>`;
}

function folio(ctx) {
  const f = ctx.folio();
  return f ? `<span class="pt-folio" data-noword>File ${f.replace('/', ' / ')}</span>` : '';
}

function head(ctx, label) {
  return `<header class="pt-head" data-role="label">
    ${label ? `<p class="pt-label">${ctx.t(label)}</p>` : '<span></span>'}
    ${folio(ctx)}
  </header>`;
}

function foot(ctx, { cue = false, size = 'line' } = {}) {
  return `<footer class="pt-foot">${ctx.compliance(size)}${cue ? `<span class="pt-cue" data-role="label">Turn the page<b aria-hidden="true"></b></span>` : ''}</footer>`;
}

// ---------- desk furniture (background) ----------
function pencil(x, y, rot, len = 620) {
  return `<svg class="pt-pencil" style="left:${x}px;top:${y}px;transform:rotate(${rot}deg)" width="${len + 40}" height="46" viewBox="0 0 ${len + 40} 46" aria-hidden="true">
    <ellipse cx="${len / 2 + 20}" cy="38" rx="${len / 2}" ry="5" fill="rgba(0,0,0,0.32)"/>
    <path d="M20 9 H${len - 70} V33 H20 Z" fill="#E2B13A"/>
    <path d="M20 9 H${len - 70} V15 H20 Z" fill="#EDC456"/>
    <path d="M20 27 H${len - 70} V33 H20 Z" fill="#C8952A"/>
    <path d="M${len - 70} 9 L${len - 2} 21 L${len - 70} 33 Z" fill="#E6C49A"/>
    <path d="M${len - 24} 17 L${len - 2} 21 L${len - 24} 25 Z" fill="#2E2C2A"/>
    <rect x="0" y="9" width="22" height="24" rx="3" fill="#C7756E"/>
    <rect x="18" y="8" width="22" height="26" fill="#B9B6AE"/><rect x="22" y="8" width="3" height="26" fill="#8F8C85"/><rect x="31" y="8" width="3" height="26" fill="#8F8C85"/>
  </svg>`;
}
function clip() {
  return `<svg class="pt-clip" width="44" height="120" viewBox="0 0 44 120" aria-hidden="true"><path d="M14 112 V22 a8 8 0 0 1 16 0 V96 a13 13 0 0 1 -26 0 V30" fill="none" stroke="#8E918F" stroke-width="5" stroke-linecap="round"/><path d="M14 112 V22 a8 8 0 0 1 16 0 V96 a13 13 0 0 1 -26 0 V30" fill="none" stroke="#D9DBD8" stroke-width="2" stroke-linecap="round" transform="translate(-1,-1)"/></svg>`;
}

function bg(ctx, desk) {
  const fmt = ctx.format.name;
  const b = ctx.variant === 'b';
  // One pencil lies on the desk; where it lies depends on the variant and format.
  // Story: the Instagram UI covers the bottom 35%, but the profile grid shows it, so the desk
  // continues there: the next page of the file (blank) and the pencil.
  const story = fmt === 'story'
    ? `<div class="pt-decor-sheet" style="left:${b ? 150 : 60}px;top:1540px;--r:${b ? -3 : 2.5}deg"><i></i></div>${pencil(b ? 140 : 380, 1440, b ? 5 : -4)}`
    : '';
  return `<div class="pt-desk" style="--desk:${desk}"></div><div class="pt-desk-grain"></div>${story}`;
}

// ---------- documents ----------
// Running balances are computed, so every row adds up. Short formats drop whole rows
// before the balances are computed (never hide a row after the fact).
function statementRows(ctx, { amountCents = 800000, label = 'Deposit', date = 'Oct 14', mark = true }) {
  let rows = [
    ['Sep 15', 'Opening balance', null, true],
    ['Sep 30', 'Payroll deposit', 241000],
    ['Oct 01', 'Rent', -185000],
    ['Oct 04', 'Groceries', -14218, false, true],
    ['Oct 08', 'Phone bill', -6540, false, true],
    [date, label, amountCents, false, false, mark],
  ];
  if (ctx.format.name !== 'feed') rows = rows.filter((r) => !r[4]);
  let bal = 321455;
  const html = rows.map(([d, desc, amt, opening, opt, hit]) => {
    if (!opening) bal += amt;
    const amtCell = opening ? '' : amt < 0 ? fmtCents(-amt) : '';
    const depCell = opening ? '' : amt > 0 ? fmtCents(amt) : '';
    const dep = hit ? `<span class="mk" data-mark="circle" data-mark-pad="16">${depCell}</span>` : depCell;
    return `<tr class="${hit ? 'is-hit' : ''}"><td>${d}</td><td>${ctx.esc(desc)}</td><td class="num">${amtCell}</td><td class="num">${dep}</td><td class="num">${fmtCents(bal)}</td></tr>`;
  }).join('');
  return { html, closing: bal };
}

function statementDoc(ctx, o = {}) {
  const amt = o.amount ? Math.round(parseFloat(String(o.amount).replace(/[^0-9.]/g, '')) * 100) : 800000;
  const { html, closing } = statementRows(ctx, { amountCents: amt, label: o.label || 'Deposit', date: o.date || 'Oct 14', mark: o.mark !== false });
  return `<div class="pt-doc pt-statement ${o.cls || ''}" style="--rot:${o.rot ?? -1.6}deg">
    <div class="pt-st-top" data-role="fine" data-noword>
      <div><p class="pt-st-org">Your lender</p><p class="pt-st-kind">Chequing statement</p></div>
      <div class="pt-st-meta"><p>Acct ···· 0000</p><p>Sep 15 – Oct 14, 2026</p></div>
    </div>
    <table class="pt-st-table" data-role="fine" data-noword>
      <thead><tr><th>Date</th><th>Description</th><th class="num">Out</th><th class="num">In</th><th class="num">Balance</th></tr></thead>
      <tbody>${html}</tbody>
    </table>
    <p class="pt-st-close" data-role="fine" data-noword><span>Closing balance</span><span class="num">${fmtCents(closing)}</span></p>
    <p class="pt-st-page" data-role="fine" data-noword>${o.page || 'Page 1 of 1'}</p>
    <i class="pt-crease" aria-hidden="true"></i>
    ${stamp()}
  </div>`;
}

// Savings that built up: monthly transfers, balance climbing to the amount in question.
function savingsDoc(ctx, o = {}) {
  const short = ctx.format.name !== 'feed';
  const months = [['Apr 30', 'Transfer in'], ['May 29', 'Transfer in'], ['Jun 30', 'Transfer in'], ['Jul 31', 'Transfer in'], ['Aug 29', 'Transfer in'], ['Sep 30', 'Transfer in']].slice(short ? 2 : 0);
  let bal = short ? 400000 : 200000;
  const rows = [`<tr><td>${short ? 'Jun 01' : 'Apr 01'}</td><td>Opening balance</td><td class="num"></td><td class="num">${fmtCents(bal)}</td></tr>`].concat(months.map(([d, desc], k) => {
    bal += 100000;
    const last = k === months.length - 1;
    return `<tr><td>${d}</td><td>${desc}</td><td class="num">${fmtCents(100000)}</td><td class="num">${last ? `<span class="mk" data-mark="circle" data-mark-pad="16">${fmtCents(bal)}</span>` : fmtCents(bal)}</td></tr>`;
  })).join('');
  return `<div class="pt-doc pt-statement pt-savings ${o.cls || ''}" style="--rot:${o.rot ?? 1.2}deg">
    <div class="pt-st-top" data-role="fine" data-noword>
      <div><p class="pt-st-org">Your lender</p><p class="pt-st-kind">Savings statement</p></div>
      <div class="pt-st-meta"><p>Acct ···· 0000</p><p>${short ? 'Jun 1' : 'Apr 1'} – Sep 30, 2026</p></div>
    </div>
    <table class="pt-st-table" data-role="fine" data-noword>
      <thead><tr><th>Date</th><th>Description</th><th class="num">In</th><th class="num">Balance</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="pt-st-page" data-role="fine" data-noword>${short ? 'Four' : 'Six'} months, same account</p>
    <i class="pt-crease" aria-hidden="true"></i>
    ${stamp()}
  </div>`;
}

// Three months of statements: two blank sheets behind, the latest one on top.
function stackDoc(ctx, o = {}) {
  return `<div class="pt-stack ${o.cls || ''}">
    <div class="pt-doc pt-sheet" style="--k:0;--rot:-4.5deg" aria-hidden="true"></div>
    <div class="pt-doc pt-sheet" style="--k:1;--rot:2.4deg" aria-hidden="true"></div>
    ${statementDoc(ctx, { rot: -0.8, mark: false, cls: 'pt-front', page: 'Statement 3 of 3 on file' })}
  </div>`;
}

function letterDoc(ctx, o = {}) {
  return `<div class="pt-doc pt-letter ${o.cls || ''}" style="--rot:${o.rot ?? 1.4}deg" data-role="fine" data-noword>
    <p class="pt-l-date">October 9, 2026</p>
    <p class="pt-l-to">To: Your lender</p>
    <p class="pt-l-re">Re: Gift toward a down payment</p>
    <p class="pt-l-body">I confirm that the $<i class="blank w3"></i> I gave to <i class="blank w5"></i> for the purchase of a home is a gift. It <span class="mk" data-mark="underline">never has to be repaid</span>, and no one else has a claim on it.</p>
    <p class="pt-l-sig"><span>Signed</span><i class="blank w6"></i><span>Date</span><i class="blank w3"></i></p>
    <i class="pt-crease" aria-hidden="true"></i>
    ${stamp()}
  </div>`;
}

function slipDoc(ctx, o = {}) {
  const plan = /fhsa/i.test(o.hint || '') && !/rrsp/i.test(o.hint || '') ? 'FHSA' : 'RRSP · Home Buyers’ Plan';
  return `<div class="pt-doc pt-slip-doc ${o.cls || ''}" style="--rot:${o.rot ?? -1.2}deg" data-role="fine" data-noword>
    <div class="pt-perf" aria-hidden="true"></div>
    <p class="pt-sd-org">Your institution</p>
    <p class="pt-sd-kind">Withdrawal confirmation</p>
    <dl class="pt-dl">
      <div><dt>Plan</dt><dd>${plan}</dd></div>
      <div><dt>Acct</dt><dd>···· 0000</dd></div>
      <div><dt>Date</dt><dd>Oct 06, 2026</dd></div>
      <div class="is-hit"><dt>Amount</dt><dd><span class="mk" data-mark="circle" data-mark-pad="16">$8,000.00</span></dd></div>
    </dl>
    <p class="pt-sd-foot">Keep with the account statement it came from.</p>
    ${stamp()}
  </div>`;
}

function saleDoc(ctx, o = {}) {
  return `<div class="pt-doc pt-sale ${o.cls || ''}" style="--rot:${o.rot ?? 1.8}deg" data-role="fine" data-noword>
    <p class="pt-sale-h">Bill of sale · used vehicle</p>
    <dl class="pt-dl">
      <div><dt>Seller</dt><dd><i class="blank w5"></i></dd></div>
      <div><dt>Buyer</dt><dd><i class="blank w5"></i></dd></div>
      <div><dt>Vehicle</dt><dd>2019 hatchback, 84,000 km</dd></div>
      <div><dt>Sale date</dt><dd>Oct 11, 2026</dd></div>
      <div class="is-hit"><dt>Price</dt><dd><span class="mk" data-mark="circle" data-mark-pad="16">$8,000.00</span></dd></div>
    </dl>
    <p class="pt-l-sig"><span>Seller</span><i class="blank w4"></i><span>Buyer</span><i class="blank w4"></i></p>
    <i class="pt-crease" aria-hidden="true"></i>
    ${stamp()}
  </div>`;
}

// Transfer receipt: proof that a gift arrived (generic, masked).
function receiptDoc(ctx, o = {}) {
  return `<div class="pt-doc pt-receipt ${o.cls || ''}" style="--rot:${o.rot ?? -3.4}deg">
    <p class="pt-rc-h">Transfer received</p>
    <dl class="pt-dl">
      <div><dt>From</dt><dd>···· 4821</dd></div>
      <div><dt>To</dt><dd>···· 0000</dd></div>
      <div><dt>Date</dt><dd>Oct 10, 2026</dd></div>
      <div><dt>Amount</dt><dd>$8,000.00</dd></div>
      <div><dt>Ref.</dt><dd>TRF 1010 0193</dd></div>
    </dl>
  </div>`;
}

// Two documents: `back` is decorative (partly covered), `front` carries the mark and stamp.
function pair(back, front, { flip = false } = {}) {
  back = back.replace(/<div class="pt-stamp[^"]*"[^>]*>[^<]*<\/div>/g, '');
  return `<div class="pt-pair ${flip ? 'is-flip' : ''}"><div class="pt-back" aria-hidden="true">${back}</div>${front.replace('class="pt-doc ', 'class="pt-doc pt-front ')}</div>`;
}

function memoDoc(ctx, text, o = {}) {
  return `<div class="pt-doc pt-memo ${o.cls || ''}" style="--rot:${o.rot ?? -1}deg" data-role="fine" data-noword>
    <p class="pt-memo-h">Note to file</p>
    ${o.figure ? `<p class="pt-memo-fig">${ctx.t(o.figure)}</p>${o.figureLabel ? `<p class="pt-memo-b">${ctx.t(o.figureLabel)}</p>` : ''}` : ''}
    ${text ? `<p class="pt-memo-b">${ctx.t(text)}</p>` : ''}
    ${stamp()}
  </div>`;
}

// Pick a document for a slide from its words (specs stay style-agnostic).
function docFor(ctx, s, o = {}) {
  const words = `${s.eyebrow || ''} ${s.label || ''} ${s.text || ''} ${s.headline || ''}`;
  if (s.doc && s.doc.kind === 'statement-line') return statementDoc(ctx, { ...s.doc, ...o });
  // Evidence pairs: the paper that explains the money, lying on the paper that shows it.
  if (/gift/i.test(words)) return pair(receiptDoc(ctx), letterDoc(ctx, { rot: 1.8 }));
  if (/rrsp|fhsa|withdraw|home buyers/i.test(words)) return pair(statementDoc(ctx, { mark: false, label: 'Transfer in', rot: -3 }), slipDoc(ctx, { hint: words, rot: 2 }));
  if (/sold|bill of sale|vehicle|car\b|trade confirmation/i.test(words)) return pair(statementDoc(ctx, { rot: 2.4 }), saleDoc(ctx, { rot: -1.8 }), { flip: true });
  if (/building up|savings/i.test(words)) return savingsDoc(ctx, o);
  if (/90 days|three months/i.test(words)) return stackDoc(ctx, o);
  if (/statement|savings|deposit/i.test(words)) return statementDoc(ctx, { ...o, mark: !/building up|savings/i.test(words) });
  if (s.type === 'cover') return memoDoc(ctx, '', { ...o, figure: s.figure, figureLabel: s.figureLabel });
  return memoDoc(ctx, s.note || '', o);
}

// ---------- slide types ----------
function stageAttr(desk) { return `style="--desk:${desk}"`; }

function cover(s, ctx, desk) {
  const doc = docFor(ctx, s, { cls: 'pt-cover-doc' });
  return {
    html: `<div class="stage pt-stage pt-cover" ${stageAttr(desk)}>
      ${head(ctx, s.kicker)}
      <h1 class="pt-h1" data-block="headline" data-role="display" data-fit="box" data-max-lines="4" data-fit-min="70">${onDesk(ctx, s.headline)}</h1>
      <div class="pt-art">${doc}
        ${s.dek ? `<p class="pt-note-slip" data-block="dek">${ctx.t(s.dek)}</p>` : ''}
      </div>
      ${foot(ctx, { cue: !ctx.isSingle })}
    </div>`,
  };
}

function point(s, ctx, desk) {
  const doc = docFor(ctx, s, { cls: 'pt-point-doc' });
  return {
    html: `<div class="stage pt-stage pt-point ${s.figure ? 'has-fig' : ''}" ${stageAttr(desk)}>
      ${head(ctx, s.eyebrow)}
      ${s.figure ? `<p class="pt-fig" data-role="display" data-block="figure">${onDesk(ctx, s.figure)}</p>` : ''}
      <p class="pt-text" data-block="text" data-role="display" data-fit="box" data-max-lines="5" data-fit-min="44">${onDesk(ctx, s.text)}</p>
      <div class="pt-art">${doc}${s.note && !/pt-memo/.test(doc) ? `<div class="pt-note-wrap"><p class="pt-note-slip" data-block="note">${clip()}${ctx.t(s.note)}</p></div>` : ''}</div>
      ${foot(ctx)}
    </div>`,
  };
}

function worksheet(s, ctx) {
  const ch = ctx.calc?.chart;
  if (!ch) throw new Error('paper-trail number slide needs a calc with a chart');
  const rows = ch.rows;
  const max = Math.max(...rows.map((r) => r.value));
  const labels = s.rowLabels || rows.map((r) => r.label);
  const bars = rows.map((r, k) => `<div class="pt-ws-row ${k === ch.highlight && rows.length > 1 ? 'is-hi' : ''}">
      <p class="pt-ws-k">${ctx.t(labels[k] || r.label)}</p>
      <div class="pt-ws-track"><i style="width:${((r.value / max) * 100).toFixed(3)}%"></i><span class="pt-ws-v">${ctx.esc(r.shown)}</span></div>
    </div>`).join('');
  return `<div class="pt-doc pt-worksheet" style="--rot:-1deg" data-role="fine" data-noword>
    <div class="pt-ws-top"><p class="pt-st-org">Worksheet</p><p class="pt-st-kind">${ch.unit === 'months' ? 'Months to pay off' : 'Monthly figures'}</p></div>
    <div class="pt-ws-rows">${bars}<div class="pt-ws-axis"><span>${ch.unit === 'months' ? '0 months' : '$0'}</span></div></div>
    ${s.callout ? `<div class="pt-ws-total"><span class="pt-ws-tk">${ctx.t(s.calloutSub || '')}</span><span class="pt-ws-tv"><span class="mk" data-mark="circle" data-mark-pad="18">${ctx.t(s.callout)}</span></span></div>` : ''}
    <p class="pt-ws-fine">${ctx.t(s.assumptions || '')}</p>
    ${stamp()}
  </div>`;
}

function number(s, ctx, desk) {
  return {
    html: `<div class="stage pt-stage pt-number" ${stageAttr(desk)}>
      ${head(ctx, s.label)}
      <h2 class="pt-h2" data-block="title" data-role="display" data-fit="box" data-max-lines="3" data-fit-min="44">${onDesk(ctx, s.title)}</h2>
      <div class="pt-art">${worksheet(s, ctx)}</div>
      ${foot(ctx)}
    </div>`,
    audit: ctx.calc?.audit,
  };
}

function compare(s, ctx, desk) {
  const card = (o, k) => `<div class="pt-doc pt-card ${k ? 'is-r' : 'is-l'}" style="--rot:${k ? 1.6 : -2.2}deg">
      <p class="pt-card-k" data-role="label">${ctx.t(o.label)}</p>
      <p class="pt-card-v" data-role="display">${k ? `<span class="mk" data-mark="circle" data-mark-pad="14">${ctx.t(o.value)}</span>` : ctx.t(o.value)}</p>
      ${o.note ? `<p class="pt-card-n">${ctx.t(o.note)}</p>` : ''}
      ${k ? stamp('Illustrative', 'is-small') : ''}
    </div>`;
  return {
    html: `<div class="stage pt-stage pt-compare" ${stageAttr(desk)}>
      ${head(ctx, s.label)}
      <h2 class="pt-h2" data-block="title" data-role="display" data-fit="box" data-max-lines="3" data-fit-min="44">${onDesk(ctx, s.title)}</h2>
      <div class="pt-art"><div class="pt-cards" data-block="cards">${card(s.left, 0)}${card(s.right, 1)}</div></div>
      ${s.verdict ? `<p class="pt-desk-note" data-block="verdict">${ctx.t(s.verdict)}</p>` : ''}
      ${foot(ctx)}
    </div>`,
  };
}

function list(s, ctx, desk, numbered) {
  const items = (s.items || []).map((it, i) => `<li>
      <span class="pt-box" aria-hidden="true">${numbered ? `<b>${i + 1}</b>` : '<span class="mk" data-mark="tick">&#x2003;</span>'}</span>
      <span class="pt-li">${ctx.t(it.text)}${it.tag ? ` <em>${ctx.t(it.tag)}</em>` : ''}</span>
    </li>`).join('');
  return {
    html: `<div class="stage pt-stage pt-list" ${stageAttr(desk)}>
      ${head(ctx, s.label)}
      <h2 class="pt-h2" data-block="title" data-role="display">${onDesk(ctx, s.title)}</h2>
      <div class="pt-art"><div class="pt-doc pt-index" style="--rot:-0.8deg" data-block="items" data-allow="gradient">
        <ol class="pt-ol">${items}</ol>
        ${stamp()}
      </div></div>
      ${s.note ? `<p class="pt-desk-note">${ctx.t(s.note)}</p>` : ''}
      ${foot(ctx)}
    </div>`,
  };
}

function myth(s, ctx, desk) {
  return {
    html: `<div class="stage pt-stage pt-myth" ${stageAttr(desk)}>
      ${head(ctx, s.label || 'Heard it before?')}
      <div class="pt-art"><div class="pt-doc pt-sticky" style="--rot:-3deg" data-block="myth">
        <p class="pt-sticky-t"><span class="mk" data-mark="strike">${ctx.t(s.myth)}</span></p>
        ${stamp('Illustrative', 'is-small')}
      </div></div>
      <p class="pt-text" data-block="fact" data-role="display">${onDesk(ctx, s.fact)}</p>
      ${s.note ? `<p class="pt-desk-note">${ctx.t(s.note)}</p>` : ''}
      ${foot(ctx)}
    </div>`,
  };
}

function quote(s, ctx, desk) {
  return {
    html: `<div class="stage pt-stage pt-quote" ${stageAttr(desk)}>
      ${head(ctx, s.label || 'From the file')}
      <div class="pt-art"><div class="pt-doc pt-letter pt-qdoc" style="--rot:1deg" data-block="quote">
        <p class="pt-q">${ctx.t(s.quote)}</p>
        ${s.by ? `<p class="pt-q-by" data-role="label">${ctx.t(s.by)}</p>` : ''}
        ${stamp()}
      </div></div>
      ${foot(ctx)}
    </div>`,
  };
}

function stat(s, ctx, desk) {
  const rows = (s.facts || []).map((f) => `<div class="${f.emphasis ? 'is-hit' : ''}"><dt>${ctx.t(f.label)}</dt><dd>${f.emphasis ? `<span class="mk" data-mark="circle" data-mark-pad="12">${ctx.t(f.value)}</span>` : ctx.t(f.value)}${f.note ? ` <small>${ctx.t(f.note)}</small>` : ''}</dd></div>`).join('');
  return {
    html: `<div class="stage pt-stage pt-stat" ${stageAttr(desk)}>
      ${head(ctx, s.kicker)}
      <h1 class="pt-h2" data-block="headline" data-role="display" data-fit="box" data-max-lines="4" data-fit-min="44">${onDesk(ctx, s.headline)}</h1>
      <div class="pt-art"><div class="pt-doc pt-summary" style="--rot:-1.2deg" data-role="fine" data-noword>
        <p class="pt-st-org">Summary</p>
        ${s.figure ? `<p class="pt-sum-fig">${ctx.t(s.figure)} <small>${ctx.t(s.figureLabel || '')}</small></p>` : ''}
        <dl class="pt-dl">${rows}</dl>
        ${stamp()}
      </div></div>
      ${s.note ? `<p class="pt-desk-note">${ctx.t(s.note)}</p>` : ''}
      ${foot(ctx, { size: 'block' })}
    </div>`,
  };
}

function cta(s, ctx, desk) {
  const kw = s.keyword ? `<span class="pt-kw">${ctx.esc(s.keyword)}</span>` : '';
  return {
    html: `<div class="stage pt-stage pt-cta" ${stageAttr(desk)}>
      ${head(ctx, null)}
      <h2 class="pt-h1 pt-cta-h" data-block="cta" data-role="display" data-fit="box" data-max-lines="5" data-fit-min="60">${onDesk(ctx, s.headline).replace('{keyword}', kw)}</h2>
      ${s.sub ? `<p class="pt-desk-note pt-cta-sub">${ctx.t(s.sub)}</p>` : ''}
      <div class="pt-art"><div class="pt-folder" style="--rot:-1.5deg">
        <div class="pt-folder-back"></div>
        <div class="pt-folder-tab" data-role="label" data-noword>${ctx.esc(ctx.spec.series || 'File')}</div>
        <div class="pt-folder-sheet" style="--r:-1.6deg" aria-hidden="true"></div>
        <div class="pt-folder-sheet" style="--r:1.1deg;left:9%;top:34px" aria-hidden="true"></div>
        <div class="pt-folder-front"><div class="pt-folder-grain"></div>
          <div class="pt-folder-label">${ctx.compliance('block')}</div>
          ${stamp('Illustrative file', 'is-folder')}
        </div>
      </div></div>
    </div>`,
  };
}

const TYPES = { cover, point, number, compare, steps: (s, c, d) => list(s, c, d, true), recap: (s, c, d) => list(s, c, d, false), myth, quote, stat, cta };

export function render(slide, ctx) {
  const fn = TYPES[slide.type];
  if (!fn) throw new Error(`paper-trail: no layout for slide type "${slide.type}"`);
  const desk = deskOf(ctx.palette.accent, ctx.palette['desk-ink']);
  const part = fn(slide, ctx, desk);
  return { bg: bg(ctx, desk), ...part };
}
