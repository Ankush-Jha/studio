// Loose date parsing for listing-page dates in English and French.
const EN = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const UNIT_MS = { second: 1e3, minute: 6e4, min: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6, year: 31536e6 };
const FR_UNIT = { seconde: 'second', minute: 'minute', heure: 'hour', jour: 'day', semaine: 'week', mois: 'month', an: 'year', 'année': 'year' };
const FR = { janvier: 0, 'février': 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, 'août': 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, 'décembre': 11, decembre: 11 };

export function parseLooseDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = str.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // relative: "2 days ago", "3 weeks ago", "il y a 2 jours" (approximate, relative to now)
  m = str.toLowerCase().match(/^(\d+|an?) (second|minute|min|hour|day|week|month|year)s? ago/);
  if (m) return new Date(Date.now() - (/^\d/.test(m[1]) ? +m[1] : 1) * UNIT_MS[m[2]]);
  m = str.toLowerCase().match(/^il y a (\d+|une?) (seconde|minute|heure|jour|semaine|mois|année|an)s?/);
  if (m) return new Date(Date.now() - (/^\d/.test(m[1]) ? +m[1] : 1) * UNIT_MS[FR_UNIT[m[2]]]);
  // "November 5, 2026", "Nov. 5 2026", "5 November 2026" as UTC calendar dates (no timezone shift)
  m = str.toLowerCase().match(/^([a-z]{3,9})\.? (\d{1,2}),? (\d{4})/);
  if (m && EN[m[1].slice(0, 3)] != null) return new Date(Date.UTC(+m[3], EN[m[1].slice(0, 3)], +m[2]));
  m = str.toLowerCase().match(/^(\d{1,2}) ([a-z]{3,9})\.? (\d{4})/);
  if (m && EN[m[2].slice(0, 3)] != null) return new Date(Date.UTC(+m[3], EN[m[2].slice(0, 3)], +m[1]));
  m = str.toLowerCase().match(/^(1er|\d{1,2}) ([a-zéû]+) (\d{4})/);
  if (m && FR[m[2]] != null) return new Date(Date.UTC(+m[3], FR[m[2]], m[1] === '1er' ? 1 : +m[1]));
  const t = Date.parse(str.replace(/\bSept\b/i, 'Sep'));
  return Number.isNaN(t) ? null : new Date(t);
}

const TEXT_DATE = /\b(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.? \d{1,2},? \d{4}|\d{1,2} (?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) \d{4}|\d{4}-\d{2}-\d{2})\b/g;

export function isoDay(d) { return d ? d.toISOString().slice(0, 10) : null; }

// Newest date a result shows (page published date, feed items, dated links), ignoring
// anything more than 2 days in the future (event dates, typos).
export function newestOf(r) {
  if (!r) return null;
  const limit = Date.now() + 2 * 86400000;
  const cands = [];
  const push = (v, title) => { const d = parseLooseDate(v); if (d && d.getTime() <= limit) cands.push({ d, title }); };
  if (r.published && !(r.items && r.items.length)) push(r.published, r.title);
  for (const i of r.items || []) push(i.published, i.title);
  for (const l of r.links || []) if (l.date) push(l.date, l.text);
  for (const f of r.followed || []) push(f.published, f.title);
  // dates written in the page text (weaker: no title of their own, so a dated link wins a same-day tie)
  if (r.text && !(r.items && r.items.length)) {
    for (const m of String(r.text).slice(0, 12000).matchAll(TEXT_DATE)) push(m[0], null);
  }
  // a page's modified date counts unless it looks generated at request time (within an hour of the fetch)
  if (r.modified && !(r.items && r.items.length)) {
    const md = parseLooseDate(r.modified), fetched = Date.parse(r.fetchedAt || '') || Date.now();
    if (md && Math.abs(fetched - md.getTime()) > 3600000) push(r.modified, r.title);
  }
  // newest first; on the same day prefer the longest title (an article headline over "Ottawa, Ontario")
  const weight = (t) => { t = String(t || ''); return parseLooseDate(t) || /^\d+\s*(min|mins|minutes|sec)\b/i.test(t) || /^[\d:]+$/.test(t) ? 0 : t.length; };
  cands.sort((a, b) => isoDay(b.d).localeCompare(isoDay(a.d)) || weight(b.title) - weight(a.title));
  const best = cands[0];
  if (best && !weight(best.title) && r.title) best.title = r.title;   // "18 mins" / "2:54" -> page title
  return best || null;
}
