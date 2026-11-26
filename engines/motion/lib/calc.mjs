// Every number a template shows comes from here, never from typed copy.
// Each calc kind takes inputs and returns named values: { exact, shown, text, working }.
//   exact    full-precision value (audit)
//   shown    the value as displayed (rounded); deltas and sums use SHOWN values so a
//            frame never shows arithmetic that doesn't add up ($650 - $619 = $31)
//   text     formatted for screen ("$650", "+$31", "5.20%")
//   working  one line of working, written to the manifest
// `expect` lines (copied from the idea's checked math) are compared against `shown`;
// a mismatch stops the render.
import { amortPayment } from './statics.mjs';

const r2 = (n) => Math.round(n * 100) / 100;
const money = (n, { cents = false, sign = false } = {}) => {
  const s = '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  return n < 0 ? `−${s}` : sign ? `+${s}` : s;
};
const pct = (n, d = 2) => `${n.toFixed(d)}%`;
const v = (exact, shown, text, working, extra = {}) => ({ exact: r2(exact * 1) === exact ? exact : +exact.toFixed(6), shown, text, working, ...extra });

// Interest-only HELOC, with an optional self-set payment that pays principal down.
// Interest accrues monthly on the outstanding balance at the annual rate / 12
// (simple monthly convention; daily accrual differs by under $1 a year on these sizes).
function helocInterestOnly(i) {
  const P = i.principal;
  const spread = i.spread ?? 0;
  const months = i.months ?? 12;
  const rNow = i.primeNow + spread;
  const rBefore = i.primeBefore != null ? i.primeBefore + spread : null;
  const step = i.nextChange ?? 0.25;
  const rNext = rNow + step;
  const io = (rate) => (P * rate) / 100 / 12;
  const out = {};
  out.principal = v(P, P, money(P), 'Balance borrowed');
  out.primeNow = v(i.primeNow, i.primeNow, pct(i.primeNow), 'Big-bank prime rate (input)');
  if (i.primeBefore != null) out.primeBefore = v(i.primeBefore, i.primeBefore, pct(i.primeBefore), 'Big-bank prime rate before the change (input)');
  out.spread = v(spread, spread, pct(spread), 'HELOC spread over prime (input)');
  out.step = v(step, step, pct(step), 'Size of one rate move (input)');
  out.rateNow = v(rNow, +rNow.toFixed(2), pct(rNow), `Prime ${pct(i.primeNow)} + ${pct(spread)}`);
  out.paymentNow = v(io(rNow), Math.round(io(rNow)), money(Math.round(io(rNow))), `${money(P)} × ${pct(rNow)} ÷ 12 = ${money(io(rNow), { cents: true })}`);
  if (rBefore != null) {
    out.rateBefore = v(rBefore, +rBefore.toFixed(2), pct(rBefore), `Prime ${pct(i.primeBefore)} + ${pct(spread)}`);
    out.paymentBefore = v(io(rBefore), Math.round(io(rBefore)), money(Math.round(io(rBefore))), `${money(P)} × ${pct(rBefore)} ÷ 12 = ${money(io(rBefore), { cents: true })}`);
    const d = out.paymentNow.shown - out.paymentBefore.shown;
    out.deltaBefore = v(io(rNow) - io(rBefore), d, money(d, { sign: true }), `${out.paymentNow.text} − ${out.paymentBefore.text} (shown figures)`);
  }
  out.rateNext = v(rNext, +rNext.toFixed(2), pct(rNext), `${pct(rNow)} + ${pct(step)} if the next decision moves prime`);
  out.paymentNext = v(io(rNext), Math.round(io(rNext)), money(Math.round(io(rNext))), `${money(P)} × ${pct(rNext)} ÷ 12 = ${money(io(rNext), { cents: true })}`);
  out.paymentNowC = v(io(rNow), r2(io(rNow)), money(io(rNow), { cents: true }), out.paymentNow.working);
  if (rBefore != null) {
    out.paymentBeforeC = v(io(rBefore), r2(io(rBefore)), money(io(rBefore), { cents: true }), out.paymentBefore.working);
    const dc = r2(r2(io(rNow)) - r2(io(rBefore)));
    out.deltaBeforeC = v(io(rNow) - io(rBefore), dc, money(dc, { cents: true, sign: true }), `${money(io(rNow), { cents: true })} − ${money(io(rBefore), { cents: true })}`);
  }
  const dn = out.paymentNext.shown - out.paymentNow.shown;
  out.deltaNext = v(io(rNext) - io(rNow), dn, money(dn, { sign: true }), `${out.paymentNext.text} − ${out.paymentNow.text} (shown figures)`);
  const per100k = (100000 * step) / 100 / 12;
  out.per100k = v(per100k, Math.round(per100k), money(Math.round(per100k)), `$100,000 × ${pct(step)} ÷ 12 = ${money(per100k, { cents: true })}`);
  out.per100kC = v(per100k, r2(per100k), money(per100k, { cents: true }), out.per100k.working);
  out.months = v(months, months, String(months), 'Payments counted');
  // Totals use the exact payment (then round), so $433.33 x 12 shows $5,200, not $5,196.
  const paid = Math.round(io(rNow) * months);
  out.paidIO = v(io(rNow) * months, paid, money(paid), `${money(io(rNow), { cents: true })} × ${months} = ${money(io(rNow) * months, { cents: true })}`);
  out.balanceIO = v(P, P, money(P), 'Interest-only payments leave the balance unchanged');
  out.principalIO = v(0, 0, money(0), 'Principal repaid on interest-only payments');

  if (i.customPayment) {
    const pay = i.customPayment;
    let bal = P, interest = 0;
    const series = [P];
    for (let m = 0; m < months; m++) {
      const it = (bal * rNow) / 100 / 12;
      interest += it;
      bal -= pay - it;
      series.push(r2(bal));
    }
    const principalPaid = P - bal;
    // Shown parts must add up to the shown total (largest remainder on whole dollars).
    const total = pay * months;
    const pShown = Math.round(principalPaid);
    const iShown = total - pShown;
    out.customPayment = v(pay, pay, money(pay), 'Self-set monthly payment');
    out.paidCustom = v(total, total, money(total), `${money(pay)} × ${months} = ${money(total)}`);
    out.interestCustom = v(interest, iShown, money(iShown), `Sum over ${months} months of balance × ${pct(rNow)} ÷ 12 = ${money(interest, { cents: true })}`);
    out.principalCustom = v(principalPaid, pShown, money(pShown), `${money(total)} paid − ${money(interest, { cents: true })} interest = ${money(principalPaid, { cents: true })} off the balance`);
    out.balanceCustom = v(bal, Math.round(bal), money(Math.round(bal)), `${money(P)} − ${money(principalPaid, { cents: true })} = ${money(bal, { cents: true })}`);
    out.extraCustom = v(pay - out.paymentNow.shown, pay - out.paymentNow.shown, money(pay - out.paymentNow.shown), `${money(pay)} − ${out.paymentNow.text}`);
    out.series = { exact: series, shown: series.map(Math.round), text: '', working: `Month-end balances at ${pct(rNow)}, payment ${money(pay)}` };
  }
  // Ladder: the same 0.25% on several balances (for a "per $100K" rule-of-thumb visual).
  if (Array.isArray(i.ladder)) {
    i.ladder.forEach((b, k) => {
      const d = (b * step) / 100 / 12;
      out[`ladder${k}`] = v(d, Math.round(d), money(Math.round(d), { sign: true }), `${money(b)} × ${pct(step)} ÷ 12 = ${money(d, { cents: true })}`, { label: `${money(b / 1000)}K` });
      out[`ladderBal${k}`] = v(b, b, money(b), 'Balance');
    });
  }
  return out;
}

// Amortizing comparison (Canadian semi-annual compounding by default), via statics maths.
function amortizingCompare(i) {
  const out = {};
  const comp = i.compounding || 'semi-annual';
  i.rates.forEach((rate, k) => {
    const p = amortPayment({ principal: i.principal, annualPct: rate, amortYears: i.amortYears, compounding: comp });
    out[`payment${k}`] = v(p, Math.round(p), money(Math.round(p)), `${money(i.principal)}, ${pct(rate)}, ${i.amortYears}-yr amortization, ${comp} compounding = ${money(p, { cents: true })}`);
    out[`rate${k}`] = v(rate, rate, pct(rate), 'Rate');
  });
  for (let k = 1; k < i.rates.length; k++) {
    const d = out[`payment${k}`].shown - out.payment0.shown;
    out[`delta${k}`] = v(out[`payment${k}`].exact - out.payment0.exact, d, money(d, { sign: true }), `${out[`payment${k}`].text} − ${out.payment0.text} (shown figures)`);
  }
  out.principal = v(i.principal, i.principal, money(i.principal), 'Mortgage balance');
  return out;
}

const KINDS = { 'heloc-interest-only': helocInterestOnly, 'amortizing-compare': amortizingCompare };

export function runCalc(calc) {
  if (!calc) return { values: {}, audit: [] };
  const fn = KINDS[calc.kind];
  if (!fn) throw new Error(`Unknown calc kind "${calc.kind}". Known: ${Object.keys(KINDS).join(', ')}`);
  const values = fn(calc.inputs || {});
  const audit = Object.entries(values).filter(([k]) => k !== 'series').map(([key, x]) => ({ key, exact: x.exact, shown: x.shown, text: x.text, working: x.working }));
  return { values, audit };
}

// Compare the idea's checked figures with ours. Each expect: { key, shown, claim }.
export function checkExpect(values, expect = []) {
  const problems = [];
  for (const e of expect) {
    const got = values[e.key];
    if (!got) { problems.push(`expect: no computed value "${e.key}" (${e.claim || ''})`); continue; }
    if (Number(got.shown) !== Number(e.shown)) problems.push(`expect ${e.key}: idea says ${e.shown}, calc gives ${got.shown} (${got.working})`);
  }
  return problems;
}

export { money, pct };
