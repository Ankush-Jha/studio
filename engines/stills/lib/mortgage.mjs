// Canadian mortgage payment maths.
// Fixed-rate mortgages in Canada compound semi-annually (Interest Act s.6), so the
// effective monthly rate is (1 + j/2)^(1/6) - 1. Most variable mortgages compound
// monthly; specs choose explicitly with `compounding`.

export function periodicRate(annualPct, compounding = 'semi-annual', paymentsPerYear = 12) {
  const j = annualPct / 100;
  const perYear = { 'semi-annual': 2, monthly: 12, annual: 1 }[compounding];
  if (!perYear) throw new Error(`Unknown compounding: ${compounding}`);
  return (1 + j / perYear) ** (perYear / paymentsPerYear) - 1;
}

export function payment({ principal, annualPct, amortYears, compounding = 'semi-annual', paymentsPerYear = 12 }) {
  const r = periodicRate(annualPct, compounding, paymentsPerYear);
  const n = amortYears * paymentsPerYear;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - (1 + r) ** -n);
}

// Compare a list of rates; returns exact and display-rounded values plus deltas
// computed from the *rounded* figures so the slide never shows sums that don't add up.
export function compare({ principal, amortYears, compounding = 'semi-annual', rates }) {
  const rows = rates.map((annualPct) => {
    const exact = payment({ principal, annualPct, amortYears, compounding });
    return { annualPct, exact: +exact.toFixed(4), shown: Math.round(exact) };
  });
  const base = rows[0];
  rows.forEach((row) => {
    row.deltaShown = row.shown - base.shown;
    row.deltaExact = +(row.exact - base.exact).toFixed(4);
    row.yearlyShown = row.deltaShown * 12;
  });
  return { principal, amortYears, compounding, rows };
}

// Minimum down payment on a purchase (federal rules in force since Dec 15, 2024):
// 5% of the first $500,000 plus 10% of the part above it, up to a $1.5M price.
// At $1.5M and up an insured mortgage isn't available, so 20% applies.
// Amounts are exact to the cent; display rounding happens in the chart.
export function minDownPayment(price, { tier = 500000, cap = 1500000 } = {}) {
  const cents = (n) => Math.round(n * 100) / 100;
  if (price >= cap) return { insurable: false, exact: cents(price * 0.2), parts: [{ pct: 20, base: price, exact: cents(price * 0.2), basis: 'all' }] };
  const parts = [{ pct: 5, base: Math.min(price, tier), basis: 'first' }];
  if (price > tier) parts.push({ pct: 10, base: price - tier, basis: 'next' });
  parts.forEach((p) => { p.exact = cents((p.base * p.pct) / 100); });
  return { insurable: true, exact: cents(parts.reduce((s, p) => s + p.exact, 0)), parts };
}

export const money = (n, { cents = false } = {}) =>
  '$' + Number(n).toLocaleString('en-CA', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
