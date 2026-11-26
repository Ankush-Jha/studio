// Studio Desk app shell: state store, hash router, rail, top bar, ticker, toasts, SSE, keys, drawer.
import { h, icon, clock, slugName, ago } from './ui.js';
import * as flow from './flow.js';
import * as radar from './radar.js';
import * as clients from './clients.js';
import * as library from './library.js';
import * as job from './job.js';
import * as batch from './batch.js';
import * as runnerUI from './runner.js';
import * as scorecard from './scorecard.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage'), rail = $('rail'), top = $('top'), ticker = $('ticker'), drawerEl = $('drawer'), toasts = $('toasts');

const SCREENS = {
  flow: { mod: flow, nav: 'flow', deps: ['jobs', 'kits', 'library', 'radar'] },
  radar: { mod: radar, nav: 'radar', deps: ['radar', 'kits'] },
  clients: { mod: clients, nav: 'clients', deps: ['kits', 'library'] },
  library: { mod: library, nav: 'library', deps: ['library', 'kits'] },
  gates: { mod: job, nav: 'gates', deps: ['jobs', 'kits'] },
  job: { mod: job, nav: 'gates', deps: ['jobs'] },
  batch: { mod: batch, nav: 'batch', deps: ['jobs', 'kits'] },
  scorecard: { mod: scorecard, nav: 'scorecard', deps: ['evals'] },
};
const NAV = [
  { id: 'flow', label: 'Flow', ic: 'flow', key: 'f', href: '#/flow' },
  { id: 'radar', label: 'Radar', ic: 'radar', key: 'r', href: '#/radar' },
  { id: 'clients', label: 'Clients', ic: 'clients', key: 'c', href: '#/clients' },
  { id: 'library', label: 'Library', ic: 'library', key: 'l', href: '#/library' },
  { id: 'gates', label: 'Gates', ic: 'gate', key: 'g', href: '#/gates' },
  { id: 'batch', label: 'Batch', ic: 'batch', key: 'b', href: '#/batch' },
  { id: 'scorecard', label: 'Scorecard', ic: 'gauge', key: 's', href: '#/scorecard' },
];

export const app = {
  state: null,
  route: { name: 'flow', params: [] },
  sse: 'connecting',
  toast, navigate, refresh, openDrawer, closeDrawer, setTop,
  runListeners: new Set(),
  newPiece: (prefill) => runnerUI.openNewPiece(app, prefill || {}),
  openRunner: () => runnerUI.openRunnerDrawer(app),
};
window.__desk = app;

// ------------------------------------------------------------------ routing
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const name = SCREENS[parts[0]] ? parts[0] : 'flow';
  const q = Object.fromEntries(new URLSearchParams(query || ''));
  return { name, params: parts.slice(1), query: q };
}
function navigate(hash) { if (location.hash !== hash) location.hash = hash; else render(); }
window.addEventListener('hashchange', () => { closeDrawer(); render(true); });

// ------------------------------------------------------------------ data
let refreshing = null;
async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      app.state = await res.json();
    } catch (e) {
      if (!app.state) stage.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'empty' }, h('strong', null, 'The Desk server is not answering.'), h('span', null, `Start it with studio/desk/start.sh, then reload. (${e.message})`))));
      throw e;
    } finally { refreshing = null; }
  })();
  return refreshing;
}

// ------------------------------------------------------------------ chrome
function counts(s) {
  const jobs = s?.jobs || [];
  const waiting = jobs.filter((j) => j.status === 'gate1' || j.status === 'gate2').length;
  const active = jobs.filter((j) => !['approved', 'delivered', 'parked', 'failed'].includes(j.status)).length;
  return {
    flow: active, radar: s?.radar?.summary?.posts ?? 0, clients: s?.kits?.items?.length ?? 0, library: s?.library?.cards?.length ?? 0,
    gates: waiting, batch: jobs.filter((j) => j.status === 'gate1').length,
    scorecard: s?.scorecard?.overall ?? 0,
  };
}
function renderRail() {
  const s = app.state; const c = counts(s);
  const cur = SCREENS[app.route.name]?.nav;
  const nightly = s?.system?.nightly;
  const phases = nightly?.phases || [];
  rail.replaceChildren(
    h('a', { class: 'brand', href: '#/flow', 'aria-label': 'Studio Desk home' },
      brandMark(),
      h('div', { class: 'brand-name' }, 'Studio', h('small', null, 'DESK · CONTROL'))),
    h('button', { class: 'newpiece', title: 'New piece (N)', onclick: () => app.newPiece(), 'data-keep-drawer': '' }, icon('plus'), h('span', { class: 'lbl' }, 'New piece'), h('span', { class: 'kbd' }, 'N')),
    h('div', { class: 'nav' }, NAV.map((n) => h('a', { href: n.href, 'aria-current': cur === n.id ? 'page' : null, title: `${n.label} (${n.key.toUpperCase()})` },
      icon(n.ic), h('span', { class: 'lbl' }, n.label),
      h('span', { class: `count ${n.id === 'gates' && c.gates ? 'hot' : ''}` }, c[n.id] ? String(c[n.id]) : '')))),
    nightly ? h('div', { class: 'rail-sec' },
      h('div', { class: 'rail-h' }, h('span', null, 'Nightly'), h('span', null, nightly.date?.slice(5) || '')),
      h('div', { class: 'phases', style: { gridTemplateColumns: `repeat(${Math.max(phases.length, 1)}, 1fr)` } }, phases.map((p) => h('i', { class: p.status, title: `${p.id}: ${p.status}` }))),
      h('div', { class: 'rail-small' }, h('b', null, `${phases.filter((p) => p.status === 'done').length}/${phases.length} phases`), nightly.finished ? ` · finished ${ago(nightly.finished)} ago` : ' · running'),
    ) : null,
    s ? h('div', { class: 'rail-sec' },
      h('div', { class: 'rail-h' }, h('span', null, 'Feedback'), h('span', null, String(s.feedback?.count ?? 0))),
      h('div', { class: 'rail-small' }, 'Gate decisions logged to ', h('b', null, 'library/feedback.jsonl'))) : null,
    h('div', { class: 'rail-foot' },
      h('span', { class: `live ${app.sse === 'open' ? 'on' : app.sse === 'closed' ? 'off' : ''}`, title: app.sse === 'open' ? 'Live: watching jobs, kits, library, radar' : 'Reconnecting' }, h('i'), h('span', null, app.sse === 'open' ? 'Live' : 'Offline')),
      h('button', { class: 'ibtn', title: 'Keyboard shortcuts (?)', onclick: showKeys }, icon('keyboard')),
      h('button', { class: 'ibtn', title: 'Theme (T)', onclick: toggleTheme }, icon(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun'))),
  );
}
function brandMark() {
  return h('svg:svg', { class: 'brand-mark', viewBox: '0 0 26 26', 'aria-hidden': 'true' },
    h('svg:rect', { x: 0.5, y: 0.5, width: 25, height: 25, fill: 'none', stroke: 'currentColor', 'stroke-opacity': '.35' }),
    h('svg:rect', { x: 5, y: 7, width: 16, height: 2.6, fill: '#3FD08F' }),
    h('svg:rect', { x: 5, y: 11.7, width: 11, height: 2.6, fill: '#F5B83D' }),
    h('svg:rect', { x: 5, y: 16.4, width: 7, height: 2.6, fill: 'currentColor' }));
}
let topExtra = null;
function setTop(extra) { topExtra = extra; renderTop(); }
function renderTop() {
  const scr = SCREENS[app.route.name];
  const t = scr.mod.title ? scr.mod.title(ctx()) : { title: app.route.name };
  top.replaceChildren(...[
    h('div', { class: 'crumb' }, h('h1', null, t.title), t.sub ? h('span', { class: 'sub' }, t.sub) : null),
    t.sample ? h('span', { class: 'sample-badge', title: 'Real data for this view does not exist yet; showing fixtures from studio/desk/fixtures' }, 'Sample') : null,
    h('div', { class: 'spacer' }),
    topExtra || null,
    igChip(),
    app.state ? runnerUI.runnerChip(app) : null,
    h('button', { class: 'ibtn top-new', title: 'New piece (N)', 'aria-label': 'New piece', onclick: () => app.newPiece(), 'data-keep-drawer': '' }, icon('plus')),
    h('span', { class: 'top-meta' }, app.state ? `Synced ${clock(app.state.at)}` : ''),
  ].filter(Boolean));
}

function igChip() {
  const ig = app.state?.radar?.status?.sources?.instagram;
  if (!ig) return null;
  const exp = ig.expiresAt ? Date.parse(ig.expiresAt) : NaN;
  const expired = ig.ok === false || (Number.isFinite(exp) && exp <= Date.now());
  if (!expired) return null;
  return h('a', { class: 'rchip fail', href: '#/radar', title: `${ig.error || 'Instagram token expired'}\nRadar keeps the posts it has; new Instagram posts stop until you reconnect (studio/radar/SETUP.md, Part B).` }, h('i'), h('span', { class: 'l' }, 'Instagram token expired'), h('span', { class: 's' }, 'reconnect'));
}

// ------------------------------------------------------------------ ticker (edge print)
function renderTicker() {
  const s = app.state; if (!s) return;
  const items = [];
  for (const j of s.jobs || []) for (const l of j.log || []) items.push({ ...l, job: j.id, client: j.client });
  items.sort((a, b) => String(b.t).localeCompare(String(a.t)));
  const top20 = items.slice(0, 24);
  const nightly = s.system?.nightly;
  if (nightly) top20.push({ t: nightly.finished || nightly.started, node: 'nightly', msg: `${nightly.date} research run: ${nightly.phases.filter((p) => p.status === 'done').length}/${nightly.phases.length} phases`, client: null });
  const mk = (it) => h('a', { class: 'tick-item', href: it.job ? `#/flow/${encodeURIComponent(it.job)}` : '#/flow' },
    h('em', null, clock(it.t)), h('b', null, it.client ? slugName(it.client, s) : 'System'), h('em', null, it.node || ''), h('span', null, it.msg || ''));
  const track = h('div', { class: 'tick-track', style: { '--dur': `${Math.max(40, top20.length * 7)}s` } }, top20.map(mk), top20.map(mk));
  ticker.replaceChildren(h('div', { class: 'tick-label' }, h('i'), 'Activity'), h('div', { class: 'tick-run' }, track));
}

// ------------------------------------------------------------------ drawer
let drawerKey = null;
function openDrawer(build, { wide = false, key = null } = {}) {
  drawerKey = key;
  drawerEl.classList.toggle('wide', wide);
  drawerEl.replaceChildren(...[].concat(build()).filter(Boolean));
  drawerEl.classList.add('open'); drawerEl.setAttribute('aria-hidden', 'false');
  drawerEl.focus({ preventScroll: true });
}
function closeDrawer() {
  if (!drawerEl.classList.contains('open')) return;
  drawerEl.classList.remove('open'); drawerEl.setAttribute('aria-hidden', 'true'); drawerKey = null;
  drawerEl.querySelectorAll('video').forEach((v) => v.pause());
  app.onDrawerClose?.(); app.onDrawerClose = null;
}
app.drawerKey = () => drawerKey;

// ------------------------------------------------------------------ toasts
function toast(msg, kind = 'info', label) {
  const t = h('div', { class: `toast ${kind}` }, h('span', { class: 'k' }, label || (kind === 'err' ? 'Error' : kind === 'ok' ? 'Done' : 'Live')), h('span', null, msg));
  toasts.appendChild(t);
  while (toasts.children.length > 4) toasts.firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, kind === 'err' ? 6000 : 3400);
}

// ------------------------------------------------------------------ render
function ctx() { return { state: app.state, route: app.route, app }; }
let lastScreen = null;
function render(routeChanged = false) {
  app.route = parseHash();
  const scr = SCREENS[app.route.name];
  if (routeChanged || lastScreen !== app.route.name) { topExtra = null; stage.scrollTop = 0; }
  lastScreen = app.route.name;
  renderRail(); renderTop(); renderTicker();
  if (!app.state) return;
  stage.style.overflow = '';
  try { scr.mod.render(stage, ctx(), { routeChanged }); }
  catch (e) { console.error(e); stage.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'empty' }, h('strong', null, 'This view hit an error.'), h('span', { class: 'mono' }, String(e.message))))); }
  renderTop();
}

// ------------------------------------------------------------------ SSE
let sseTimer = null; const pendingTypes = new Map();
function connectSSE() {
  const es = new EventSource('/events');
  es.addEventListener('hello', () => { app.sse = 'open'; renderRail(); });
  es.addEventListener('update', (e) => {
    let ev; try { ev = JSON.parse(e.data); } catch { return; }
    pendingTypes.set(`${ev.type}:${ev.id || ''}`, ev);
    clearTimeout(sseTimer);
    sseTimer = setTimeout(async () => {
      const evs = [...pendingTypes.values()]; pendingTypes.clear();
      try { await refresh(); } catch { return; }
      const types = new Set(evs.map((x) => x.type));
      for (const x of evs.slice(0, 3)) toast(describe(x), 'info', x.type);
      if (evs.length > 3) toast(`${evs.length - 3} more updates`, 'info', 'live');
      const deps = SCREENS[app.route.name].deps;
      const affected = deps.some((d) => types.has(d));
      renderRail(); renderTicker();
      if (affected) { const mod = SCREENS[app.route.name].mod; if (mod.onLive) mod.onLive(stage, ctx(), evs); else render(); }
    }, 250);
  });
  es.addEventListener('runner', (e) => {
    let st; try { st = JSON.parse(e.data); } catch { return; }
    if (!app.state) return;
    const prev = app.state.runner;
    app.state.runner = st;
    renderTop();
    if (drawerKey === 'runner') runnerUI.openRunnerDrawer(app);
    const changed = !prev || prev.state !== st.state || prev.current?.id !== st.current?.id || prev.current?.jobId !== st.current?.jobId || (prev.queued || []).length !== (st.queued || []).length;
    if (changed) {
      const mod = SCREENS[app.route.name].mod;
      if (mod.onRunner) mod.onRunner(stage, ctx(), st); else if (app.route.name === 'flow') render();
    }
    if (prev?.current && (!st.current || st.current.id !== prev.current.id)) {
      const fin = (st.history || []).find((x) => x.id === prev.current.id);
      if (fin) toast(`${fin.status === 'done' ? 'Finished' : fin.status === 'waiting' ? 'Paused for usage reset' : fin.status}: ${fin.text || fin.label}`, fin.status === 'done' ? 'ok' : fin.status === 'waiting' ? 'info' : 'err', 'Runner');
      else if (st.waiting?.id === prev.current.id) toast(`Paused for the usage reset: retry at ${new Date(st.waiting.retryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, 'info', 'Runner');
    }
  });
  es.addEventListener('run', (e) => {
    let ev; try { ev = JSON.parse(e.data); } catch { return; }
    if (app.state?.runner?.current && app.state.runner.current.id === ev.run) { app.state.runner.current.lastLine = `${ev.line.agent}: ${ev.line.msg}`; }
    for (const fn of [...app.runListeners]) { try { fn(ev); } catch (err) { console.error(err); } }
  });
  es.onerror = () => { app.sse = 'closed'; renderRail(); };
  es.onopen = () => { app.sse = 'open'; renderRail(); };
}
function describe(ev) {
  const id = ev.id ? String(ev.id) : '';
  if (ev.type === 'jobs') return id ? `Job ${id} changed` : 'Jobs changed';
  if (ev.type === 'kits') return id && !id.startsWith('_') ? `Kit ${slugName(id, app.state)} updated` : 'Kits updated';
  if (ev.type === 'library') return id === 'feedback' ? 'Feedback logged' : 'Library updated';
  if (ev.type === 'radar') return id === 'posts' ? 'Radar posts updated' : 'Radar updated';
  if (ev.type === 'evals') return id === 'reviews' ? 'Orchestrator review added' : 'Scorecard updated';
  return `${ev.type} updated`;
}

// ------------------------------------------------------------------ keys + theme
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('desk-theme', next); } catch { /* */ }
  renderRail();
}
function showKeys() {
  const k = $('keys');
  k.replaceChildren(h('div', { class: 'pane', role: 'dialog', 'aria-label': 'Keyboard shortcuts' },
    h('h3', null, 'Shortcuts'),
    h('dl', null,
      ...NAV.flatMap((n) => [h('dt', null, h('span', { class: 'kbd' }, n.key.toUpperCase())), h('dd', null, n.label)]),
      h('dt', null, h('span', { class: 'kbd' }, 'N')), h('dd', null, 'New piece: queue /create on the runner'),
      h('dt', null, h('span', { class: 'kbd' }, '/')), h('dd', null, 'Search or filter on this screen'),
      h('dt', null, h('span', { class: 'kbd' }, 'A'), ' ', h('span', { class: 'kbd' }, 'B'), ' ', h('span', { class: 'kbd' }, 'C')), h('dd', null, 'Gate 1: select concept'),
      h('dt', null, h('span', { class: 'kbd' }, '0')), h('dd', null, 'Flow: fit the canvas'),
      h('dt', null, h('span', { class: 'kbd' }, 'T')), h('dd', null, 'Light / dark'),
      h('dt', null, h('span', { class: 'kbd' }, 'Esc')), h('dd', null, 'Close panel'),
    )));
  k.hidden = false;
  k.onclick = (e) => { if (e.target === k) k.hidden = true; };
}
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (e.key === 'Escape') { if (!$('keys').hidden) { $('keys').hidden = true; return; } closeDrawer(); return; }
  if (['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const nav = NAV.find((n) => n.key === k);
  const mod = SCREENS[app.route.name].mod;
  if (mod.onKey && mod.onKey(e, ctx()) === true) { e.preventDefault(); return; }
  if (nav) { e.preventDefault(); navigate(nav.href); return; }
  if (k === 'n') { e.preventDefault(); app.newPiece(); return; }
  if (k === 't') { toggleTheme(); return; }
  if (k === '?') { showKeys(); return; }
  if (k === '/') { const s = stage.querySelector('input[type="search"]'); if (s) { e.preventDefault(); s.focus(); } }
});
drawerEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
document.addEventListener('pointerdown', (e) => {
  if (!drawerEl.classList.contains('open')) return;
  if (drawerEl.contains(e.target) || e.target.closest('.lightbox, .toast, .keys')) return;
  if (e.target.closest('[data-keep-drawer]')) return;
  closeDrawer();
});

// ------------------------------------------------------------------ boot
(async function boot() {
  app.route = parseHash();
  renderRail(); renderTop();
  stage.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'edge' }, 'Loading the desk…')));
  try { await refresh(); } catch { return; }
  render(true);
  connectSSE();
  setInterval(() => { if (document.visibilityState === 'visible') renderTop(); }, 30000);
})();
