// FLOW: the whole system as a pannable node graph (racetrack loop), or one job's graph from job.json.nodes.
import { h, icon, fileUrl, thumb, clock, dur, ago, num, slugName, kitFor, statusChip, fmtChip, nodeStatusIcon, api, lightbox, postThumb } from './ui.js';

const SYS = [
  { id: 'radar', name: 'Radar', ic: 'radar' },
  { id: 'nightly', name: 'Nightly research', ic: 'clock' },
  { id: 'ideas', name: 'Ideas', ic: 'idea' },
  { id: 'create', name: '/create', ic: 'terminal' },
  { id: 'intake', name: 'Intake', ic: 'inbox' },
  { id: 'strategist', name: 'Strategist', ic: 'brain' },
  { id: 'gate1', name: 'Gate 1 · Pick', ic: 'gate', gate: true },
  { id: 'checker', name: 'Checker', ic: 'shield' },
  { id: 'director', name: 'Director', ic: 'clap' },
  { id: 'critic', name: 'Critic', ic: 'eye' },
  { id: 'gate2', name: 'Gate 2 · Approve', ic: 'gate', gate: true },
  { id: 'librarian', name: 'Librarian', ic: 'archive' },
  { id: 'library', name: 'Library', ic: 'library' },
];
const STATION = Object.fromEntries(SYS.map((s) => [s.id, s]));
const PIPE = ['intake', 'strategist', 'gate1', 'checker', 'director', 'critic', 'gate2', 'librarian'];
const ABOUT = {
  radar: 'Competitor and client accounts: YouTube API, Instagram Business Discovery, broker blogs, manual posts. Outliers feed the nightly research and the Strategist.',
  nightly: 'The nightly content desk: collect, competitor analysis, research editor, weekly strategist, publish, group scripts.',
  ideas: 'Scripts and ideas from the nightly run, ready to hand to /create as idea:<id>.',
  create: 'A brief from the New piece panel (runs headless on the Desk runner) or /create <brief> typed in Claude Code. Each brief becomes a job folder under jobs/.',
  intake: 'Parses the brief, resolves the client or group, loads the kit (footer, logo, colours, rules).',
  strategist: 'Writes three concepts against the client history, radar outliers and lessons. Feedback from past gates loops back here.',
  gate1: 'You pick one concept, mix two, or ask for a revision.',
  checker: 'Verifies every claim, number and client fact before production.',
  director: 'Drives the render engine (films, stills, motion, hyperframes…) into jobs/<id>/out.',
  critic: 'Runs the QA gate: sizes, safe zones, loudness, spelling, compliance, variety.',
  gate2: 'You approve the finished piece or send it back with notes.',
  librarian: 'Files the piece as a library card with its treatment, feedback and lessons.',
  library: 'Every past piece, with format, engine, style, hook and feedback. The Strategist reads it to avoid repeats.',
};

const view = { tf: {}, lastKey: null };

export function title({ state, route }) {
  const id = route.params[0];
  if (id) {
    const j = state?.jobs?.find((x) => x.id === id);
    return { title: 'Flow', sub: j ? `${slugName(j.client, state)} · ${j.topic || j.id}` : id, sample: j?.sample };
  }
  const jobs = state?.jobs || [];
  return { title: 'Flow', sub: 'Whole system, live', sample: jobs.length > 0 && jobs.every((j) => j.sample) };
}

// ------------------------------------------------------------------ stats
function jobNode(j, id) { return (j.nodes || []).find((n) => n.id === id); }
function stationStats(state) {
  const jobs = state.jobs || [];
  const out = {};
  for (const id of PIPE) {
    const here = jobs.filter((j) => ['running', 'waiting'].includes(jobNode(j, id)?.status));
    const failed = jobs.filter((j) => jobNode(j, id)?.status === 'failed');
    const done = jobs.filter((j) => jobNode(j, id)?.status === 'done').length;
    let status = 'idle';
    if (failed.length) status = 'failed';
    else if (here.some((j) => jobNode(j, id).status === 'running')) status = 'running';
    else if (here.length) status = 'waiting';
    else if (done) status = 'done';
    const latest = here[0] || failed[0];
    out[id] = {
      status, count: here.length + failed.length, unit: status === 'waiting' ? 'waiting' : status === 'running' ? 'running' : status === 'failed' ? 'failed' : 'at station',
      summary: latest ? `${slugName(latest.client, state)}: ${jobNode(latest, id)?.summary || latest.topic || ''}` : (done ? `${done} job${done === 1 ? '' : 's'} passed through` : 'Idle'),
      edge: `${done} passed${here.length ? ` · ${here.length} here` : ''}`, jobs: [...here, ...failed],
    };
  }
  const r = state.radar?.summary || {};
  out.radar = { status: r.posts ? 'done' : 'idle', count: r.posts || 0, unit: 'posts', summary: `${r.accounts || 0} accounts · ${r.outliers || 0} outliers ≥ 2×`, edge: r.run ? `api run ${r.run.date}` : `${(r.sources || []).filter((s) => s.key && !s.connected).length} sources need keys` };
  const n = state.system?.nightly;
  if (n) {
    const ph = n.phases || [];
    const st = ph.some((p) => p.status === 'failed') ? 'failed' : (!n.finished || ph.some((p) => p.status === 'running')) ? 'running' : 'done';
    out.nightly = { status: st, count: `${ph.filter((p) => p.status === 'done').length}/${ph.length}`, unit: 'phases', summary: (ph.at(-1)?.detail || n.notes || '').slice(0, 120), edge: `${n.date} · ${n.depth || ''}` };
    out.ideas = { status: n.ideas ? 'done' : 'idle', count: n.ideas || 0, unit: 'ideas', summary: n.ideas ? 'Ready as /create idea:<id>' : 'No ideas from the last run', edge: n.date };
  } else {
    out.nightly = { status: 'idle', count: '—', unit: 'no run', summary: 'No nightly run found', edge: '' };
    out.ideas = { status: 'idle', count: 0, unit: 'ideas', summary: '', edge: '' };
  }
  const today = new Date().toISOString().slice(0, 10);
  const rn = state.runner || {}; const rq = (rn.queued || []).length;
  out.create = { status: jobs.some((j) => j.status === 'intake') ? 'running' : jobs.length ? 'done' : 'idle', count: jobs.filter((j) => String(j.created || '').startsWith(today)).length, unit: 'today', summary: `${jobs.length} job${jobs.length === 1 ? '' : 's'} on the board`, edge: jobs[0] ? `last ${ago(jobs[0].created)} ago` : '' };
  if (rn.current || rq || rn.state === 'waiting') {
    // the Desk runner is driving /create headless
    const cur = rn.current;
    out.create = {
      status: cur ? 'running' : rn.state === 'waiting' ? 'waiting' : 'idle', count: (cur ? 1 : 0) + rq, unit: cur ? (rq ? `running · ${rq} queued` : 'running') : rn.state === 'waiting' ? 'usage wait' : 'queued',
      summary: cur ? (cur.lastLine || cur.text || cur.label) : rn.state === 'waiting' ? `Waiting for the usage reset, retry ${clock(rn.waiting?.retryAt)}` : `Next: ${rn.queued[0]?.text || rn.queued[0]?.label || ''}`,
      edge: `desk runner · ${jobs.length} jobs on the board`,
    };
  }
  const cards = state.library?.cards || [];
  out.library = { status: cards.length ? 'done' : 'idle', count: cards.length, unit: 'pieces', summary: `${cards.filter((c) => c.status === 'delivered').length} delivered · ${cards.filter((c) => c.status === 'approved').length} approved · ${cards.filter((c) => c.status === 'draft').length} draft`, edge: `${state.feedback?.count || 0} decisions logged` };
  return out;
}

// ------------------------------------------------------------------ layout (serpentine, like a stripboard read row by row)
const MX = 84;
function layout(ids, { w, hgt, gapX, gapY, vertical, cols }) {
  const pos = {};
  if (vertical) {
    ids.forEach((id, i) => { pos[id] = { x: 0, y: i * (hgt + gapY), row: i, col: 0, dir: 1 }; });
    return pos;
  }
  ids.forEach((id, i) => {
    const row = Math.floor(i / cols), idx = i % cols, dir = row % 2 === 0 ? 1 : -1;
    const col = dir === 1 ? idx : cols - 1 - idx;
    pos[id] = { x: MX + col * (w + gapX), y: row * (hgt + gapY), row, col, dir };
  });
  return pos;
}
function edgePath(a, b, { w, hgt, vertical }) {
  if (vertical) {
    const x1 = a.x + w / 2, y1 = a.y + hgt, x2 = b.x + w / 2, y2 = b.y;
    return `M${x1},${y1} C${x1},${y1 + 30} ${x2},${y2 - 30} ${x2},${y2}`;
  }
  const ym1 = a.y + hgt / 2, ym2 = b.y + hgt / 2;
  if (a.row === b.row) {
    if (b.x > a.x) { const x1 = a.x + w, x2 = b.x, dx = (x2 - x1) / 2; return `M${x1},${ym1} C${x1 + dx},${ym1} ${x2 - dx},${ym2} ${x2},${ym2}`; }
    const x1 = a.x, x2 = b.x + w, dx = (x1 - x2) / 2; return `M${x1},${ym1} C${x1 - dx},${ym1} ${x2 + dx},${ym2} ${x2},${ym2}`;
  }
  if (a.dir === 1) { const x = a.x + w; return `M${x},${ym1} C${x + 74},${ym1} ${x + 74},${ym2} ${x},${ym2}`; }
  const x = a.x; return `M${x},${ym1} C${x - 74},${ym1} ${x - 74},${ym2} ${x},${ym2}`;
}
function loopPath(a, b, { w, hgt, vertical }) {
  if (vertical) {
    const x1 = a.x + w, y1 = a.y + hgt / 2, x2 = b.x + w, y2 = b.y + hgt / 2;
    return `M${x1},${y1} C${x1 + 60},${y1} ${x2 + 60},${y2} ${x2},${y2}`;
  }
  const x1 = a.x + w / 2, y1 = a.y, x2 = b.x + w / 2, y2 = b.y + hgt; const my = (y1 + y2) / 2;
  return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
}

// ------------------------------------------------------------------ render
export function render(stage, ctx, { routeChanged } = {}) {
  const { state, route, app } = ctx;
  const jobId = route.params[0] || null;
  const job = jobId ? state.jobs.find((j) => j.id === jobId) : null;
  if (jobId && !job) { stage.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'empty' }, h('strong', null, `No job called ${jobId}.`), h('span', null, 'It may have been removed or renamed.'), h('a', { class: 'btn sm', href: '#/flow' }, 'Whole system')))); return; }
  const vertical = stage.clientWidth < 760;
  const key = `${jobId || 'system'}|${vertical ? 'v' : 'h'}`;

  const root = h('div', { class: 'flow' });
  const canvas = h('div', { class: 'canvas' });
  const world = h('div', { class: 'world' });
  canvas.appendChild(world);

  let geo, nodes, edges = [], loop = null;
  if (job) {
    geo = { w: 252, hgt: 214, gapX: 70, gapY: vertical ? 44 : 96, vertical, cols: 4 };
    const ids = (job.nodes || []).map((n) => n.id);
    const list = ids.length ? ids : PIPE;
    const pos = layout(list, geo);
    nodes = list.map((id) => ({ id, pos: pos[id], data: (job.nodes || []).find((n) => n.id === id) || { id, status: 'idle' } }));
    for (let i = 0; i < list.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const cls = a.data.status === 'done' && ['done', 'running', 'waiting'].includes(b.data.status) ? (b.data.status === 'running' ? 'course active' : b.data.status === 'waiting' ? 'course waiting' : 'course')
        : b.data.status === 'running' ? 'active' : b.data.status === 'waiting' ? 'waiting' : '';
      edges.push({ id: `e${i}`, d: edgePath(a.pos, b.pos, geo), cls, flow: /active|waiting/.test(cls) });
    }
  } else {
    geo = { w: 198, hgt: 140, gapX: 58, gapY: vertical ? 40 : 92, vertical, cols: 5 };
    const stats = stationStats(state);
    const pos = layout(SYS.map((s) => s.id), geo);
    nodes = SYS.map((s) => ({ id: s.id, pos: pos[s.id], data: stats[s.id] }));
    for (let i = 0; i < SYS.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const st = b.data.status;
      const cls = st === 'running' ? 'active' : st === 'waiting' ? 'waiting' : st === 'failed' ? '' : '';
      const flowing = st === 'running' || st === 'waiting' || (a.data.status === 'running');
      edges.push({ id: `e${i}`, d: edgePath(a.pos, b.pos, geo), cls, flow: flowing });
    }
    const lib = nodes.find((n) => n.id === 'library'), strat = nodes.find((n) => n.id === 'strategist');
    loop = { id: 'loop', d: loopPath(lib.pos, strat.pos, geo), cls: 'loop', flow: (state.feedback?.count || 0) > 0 || (state.library?.cards?.length || 0) > 0, label: `feedback · ${state.feedback?.count || 0} decisions` };
  }

  // bounds
  const maxX = Math.max(...nodes.map((n) => n.pos.x)) + geo.w + (vertical ? 70 : MX);
  const maxY = Math.max(...nodes.map((n) => n.pos.y)) + geo.hgt;
  const svg = h('svg:svg', { class: 'edges', width: maxX, height: maxY, viewBox: `0 0 ${maxX} ${maxY}` });
  const all = loop ? [...edges, loop] : edges;
  for (const e of all) {
    const g = h('svg:g', { class: e.cls });
    g.append(h('svg:path', { id: `p-${key.replace(/[^\w]/g, '')}-${e.id}`, class: 'rail-out', d: e.d }), h('svg:path', { class: 'rail-in', d: e.d }));
    if (e.flow) {
      const n = e.cls.includes('loop') ? 2 : 3;
      const dur = e.cls.includes('loop') ? 9 : 3.2;
      for (let k = 0; k < n; k++) {
        const r = h('svg:rect', { class: 'frame', x: -4, y: -2.6, width: 8, height: 5.2, rx: 0.6 });
        const am = h('svg:animateMotion', { dur: `${dur}s`, repeatCount: 'indefinite', rotate: 'auto', begin: `${(-dur * k) / n}s` });
        am.appendChild(h('svg:mpath', { href: `#p-${key.replace(/[^\w]/g, '')}-${e.id}` }));
        r.appendChild(am); g.appendChild(r);
      }
    }
    if (e.label) {
      const lib = nodes.find((n) => n.id === 'library').pos, strat = nodes.find((n) => n.id === 'strategist').pos;
      const lx = vertical ? lib.x + geo.w + 14 : (lib.x + strat.x) / 2 + geo.w / 2 + 16;
      const ly = vertical ? (lib.y + strat.y) / 2 + geo.hgt / 2 : Math.min(lib.y, strat.y) + geo.hgt + geo.gapY / 2 - 8;
      g.appendChild(h('svg:text', { class: 'lbl', x: lx, y: ly, transform: vertical ? `rotate(90 ${lx} ${ly})` : null }, e.label));
    }
    svg.appendChild(g);
  }
  world.appendChild(svg);
  world.style.width = maxX + 'px'; world.style.height = maxY + 'px';

  for (const n of nodes) world.appendChild(job ? jobNodeCard(n, geo, job, ctx) : sysNodeCard(n, geo, ctx));

  // overlays
  const tl = h('div', { class: 'canvas-ui tl' });
  if (job) {
    const gateWaiting = job.status === 'gate1' || job.status === 'gate2';
    tl.append(h('div', { class: 'canvas-title' },
      h('a', { class: 'btn sm ghost', href: '#/flow', title: 'Back to the whole system' }, icon('left'), 'System'),
      h('b', null, slugName(job.client, state)), fmtChip(job.format), statusChip(job.status),
      gateWaiting ? h('a', { class: 'btn sm amber', href: `#/job/${encodeURIComponent(job.id)}` }, icon('gate'), job.status === 'gate1' ? 'Open Gate 1' : 'Open Gate 2') : h('a', { class: 'btn sm', href: `#/job/${encodeURIComponent(job.id)}` }, 'Job page'),
      runFor(state, job.id) ? h('a', { class: `rchip ${runFor(state, job.id).status === 'running' ? 'run' : 'idle'}`, href: `#/job/${encodeURIComponent(job.id)}?tab=live`, title: runFor(state, job.id).lastLine || '' }, h('i'), h('span', { class: 'l' }, runFor(state, job.id).status === 'running' ? 'Run live' : 'Resume queued'), h('span', { class: 's' }, runFor(state, job.id).status === 'running' ? 'open log' : '')) : null));
  } else {
    const jobs = state.jobs || [];
    const waiting = jobs.filter((j) => j.status === 'gate1' || j.status === 'gate2').length;
    const active = jobs.filter((j) => !['approved', 'delivered', 'parked', 'failed'].includes(j.status)).length;
    tl.append(h('div', { class: 'canvas-title' }, h('b', null, 'Whole system'), h('span', { class: 'edge' }, `${active} active · ${waiting} at gates · ${state.radar?.summary?.posts || 0} radar posts · ${state.library?.cards?.length || 0} pieces`)));
  }
  tl.append(h('div', { class: 'legend' },
    h('span', null, h('i', { style: { background: 'var(--run)' } }), 'Running'),
    h('span', null, h('i', { style: { background: 'var(--wait)' } }), 'Waiting'),
    h('span', null, h('i', { style: { background: 'var(--done)' } }), 'Done'),
    h('span', null, h('i', { style: { background: 'var(--fail)' } }), 'Failed'),
    job ? h('span', null, h('i', { style: { background: 'var(--course)' } }), 'This job') : null));
  const br = h('div', { class: 'canvas-ui br' }, h('div', { class: 'panel' },
    h('button', { class: 'ibtn', title: 'Zoom out', onclick: () => zoomBy(0.8) }, icon('minus')),
    h('button', { class: 'ibtn', title: 'Fit (0)', onclick: () => fit() }, icon('fit')),
    h('button', { class: 'ibtn', title: 'Zoom in', onclick: () => zoomBy(1.25) }, icon('plus'))));
  canvas.append(tl, br);

  root.append(canvas, jobStrip(state, jobId));
  stage.replaceChildren(root);
  stage.style.overflow = 'hidden';

  // pan / zoom
  let tf = view.tf[key];
  const apply = () => { world.style.transform = `translate(${tf.x}px, ${tf.y}px) scale(${tf.k})`; view.tf[key] = tf; };
  function fit() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    const padTop = vertical ? 70 : 74, pad = 28;
    const k = vertical ? Math.min((cw - pad * 2) / maxX, 1.1) : Math.min((cw - pad * 2) / maxX, (ch - padTop - pad) / maxY, 1.15);
    tf = { k, x: (cw - maxX * k) / 2, y: vertical ? padTop : padTop + Math.max(0, (ch - padTop - pad - maxY * k) / 2) };
    apply();
  }
  function zoomBy(f, cx = canvas.clientWidth / 2, cy = canvas.clientHeight / 2) {
    const k = Math.max(0.2, Math.min(2.4, tf.k * f));
    tf = { k, x: cx - (cx - tf.x) * (k / tf.k), y: cy - (cy - tf.y) * (k / tf.k) }; apply();
  }
  view.fit = fit;
  if (!tf || routeChanged || view.lastKey !== key) requestAnimationFrame(fit); else apply();
  view.lastKey = key;

  const pts = new Map(); let start = null; let moved = false; let pinch = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.canvas-ui, a, button')) return;
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false; start = { x: e.clientX, y: e.clientY, tx: tf.x, ty: tf.y };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: tf.k }; }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = canvas.getBoundingClientRect();
      zoomBy((pinch.k * (d / pinch.d)) / tf.k, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top); moved = true; return;
    }
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    moved = true; canvas.classList.add('dragging');
    tf = { ...tf, x: start.tx + dx, y: start.ty + dy }; apply();
  });
  const end = (e) => {
    pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
    canvas.classList.remove('dragging');
    if (!moved && e.type === 'pointerup') {
      const card = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.classList?.contains('node'));
      if (card) card.dispatchEvent(new CustomEvent('open-node', { bubbles: true }));
    }
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top);
    else { tf = { ...tf, x: tf.x - e.deltaX, y: tf.y - e.deltaY }; apply(); }
  }, { passive: false });
  if (!view.ro) {
    view.ro = new ResizeObserver(() => { const nowV = stage.clientWidth < 760; if (stage.querySelector('.flow') && nowV !== view.vertical) { view.vertical = nowV; render(stage, ctx, { routeChanged: true }); } });
    view.ro.observe(stage);
  }
  view.vertical = vertical;

  // reopen drawer for the node it showed, so live updates refresh it in place
  const dk = app.drawerKey();
  if (dk && dk.startsWith(`${jobId || 'system'}:`)) {
    const nid = dk.split(':')[1];
    const card = world.querySelector(`.node[data-id="${nid}"]`);
    if (card) card.dispatchEvent(new CustomEvent('open-node', { bubbles: true, detail: { quiet: true } }));
  }
}

export function onKey(e) {
  if (e.key === '0' && view.fit) { view.fit(); return true; }
  return false;
}

// ------------------------------------------------------------------ cards
function sysNodeCard(n, geo, ctx) {
  const s = STATION[n.id], d = n.data;
  const card = h('div', { class: `node ${d.status} ${s.gate ? 'gate' : ''}`, 'data-id': n.id, tabindex: 0, role: 'button', 'aria-label': `${s.name}: ${d.status}`,
    style: { left: n.pos.x + 'px', top: n.pos.y + 'px', '--nw': geo.w + 'px', height: geo.hgt + 'px' } },
    h('div', { class: 'node-h' }, icon(s.ic, 'ic'), h('span', { class: 'nm' }, s.name), h('span', { class: 'st' }, nodeStatusIcon(d.status))),
    h('div', { class: 'node-b' }, h('div', { class: 'node-n' }, String(d.count ?? '—'), h('small', null, d.unit || '')), h('div', { class: 'node-s' }, d.summary || '')),
    h('div', { class: 'edge', style: { marginTop: 'auto' } }, d.edge || ''));
  const open = (ev) => openSystemDrawer(n.id, ctx, ev?.detail?.quiet);
  card.addEventListener('open-node', open);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return card;
}
const NODE_NAME = { intake: 'Intake', strategist: 'Strategist', gate1: 'Gate 1 · Pick', checker: 'Checker', director: 'Director', critic: 'Critic', gate2: 'Gate 2 · Approve', librarian: 'Librarian' };
function jobNodeCard(n, geo, job, ctx) {
  const d = n.data; const st = STATION[n.id] || { ic: 'dot', name: n.id };
  const isGate = n.id === 'gate1' || n.id === 'gate2';
  const onCourse = d.status === 'done';
  const imgs = (d.outputs || []).filter((p) => /\.(png|jpe?g|webp|gif|mp4|mov)$/i.test(p)).slice(0, 3);
  const files = (d.outputs || []).filter((p) => !/\.(png|jpe?g|webp|gif|mp4|mov)$/i.test(p)).slice(0, 3);
  let body;
  if (isGate && d.status === 'waiting') {
    body = h('a', { class: 'btn amber gate-cta', href: `#/job/${encodeURIComponent(job.id)}`, onclick: (e) => e.stopPropagation() }, icon('gate'), n.id === 'gate1' ? `Pick from ${job.conceptCount || 3} concepts` : 'Review the cut');
  } else if (n.id === 'gate1' && job.gates?.g1?.decision) {
    body = h('div', { class: 'node-b' }, h('div', { class: 'node-n' }, job.gates.g1.choice || job.gates.g1.decision, h('small', null, job.gates.g1.decision)));
  } else if (imgs.length) {
    body = h('div', { class: 'outs' }, imgs.map((p) => thumb(p, { w: 200, cls: /carousel|4x5|@2x|\/0\d\.jpg/.test(p) ? 'wide' : '' })));
  } else if (files.length) {
    body = h('div', { class: 'node-b' }, h('div', { class: 'chips' }, files.map((f) => h('span', { class: 'chip' }, icon('file'), f.split('/').pop()))));
  } else body = h('div', { class: 'node-b' });
  const card = h('div', { class: `node ${d.status} ${isGate ? 'gate' : ''} ${onCourse ? 'on-course' : ''}`, 'data-id': n.id, tabindex: 0, role: 'button', 'aria-label': `${NODE_NAME[n.id] || n.id}: ${d.status}`,
    style: { left: n.pos.x + 'px', top: n.pos.y + 'px', '--nw': geo.w + 'px', height: geo.hgt + 'px' } },
    h('div', { class: 'node-h' }, icon(st.ic, 'ic'), h('span', { class: 'nm' }, NODE_NAME[n.id] || n.id), h('span', { class: 'st' }, nodeStatusIcon(d.status))),
    h('div', { class: 'node-b', style: { paddingBottom: '4px' } },
      h('span', { class: 'time' }, d.started ? `${clock(d.started)} → ${d.ended ? clock(d.ended) : 'now'} · ${dur(d.started, d.ended)}` : d.status === 'idle' ? 'not started' : d.status),
      h('div', { class: 'node-s' }, d.summary || '')),
    body,
    h('div', { class: 'edge', style: { marginTop: 'auto' } }, `${job.id.slice(0, 10)} · ${n.id}${d.outputs?.length ? ` · ${d.outputs.length} out` : ''}`));
  const open = (ev) => openJobNodeDrawer(job, n.id, ctx, ev?.detail?.quiet);
  card.addEventListener('open-node', open);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return card;
}

// ------------------------------------------------------------------ job strip (stripboard)
const STRIP_COLOR = { gate1: 'var(--wait)', gate2: 'var(--wait)', producing: 'var(--run)', checking: 'var(--run)', intake: 'var(--run)', concepts: 'var(--run)', qa: 'var(--run)', approved: 'var(--done)', delivered: 'var(--done)', failed: 'var(--fail)', parked: 'var(--line-2)' };
function jobStrip(state, selId) {
  const jobs = [...(state.jobs || [])].sort((a, b) => rank(a) - rank(b) || String(b.updated).localeCompare(String(a.updated)));
  const strip = h('div', { class: 'strip', role: 'list', 'aria-label': 'Jobs' },
    h('div', { class: 'strip-h' }, 'Jobs'),
    h('a', { class: `jstrip system ${!selId ? 'sel' : ''}`, href: '#/flow', role: 'listitem' },
      h('b', null, 'Whole system'), h('span', { class: 'what', style: { margin: 0 } }, `${jobs.length} job${jobs.length === 1 ? '' : 's'} on the board`),
      h('span', { class: 'edge' }, 'radar → library → loop')));
  const rn = state.runner || {};
  const pend = [rn.current, rn.waiting, ...(rn.queued || [])].filter((r) => r && !r.jobId && r.kind === 'create');
  for (const r of pend) {
    const st = r.status === 'running' ? 'run' : r.status === 'waiting' ? 'wait' : 'park';
    strip.append(h('button', { class: `jstrip pending ${st}`, role: 'listitem', style: { '--sb': st === 'run' ? 'var(--run)' : st === 'wait' ? 'var(--wait)' : 'var(--line-2)' }, onclick: () => state && window.__desk?.openRunner(), 'data-keep-drawer': '' },
      h('div', { class: 'thumb pend-face' }, icon(st === 'run' ? 'terminal' : 'clock')), h('span', { class: 'band' }),
      h('span', { class: 'who' }, h('b', null, r.brief?.group ? `Group ${r.brief.group}` : slugName(r.brief?.client, state)), h('span', { class: `status ${st}` }, h('i'), r.status === 'running' ? 'running' : r.status === 'waiting' ? 'usage wait' : 'queued')),
      h('span', { class: 'what' }, r.status === 'running' && r.lastLine ? r.lastLine : r.brief?.topic || r.label),
      h('span', { class: 'ticks', style: { '--n': 8 } }, PIPE.map((id, i) => h('i', { class: r.status === 'running' && i === 0 ? 'running' : 'idle' }))),
      h('span', { class: 'edge' }, `${r.brief?.format || ''} · new piece · ${r.status === 'queued' ? 'queued ' + ago(r.created) + ' ago' : r.status}`)));
  }
  if (!jobs.length && !pend.length) strip.append(h('div', { class: 'empty', style: { padding: '14px 18px' } }, h('strong', null, 'No jobs yet'), h('span', null, 'Press N for a new piece, or type /create <brief> in Claude Code.')));
  for (const j of jobs) {
    const t = j.thumb?.path || j.concepts?.[0]?.preview || null;
    const nodes = j.nodes?.length ? j.nodes : PIPE.map((id) => ({ id, status: 'idle' }));
    strip.append(h('a', { class: `jstrip ${selId === j.id ? 'sel' : ''}`, href: `#/flow/${encodeURIComponent(j.id)}`, role: 'listitem', style: { '--sb': STRIP_COLOR[j.status] || 'var(--line-2)' } },
      thumb(t, { w: 120 }), h('span', { class: 'band' }),
      h('span', { class: 'who' }, h('b', null, slugName(j.client, state)), statusChip(j.status)),
      h('span', { class: 'what' }, j.topic || j.id),
      h('span', { class: 'ticks', style: { '--n': nodes.length } }, nodes.map((n) => h('i', { class: n.status, title: `${n.id}: ${n.status}` }))),
      h('span', { class: 'edge' }, `${j.format || ''} · ${ago(j.updated || j.created)} ago${j.sample ? ' · sample' : ''}`),
      runFor(state, j.id) ? h('span', { class: `runmark ${runFor(state, j.id).status === 'running' ? 'run' : ''}`, title: runFor(state, j.id).lastLine || runFor(state, j.id).text || '' }, runFor(state, j.id).status === 'running' ? 'Run live' : 'Queued') : null));
  }
  requestAnimationFrame(() => { const s = strip.querySelector('.jstrip.sel:not(.system)'); if (s) s.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
  return strip;
}
function runFor(state, id) {
  const rn = state.runner || {};
  return [rn.current, ...(rn.queued || []), rn.waiting].find((r) => r && (r.jobId === id || (r.jobs || []).includes(id))) || null;
}
function rank(j) { return { gate1: 0, gate2: 0, producing: 1, checking: 1, qa: 1, concepts: 1, intake: 1, failed: 2, approved: 3, delivered: 4, parked: 5 }[j.status] ?? 3; }

// ------------------------------------------------------------------ drawers
function drawerHead(titleText, sub, ctx, extra) {
  return h('div', { class: 'dr-h' }, h('div', null, h('h3', null, titleText), sub ? h('div', { class: 'sub' }, sub) : null, extra || null),
    h('button', { class: 'ibtn', title: 'Close (Esc)', onclick: () => ctx.app.closeDrawer() }, icon('close')));
}
function openSystemDrawer(id, ctx) {
  const { state, app } = ctx; const s = STATION[id]; const stats = stationStats(state)[id];
  app.openDrawer(() => {
    const secs = [h('div', { class: 'dr-sec' }, h('p', { class: 'prose', style: { margin: 0 } }, ABOUT[id] || ''))];
    secs.push(h('div', { class: 'dr-sec' }, h('dl', { class: 'kv' }, h('dt', null, 'Status'), h('dd', null, statusChip(stats.status)), h('dt', null, 'Now'), h('dd', null, `${stats.count} ${stats.unit}`), h('dt', null, 'Note'), h('dd', null, stats.edge || '—'))));
    if (PIPE.includes(id)) {
      const here = stats.jobs || [];
      const passed = (state.jobs || []).filter((j) => jobNode(j, id)?.status === 'done');
      secs.push(h('div', { class: 'dr-sec' }, h('h4', null, `At this station (${here.length})`), here.length ? jobList(here, state, id) : h('div', { class: 'faint' }, 'Nothing here right now.')));
      if (passed.length) secs.push(h('div', { class: 'dr-sec' }, h('h4', null, `Passed through (${passed.length})`), jobList(passed.slice(0, 8), state, id)));
    }
    if (id === 'nightly' && state.system?.nightly) {
      const n = state.system.nightly;
      secs.push(h('div', { class: 'dr-sec' }, h('h4', null, `Run ${n.date}`), h('div', { class: 'phase-list' }, n.phases.map((p) => h('div', null, h('span', { style: { color: p.status === 'done' ? 'var(--run)' : p.status === 'failed' ? 'var(--fail)' : 'var(--wait)' } }, nodeStatusIcon(p.status === 'done' ? 'done' : p.status === 'failed' ? 'failed' : 'waiting')), h('div', null, h('b', null, p.id.replace(/_/g, ' ')), h('span', null, p.detail)))))));
    }
    if (id === 'ideas' && state.system?.nightly?.ideaIds?.length) {
      secs.push(h('div', { class: 'dr-sec' }, h('h4', null, 'Idea ids'), h('div', { class: 'chips' }, state.system.nightly.ideaIds.map((x) => h('span', { class: 'chip' }, `idea:${x}`)))));
    }
    if (id === 'radar') {
      const top = [...(state.radar?.posts || [])].filter((p) => typeof p.outlier === 'number').sort((a, b) => b.outlier - a.outlier).slice(0, 6);
      secs.push(h('div', { class: 'dr-sec' }, h('h4', null, 'Top outliers'), h('div', { class: 'outgrid', style: { gridTemplateColumns: 'repeat(2, 1fr)' } }, top.map((p) => h('a', { href: '#/radar', style: { textDecoration: 'none' } }, thumb(postThumb(p), { ratio: '16 / 9' }), h('div', { class: 'edge', style: { marginTop: '4px' } }, `${p.outlier}× · ${p.account}`), h('div', { style: { fontSize: '12px', lineHeight: 1.3 } }, p.hook || p.title || ''))))));
      secs.push(h('a', { class: 'btn', href: '#/radar' }, icon('radar'), 'Open the Radar wall'));
    }
    if (id === 'library') {
      const recent = (state.library?.cards || []).slice(0, 9);
      secs.push(h('div', { class: 'dr-sec' }, h('h4', null, 'Recent pieces'), h('div', { class: 'outgrid' }, recent.map((c) => thumb(c.files?.thumb || c.files?.poster, { w: 240 })))));
      secs.push(h('a', { class: 'btn', href: '#/library' }, icon('library'), 'Open the Library'));
    }
    if (id === 'create') secs.push(h('div', { class: 'dr-sec' }, h('h4', null, 'Start a job'),
      h('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px' } }, h('button', { class: 'btn primary', onclick: () => app.newPiece() }, icon('plus'), 'New piece (N)'), h('button', { class: 'btn', onclick: () => app.openRunner() }, icon('terminal'), 'Runner')),
      h('div', { class: 'edge', style: { whiteSpace: 'normal' } }, 'or in Claude Code: /create graphic reel for northline-mortgages about renewals')));
    return [drawerHead(s.name, ABOUT[id] ? null : '', ctx), h('div', { class: 'dr-b' }, secs)];
  }, { key: `system:${id}` });
}
function jobList(jobs, state, nodeId) {
  return h('div', { class: 'filelist' }, jobs.map((j) => h('a', { href: `#/flow/${encodeURIComponent(j.id)}` }, icon('flow'), h('span', null, `${slugName(j.client, state)} · ${jobNode(j, nodeId)?.summary || j.topic || j.id}`))));
}
async function openJobNodeDrawer(jobSum, nodeId, ctx) {
  const { app, state } = ctx;
  const nd = (jobSum.nodes || []).find((n) => n.id === nodeId) || { id: nodeId, status: 'idle' };
  const build = (full) => {
    const job = full?.job || jobSum;
    const node = (job.nodes || []).find((n) => n.id === nodeId) || nd;
    const base = full?.dir || jobSum.dir;
    const abs = (p) => (p && (p.startsWith('/') ? p : `${base}/${p}`));
    const outs = (node.outputs || []).map(abs);
    const media = outs.filter((p) => /\.(png|jpe?g|webp|gif|mp4|mov)$/i.test(p));
    const other = outs.filter((p) => !/\.(png|jpe?g|webp|gif|mp4|mov)$/i.test(p));
    const logs = (job.log || []).filter((l) => l.node === nodeId);
    const secs = [];
    secs.push(h('div', { class: 'dr-sec' }, h('dl', { class: 'kv' },
      h('dt', null, 'Status'), h('dd', null, statusChip(node.status)),
      h('dt', null, 'Started'), h('dd', null, node.started ? `${new Date(node.started).toLocaleString()}` : '—'),
      h('dt', null, 'Ended'), h('dd', null, node.ended ? `${new Date(node.ended).toLocaleString()}` : node.started ? 'still running' : '—'),
      h('dt', null, 'Took'), h('dd', null, dur(node.started, node.ended) || '—'),
      h('dt', null, 'Summary'), h('dd', null, node.summary || '—'))));
    if ((nodeId === 'gate1' || nodeId === 'gate2')) {
      const g = job.gates?.[nodeId === 'gate1' ? 'g1' : 'g2'];
      secs.push(h('div', { class: 'dr-sec' }, h('h4', null, 'Decision'), g?.decision ? h('dl', { class: 'kv' }, h('dt', null, 'Decision'), h('dd', null, g.decision), g.choice ? [h('dt', null, 'Choice'), h('dd', null, g.choice)] : null, h('dt', null, 'By'), h('dd', null, g.by || '—'), h('dt', null, 'At'), h('dd', null, g.at ? new Date(g.at).toLocaleString() : '—'), g.notes ? [h('dt', null, 'Notes'), h('dd', null, g.notes)] : null) : h('div', { class: 'faint' }, 'No decision yet.'),
        h('a', { class: `btn ${node.status === 'waiting' ? 'amber' : ''}`, href: `#/job/${encodeURIComponent(job.id)}?tab=${nodeId === 'gate1' ? 'g1' : 'g2'}`, style: { marginTop: '10px' } }, icon('gate'), node.status === 'waiting' ? 'Decide now' : 'Open gate')));
    }
    if (media.length) secs.push(h('div', { class: 'dr-sec' }, h('h4', null, `Outputs (${media.length})`), h('div', { class: 'outgrid' }, media.map((p) => {
      const t = thumb(p, { w: 320 }); t.addEventListener('click', () => lightbox(fileUrl(p), /\.(mp4|mov)$/i.test(p))); return t;
    }))));
    if (other.length) secs.push(h('div', { class: 'dr-sec' }, h('h4', null, 'Files written'), h('div', { class: 'filelist' }, other.map((p) => h('a', { href: fileUrl(p), target: '_blank', rel: 'noopener' }, icon('file'), h('span', null, p.replace(base + '/', '')))))));
    secs.push(h('div', { class: 'dr-sec' }, h('h4', null, `Log (${logs.length})`), logs.length ? h('div', { class: 'loglist' }, logs.map((l) => h('div', null, h('span', { class: 't' }, clock(l.t)), h('span', { class: 'n' }, l.node), h('span', null, l.msg)))) : h('div', { class: 'faint' }, 'No log lines for this step.')));
    if (full?.files?.length) {
      const rel = full.files.filter((f) => !f.startsWith('project/')).slice(0, 40);
      secs.push(h('div', { class: 'dr-sec' }, h('h4', null, `Job folder (${full.files.length} files)`), h('div', { class: 'filelist' }, rel.map((f) => h('a', { href: fileUrl(`${base}/${f}`), target: '_blank', rel: 'noopener' }, icon('file'), h('span', null, f))))));
    }
    return [drawerHead(NODE_NAME[nodeId] || nodeId, `${slugName(job.client, state)} · ${job.id}`, ctx), h('div', { class: 'dr-b' }, secs)];
  };
  app.openDrawer(() => build(null), { key: `${jobSum.id}:${nodeId}` });
  try {
    const full = await api('GET', `/api/job/${encodeURIComponent(jobSum.id)}`);
    if (app.drawerKey() === `${jobSum.id}:${nodeId}`) app.openDrawer(() => build(full), { key: `${jobSum.id}:${nodeId}` });
  } catch { /* summary is enough */ }
}
