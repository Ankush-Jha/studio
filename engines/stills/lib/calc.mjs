// Shared finance calculations for the style library.
// A slide declares `calc: { kind, ...inputs }`. The result's `fills` replace {name} tokens in
// every text field of the slide, so no computed number is ever typed into copy, and its
// `audit` (inputs, exact values, working) goes to manifest.json, where tools/mathcheck.py
// recomputes it independently.
//
// Rounding rule: when a slide shows two rounded figures and their difference, the difference
// is taken from the rounded figures ({delta}), so what is on screen always adds up. The exact
// difference is available as {deltaCents}; the plain rounding of the exact one as {deltaAbout}.
import { payment, periodicRate, minDownPayment } from './mortgage.mjs';

const r2 = (n) => Math.round(n * 100) / 100;
export const money = (n, { cents = false } = {}) =>
  (n < 0 ? '−' : '') + '$' + Math.abs(Number(n)).toLocaleString('en-CA', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
export const moneyK = (n) => (n % 1000 === 0 ? `$${n / 1000}K` : money(n));
export const pct = (n, d = 2) => `${Number(n).toFixed(d)}%`;

// Months to repay `balance` at periodic rate i with level payment p (last payment partial).
function payoff(balance, i, p) {
  let bal = balance, m = 0, interest = 0;
  while (bal > 0.005 && m < 1200) {
    const it = bal * i;
    const pay = Math.min(p, bal + it);
    bal = bal + it - pay;
    interest += it;
    m++;
  }
  return { months: m, interest: r2(interest) };
}

const KINDS = {
  // Mortgage payment at two or more rates. Canadian fixed: semi-annual compounding.
  'payment-compare'({ principal, amortYears = 25, compounding = 'semi-annual', rates }) {
    if (!(principal > 0) || !Array.isArray(rates) || rates.length < 2) throw new Error('payment-compare needs principal and 2+ rates');
    const rows = rates.map((annualPct) => {
      const exact = payment({ principal, annualPct, amortYears, compounding });
      return { annualPct, i: periodicRate(annualPct, compounding), exact: r2(exact), shown: Math.round(exact) };
    });
    const [a, b] = rows;
    const delta = b.shown - a.shown;
    const deltaExact = r2(b.exact - a.exact);
    const per100k = r2(deltaExact / (principal / 100000));
    return {
      chart: { unit: 'money', rows: rows.map((r) => ({ label: pct(r.annualPct), value: r.exact, shown: money(r.exact, { cents: true }), shortShown: money(r.shown) })), highlight: 1 },
      values: { rows, delta, deltaExact, per100k },
      fills: {
        principal: money(principal), principalK: moneyK(principal), amort: `${amortYears}`,
        rateA: pct(a.annualPct), rateB: pct(b.annualPct), rateDiff: pct(b.annualPct - a.annualPct),
        a: money(a.shown), b: money(b.shown), aCents: money(a.exact, { cents: true }), bCents: money(b.exact, { cents: true }),
        delta: money(delta), deltaCents: money(deltaExact, { cents: true }), deltaAbout: money(Math.round(deltaExact)),
        yearly: money(delta * 12), yearlyCents: money(deltaExact * 12, { cents: true }), yearlyAbout: money(Math.round(deltaExact * 12)),
        per100k: money(per100k, { cents: true }),
        compounding,
      },
      audit: {
        inputs: { principal, amortYears, compounding, rates },
        steps: rows.map((r) => `${pct(r.annualPct)}: i = (1 + ${r.annualPct / 100}/${compounding === 'monthly' ? 12 : 2})^(${compounding === 'monthly' ? 1 : '1/6'}) - 1 = ${r.i.toFixed(7)}; P = ${principal} x i / (1 - (1+i)^-${amortYears * 12}) = ${r.exact}`)
          .concat([`shown ${a.shown} -> ${b.shown}: delta ${delta} (exact ${deltaExact}); per $100K ${per100k}`]),
      },
    };
  },

  // One mortgage payment (e.g. the payment a co-signer carries on their credit).
  payment({ principal, annualPct, amortYears = 25, compounding = 'semi-annual' }) {
    const exact = r2(payment({ principal, annualPct, amortYears, compounding }));
    const i = periodicRate(annualPct, compounding);
    return {
      chart: { unit: 'money', rows: [{ label: pct(annualPct), value: exact, shown: money(exact, { cents: true }), shortShown: money(Math.round(exact)) }], highlight: 0 },
      values: { exact, shown: Math.round(exact), i },
      fills: { principal: money(principal), principalK: moneyK(principal), rate: pct(annualPct), amort: `${amortYears}`, pay: money(Math.round(exact)), payCents: money(exact, { cents: true }), compounding },
      audit: { inputs: { principal, annualPct, amortYears, compounding }, steps: [`i = ${i.toFixed(7)}; P = ${principal} x i / (1 - (1+i)^-${amortYears * 12}) = ${exact}`] },
    };
  },

  // Interest-only line of credit (most HELOC minimums). Optional paydown at a set payment.
  heloc({ balance, rates, paydown }) {
    if (!(balance > 0) || !Array.isArray(rates) || !rates.length) throw new Error('heloc needs balance and rates');
    const rows = rates.map((annualPct) => {
      const exact = r2((balance * annualPct) / 100 / 12);
      return { annualPct, exact, shown: Math.round(exact) };
    });
    const fills = { balance: money(balance), balanceK: moneyK(balance) };
    rows.forEach((r, k) => {
      fills[`rate${k}`] = pct(r.annualPct);
      fills[`pay${k}`] = money(r.shown);
      fills[`pay${k}Cents`] = money(r.exact, { cents: true });
      fills[`year${k}`] = money(r.exact * 12);
    });
    if (rows.length > 1) {
      fills.delta01 = money(rows[1].shown - rows[0].shown);
      fills.delta01Cents = money(r2(rows[1].exact - rows[0].exact), { cents: true });
    }
    if (rows.length > 2) {
      fills.delta12 = money(rows[2].shown - rows[1].shown);
      fills.delta12Cents = money(r2(rows[2].exact - rows[1].exact), { cents: true });
    }
    fills.per100kQuarter = money(r2(100000 * 0.0025 / 12), { cents: true });
    const steps = rows.map((r) => `${balance} x ${r.annualPct}% / 12 = ${r.exact}`);
    let pd = null;
    if (paydown) {
      const k = paydown.rateIndex ?? (rows.length > 1 ? 1 : 0);
      const rate = rows[k].annualPct / 100 / 12;
      let bal = balance, interest = 0;
      for (let m = 0; m < (paydown.months || 12); m++) { const it = bal * rate; interest += it; bal -= paydown.payment - it; }
      pd = { payment: paydown.payment, months: paydown.months || 12, rateIndex: k, balanceAfter: r2(bal), principalPaid: r2(balance - bal), interestPaid: r2(interest) };
      fills.paydownPayment = money(paydown.payment);
      fills.paydownBalance = money(Math.round(pd.balanceAfter));
      fills.paydownPrincipal = money(Math.round(pd.principalPaid));
      fills.paydownPrincipalAbout = money(Math.round(pd.principalPaid / 50) * 50);
      fills.paydownInterest = money(Math.round(pd.interestPaid));
      steps.push(`paydown ${paydown.payment}/mo at ${rows[k].annualPct}% for ${pd.months} months: balance ${pd.balanceAfter}, principal ${pd.principalPaid}, interest ${pd.interestPaid}`);
    }
    return { chart: { unit: 'money', rows: rows.map((r) => ({ label: pct(r.annualPct), value: r.exact, shown: money(r.shown), shortShown: money(r.shown) })), highlight: rows.length > 1 ? 1 : 0 }, values: { rows, paydown: pd }, fills, audit: { inputs: { balance, rates, paydown: paydown || null }, steps } };
  },

  // A lump sum at renewal: keep the payment (finish sooner) or keep the end date (pay less).
  'lump-sum'({ balance, annualPct, years, lump, compounding = 'semi-annual' }) {
    const i = periodicRate(annualPct, compounding);
    const n = years * 12;
    const p = payment({ principal: balance, annualPct, amortYears: years, compounding });
    const before = { months: n, interest: r2(p * n - balance) };
    const after = payoff(balance - lump, i, p);
    const p2 = payment({ principal: balance - lump, annualPct, amortYears: years, compounding });
    const v = {
      payment: r2(p), monthsBefore: n, monthsAfter: after.months, monthsSaved: n - after.months,
      interestBefore: before.interest, interestAfter: after.interest, interestSaved: r2(before.interest - after.interest),
      lowerPayment: r2(p2), paymentDrop: r2(p - p2),
    };
    return {
      chart: { unit: 'months', rows: [{ label: 'No lump sum', value: n, shown: `${n} months`, shortShown: `${n}` }, { label: `${moneyK(lump)} lump sum`, value: after.months, shown: `${after.months} months`, shortShown: `${after.months}` }], highlight: 1 },
      values: v,
      fills: {
        balance: money(balance), lump: money(lump), lumpK: moneyK(lump), newBalance: money(balance - lump),
        rate: pct(annualPct), years: `${years}`,
        payment: money(Math.round(v.payment)), paymentCents: money(v.payment, { cents: true }),
        monthsBefore: `${n}`, monthsAfter: `${after.months}`, monthsSaved: `${v.monthsSaved}`,
        interestSaved: money(Math.round(v.interestSaved)), interestSavedAbout: money(Math.round(v.interestSaved / 1000) * 1000),
        lowerPayment: money(Math.round(v.lowerPayment)), paymentDrop: money(Math.round(v.paymentDrop)), paymentDropCents: money(v.paymentDrop, { cents: true }),
      },
      audit: {
        inputs: { balance, annualPct, years, lump, compounding },
        steps: [
          `payment on ${balance} at ${annualPct}% over ${n} months = ${v.payment}`,
          `${balance - lump} repaid at ${v.payment}/mo takes ${after.months} months (saved ${v.monthsSaved})`,
          `interest ${before.interest} -> ${after.interest}, saved ${v.interestSaved}`,
          `or same end date: payment ${v.lowerPayment}, drop ${v.paymentDrop}`,
        ],
      },
    };
  },

  // Minimum down payment (federal rules since Dec 15, 2024).
  'down-payment'({ price }) {
    const dp = minDownPayment(price);
    const minShown = Math.round(dp.exact);
    const twenty = r2(price * 0.2);
    return {
      chart: { unit: 'money', rows: [{ label: '20% down', value: twenty, shown: money(Math.round(twenty)), shortShown: money(Math.round(twenty)) }, { label: 'Minimum down', value: dp.exact, shown: money(minShown), shortShown: money(minShown) }], highlight: 1 },
      values: { ...dp, minShown, twenty, gap: r2(twenty - dp.exact) },
      fills: { price: money(price), min: money(minShown), minExact: money(dp.exact, { cents: true }), twenty: money(Math.round(twenty)), gap: money(Math.round(twenty) - minShown) },
      audit: { inputs: { price }, steps: dp.parts.map((p) => `${p.pct}% of ${p.base} = ${p.exact}`).concat([`minimum ${dp.exact}; 20% ${twenty}`]) },
    };
  },

  // FHSA room: room exists only once the account is open; up to $8,000 of unused room carries forward.
  'fhsa-room'({ annualRoom = 8000, carryForwardCap = 8000, lifetimeLimit = 40000, contributedThisYear = 0 }) {
    const carried = Math.min(annualRoom - contributedThisYear, carryForwardCap);
    const now = annualRoom + carried;
    return {
      chart: { unit: 'money', rows: [{ label: 'Opened this year', value: now, shown: money(now), shortShown: money(now) }, { label: 'Opened next year', value: annualRoom, shown: money(annualRoom), shortShown: money(annualRoom) }], highlight: 0 },
      values: { now, later: annualRoom, carried, lifetimeLimit },
      fills: { now: money(now), later: money(annualRoom), carried: money(carried), annual: money(annualRoom), lifetime: money(lifetimeLimit), couple: money(now * 2) },
      audit: { inputs: { annualRoom, carryForwardCap, lifetimeLimit, contributedThisYear }, steps: [`opened this year with ${contributedThisYear}: next year ${annualRoom} + carried ${carried} = ${now}`, `opened next year: ${annualRoom}`] },
    };
  },

  // Calendar days between two ISO dates (to - from).
  // (no chart)
  days({ from, to }) {
    const d = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
    return { values: { days: d }, fills: { days: `${d}` }, audit: { inputs: { from, to }, steps: [`${to} - ${from} = ${d} days`] } };
  },

  // Sourced figures with no maths (market data). Each value must carry a source in the spec.
  facts({ values }) {
    const fills = {};
    for (const [k, v] of Object.entries(values || {})) fills[k] = typeof v === 'object' ? String(v.shown ?? v.value) : String(v);
    return { values, fills, audit: { inputs: { values }, steps: ['sourced figures, no calculation'] } };
  },
};

export function runCalc(spec) {
  if (!spec) return null;
  const fn = KINDS[spec.kind];
  if (!fn) throw new Error(`Unknown calc kind "${spec.kind}". Known: ${Object.keys(KINDS).join(', ')}`);
  const out = fn(spec);
  return { kind: spec.kind, ...out };
}

// Replace {name} tokens in every string of a slide (deep), using fills from one or more calcs.
export function fillDeep(node, fills) {
  if (typeof node === 'string') return node.replace(/\{(\w+)\}/g, (m, k) => (k in fills ? fills[k] : m));
  if (Array.isArray(node)) return node.map((n) => fillDeep(n, fills));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = k === 'calc' ? v : fillDeep(v, fills);
    return out;
  }
  return node;
}

export const CALC_KINDS = Object.keys(KINDS);
