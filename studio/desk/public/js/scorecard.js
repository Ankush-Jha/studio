// SCORECARD: Studio's quality tests over time (studio/evals/history). Overall + one tile per suite with a trend,
// failing/warning chips; #/scorecard/<suite> lists that suite's tests with value vs target and a per-test history chart.
import { h, icon, ago } from './ui.js';

let data = null, loading = null, err = null;
const open = new Set(); // expanded test rows

async function load(force = false) {
  if (loading) return loading;
  if (data && !force) return data;
  loading = fetch('/api/scorecard', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((d) => { data = d; err = null; return d; })
    .catch((e) => { err = e; return null; })
    .finally(() => { loading = null; });
  return loading;
}

export function title({ route }) {
  const sid = route.params[0];
  const s = sid && data?.latest?.suites?.[sid];
  return { title: s ? s.name : 'Scorecard', sub: data?.latest ? `${s ? 'Scorecard · ' : ''}${data.latest.date} · ${data.latest.catalogue?.tests || ''} tests` : '' };
}
export async function onLive(stage, ctx) { await load(true); render(stage, ctx, { quiet: true }); }

export function render(stage, ctx, opts = {}) {
  if (!data) {
    stage.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'edge' }, err ? `Scorecard not reachable: ${err.message}` : 'Loading the scorecard…')));
    load().then((d) => { if (d && location.hash.startsWith('#/scorecard')) { render(stage, ctx); ctx.app.setTop(null); } });
    return;
  }
  const L = data.latest;
  if (!L) {
    stage.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'empty' },
      h('strong', null, 'No scorecard yet.'),
      h('span', null, 'Run studio/.venv/bin/python studio/evals/scorecard.py: it writes studio/evals/history/, and this view fills in live.'))));
    return;
  }
  const sid = ctx.route.params[0];
  const prev = stage.scrollTop;
  const view = sid && L.suites[sid] ? suiteView(sid, ctx) : overview(ctx);
  if (opts.quiet) view.classList.add('noanim'); // in-place refresh: don't replay the screen-enter animation
  stage.replaceChildren(view);
  stage.scrollTop = prev;
}

// ------------------------------------------------------------------ helpers
const band = (v) => (v === null || v === undefined ? 'none' : v >= 80 ? 'good' : v >= 50 ? 'mid' : 'low');
const STATUS_LABEL = { pass: 'Pass', warn: 'Warn', fail: 'Fail', info: 'Info', nodata: 'No data', pending: 'Pending' };
const shortName = (t) => t.name.replace(/^Coverage: (.+)$/, '$1 coverage').replace(/^Time: (.+)$/, '$1 time').replace(/ \(spot-check\)$/, '');

function delta(series) {
  const pts = series.filter((x) => typeof x === 'number');
  if (pts.length < 2) return null;
  return pts[pts.length - 1] - pts[pts.length - 2];
}
function deltaEl(d) {
  if (d === null) return h('span', { class: 'sc-delta flat' }, 'first run');
  if (d === 0) return h('span', { class: 'sc-delta flat' }, '±0 vs last run');
  return h('span', { class: `sc-delta ${d > 0 ? 'up' : 'down'}` }, `${d > 0 ? '▲' : '▼'} ${Math.abs(d)} vs last run`);
}

// SVG charts drawn to scale: x = real date positions, y = fixed 0-100 for scores / test-specific domain for values.
function chart(points, { w = 160, hgt = 36, domain = null, target = null, fail = null, cls = '', dots = true, label = '' } = {}) {
  const pts = points.filter((p) => typeof p.v === 'number' && p.d);
  const svg = h('svg:svg', { class: `sc-chart ${cls}`, viewBox: `0 0 ${w} ${hgt}`, width: w, height: hgt, role: 'img', 'aria-label': label || 'trend', preserveAspectRatio: 'none' });
  const pad = 4;
  const vals = pts.map((p) => p.v);
  let [lo, hi] = domain || [Math.min(0, ...vals, ...(target !== null ? [target] : []), ...(fail !== null ? [fail] : [])), Math.max(...vals, ...(target !== null ? [target] : []), ...(fail !== null ? [fail] : []), 1)];
  if (!domain) hi = hi + (hi - lo) * 0.12;
  if (hi === lo) hi = lo + 1;
  const y = (v) => pad + (hgt - pad * 2) * (1 - (v - lo) / (hi - lo));
  const ts = pts.map((p) => Date.parse(p.d + 'T12:00:00Z'));
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  const x = (t) => (pts.length < 2 || t1 === t0 ? w - pad : pad + (w - pad * 2) * ((t - t0) / (t1 - t0)));
  svg.append(h('svg:line', { class: 'sc-base', x1: 0, x2: w, y1: hgt - 0.5, y2: hgt - 0.5 }));
  if (target !== null && target >= lo && target <= hi) svg.append(h('svg:line', { class: 'sc-target', x1: 0, x2: w, y1: y(target), y2: y(target) }));
  if (fail !== null && fail !== target && fail >= lo && fail <= hi) svg.append(h('svg:line', { class: 'sc-failline', x1: 0, x2: w, y1: y(fail), y2: y(fail) }));
  if (pts.length >= 2) {
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(ts[i]).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    svg.append(h('svg:path', { class: 'sc-area', d: `${d} L${x(ts[ts.length - 1]).toFixed(1)},${hgt} L${x(ts[0]).toFixed(1)},${hgt} Z` }));
    svg.append(h('svg:path', { class: 'sc-line', d }));
  }
  // dots = zero-length round-capped strokes with non-scaling stroke: stay round when the chart stretches to its box
  if (dots) pts.forEach((p, i) => svg.append(h('svg:path', { class: `sc-dot ${p.s || ''}${i === pts.length - 1 ? ' last' : ''}`, d: `M${x(ts[i]).toFixed(1)},${y(p.v).toFixed(1)}h0` }, h('svg:title', null, `${p.d}: ${p.label ?? p.v}`))));
  if (!pts.length) svg.append(h('svg:text', { class: 'sc-none', x: w / 2, y: hgt / 2 + 3, 'text-anchor': 'middle' }, 'no values yet'));
  return svg;
}

function testDomain(t) {
  if (t.unit === '%') return [0, 100];
  if (t.unit === 'score') return t.id.startsWith('creative.variety') ? [0, 1] : [1, 5];
  return null;
}

// ------------------------------------------------------------------ overview
function overview(ctx) {
  const L = data.latest; const idx = data.index || [];
  const overallSeries = idx.map((x) => ({ d: x.date, v: x.overall }));
  const all = Object.values(L.suites).flatMap((s) => s.tests);
  const cnt = (st) => all.filter((t) => t.status === st).length;
  const ob = band(L.overall);
  const head = h('section', { class: 'sc-head' },
    h('div', { class: `sc-overall ${ob}` },
      h('div', { class: 'edge' }, 'Overall'),
      h('div', { class: 'sc-big' }, L.overall ?? '—', h('small', null, '/100')),
      deltaEl(delta(idx.map((x) => x.overall)))),
    h('div', { class: 'sc-trend' },
      h('div', { class: 'sc-trend-h' }, h('span', { class: 'edge' }, `Overall trend · ${idx.length} run${idx.length === 1 ? '' : 's'}`), h('span', { class: 'edge' }, '0–100 scale')),
      chart(overallSeries, { w: 520, hgt: 64, domain: [0, 100], target: 80, fail: 50, cls: 'wide', label: 'Overall score by day' })),
    h('div', { class: 'sc-tally' },
      [['pass', 'pass'], ['warn', 'warn'], ['fail', 'fail'], ['pending', 'pending'], ['nodata', 'no data']].map(([k, lbl]) =>
        h('div', { class: `sc-t ${k}` }, h('b', null, String(cnt(k))), h('span', null, lbl)))));
  const tiles = h('div', { class: 'sc-tiles' }, Object.entries(L.suites).map(([id, s]) => suiteTile(id, s, idx)));
  const notes = (L.notes || []).length ? h('div', { class: 'sc-notes' }, L.notes.map((n) => h('div', null, icon('alert'), h('span', null, n)))) : null;
  return h('div', { class: 'screen sc' }, head,
    h('div', { class: 'sect-h' }, h('h2', null, 'Suites'), h('span', { class: 'edge' }, `run ${ago(L.at)} ago · weights shown on each tile · click a suite for its tests`)),
    tiles,
    reviewPanel(),
    notes,
    h('div', { class: 'edge sc-foot' }, `studio/evals/history/${L.date}.json · catalogue studio/evals/tests.json · TESTS.md explains every test`));
}

function suiteTile(id, s, idx) {
  const series = idx.map((x) => ({ d: x.date, v: x.suites?.[id] ?? null }));
  const runs = series.filter((p) => typeof p.v === 'number').length;
  const bad = s.tests.filter((t) => t.status === 'fail');
  const warn = s.tests.filter((t) => t.status === 'warn');
  const c = s.counts || {};
  const b = band(s.score);
  return h('a', { class: `sc-tile ${b}`, href: `#/scorecard/${id}`, title: s.question || '' },
    h('div', { class: 'sc-tile-h' }, h('h3', null, s.name), h('span', { class: 'sc-score' }, s.score ?? '—')),
    h('div', { class: 'sc-tile-q' }, s.question || ''),
    h('div', { class: 'sc-tile-chart' }, chart(series, { w: 240, hgt: 34, domain: [0, 100], cls: 'tile', label: `${s.name} score by day` }), runs === 1 ? h('span', { class: 'edge sc-first' }, 'first run · trend starts next run') : null),
    h('div', { class: 'sc-chips' },
      bad.map((t) => h('span', { class: 'sc-chip fail', title: `${t.name}: ${t.display} (target ${t.targetText})` }, shortName(t))),
      warn.map((t) => h('span', { class: 'sc-chip warn', title: `${t.name}: ${t.display} (target ${t.targetText})` }, shortName(t))),
      !bad.length && !warn.length ? h('span', { class: `sc-chip ${s.score === null ? 'idle' : 'ok'}` }, s.score === null ? 'nothing scored yet' : 'all scored tests pass') : null),
    h('div', { class: 'edge sc-tile-f' }, `${s.tests.length} tests · ${c.pass || 0} pass · ${c.warn || 0} warn · ${c.fail || 0} fail${(c.pending || 0) + (c.nodata || 0) ? ` · ${(c.pending || 0) + (c.nodata || 0)} waiting` : ''} · w ${s.weight}`));
}

function reviewPanel() {
  const rv = data.review;
  const spot = Object.values(data.latest.suites).flatMap((s) => s.tests).filter((t) => t.method === 'spot');
  const body = rv && rv.rows.length
    ? h('div', { class: 'sc-review' }, rv.rows.map((r) => {
        const t = spot.find((x) => x.id === r.test);
        return h('div', { class: 'sc-rrow' },
          h('span', { class: `sc-dot-i ${t?.status || 'info'}` }),
          h('div', null, h('b', null, t?.name || r.test), h('div', { class: 'mono faint sc-id' }, r.test)),
          h('div', { class: 'sc-rval' }, typeof r.value === 'number' ? `${r.value}%` : String(r.value ?? '—')),
          h('div', null, h('div', null, r.verdict || ''), r.notes ? h('div', { class: 'faint' }, r.notes) : null,
            (r.sample || []).length ? h('div', { class: 'edge' }, `sample: ${r.sample.slice(0, 6).join(' · ')}${r.sample.length > 6 ? ' …' : ''}`) : null));
      }))
    : h('div', { class: 'empty' },
        h('strong', null, 'No orchestrator review yet.'),
        h('span', null, `${spot.length} spot-checks are pending: ${spot.map((t) => shortName(t)).join(', ')}. The orchestrator writes studio/evals/reviews/<date>.json ([{test, value, sample, verdict, notes}]) and this panel fills in live.`));
  return h('section', null,
    h('div', { class: 'sect-h' }, h('h2', null, 'Latest orchestrator review'), h('span', { class: 'edge' }, rv ? `reviews/${rv.date}.json` : 'reviews/ is empty')),
    body);
}

// ------------------------------------------------------------------ suite detail
function suiteView(sid, ctx) {
  const L = data.latest; const s = L.suites[sid];
  const idx = data.index || [];
  const cat = data.catalogue?.tests || {};
  const order = { fail: 0, warn: 1, pending: 2, nodata: 3, pass: 4, info: 5 };
  const tests = [...s.tests].sort((a, b) => (order[a.status] - order[b.status]) || 0);
  const rows = tests.map((t) => testRow(t, cat[t.id], ctx));
  const nav = h('div', { class: 'sc-suitenav' }, Object.entries(L.suites).map(([id, x]) =>
    h('a', { href: `#/scorecard/${id}`, class: `sc-pill ${band(x.score)}`, 'aria-current': id === sid ? 'page' : null }, x.name, h('b', null, x.score ?? '—'))));
  return h('div', { class: 'screen sc' },
    h('div', { class: 'sc-crumb' }, h('a', { href: '#/scorecard', class: 'btn sm ghost' }, icon('left'), 'All suites'), nav),
    h('section', { class: 'sc-head suite' },
      h('div', { class: `sc-overall ${band(s.score)}` }, h('div', { class: 'edge' }, s.name), h('div', { class: 'sc-big' }, s.score ?? '—', h('small', null, '/100')), deltaEl(delta(idx.map((x) => x.suites?.[sid] ?? null)))),
      h('div', { class: 'sc-trend' },
        h('div', { class: 'sc-trend-h' }, h('span', { class: 'edge' }, s.question || ''), h('span', { class: 'edge' }, `weight ${s.weight} in overall`)),
        chart(idx.map((x) => ({ d: x.date, v: x.suites?.[sid] ?? null })), { w: 520, hgt: 64, domain: [0, 100], target: 80, fail: 50, cls: 'wide', label: `${s.name} score by day` }))),
    h('div', { class: 'sc-table', role: 'table', 'aria-label': `${s.name} tests` },
      h('div', { class: 'sc-tr sc-th', role: 'row' }, ['', 'Test', 'Value', 'Target', 'Fail', 'History', ''].map((x) => h('span', { role: 'columnheader' }, x))),
      rows));
}

function testRow(t, c, ctx) {
  const series = (data.series?.[t.id] || []).map((p) => ({ d: p.date, v: p.value, s: p.status }));
  const isOpen = open.has(t.id);
  const scale = { domain: testDomain(t), target: typeof t.target === 'number' ? t.target : null, fail: typeof t.fail === 'number' ? t.fail : null };
  const toggle = () => { if (open.has(t.id)) open.delete(t.id); else open.add(t.id); render(document.getElementById('stage'), ctx, { quiet: true }); };
  const row = h('div', { class: `sc-tr ${t.status}${isOpen ? ' open' : ''}`, role: 'row', tabindex: 0, onclick: toggle, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } } },
    h('span', { class: `sc-st ${t.status}`, title: STATUS_LABEL[t.status] }, STATUS_LABEL[t.status]),
    h('span', { class: 'sc-name' }, h('b', null, t.name), h('span', { class: 'mono faint sc-id' }, `${t.id} · ${({ auto: 'automatic', spot: 'spot-check', user: 'user signal', monthly: 'monthly' })[t.method] || t.method}`)),
    h('span', { class: 'sc-val' }, t.display),
    h('span', { class: 'sc-tgt' }, t.targetText || '—'),
    h('span', { class: 'sc-fl' }, t.failText || '—'),
    h('span', { class: 'sc-hist' }, t.direction === 'none' && !series.some((p) => typeof p.v === 'number') ? h('span', { class: 'faint' }, 'info') : chart(series, { w: 150, hgt: 30, ...scale, label: `${t.name} history` })),
    h('span', { class: 'sc-more' }, icon(isOpen ? 'minus' : 'plus')),
    h('span', { class: 'sc-detail' }, t.detail));
  if (!isOpen) return row;
  const big = h('div', { class: 'sc-x' },
    h('div', { class: 'sc-x-chart' },
      h('div', { class: 'edge' }, `History · ${series.length} run${series.length === 1 ? '' : 's'}${scale.target !== null ? ' · green dashes = target' : ''}${scale.fail !== null && scale.fail !== scale.target ? ' · red dashes = fail line' : ''}`),
      chart(series, { w: 460, hgt: 110, ...scale, cls: 'big', label: `${t.name} history, larger` }),
      h('div', { class: 'sc-x-axis edge' }, h('span', null, series[0]?.d || ''), h('span', null, series.length > 1 ? series[series.length - 1].d : ''))),
    c ? h('dl', { class: 'kv sc-x-kv' },
      h('dt', null, 'Measures'), h('dd', null, c.measures),
      h('dt', null, 'How'), h('dd', null, c.computed),
      h('dt', null, 'Why it matters'), h('dd', null, c.why),
      h('dt', null, 'Thresholds'), h('dd', null, `pass ${c.thresholds?.pass || '—'} · warn ${c.thresholds?.warn || '—'} · fail ${c.thresholds?.fail || '—'}`)) : null);
  return h('div', { class: 'sc-group' }, row, big);
}
