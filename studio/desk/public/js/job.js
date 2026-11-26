// JOB / GATES: Gate 1 (three concepts side by side) and Gate 2 (phone preview + QA), plus the gates index.
import { faceKids, h, icon, thumb, img, fileUrl, clock, ago, dur, slugName, kitFor, statusChip, fmtChip, api, copyText, lightbox, nodeStatusIcon } from './ui.js';
import { liveLog, runCard } from './runner.js';

const view = { id: null, data: null, loading: null, per: {} };
const per = (id) => (view.per[id] ||= { tab: null, notes: '', mix: new Set(), safe: false, crop: false, slide: 0 });

export function title({ state, route }) {
  if (route.name === 'gates') {
    const n = (state?.jobs || []).filter((j) => j.status === 'gate1' || j.status === 'gate2').length;
    return { title: 'Gates', sub: n ? `${n} waiting for you` : 'Nothing waiting', sample: (state?.jobs || []).some((j) => j.sample) };
  }
  const id = route.params[0]; const j = state?.jobs?.find((x) => x.id === id);
  return { title: j?.status === 'gate1' ? 'Gate 1' : j?.status === 'gate2' ? 'Gate 2' : 'Job', sub: j ? `${slugName(j.client, state)} · ${j.id}` : id, sample: j?.sample };
}

export function onLive(stage, ctx, evs) {
  if (ctx.route.name === 'gates') return render(stage, ctx);
  const id = ctx.route.params[0];
  if (evs.some((e) => e.type === 'jobs' && (!e.id || e.id === id))) {
    // keep the live log mounted while a run streams; refresh the data quietly underneath
    if (per(id).tab === 'live') { api('GET', `/api/job/${encodeURIComponent(id)}`).then((d) => { view.data = d; view.id = id; }).catch(() => {}); return; }
    view.id = null; render(stage, ctx);
  }
}
export function onRunner(stage, ctx) {
  if (ctx.route.name !== 'job') return;
  const id = ctx.route.params[0];
  if (document.activeElement?.closest?.('.stage textarea, .stage input')) return; // don't steal focus mid-note
  if (view.data && view.id === id) renderJob(stage, ctx);
}
function runForJob(state, id) {
  const rn = state?.runner || {};
  return [rn.current, rn.waiting, ...(rn.queued || [])].find((r) => r && (r.jobId === id || (r.jobs || []).includes(id))) || null;
}
const autoResume = () => { try { return localStorage.getItem('desk-auto-resume') !== '0'; } catch { return true; } };

export function onKey(e, ctx) {
  if (ctx.route.name !== 'job') return false;
  const id = ctx.route.params[0]; const p = per(id);
  const k = e.key.toLowerCase();
  if (p.tab === 'g1' && /^[a-e]$/.test(k) && !(k === 'b' && false)) {
    const btn = document.querySelector(`.concept[data-id="${k.toUpperCase()}"] .pickrow .btn`);
    if (btn) { btn.focus(); btn.closest('.concept').scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); return true; }
  }
  return false;
}

export function render(stage, ctx) {
  if (ctx.route.name === 'gates') return renderIndex(stage, ctx);
  const id = ctx.route.params[0];
  if (!id) { location.hash = '#/gates'; return; }
  if (view.id !== id || !view.data) {
    if (view.loading === id) return;
    view.loading = id;
    if (view.id !== id) stage.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'edge' }, 'Loading job…')));
    api('GET', `/api/job/${encodeURIComponent(id)}`).then((d) => { view.data = d; view.id = id; view.loading = null; if (ctx.app.route.params[0] === id) renderJob(stage, ctx); })
      .catch((e) => { view.loading = null; stage.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'empty' }, h('strong', null, `Job ${id} not found.`), h('span', null, e.message), h('a', { class: 'btn sm', href: '#/gates' }, 'All gates')))); });
    return;
  }
  renderJob(stage, ctx);
}

// ------------------------------------------------------------------ index
function renderIndex(stage, ctx) {
  const { state } = ctx;
  const jobs = [...(state.jobs || [])];
  const waiting = jobs.filter((j) => j.status === 'gate1' || j.status === 'gate2');
  const rest = jobs.filter((j) => !waiting.includes(j));
  const row = (j) => h('a', { class: 'grow-row', href: `#/job/${encodeURIComponent(j.id)}` },
    thumb(j.thumb?.path || j.concepts?.[0]?.preview, { w: 160 }),
    h('div', { style: { minWidth: 0 } }, h('b', null, slugName(j.client, state)), h('div', { class: 'sub' }, j.topic || j.id), h('div', { class: 'edge' }, `${j.id} · ${ago(j.updated || j.created)} ago`)),
    h('span', { class: 'hide-sm' }, fmtChip(j.format)),
    j.status === 'gate1' ? h('span', { class: 'btn amber sm' }, `Pick · ${j.conceptCount} concepts`) : j.status === 'gate2' ? h('span', { class: 'btn amber sm' }, 'Review the cut') : statusChip(j.status));
  const g1n = waiting.filter((j) => j.status === 'gate1').length;
  stage.replaceChildren(h('div', { class: 'screen' },
    h('div', { class: 'sect-h', style: { marginTop: 0 } }, h('h2', null, 'Waiting for you'), h('span', { class: 'edge' }, `${waiting.length} jobs`), g1n > 1 ? h('a', { class: 'btn sm', href: '#/batch', style: { marginLeft: '12px' } }, icon('batch'), `Decide all ${g1n} in one screen`) : null),
    waiting.length ? h('div', { class: 'glist' }, waiting.map(row)) : h('div', { class: 'empty' }, h('strong', null, 'No gates open.'), h('span', null, 'When a job reaches Gate 1 or Gate 2 it lands here and glows amber on the Flow.')),
    rest.length ? [h('div', { class: 'sect-h' }, h('h2', null, 'Other jobs'), h('span', { class: 'edge' }, `${rest.length}`)), h('div', { class: 'glist' }, rest.map(row))] : null));
}

// ------------------------------------------------------------------ job page
function renderJob(stage, ctx) {
  const { state } = ctx; const d = view.data; const job = d.job; const id = job.id || view.id; const p = per(id);
  const kit = kitFor(job.client, state);
  const hasOut = (job.outputs || []).some((o) => ['video', 'carousel', 'image', 'cover'].includes(o.kind));
  if (!p.tab || ctx.route.query?.tab) p.tab = ctx.route.query?.tab || (job.status === 'gate1' || job.status === 'concepts' || job.status === 'intake' || !hasOut ? 'g1' : 'g2');
  const nodes = job.nodes || [];
  const head = h('div', { class: 'jhead' },
    h('div', { class: 'face' }, faceKids(kit?.photo, slugName(job.client, state), 140)),
    h('div', { style: { minWidth: 0 } },
      h('h2', null, job.topic || id),
      h('div', { class: 'meta' }, h('b', { style: { color: 'var(--ink)' } }, slugName(job.client, state)), fmtChip(job.format), statusChip(job.status),
        job.engine ? h('span', { class: 'edge' }, `${job.engine}${job.style ? ' · ' + job.style : ''}`) : null,
        h('span', { class: 'edge' }, `created ${ago(job.created)} ago`))),
    h('div', { class: 'right' },
      h('div', { class: 'ticks', style: { '--n': nodes.length || 8 } }, nodes.map((n) => h('i', { class: n.status, title: `${n.id}: ${n.status}` }))),
      h('div', { style: { display: 'flex', gap: '6px' } }, h('a', { class: 'btn sm', href: `#/flow/${encodeURIComponent(id)}` }, icon('flow'), 'Graph'), h('a', { class: 'btn sm ghost', href: '#/gates' }, 'All gates'))));
  const tab = (key, label, dot) => h('button', { role: 'tab', 'aria-selected': p.tab === key ? 'true' : 'false', onclick: () => { p.tab = key; history.replaceState(null, '', `#/job/${encodeURIComponent(id)}`); renderJob(stage, ctx); } }, label, dot ? h('span', { class: 'dot' }) : null);
  const tabs = h('div', { class: 'tabs', role: 'tablist' },
    tab('g1', `Gate 1 · Concepts${Array.isArray(d.concepts) ? ` (${d.concepts.length})` : ''}`, job.status === 'gate1'),
    tab('g2', 'Gate 2 · The cut', job.status === 'gate2'),
    tab('live', h('span', { class: 'livetab' }, runForJob(state, id)?.status === 'running' ? h('i', { class: 'on' }) : h('i'), 'Live')),
    tab('log', `Log & files (${(job.log || []).length})`));
  let body;
  if (p.tab === 'g1') body = gate1(job, d, p, ctx, stage);
  else if (p.tab === 'g2') body = gate2(job, d, p, ctx, stage);
  else if (p.tab === 'live') body = liveTab(job, ctx, stage);
  else body = logTab(job, d);
  const keepScroll = stage.scrollTop;
  stage.replaceChildren(h('div', null, head, tabs, body));
  stage.scrollTop = keepScroll;
}

async function decide(job, body, ctx, stage) {
  try {
    body = { ...body, resume: autoResume() };
    const res = await api('POST', `/api/job/${encodeURIComponent(job.id)}/gate`, body);
    const what = body.decision === 'pick' ? `Picked ${body.choice}` : body.decision === 'approve' ? 'Approved' : body.decision === 'revise' ? 'Sent back for revision' : 'Rejected';
    ctx.app.toast(`${what}${res.sample ? ' (sample job: kept in memory only)' : res.test ? ' (test job)' : ' · logged to feedback.jsonl'}`, 'ok', body.gate.toUpperCase());
    if (res.resume) ctx.app.toast(`Pipeline continues: ${res.resume.text}${res.resume.status === 'queued' && ctx.state.runner?.current ? ' (queued)' : ''}`, 'ok', 'Runner');
    else if (res.resumeError) ctx.app.toast(`Could not queue the resume: ${res.resumeError}`, 'err');
    per(job.id).notes = ''; per(job.id).mix.clear();
    view.id = null;
    await ctx.app.refresh();
    render(stage, ctx);
  } catch (e) { ctx.app.toast(e.message, 'err'); }
}

function autoBox() {
  const cb = h('input', { type: 'checkbox', checked: autoResume() ? true : null, onchange: (e) => { try { localStorage.setItem('desk-auto-resume', e.target.checked ? '1' : '0'); } catch { /* */ } } });
  return h('label', { class: 'mixbox autobox', title: 'After your decision, queue /create resume on the Desk runner so the pipeline carries on by itself. Reject never resumes.' }, cb, 'Continue automatically');
}
function notesArea(p, placeholder) {
  const ta = h('textarea', { class: 'input', placeholder, rows: 1, 'aria-label': 'Notes for this decision', oninput: (e) => { p.notes = e.target.value; } });
  ta.value = p.notes || '';
  return ta;
}

// ------------------------------------------------------------------ gate 1
function gate1(job, d, p, ctx, stage) {
  const concepts = Array.isArray(d.concepts) ? d.concepts : [];
  const g1 = job.gates?.g1 || {};
  const open = job.status === 'gate1';
  const chosen = String(job.chosen || g1.choice || '').split('+').filter(Boolean);
  const out = [];
  if (g1.decision) out.push(h('div', { class: 'decided' }, icon('check'), h('span', null, h('b', null, g1.decision === 'pick' ? `Picked ${g1.choice}` : g1.decision === 'revise' ? 'Revision requested' : 'Rejected'), ` · ${g1.by || ''} · ${g1.at ? new Date(g1.at).toLocaleString() : ''}${g1.notes ? ' · “' + g1.notes + '”' : ''}`)));
  if (!concepts.length) {
    out.push(h('div', { class: 'screen' }, h('div', { class: 'empty' }, h('strong', null, job.status === 'intake' || job.status === 'concepts' ? 'The Strategist is still writing concepts.' : 'No concepts.json for this job.'), h('span', null, 'This page fills in by itself when concepts.json lands.'))));
    return out;
  }
  const cols = h('div', { class: 'g1', style: { gridTemplateColumns: `repeat(${concepts.length}, minmax(300px, 1fr))` } }, concepts.map((c) => conceptCol(c, job, d, p, ctx, stage, chosen, open)));
  out.push(cols);
  const mixList = [...p.mix].sort();
  if (open) {
    out.push(h('div', { class: 'actbar' }, notesArea(p, 'Notes for the Strategist (what to keep, what to change)…'),
      h('div', { class: 'acts' },
        h('button', { class: 'btn', disabled: mixList.length < 2 ? true : null, title: 'Tick “Mix” on two concepts', onclick: () => decide(job, { gate: 'g1', decision: 'pick', choice: mixList.join('+'), notes: p.notes }, ctx, stage) }, icon('mix'), mixList.length >= 2 ? `Mix ${mixList.join(' + ')}` : 'Mix'),
        h('button', { class: 'btn', onclick: (e) => { if (!p.notes.trim()) { ctx.app.toast('Add a note so the Strategist knows what to change', 'err', 'Revise'); e.currentTarget.closest('.actbar').querySelector('textarea').focus(); return; } decide(job, { gate: 'g1', decision: 'revise', notes: p.notes }, ctx, stage); } }, icon('undo'), 'Revise'),
        h('button', { class: 'btn danger', onclick: () => decide(job, { gate: 'g1', decision: 'reject', notes: p.notes }, ctx, stage) }, 'Reject'), autoBox())));
  }
  return out;
}
function conceptCol(c, job, d, p, ctx, stage, chosen, open) {
  const picked = chosen.includes(c.id);
  const base = d.dir;
  const prev = c.preview ? (c.preview.startsWith('/') ? c.preview : `${base}/${c.preview}`) : null;
  const warn = /repetit|flag|same|close to|shares|needs a different/i.test(c.novelty || '');
  const mixBox = h('input', { type: 'checkbox', checked: p.mix.has(c.id) ? true : null, onchange: (e) => { e.target.checked ? p.mix.add(c.id) : p.mix.delete(c.id); renderJob(stage, ctx); } });
  return h('section', { class: `concept ${picked ? 'picked' : ''} ${p.mix.has(c.id) ? 'mixed' : ''}`, 'data-id': c.id, 'aria-label': `Concept ${c.id}` },
    picked ? h('span', { class: 'stamp' }, chosen.length > 1 ? 'Mixed' : 'Picked') : null,
    h('div', { class: 'letter' }, h('b', null, c.id), h('div', { style: { minWidth: 0, flex: 1 } }, h('h3', null, c.title || ''), h('span', { class: 'edge' }, `${c.format || job.format || ''} · ${c.device || ''}`))),
    open ? h('div', { class: 'pickrow' },
      h('button', { class: 'btn go', onclick: () => decide(job, { gate: 'g1', decision: 'pick', choice: c.id, notes: p.notes }, ctx, stage) }, icon('check'), `Pick ${c.id}`),
      h('label', { class: 'mixbox' }, mixBox, 'Mix with others')) : null,
    h('p', { class: 'hook' }, c.hook?.main || ''),
    (c.hook?.alts || []).length ? h('div', null, h('div', { class: 'lab' }, 'Alt hooks'), h('ul', { class: 'alts' }, c.hook.alts.map((a) => h('li', null, a)))) : null,
    c.angle ? h('div', null, h('div', { class: 'lab' }, 'Angle'), h('p', { class: 'angle' }, c.angle)) : null,
    (c.clientFacts || []).length ? h('div', null, h('div', { class: 'lab' }, 'Client facts used'), h('div', { class: 'chips' }, c.clientFacts.map((x) => h('span', { class: 'chip fact' }, x)))) : null,
    h('div', null, h('div', { class: 'lab' }, 'Engine & style'), h('div', { class: 'engine-row' },
      prev ? (() => { const t = thumb(prev, { w: 300 }); t.addEventListener('click', () => lightbox(fileUrl(prev))); return t; })() : h('div', { class: 'thumb img-ph', style: { aspectRatio: '4 / 5' } }),
      h('div', null, h('div', { class: 'chips' }, h('span', { class: 'chip fact' }, c.engine || '—'), h('span', { class: 'chip' }, c.style || '—')), c.styleWhy ? h('div', { class: 'why' }, c.styleWhy) : null, c.structure ? h('div', { class: 'edge', style: { marginTop: '6px', whiteSpace: 'normal' } }, c.structure) : null))),
    (c.beats || []).length ? h('div', null, h('div', { class: 'lab' }, `Storyboard · ${c.beats.length} beats`), h('div', { class: 'board' }, c.beats.map((b, i) => h('div', { class: 'beat' }, h('div', { class: 'bn' }, h('span', null, `${String(i + 1).padStart(2, '0')}`), h('span', null, b.t && b.t !== String(i + 1) ? b.t : '')), h('div', { class: 'bv' }, b.visual || ''), h('div', { class: 'bt' }, b.text || b.voice || ''))))) : null,
    c.cta ? h('div', null, h('div', { class: 'lab' }, 'CTA'), h('div', { style: { fontSize: '13px' } }, c.cta)) : null,
    c.novelty ? h('div', { class: `novelty ${warn ? 'warn' : ''}` }, icon(warn ? 'alert' : 'check'), h('span', null, c.novelty)) : null,
    null);
}

// ------------------------------------------------------------------ gate 2
function gate2(job, d, p, ctx, stage) {
  const base = d.dir;
  const abs = (x) => (x ? (x.startsWith('/') || x.startsWith('~') ? x : `${base}/${x}`) : null);
  const outs = job.outputs || [];
  const video = outs.find((o) => o.kind === 'video');
  const car = outs.find((o) => o.kind === 'carousel');
  const image = outs.find((o) => o.kind === 'image');
  const cover = outs.find((o) => o.kind === 'cover');
  const capOut = outs.find((o) => o.kind === 'caption');
  const contact = abs(d.qa?.contact || outs.find((o) => o.kind === 'contact')?.path);
  const qa = d.qa;
  const g2 = job.gates?.g2 || {};
  const open = job.status === 'gate2';
  const out = [];
  if (g2.decision) out.push(h('div', { class: 'decided' }, icon('check'), h('span', null, h('b', null, g2.decision === 'approve' ? 'Approved' : g2.decision === 'revise' ? 'Revision requested' : 'Rejected'), ` · ${g2.by || ''} · ${g2.at ? new Date(g2.at).toLocaleString() : ''}${g2.notes ? ' · “' + g2.notes + '”' : ''}`)));
  if (!video && !car && !image && !cover) {
    out.push(h('div', { class: 'screen' }, h('div', { class: 'empty' }, h('strong', null, ['producing', 'checking', 'qa'].includes(job.status) ? 'The Director is still producing this piece.' : 'Nothing to review yet.'), h('span', null, 'The cut appears here when job.outputs lists a video, carousel or image.'))));
    return out;
  }
  // phone
  let content; let aspect;
  const screen = h('div', { class: 'screen-9x16' });
  if (video) {
    aspect = (video.w && video.h) ? video.w / video.h : 9 / 16;
    const v = h('video', { src: fileUrl(abs(video.path)), poster: cover ? fileUrl(abs(cover.path), 720) : null, controls: true, playsinline: true, preload: 'metadata', loop: true });
    content = h('div', { style: { position: 'absolute', inset: 0 } }, v);
    screen.append(content);
  } else {
    const slides = car ? (Array.isArray(car.path) ? car.path : [car.path]).map(abs) : [abs((image || cover).path)];
    const o = car || image || cover;
    aspect = (o.w && o.h) ? o.w / o.h : 4 / 5;
    p.slide = Math.min(p.slide, slides.length - 1);
    const track = h('div', { class: 'track', style: { transform: `translateX(-${p.slide * 100}%)` } }, slides.map((s) => h('img', { src: fileUrl(s, 900), alt: '', draggable: 'false' })));
    const counter = h('span', { class: 'counter' }, `${p.slide + 1} / ${slides.length}`);
    const dots = h('div', { class: 'dots' }, slides.map((_, i) => h('i', { class: i === p.slide ? 'on' : '' })));
    const go = (n) => { p.slide = Math.max(0, Math.min(slides.length - 1, n)); track.style.transform = `translateX(-${p.slide * 100}%)`; counter.textContent = `${p.slide + 1} / ${slides.length}`; [...dots.children].forEach((d2, i) => d2.classList.toggle('on', i === p.slide)); };
    const frame = h('div', { class: 'frame45', style: { aspectRatio: `${aspect}` } }, track, slides.length > 1 ? [h('button', { class: 'nav-b prev', 'aria-label': 'Previous slide', onclick: () => go(p.slide - 1) }, icon('left')), h('button', { class: 'nav-b next', 'aria-label': 'Next slide', onclick: () => go(p.slide + 1) }, icon('right')), counter] : null);
    let sx = null;
    frame.addEventListener('pointerdown', (e) => { sx = e.clientX; });
    frame.addEventListener('pointerup', (e) => { if (sx !== null && Math.abs(e.clientX - sx) > 40) go(p.slide + (e.clientX < sx ? 1 : -1)); sx = null; });
    content = frame;
    screen.append(h('div', { class: 'slides' }, frame, slides.length > 1 ? dots : null));
  }
  // overlays on the content box
  if (p.safe) content.append(safeZones(!!video));
  if (p.crop) content.append(cropOverlay(aspect));
  const phoneCol = h('div', { class: 'phone-col' },
    h('div', { class: 'phone' }, screen),
    h('div', { class: 'toggles' },
      h('button', { class: 'chip', 'aria-pressed': p.safe ? 'true' : 'false', onclick: () => { p.safe = !p.safe; renderJob(stage, ctx); } }, icon('safe'), 'IG safe zones'),
      h('button', { class: 'chip', 'aria-pressed': p.crop ? 'true' : 'false', onclick: () => { p.crop = !p.crop; renderJob(stage, ctx); } }, icon('grid34'), 'Grid crop 3:4')),
    h('div', { class: 'edge' }, video ? `${video.w || 1080}×${video.h || 1920}${video.durationS ? ' · ' + video.durationS + ' s' : ''}` : `${(car || image || cover).w || ''}×${(car || image || cover).h || ''}${car ? ' · ' + (Array.isArray(car.path) ? car.path.length : 1) + ' slides' : ''}`));

  // side
  const capPre = h('pre', null, 'Loading caption…');
  const capCount = h('span', { class: 'edge' }, '');
  const setCap = (t) => { capPre.textContent = t; capCount.textContent = `${t.length} chars`; };
  const capText = d.script?.caption ? `${d.script.caption}${d.script.hashtags?.length ? '\n\n' + d.script.hashtags.join(' ') : ''}` : null;
  if (capOut) fetch(fileUrl(abs(capOut.path))).then((r) => (r.ok ? r.text() : Promise.reject())).then((t) => setCap(t.trim())).catch(() => setCap(capText || 'No caption file.'));
  else setCap(capText || 'No caption in outputs or script.json.');
  const checks = qa?.checks || [];
  const cnt = (s) => checks.filter((c) => c.status === s).length;
  const side = h('div', { class: 'g2-side' },
    h('section', null, h('div', { class: 'sect-h', style: { marginTop: 0 } }, h('h2', null, 'Caption'), h('span', { class: 'edge' }, capOut ? capOut.path : 'script.json')),
      h('div', { class: 'caption-box' }, h('div', { class: 'hd' }, capCount, h('button', { class: 'btn sm', onclick: async () => { const ok = await copyText(capPre.textContent); ctx.app.toast(ok ? 'Caption copied' : 'Copy failed', ok ? 'ok' : 'err', ok ? 'Copied' : 'Error'); } }, icon('copy'), 'Copy')), capPre)),
    h('section', null, h('div', { class: 'sect-h' }, h('h2', null, 'QA checks'), qa ? h('span', { class: 'qa-sum' }, h('span', { class: 'p' }, `${cnt('pass')} pass`), h('span', { class: 'w' }, `${cnt('warn')} warn`), h('span', { class: 'f' }, `${cnt('fail')} fail`)) : null, h('span', { class: 'edge' }, qa?.at ? `run ${ago(qa.at)} ago` : '')),
      checks.length ? h('div', { class: 'qa' }, checks.map((c) => h('div', { class: `qa-c ${c.status}` }, icon(c.status === 'pass' ? 'check' : c.status === 'fail' ? 'x' : c.status === 'warn' ? 'alert' : 'skip'), h('b', null, c.name || c.id), h('span', { class: 'v' }, `${c.value ?? '—'}${c.expected ? '  ·  want ' + c.expected : ''}`), c.detail ? h('span', { class: 'd' }, c.detail) : null))) : h('div', { class: 'empty' }, h('strong', null, 'No QA report yet.'), h('span', null, 'qa/report.json appears after the Critic runs.'))),
    contact ? h('section', null, h('div', { class: 'sect-h' }, h('h2', null, 'Contact sheet')), (() => { const c = h('div', { class: 'contact' }, img(fileUrl(contact, 1200))); c.addEventListener('click', () => lightbox(fileUrl(contact))); return c; })()) : null,
    (qa?.frames || []).length ? h('section', null, h('div', { class: 'sect-h' }, h('h2', null, 'QA frames')), h('div', { class: 'outgrid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))' } }, qa.frames.map((fr) => { const t = thumb(abs(fr), { w: 240 }); t.addEventListener('click', () => lightbox(fileUrl(abs(fr)))); return t; }))) : null);
  out.push(h('div', { class: 'g2' }, phoneCol, side));
  if (open) {
    out.push(h('div', { class: 'actbar' }, notesArea(p, 'Notes for the Director (what to fix)…'),
      h('div', { class: 'acts' },
        h('button', { class: 'btn go lg', onclick: () => decide(job, { gate: 'g2', decision: 'approve', notes: p.notes }, ctx, stage) }, icon('check'), 'Approve'),
        h('button', { class: 'btn lg', onclick: (e) => { if (!p.notes.trim()) { ctx.app.toast('Add a note so the Director knows what to fix', 'err', 'Revise'); e.currentTarget.closest('.actbar').querySelector('textarea').focus(); return; } decide(job, { gate: 'g2', decision: 'revise', notes: p.notes }, ctx, stage); } }, icon('undo'), 'Revise'),
        h('button', { class: 'btn danger lg', onclick: () => decide(job, { gate: 'g2', decision: 'reject', notes: p.notes }, ctx, stage) }, 'Reject'), autoBox())));
  }
  return out;
}
function safeZones(isReel) {
  // Instagram Reels UI: top ~14% (header), bottom ~22% (caption + audio), right ~15% from 45% down (buttons).
  const w = h('div', { class: 'safe', style: { position: 'absolute', inset: 0, pointerEvents: 'none' } });
  if (isReel) {
    w.append(h('div', { class: 'zone', style: { left: 0, right: 0, top: 0, height: '14%' } }, h('span', null, 'Header / tabs')),
      h('div', { class: 'zone', style: { left: 0, right: 0, bottom: 0, height: '22%' } }, h('span', null, 'Caption · audio')),
      h('div', { class: 'zone', style: { right: 0, width: '15%', top: '44%', bottom: '22%' } }, h('span', { style: { writingMode: 'vertical-rl' } }, 'Buttons')));
  } else {
    w.append(h('div', { class: 'zone', style: { left: 0, right: 0, bottom: 0, height: '9%' } }, h('span', null, 'Tags · dots')));
  }
  return w;
}
function cropOverlay(a) {
  const target = 3 / 4;
  const box = h('div', { class: 'crop34' });
  if (a < target) {
    const m = ((1 - a / target) / 2) * 100;
    box.append(h('div', { class: 'm', style: { top: 0, height: `${m}%` } }), h('div', { class: 'm', style: { bottom: 0, height: `${m}%` } }), h('div', { class: 'win', style: { top: `${m}%`, bottom: `${m}%` } }, h('span', null, 'profile grid 3:4')));
  } else {
    const m = ((1 - target / a) / 2) * 100;
    box.append(h('div', { class: 'm', style: { left: 0, width: `${m}%`, top: 0, bottom: 0, right: 'auto' } }), h('div', { class: 'm', style: { right: 0, width: `${m}%`, top: 0, bottom: 0, left: 'auto' } }), h('div', { class: 'win', style: { left: `${m}%`, right: `${m}%`, top: 0, bottom: 0, borderTop: 0, borderBottom: 0, borderLeft: '1px solid #fff', borderRight: '1px solid #fff' } }, h('span', null, '3:4')));
  }
  return box;
}

// ------------------------------------------------------------------ live tab (headless runs for this job)
function liveTab(job, ctx, stage) {
  const id = job.id || view.id; const { app, state } = ctx;
  const wrap = h('div', { class: 'screen livescreen' });
  const cur = runForJob(state, id);
  const head = h('div', { class: 'live-head' });
  const side = h('div', { class: 'live-runs' }, h('div', { class: 'faint' }, 'Loading runs…'));
  const logBox = h('div', { class: 'live-log' });
  wrap.append(head, h('div', { class: 'live-grid' }, logBox, side));
  const showHead = (r) => {
    head.replaceChildren(...[
      r ? runCard(r, state, true) : h('div', { class: 'empty' }, h('strong', null, 'No Desk runs for this job yet.'), h('span', null, 'Runs appear here when this job is started from New piece or continued after a gate decision in the Desk.')),
      r && r.status === 'running' ? h('button', { class: 'btn danger', onclick: async () => { try { await api('POST', '/api/runner/stop'); app.toast('Stop sent: SIGTERM now, SIGKILL in 10 s if needed', 'ok', 'Runner'); } catch (e) { app.toast(e.message, 'err'); } } }, icon('x'), 'Stop run') : null,
    ].filter(Boolean));
  };
  const pick = (r) => {
    view.liveSel = r.id || `n${r.n}`;
    showHead(r);
    logBox.replaceChildren(r.id ? liveLog(app, { runId: r.id }) : liveLog(app, { jobId: id, n: r.n }));
    side.querySelectorAll('.lrun').forEach((b) => b.setAttribute('aria-pressed', b.dataset.k === view.liveSel ? 'true' : 'false'));
  };
  showHead(cur);
  api('GET', `/api/job/${encodeURIComponent(id)}/runs`).then((d) => {
    const runs = d.runs || [];
    side.replaceChildren(h('div', { class: 'np-sh' }, 'Runs', h('span', null, String(runs.length))), ...runs.map((r) => h('button', { class: 'lrun', 'data-k': r.id || `n${r.n}`, onclick: () => pick(r) },
      h('span', { class: `status ${r.status === 'running' ? 'run' : r.status === 'done' ? 'done' : r.status === 'queued' ? 'park' : r.status === 'waiting' ? 'wait' : 'fail'}` }, h('i'), r.status),
      h('b', null, r.n ? `#${r.n}` : 'new'), h('span', null, (r.text || r.label || '').replace(/^\/create\s*/, '')), h('span', { class: 'edge' }, r.started ? `${clock(r.started)}${r.ended ? '–' + clock(r.ended) : ''}` : r.created ? `queued ${ago(r.created)} ago` : ''))));
    if (!runs.length) { side.append(h('div', { class: 'faint' }, 'None yet.')); return; }
    const want = runs.find((r) => (r.id || `n${r.n}`) === view.liveSel) || runs.find((r) => r.status === 'running') || runs.find((r) => r.status !== 'queued') || runs[0];
    pick(want);
  }).catch((e) => side.replaceChildren(h('div', { class: 'err-line' }, e.message)));
  return wrap;
}

// ------------------------------------------------------------------ log tab
function logTab(job, d) {
  const base = d.dir;
  return h('div', { class: 'screen', style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '28px' } },
    h('section', null, h('div', { class: 'sect-h', style: { marginTop: 0 } }, h('h2', null, 'Log')),
      (job.log || []).length ? h('div', { class: 'loglist' }, [...job.log].reverse().map((l) => h('div', null, h('span', { class: 't' }, clock(l.t)), h('span', { class: 'n' }, l.node), h('span', null, l.msg)))) : h('div', { class: 'faint' }, 'No log lines.'),
      h('div', { class: 'sect-h' }, h('h2', null, 'Steps')),
      h('div', { class: 'phase-list' }, (job.nodes || []).map((n) => h('div', null, h('span', { style: { color: n.status === 'done' ? 'var(--run)' : n.status === 'failed' ? 'var(--fail)' : n.status === 'waiting' ? 'var(--wait)' : 'var(--ink-3)' } }, nodeStatusIcon(n.status) || icon('skip')), h('div', null, h('b', null, `${n.id} · ${n.status}`), h('span', null, `${n.summary || ''}${n.started ? ' · ' + dur(n.started, n.ended) : ''}`)))))),
    h('section', null,
      d.script?.math?.length ? [h('div', { class: 'sect-h', style: { marginTop: 0 } }, h('h2', null, 'Math checks')), h('div', { class: 'rules-list' }, d.script.math.map((m) => h('div', null, h('span', { class: 'k' }, 'math'), h('span', null, `${m.claim}: ${m.working} = ${m.result}`))))] : null,
      h('div', { class: 'sect-h', style: { marginTop: d.script?.math?.length ? null : 0 } }, h('h2', null, 'Job folder'), h('span', { class: 'edge' }, `${(d.files || []).length} files`)),
      h('div', { class: 'filelist' }, (d.files || []).slice(0, 120).map((f) => h('a', { href: fileUrl(`${base}/${f}`), target: '_blank', rel: 'noopener' }, icon('file'), h('span', null, f)))),
      h('div', { class: 'edge', style: { marginTop: '10px' } }, base)));
}
