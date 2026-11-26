// RUNNER: the top-bar chip, the runner drawer (current run, queue, history, stop), the live run log
// component used on the job page, and the New piece panel that queues /create on the runner.
import { h, icon, api, ago, clock, fileUrl, thumb, faceKids, fmtChip, slugName, kitFor, postThumb, FORMAT_COLOR, PLATFORM_NAME } from './ui.js';

// ------------------------------------------------------------------ helpers
export const lineTime = (t) => (!t ? '' : String(t).includes('T') ? new Date(t).toTimeString().slice(0, 8) : String(t).slice(0, 8));
const AGENT_KIND = { producer: 'k-prod', runner: 'k-sys', guard: 'k-bad' };
export function runnerOf(state) { return state?.runner || { state: 'idle', queued: [], history: [] }; }
function runWho(r, state) {
  if (!r) return '';
  if (r.jobId) { const j = state?.jobs?.find((x) => x.id === r.jobId); return j ? slugName(j.client, state) : r.jobId.replace(/^\d{4}-\d{2}-\d{2}-/, ''); }
  if (r.brief?.group) return `Group ${r.brief.group}`;
  if (r.brief?.client) return slugName(r.brief.client, state);
  return r.label || r.kind;
}
const untilClock = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); };

// ------------------------------------------------------------------ top bar chip
export function runnerChip(app) {
  const s = app.state; const r = runnerOf(s);
  const q = (r.queued || []).length;
  let cls = 'idle', label = 'Runner idle', sub = q ? `${q} queued` : '';
  if (r.state === 'running' || r.state === 'stopping') { cls = 'run'; label = `${r.state === 'stopping' ? 'Stopping' : 'Running'} · ${runWho(r.current, s)}`; }
  else if (r.state === 'waiting') { cls = 'wait'; label = 'Waiting for usage reset'; sub = r.waiting?.retryAt ? `retry ${untilClock(r.waiting.retryAt)}${q ? ` · ${q} queued` : ''}` : sub; }
  else if (q) { cls = 'run'; label = `${q} queued`; sub = ''; }
  const title = r.current ? `${r.current.text || r.current.label}\n${r.current.lastLine || ''}` : r.rate?.fiveHour != null ? `5-hour window ${Math.round(r.rate.fiveHour * 100)}% used` : 'Headless Claude Code runs, one at a time';
  return h('button', { class: `rchip ${cls}`, title, onclick: () => openRunnerDrawer(app), 'data-keep-drawer': '' },
    h('i'), h('span', { class: 'l' }, label), sub ? h('span', { class: 's' }, sub) : null);
}

// ------------------------------------------------------------------ live log component
// liveLog(app, {runId} | {jobId, n}) renders a run's lines and keeps appending while it streams.
export function liveLog(app, { runId = null, jobId = null, n = null, compact = false } = {}) {
  const list = h('div', { class: `runlog ${compact ? 'compact' : ''}`, role: 'log', 'aria-live': 'polite' });
  const empty = h('div', { class: 'faint', style: { padding: '10px 0' } }, 'Waiting for the first line…');
  list.append(empty);
  let last = -1; let loaded = false; const early = [];
  const add = (ls) => {
    if (!ls.length) return;
    empty.remove();
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    for (const l of ls) { if (l.i <= last) continue; last = l.i; list.append(lineRow(l)); }
    if (atBottom || compact) list.scrollTop = list.scrollHeight;
  };
  if (runId) {
    const fn = (ev) => {
      if (!list.isConnected && loaded) { app.runListeners.delete(fn); return; }
      if (ev.run !== runId) return;
      if (loaded) add([ev.line]); else early.push(ev.line);
    };
    app.runListeners.add(fn);
  }
  (async () => {
    try {
      const d = runId ? await api('GET', `/api/runner/lines?run=${encodeURIComponent(runId)}`)
        : jobId && n ? await api('GET', `/api/job/${encodeURIComponent(jobId)}/runs/${n}`) : { lines: [] };
      add(d.lines);
      loaded = true; add(early.sort((a, b) => a.i - b.i));
      if (last < 0) empty.textContent = runId ? 'Waiting for the first line…' : 'No lines in this run.';
    } catch (e) { loaded = true; empty.textContent = `Could not load the run log: ${e.message}`; }
  })();
  return list;
}
function lineRow(l) {
  const k = l.kind === 'guard' || l.kind === 'error' ? 'k-bad' : l.kind === 'node' ? 'k-node' : l.kind === 'result' ? 'k-res' : l.kind === 'agent' || l.kind === 'agent-done' ? 'k-agent' : l.kind === 'system' ? 'k-sys' : AGENT_KIND[l.agent] || '';
  return h('div', { class: `rl ${k}` }, h('span', { class: 't' }, lineTime(l.t)), h('span', { class: 'a' }, l.agent || ''), h('span', { class: 'm' }, l.msg || ''));
}

// ------------------------------------------------------------------ runner drawer
export function openRunnerDrawer(app) {
  const build = () => {
    const s = app.state; const r = runnerOf(s);
    const cur = r.current;
    const secs = [];
    if (cur) {
      secs.push(h('div', { class: 'dr-sec' },
        h('h4', null, cur.stopping ? 'Stopping' : 'Running now'),
        runCard(cur, s, true),
        h('div', { style: { display: 'flex', gap: '6px', margin: '8px 0' } },
          cur.jobId ? h('a', { class: 'btn sm', href: `#/job/${encodeURIComponent(cur.jobId)}?tab=live`, onclick: () => app.closeDrawer() }, icon('eye'), 'Job page · Live') : null,
          h('button', { class: 'btn sm danger', disabled: cur.stopping ? true : null, onclick: async () => { try { await api('POST', '/api/runner/stop'); app.toast('Stop sent: SIGTERM now, SIGKILL in 10 s if needed', 'ok', 'Runner'); } catch (e) { app.toast(e.message, 'err'); } } }, icon('x'), 'Stop run')),
        liveLog(app, { runId: cur.id, compact: true })));
    } else if (r.state === 'waiting' && r.waiting) {
      secs.push(h('div', { class: 'dr-sec' }, h('h4', null, 'Waiting for usage reset'), runCard(r.waiting, s),
        h('div', { class: 'edge', style: { whiteSpace: 'normal', margin: '6px 0' } }, `Retries at ${untilClock(r.waiting.retryAt)} (never sooner than 15 min). The queue waits behind it.`),
        h('button', { class: 'btn sm', onclick: async () => { try { await api('POST', `/api/runner/retry/${r.waiting.id}`); app.toast('Retrying now', 'ok', 'Runner'); } catch (e) { app.toast(e.message, 'err'); } } }, icon('undo'), 'Retry now')));
    } else {
      secs.push(h('div', { class: 'dr-sec' }, h('div', { class: 'empty' }, h('strong', null, 'Nothing running.'), h('span', null, 'New piece (N) or a gate decision queues the next run. One run at a time.'))));
    }
    const q = r.queued || [];
    secs.push(h('div', { class: 'dr-sec' }, h('h4', null, `Queue (${q.length})`), q.length ? h('div', { class: 'runlist' }, q.map((x, i) => h('div', { class: 'runrow' },
      h('span', { class: 'qn' }, String(i + 1).padStart(2, '0')), runCard(x, s),
      h('button', { class: 'ibtn', title: 'Remove from the queue', onclick: async () => { try { await api('POST', `/api/runner/cancel/${x.id}`); app.toast('Removed from the queue', 'ok', 'Runner'); } catch (e) { app.toast(e.message, 'err'); } } }, icon('close'))))) : h('div', { class: 'faint' }, 'Empty.')));
    const hist = r.history || [];
    if (hist.length) secs.push(h('div', { class: 'dr-sec' }, h('h4', null, 'Recent runs'), h('div', { class: 'runlist' }, hist.map((x) => h('div', { class: 'runrow' }, runCard(x, s))))));
    secs.push(h('div', { class: 'dr-sec' }, h('dl', { class: 'kv' },
      h('dt', null, 'Binary'), h('dd', { class: 'mono', style: { fontSize: '11px' } }, r.bin || 'not found'),
      h('dt', null, 'Mode'), h('dd', null, 'headless · dontAsk · own subscription'),
      r.rate?.fiveHour != null ? [h('dt', null, 'Usage'), h('dd', null, `5-hour ${Math.round(r.rate.fiveHour * 100)}% · 7-day ${r.rate.sevenDay != null ? Math.round(r.rate.sevenDay * 100) + '%' : '—'} · ${ago(r.rate.at)} ago`)] : null)));
    return [
      h('div', { class: 'dr-h' }, h('div', null, h('h3', null, 'Runner'), h('div', { class: 'sub' }, 'Claude Code headless, one run at a time')),
        h('button', { class: 'ibtn', title: 'Close (Esc)', onclick: () => app.closeDrawer() }, icon('close'))),
      h('div', { class: 'dr-b' }, secs),
    ];
  };
  app.openDrawer(build, { key: 'runner' });
}
const RUN_STATUS = { queued: 'park', running: 'run', waiting: 'wait', done: 'done', failed: 'fail', stopped: 'fail', cancelled: 'park', interrupted: 'fail' };
export function runCard(x, state, big = false) {
  return h('div', { class: `runcard ${big ? 'big' : ''}` },
    h('div', { class: 'r1' }, h('b', null, runWho(x, state)), h('span', { class: `status ${RUN_STATUS[x.status] || ''}` }, h('i'), x.status === 'waiting' ? 'usage wait' : x.status)),
    h('div', { class: 'cmd' }, x.text || x.label || x.prompt),
    h('div', { class: 'edge' }, [x.kind, x.jobId ? x.jobId : x.kind === 'create' ? 'job not created yet' : null, x.started ? `${clock(x.started)}${x.ended ? '–' + clock(x.ended) : ''}` : `queued ${ago(x.created)} ago`, x.cost != null ? `$${x.cost.toFixed(2)} list` : null, x.attempts > 1 ? `attempt ${x.attempts}` : null].filter(Boolean).join(' · ')),
    x.status === 'running' && x.lastLine && !big ? h('div', { class: 'last' }, x.lastLine) : null,
    (x.status === 'failed' || x.status === 'stopped') && (x.error || x.result) ? h('div', { class: 'last bad' }, x.error || x.result) : null);
}

// ------------------------------------------------------------------ New piece panel
const np = { client: '', group: null, mode: 'client', format: 'graphic reel', topic: '', engine: '', style: '', length: '', angle: '', notes: '', q: '', more: false, opts: null, preview: null, prevT: null };
export async function openNewPiece(app, prefill = {}) {
  Object.assign(np, { topic: '', angle: '', notes: '', style: '', length: '', engine: '' }, prefill);
  if (prefill.group != null) np.mode = 'group';
  else if (prefill.client) { np.mode = 'client'; np.group = null; }
  np.more = !!(prefill.angle || prefill.notes || prefill.engine || prefill.style || prefill.length);
  if (!np.opts) { try { np.opts = await api('GET', '/api/create/options'); } catch (e) { app.toast(`Could not load options: ${e.message}`, 'err'); np.opts = { formats: [], engines: [], groups: [], weekly: null, outliers: [] }; } }
  if (!np.client && np.mode === 'client') np.client = '';
  const draw = () => app.openDrawer(() => panel(app, draw), { wide: true, key: 'newpiece' });
  draw();
  requestPreview(app);
}

function fields() {
  const f = { format: np.format, topic: np.topic, engine: np.engine || undefined, style: np.style || undefined, length: np.length || undefined, angle: np.angle || undefined, notes: np.notes || undefined };
  if (np.mode === 'group') f.group = np.group; else f.client = np.client;
  return f;
}
function requestPreview(app) {
  clearTimeout(np.prevT);
  np.prevT = setTimeout(async () => {
    const el = document.querySelector('.np-preview');
    if (!el) return;
    const missing = np.mode === 'client' && !np.client ? 'Pick a client' : np.mode === 'group' && np.group == null ? 'Pick a group' : np.topic.trim().length < 3 ? 'Write a topic, or pick a suggestion' : null;
    if (missing) {
      np.preview = null; el.classList.remove('bad'); el.querySelector('.why').textContent = missing;
      el.querySelector('code').textContent = '/create …'; document.querySelector('.np-go')?.setAttribute('disabled', ''); return;
    }
    try {
      const d = await api('POST', '/api/create', { ...fields(), dryRun: true });
      np.preview = d;
      el.querySelector('code').textContent = d.text;
      el.querySelector('.full').textContent = d.prompt;
      el.classList.remove('bad'); el.querySelector('.why').textContent = '';
      document.querySelector('.np-go')?.removeAttribute('disabled');
    } catch (e) {
      np.preview = null;
      el.classList.add('bad'); el.querySelector('.why').textContent = e.message;
      el.querySelector('code').textContent = '/create …';
      document.querySelector('.np-go')?.setAttribute('disabled', '');
    }
  }, 180);
}

function panel(app, redraw) {
  const s = app.state; const o = np.opts || {}; const kits = s.kits?.items || [];
  const set = (k, v, rd = false) => { np[k] = v; requestPreview(app); if (rd) redraw(); };
  const r = runnerOf(s);
  const ahead = (r.current ? 1 : 0) + (r.queued || []).length + (r.waiting ? 1 : 0);

  // client
  const q = np.q.trim().toLowerCase();
  const list = kits.filter((k) => !q || `${k.name} ${k.slug} ${k.city} ${k.brokerage?.name || ''}`.toLowerCase().includes(q))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const rows = h('div', { class: 'np-clients', role: 'listbox', 'aria-label': 'Client' }, list.map((k) => h('button', { class: 'np-client', role: 'option', 'aria-selected': np.client === k.slug ? 'true' : 'false', onclick: () => { np.client = k.slug; requestPreview(app); redraw(); } },
    h('span', { class: 'face' }, faceKids(k.photo, k.name, 80)), h('b', null, k.name || k.slug),
    h('span', { class: 'edge' }, [k.city, k.province].filter(Boolean).join(', ')),
    h('span', { class: `grp ${k.group == null ? 'none' : ''}` }, k.group == null ? 'G?' : `G${k.group}`))));
  if (!list.length) rows.append(h('div', { class: 'faint', style: { padding: '10px' } }, 'No client matches.'));
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Find a client: name, city, brokerage', value: np.q, oninput: (e) => { np.q = e.target.value; const pos = e.target.selectionStart; redraw(); const ni = document.querySelector('.np-search'); if (ni) { ni.focus(); ni.setSelectionRange(pos, pos); } } });
  search.classList.add('np-search');
  const groups = o.groups || [];
  const groupPick = h('div', { class: 'np-groups' }, groups.map((g) => {
    const members = kits.filter((k) => k.group === g);
    return h('button', { class: 'np-group', 'aria-pressed': np.group === g ? 'true' : 'false', onclick: () => { np.group = g; requestPreview(app); redraw(); } },
      h('b', null, `Group ${g}`), h('span', { class: 'edge' }, `${members.length} clients · one job each`),
      h('span', { class: 'faces' }, members.slice(0, 7).map((k) => h('span', { class: 'face', title: k.name }, faceKids(k.photo, k.name, 60)))));
  }));
  const clientSec = h('div', { class: 'dr-sec' },
    h('div', { class: 'np-h' }, h('h4', null, 'Who'), h('div', { class: 'seg' },
      h('button', { 'aria-pressed': np.mode === 'client' ? 'true' : 'false', onclick: () => { np.mode = 'client'; requestPreview(app); redraw(); } }, 'One client'),
      h('button', { 'aria-pressed': np.mode === 'group' ? 'true' : 'false', onclick: () => { np.mode = 'group'; if (np.group == null) np.group = groups[0] ?? null; requestPreview(app); redraw(); } }, 'Batch for a group'))),
    np.mode === 'client' ? [search, rows] : groupPick);

  // format
  const fmtSec = h('div', { class: 'dr-sec' }, h('h4', null, 'Format'), h('div', { class: 'np-formats' }, (o.formats || []).map((f) => h('button', { class: 'chip', 'aria-pressed': np.format === f ? 'true' : 'false', onclick: () => set('format', f, true) },
    h('i', { class: 'fsq', style: { background: FORMAT_COLOR[f.replace(/ /g, '-')] || FORMAT_COLOR[f.split(' ').at(-1)] || 'var(--ink-3)' } }), f))));

  // topic + suggestions
  const topicIn = h('input', { class: 'input np-topic', placeholder: 'What is it about? e.g. renewing a 2021 fixed in 2026', maxlength: o.limits?.topic || 200, value: np.topic, oninput: (e) => set('topic', e.target.value) });
  const grp = np.mode === 'group' ? np.group : kitFor(np.client, s)?.group;
  const plan = o.weekly?.posts?.[String(grp)] || [];
  const planAll = !plan.length && o.weekly ? Object.entries(o.weekly.posts || {}).flatMap(([g, l]) => l.slice(0, 2).map((p) => ({ ...p, g }))) : [];
  const useTopic = (t, extra = {}) => { np.topic = String(t).slice(0, o.limits?.topic || 200); Object.assign(np, extra); requestPreview(app); redraw(); };
  const planRows = (plan.length ? plan : planAll).slice(0, 6).map((p) => h('button', { class: 'np-sug', onclick: () => useTopic(p.title, mapFormat(p.format) ? { format: mapFormat(p.format) } : {}) },
    h('b', null, p.title), h('span', null, p.hook), h('span', { class: 'edge' }, `${p.format || ''}${p.g ? ` · G${p.g}` : ''}`)));
  const outRows = (o.outliers || []).slice(0, 6).map((p) => h('button', { class: 'np-sug out', onclick: () => useTopic(`our version of: ${p.hook}`, { notes: np.notes || `radar ${p.id}` }) },
    thumb(postThumb(p), { w: 120 }),
    h('span', { class: 'ox' }, `${p.outlier}×`), h('b', null, p.hook), h('span', { class: 'edge' }, `${p.account || ''} · ${PLATFORM_NAME[p.platform] || ''}`)));
  const topicSec = h('div', { class: 'dr-sec' }, h('h4', null, 'Topic'), topicIn,
    h('div', { class: 'np-sugs' },
      h('div', null, h('div', { class: 'np-sh' }, plan.length ? `This week's plan · G${grp}` : 'This week\'s plan', h('span', null, o.weekly ? `week of ${o.weekly.weekOf}` : 'no plan found')), planRows.length ? planRows : h('div', { class: 'faint' }, 'No weekly plan on file.')),
      h('div', null, h('div', { class: 'np-sh' }, 'Radar outliers', h('span', null, 'top by outlier')), outRows.length ? outRows : h('div', { class: 'faint' }, 'No radar posts yet.'))));

  // optional
  const moreSec = h('details', { class: 'dr-sec np-more', open: np.more ? true : null, ontoggle: (e) => { np.more = e.target.open; } },
    h('summary', null, h('h4', { style: { display: 'inline' } }, 'Optional · engine, style, length, angle, notes')),
    h('div', { class: 'np-grid' },
      h('label', { class: 'field' }, h('span', null, 'Engine'), h('select', { class: 'select', onchange: (e) => set('engine', e.target.value) }, h('option', { value: '' }, 'Let the Strategist pick'), (o.engines || []).map((e) => h('option', { value: e, selected: np.engine === e ? true : null }, e)))),
      h('label', { class: 'field' }, h('span', null, 'Style'), h('input', { class: 'input', placeholder: 'e.g. swiss-motion', maxlength: 40, value: np.style, oninput: (e) => set('style', e.target.value) })),
      h('label', { class: 'field' }, h('span', null, 'Length'), h('input', { class: 'input', placeholder: '30 or 7 slides', maxlength: 12, value: np.length, oninput: (e) => set('length', e.target.value) })),
      h('label', { class: 'field wide' }, h('span', null, 'Angle'), h('input', { class: 'input', placeholder: 'The mechanism or point of view to lean on', maxlength: o.limits?.angle || 240, value: np.angle, oninput: (e) => set('angle', e.target.value) })),
      h('label', { class: 'field wide' }, h('span', null, 'Notes for the Strategist'), (() => { const t = h('textarea', { class: 'input', rows: 2, maxlength: o.limits?.notes || 400, placeholder: 'One line. Facts to use, things to avoid.', oninput: (e) => set('notes', e.target.value) }); t.value = np.notes; return t; })())));

  // preview + go
  const prev = h('div', { class: 'make np-preview' },
    h('div', { class: 'np-sh', style: { margin: 0 } }, 'Brief sent to the runner', h('span', null, 'fields only, one line, capped')),
    h('code', null, np.preview?.text || '/create …'),
    h('details', null, h('summary', { class: 'edge' }, 'exact prompt'), h('div', { class: 'full mono' }, np.preview?.prompt || '')),
    h('div', { class: 'why err-line' }));
  const go = h('button', { class: 'btn go lg np-go', disabled: np.preview ? null : true, onclick: async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try {
      const d = await api('POST', '/api/create', fields());
      app.toast(ahead ? `Queued behind ${ahead} run${ahead === 1 ? '' : 's'}: ${d.text}` : `Started: ${d.text}`, 'ok', 'Queued');
      app.closeDrawer();
      np.topic = ''; np.angle = ''; np.notes = ''; np.preview = null;
      app.navigate('#/flow');
    } catch (err) { app.toast(err.message, 'err'); b.disabled = false; }
  } }, icon('play'), 'Queue it');
  const foot = h('div', { class: 'np-foot' }, go,
    h('div', null, h('b', null, ahead ? `${ahead} ahead in the queue` : 'Runner is free: starts now'), h('div', { class: 'edge' }, 'Stops at Gate 1 · concepts land on the Desk')));

  return [
    h('div', { class: 'dr-h' }, h('div', null, h('h3', null, 'New piece'), h('div', { class: 'sub' }, 'Queues /create on the runner')),
      h('button', { class: 'ibtn', title: 'Close (Esc)', onclick: () => app.closeDrawer() }, icon('close'))),
    h('div', { class: 'dr-b np' }, clientSec, fmtSec, topicSec, moreSec, prev),
    foot,
  ];
}
function mapFormat(f) {
  const x = String(f || '').toLowerCase();
  if (/graphic/.test(x)) return 'graphic reel';
  if (/carousel/.test(x)) return /anim/.test(x) ? 'animated carousel' : 'carousel';
  if (/static|image|post/.test(x)) return 'static';
  if (/story/.test(x)) return 'story';
  if (/cover/.test(x)) return 'cover';
  if (/gif/.test(x)) return 'gif';
  if (/footage/.test(x)) return 'footage reel';
  if (/short|face|reel|video/.test(x)) return /long/.test(x) ? 'graphic reel' : 'short reel';
  return null;
}
export { mapFormat };
