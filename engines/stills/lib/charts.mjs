// SVG data-viz drawn from numbers in the spec. No chart library: every mark is placed
// on purpose. Axes start at zero (no truncated bars). Labels are live <text>.
import { compare, money, minDownPayment } from './mortgage.mjs';

const f2 = (n) => Number(n).toFixed(2);
const cents = (n) => Math.round(n * 100) / 100;
const escT = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Minimum down payment vs 20% on one purchase price.
//   view "compare": two bars from $0 (20% down vs minimum), the gap as a dashed ghost.
//   view "sum":     the working as a ledger column (part + part = total).
// Shown figures are rounded to the dollar; the last part absorbs rounding so the
// column always adds up, and the gap is computed from the rounded bars.
export function downPayment(chart) {
  const price = chart.price;
  if (!(price > 0)) throw new Error('down-payment chart needs a positive "price"');
  const dp = minDownPayment(price);
  const minShown = Math.round(dp.exact);
  const twentyExact = cents(price * 0.2);
  const twentyShown = Math.round(twentyExact);
  const partsShown = dp.parts.map((p) => Math.round(p.exact));
  partsShown[partsShown.length - 1] = minShown - partsShown.slice(0, -1).reduce((s, v) => s + v, 0);
  const data = {
    price,
    rule: '5% of the first $500,000 + 10% of the rest, to a $1.5M price; 20% at $1.5M and up',
    insurable: dp.insurable,
    parts: dp.parts.map((p, i) => ({ pct: p.pct, base: p.base, basis: p.basis, exact: p.exact, shown: partsShown[i] })),
    minExact: dp.exact, minShown,
    twentyExact, twentyShown,
    gapExact: cents(twentyExact - dp.exact), gapShown: twentyShown - minShown,
  };
  const fills = {
    price: money(price), min: money(minShown), minExact: money(dp.exact, { cents: true }),
    twenty: money(twentyShown), twentyExact: money(twentyExact, { cents: true }), gap: money(data.gapShown),
    first: money(dp.parts[0].base), firstDown: money(partsShown[0]),
    rest: money(dp.parts[1]?.base ?? 0), restDown: money(partsShown[1] ?? 0),
  };
  const view = chart.view || 'compare';

  if (view === 'sum') {
    const label = (p) => (p.basis === 'all' ? `${p.pct}% of ${money(p.base)}` : `${p.pct}% of the ${p.basis} ${money(p.base)}`);
    const rows = data.parts.map((p, i) => `
        <div class="dp-row"><span class="dp-k">${label(p)}</span><span class="dp-v">${i ? '<i>+</i>' : ''}${money(p.shown)}</span></div>`).join('');
    const html = `<div class="dp-sum" data-block="sum">${rows}
        <div class="dp-row dp-total"><span class="dp-k" data-role="label">${escT(chart.totalLabel || 'Minimum down')}</span><span class="dp-v"><span class="mk" data-mark="underline">${money(minShown)}</span></span></div>
      </div>`;
    return { html, data, fills };
  }

  // Category labels sit above each bar, so the axis and grid are drawn per row and
  // never run through a label.
  const W = 920, H = 462, left = 0, plotW = 740;
  const max = Math.ceil(twentyShown / 50000) * 50000;
  const x = (v) => left + (plotW * v) / max;
  const bh = 116, y0 = 46, y1 = y0 + bh + 112;
  const lab = chart.labels || ['20% down', 'Minimum'];
  let s = '';
  for (let v = 0; v <= max; v += 100000) {
    if (v) for (const y of [y0, y1]) s += `<line class="grid" x1="${x(v)}" x2="${x(v)}" y1="${y - 8}" y2="${y + bh + (y === y1 ? 16 : 8)}"/>`;
    s += `<text class="tick" x="${x(v)}" y="${y1 + bh + 52}" text-anchor="${v === 0 ? 'start' : 'middle'}">${v === 0 ? '$0' : money(v)}</text>`;
  }
  s += `<text class="cat" x="${left}" y="${y0 - 20}">${escT(lab[0])}</text>`;
  s += `<rect class="bar bar-b" x="${left}" y="${y0}" width="${x(twentyShown) - left}" height="${bh}"/>`;
  s += `<text class="val" x="${x(twentyShown) + 22}" y="${y0 + bh / 2 + 19}">${money(twentyShown)}</text>`;
  s += `<text class="cat" x="${left}" y="${y1 - 20}">${escT(lab[1])}</text>`;
  s += `<rect class="bar bar-delta" x="${left}" y="${y1}" width="${x(minShown) - left}" height="${bh}"/>`;
  s += `<rect class="bar-ghost" x="${x(minShown) + 1.5}" y="${y1 + 1.5}" width="${x(twentyShown) - x(minShown) - 3}" height="${bh - 3}"/>`;
  s += `<text class="gap-label" x="${(x(minShown) + x(twentyShown)) / 2}" y="${y1 + bh / 2 + 15}" text-anchor="middle">${money(data.gapShown)} less</text>`;
  s += `<text class="val val-b" x="${x(twentyShown) + 22}" y="${y1 + bh / 2 + 19}">${money(minShown)}</text>`;
  for (const y of [y0, y1]) s += `<line class="axis" x1="${left}" x2="${left}" y1="${y - 8}" y2="${y + bh + 8}"/>`;
  const svg = `<svg class="chart chart-dp" data-role="label" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Down payment on ${money(price)}: 20% is ${money(twentyShown)}, the minimum is ${money(minShown)}">${s}</svg>`;
  return { html: svg, data, fills };
}

// FHSA participation room next year: account opened this year (unused room carries
// forward, capped) vs opened next year (annual room only). Bars from $0.
export function fhsaRoom(chart) {
  const annual = chart.annualRoom ?? 8000;
  const cap = chart.carryForwardCap ?? 8000;
  const lifetime = chart.lifetimeLimit ?? 40000;
  const contributed = chart.contributedThisYear ?? 0;
  const carried = Math.min(Math.max(0, annual - contributed), cap);
  const openNow = Math.min(annual + carried, lifetime - contributed);
  const openLater = Math.min(annual, lifetime);
  const lab = chart.labels || ['Opened this year', 'Opened next year'];
  const data = {
    annualRoom: annual, carryForwardCap: cap, lifetimeLimit: lifetime, contributedThisYear: contributed,
    rows: [
      { label: lab[0], working: `${money(annual)} annual + ${money(carried)} carried forward`, total: openNow },
      { label: lab[1], working: `${money(annual)} annual, nothing to carry`, total: openLater },
    ],
  };
  const fills = { now: money(openNow), later: money(openLater), carried: money(carried), annual: money(annual) };

  const W = 920, H = 270, left = 0, plotW = 690;
  const x = (v) => left + (plotW * v) / openNow;
  const bh = 72, y0 = 44, y1 = y0 + bh + 86;
  let s = '';
  s += `<line class="ghost" x1="${x(annual)}" x2="${x(annual)}" y1="${y0 + bh}" y2="${y1}"/>`;
  s += `<text class="cat" x="${left}" y="${y0 - 16}">${escT(lab[0])}</text>`;
  s += `<rect class="bar bar-b" x="${left}" y="${y0}" width="${x(annual) - left}" height="${bh}"/>`;
  s += `<rect class="bar bar-delta" x="${x(annual)}" y="${y0}" width="${x(openNow) - x(annual)}" height="${bh}"/>`;
  s += `<text class="val" x="${x(openNow) + 20}" y="${y0 + bh / 2 + 17}">${money(openNow)}</text>`;
  s += `<text class="cat" x="${left}" y="${y1 - 16}">${escT(lab[1])}</text>`;
  s += `<rect class="bar bar-a" x="${left}" y="${y1}" width="${x(openLater) - left}" height="${bh}"/>`;
  s += `<text class="val val-b" x="${x(openLater) + 20}" y="${y1 + bh / 2 + 17}">${money(openLater)}</text>`;
  for (const y of [y0, y1]) s += `<line class="axis" x1="${left}" x2="${left}" y1="${y - 8}" y2="${y + bh + 8}"/>`;
  const svg = `<svg class="chart chart-fhsa" data-role="label" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="FHSA room: ${money(openNow)} if ${escT(lab[0])}, ${money(openLater)} if ${escT(lab[1])}">${s}</svg>`;
  return { html: svg, data, fills };
}

// Payment comparison: honest bars from $0 with the difference shown as its own slice.
export function paymentCompare(chart, { family, variant }) {
  const data = compare({
    principal: chart.principal,
    amortYears: chart.amortYears,
    compounding: chart.compounding || 'semi-annual',
    rates: chart.rates,
  });
  const [a, b] = data.rows;
  const horizontal = family === 'dossier' || family === 'ledger' || (family === 'kitchen' && variant === 'b');
  const thin = family === 'ledger';
  const W = 920;
  const H = horizontal ? (thin ? 390 : 430) : 600;
  const max = Math.ceil(b.exact / 1000) * 1000; // $3,000 for this example
  const ticks = [];
  for (let v = 0; v <= max; v += 1000) ticks.push(v);
  const label = (r) => `${f2(r.annualPct)}%`;
  let svg = '';

  if (!horizontal) {
    const top = 88, bottom = H - 70, left = 120, right = W - 30;
    const y = (v) => bottom - ((bottom - top) * v) / max;
    const bw = family === 'riso' ? 210 : 172;
    const gap = family === 'riso' ? 56 : 62;
    const x0 = left + 40, x1 = x0 + bw + gap;
    svg += ticks.map((v) => `<line class="grid" x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${left - 16}" y="${y(v) + 8}" text-anchor="end">${v === 0 ? '$0' : money(v)}</text>`).join('');
    svg += `<rect class="bar bar-a" x="${x0}" y="${y(a.exact)}" width="${bw}" height="${bottom - y(a.exact)}"/>`;
    svg += `<rect class="bar bar-b" x="${x1}" y="${y(a.exact)}" width="${bw}" height="${bottom - y(a.exact)}"/>`;
    svg += `<rect class="bar bar-delta" x="${x1}" y="${y(b.exact)}" width="${bw}" height="${y(a.exact) - y(b.exact)}"/>`;
    svg += `<line class="ghost" x1="${x0 + bw}" x2="${x1}" y1="${y(a.exact)}" y2="${y(a.exact)}"/>`;
    svg += `<text class="val" x="${x0 + bw / 2}" y="${y(a.exact) - 22}" text-anchor="middle">${money(a.shown)}</text>`;
    svg += `<text class="val val-b" x="${x1 + bw / 2}" y="${y(b.exact) - 22}" text-anchor="middle">${money(b.shown)}</text>`;
    svg += `<text class="cat" x="${x0 + bw / 2}" y="${bottom + 48}" text-anchor="middle">${label(a)}</text>`;
    svg += `<text class="cat" x="${x1 + bw / 2}" y="${bottom + 48}" text-anchor="middle">${label(b)}</text>`;
    svg += `<line class="axis" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/>`;
    // Anchor for the hand-drawn callout (read by hand.js through a selector).
    svg += `<rect id="delta-anchor" x="${x1 + bw + 6}" y="${y(b.exact) - 4}" width="2" height="${y(a.exact) - y(b.exact) + 8}" fill="none"/>`;
  } else {
    const left = 190, right = W - 150, top = 40;
    const x = (v) => left + ((right - left) * v) / max;
    const bh = thin ? 66 : 104, gap = thin ? 76 : 90;
    const y0 = top + 40, y1 = y0 + bh + gap;
    svg += ticks.map((v) => `<line class="grid" y1="${top}" y2="${y1 + bh + 18}" x1="${x(v)}" x2="${x(v)}"/><text class="tick" y="${y1 + bh + 58}" x="${x(v)}" text-anchor="middle">${v === 0 ? '$0' : money(v)}</text>`).join('');
    svg += `<rect class="bar bar-a" y="${y0}" x="${left}" height="${bh}" width="${x(a.exact) - left}"/>`;
    svg += `<rect class="bar bar-b" y="${y1}" x="${left}" height="${bh}" width="${x(a.exact) - left}"/>`;
    svg += `<rect class="bar bar-delta" y="${y1}" x="${x(a.exact)}" height="${bh}" width="${x(b.exact) - x(a.exact)}"/>`;
    svg += `<text class="cat" x="${left - 20}" y="${y0 + bh / 2 + 12}" text-anchor="end">${label(a)}</text>`;
    svg += `<text class="cat" x="${left - 20}" y="${y1 + bh / 2 + 12}" text-anchor="end">${label(b)}</text>`;
    svg += `<text class="val" x="${x(a.exact) + 22}" y="${y0 + bh / 2 + 14}">${money(a.shown)}</text>`;
    svg += `<text class="val val-b" x="${x(b.exact) + 22}" y="${y1 + bh / 2 + 14}">${money(b.shown)}</text>`;
    svg += `<line class="axis" x1="${left}" x2="${left}" y1="${top}" y2="${y1 + bh + 18}"/>`;
    svg += `<rect id="delta-anchor" x="${x(a.exact)}" y="${y1 + bh + 6}" width="${x(b.exact) - x(a.exact)}" height="2" fill="none"/>`;
    svg += `<rect id="delta-top" x="${x(a.exact)}" y="${y1 - 10}" width="${x(b.exact) - x(a.exact)}" height="2" fill="none"/>`;
  }

  return {
    svg: `<svg class="chart chart-pay ${horizontal ? 'is-h' : 'is-v'}" data-role="label" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Monthly payment ${money(a.shown)} at ${label(a)} versus ${money(b.shown)} at ${label(b)}">${svg}</svg>`,
    data,
    horizontal,
    delta: b.deltaShown,
    yearly: b.yearlyShown,
  };
}

// Policy-rate step: previous -> current -> next decision (unknown, dashed).
export function rateStep(rd, { family }) {
  const W = 920, H = family === 'riso' ? 170 : 300;
  const left = 30, right = W - 30, top = 52, bottom = H - 46;
  const lo = Math.min(rd.previous, rd.current) - 0.12, hi = Math.max(rd.previous, rd.current) + 0.05;
  const y = (v) => bottom - ((bottom - top) * (v - lo)) / (hi - lo);
  const xA = left, xB = left + (right - left) * 0.42, xC = left + (right - left) * 0.8;
  let s = '';
  s += `<line class="axis" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/>`;
  s += `<path class="step" d="M${xA},${y(rd.previous)} H${xB} V${y(rd.current)} H${xC}"/>`;
  s += `<path class="step-next" d="M${xC},${y(rd.current)} H${right - 10}"/>`;
  s += `<circle class="dot" cx="${xB}" cy="${y(rd.current)}" r="9"/>`;
  s += `<text class="tick" x="${xA}" y="${bottom + 38}">${rd.previousLabel || ''}</text>`;
  s += `<text class="tick" x="${xB}" y="${bottom + 38}" text-anchor="middle">${rd.changedLabel || ''}</text>`;
  s += `<text class="tick tick-next" id="next-tick" x="${right - 10}" y="${bottom + 38}" text-anchor="end">${rd.nextLabel || ''}</text>`;
  s += `<text class="lvl" x="${xA}" y="${y(rd.previous) - 18}">${f2(rd.previous)}%</text>`;
  s += `<text class="lvl lvl-now" x="${xB + 18}" y="${y(rd.current) - 18}">${f2(rd.current)}%</text>`;
  s += `<text class="q" id="next-q" x="${right - 26}" y="${y(rd.current) - 18}" text-anchor="end">?</text>`;
  return `<svg class="chart chart-step" data-role="label" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Policy rate ${f2(rd.previous)}% to ${f2(rd.current)}%">${s}</svg>`;
}
