// BATCH: every job at one gate, one column per client, decide a whole group in one screen.
import { faceKids, h, icon, thumb, img, fileUrl, slugName, kitFor, statusChip, fmtChip, api, ago } from './ui.js';

const view = { gate: 'g1', sel: {}, notes: {}, busy: new Set() };

function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function topicKey(j) {
  // job ids look like YYYY-MM-DD-<client>-<topic>; strip date and client to get the shared topic
  const id = String(j.id || ''); const client = String(j.client || '').replace(/^group:/, 'group-');
  const rest = id.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  return rest.startsWith(client + '-') ? rest.slice(client.length + 1) : rest;
}
function matches(j, filt) {
  if (!filt) return true;
  const f = slugify(filt);
  return String(j.id).includes(f) || topicKey(j).includes(f) || slugify(j.topic).includes(f) || String(j.created || '').startsWith(filt);
}

export function title({ state, route }) {
  const filt = route.params[0];
  return { title: 'Batch', sub: filt ? `Filtered: ${filt}` : `All jobs at ${view.gate === 'g1' ? 'Gate 1' : 'Gate 2'}`, sample: (state?.jobs || []).some((j) => j.sample) };
}
export function onLive(stage, ctx) { if (document.activeElement?.closest?.('.batch input')) return; render(stage, ctx); }

export function render(stage, ctx) {
  const { state, route, app } = ctx;
  const filt = route.params[0] || '';
  if (route.query?.gate === 'g2' || route.query?.gate === 'g1') view.gate = route.query.gate;
  const status = view.gate === 'g1' ? 'gate1' : 'gate2';
  const all = (state.jobs || []).filter((j) => matches(j, filt));
  const atGate = all.filter((j) => j.status === status);
  const decidedHere = all.filter((j) => j.status !== status && j.gates?.[view.gate]?.decision && j.gates[view.gate].by === 'desk' && Date.now() - new Date(j.gates[view.gate].at).getTime() < 6 * 3600e3);
  const topics = [...new Set((state.jobs || []).filter((j) => j.status === 'gate1' || j.status === 'gate2').map(topicKey))];
  const g1n = (state.jobs || []).filter((j) => j.status === 'gate1' && matches(j, filt)).length;
  const g2n = (state.jobs || []).filter((j) => j.status === 'gate2' && matches(j, filt)).length;

  const selectedReady = atGate.filter((j) => view.gate === 'g1' ? view.sel[j.id] : true);
  const bar = h('div', { class: 'filters', style: { padding: '14px 22px 12px', margin: 0 } },
    h('div', { class: 'field' }, h('span', null, 'Gate'), h('div', { class: 'seg' },
      h('button', { 'aria-pressed': view.gate === 'g1' ? 'true' : 'false', onclick: () => { view.gate = 'g1'; render(stage, ctx); app.setTop(null); } }, `Gate 1 · ${g1n}`),
      h('button', { 'aria-pressed': view.gate === 'g2' ? 'true' : 'false', onclick: () => { view.gate = 'g2'; render(stage, ctx); app.setTop(null); } }, `Gate 2 · ${g2n}`))),
    h('label', { class: 'field' }, h('span', null, 'Topic'), h('select', { class: 'select', onchange: (e) => { location.hash = e.target.value ? `#/batch/${encodeURIComponent(e.target.value)}` : '#/batch'; } },
      h('option', { value: '' }, 'All topics'), topics.map((t) => h('option', { value: t, selected: slugify(filt) === t ? true : null }, t)))),
    h('div', { class: 'edge', style: { alignSelf: 'center' } }, `${atGate.length} waiting · ${decidedHere.length} decided this session`),
    view.gate === 'g1' && atGate.length > 1 ? h('button', { class: 'btn go', style: { marginLeft: 'auto' }, disabled: !selectedReady.length ? true : null, onclick: async () => {
      for (const j of selectedReady) await decide(j, { gate: 'g1', decision: 'pick', choice: view.sel[j.id], notes: view.notes[j.id] || '' }, ctx, true);
      await app.refresh(); render(stage, ctx);
    } }, icon('check'), selectedReady.length ? `Pick ${selectedReady.length} selected` : 'Select concepts to pick') : null,
    view.gate === 'g2' && atGate.length > 1 ? h('button', { class: 'btn go', style: { marginLeft: 'auto' }, onclick: async () => {
      for (const j of atGate) await decide(j, { gate: 'g2', decision: 'approve', notes: view.notes[j.id] || '' }, ctx, true);
      await app.refresh(); render(stage, ctx);
    } }, icon('check'), `Approve all ${atGate.length}`) : null);

  const cols = [...atGate, ...decidedHere].map((j) => column(j, ctx, stage));
  const body = cols.length ? h('div', { class: 'batch' }, cols) : h('div', { class: 'screen' }, h('div', { class: 'empty' }, h('strong', null, `Nothing at ${view.gate === 'g1' ? 'Gate 1' : 'Gate 2'}${filt ? ` for “${filt}”` : ''}.`), h('span', null, 'Group batches (/create … for group 2) land here as one column per client.'), filt ? h('a', { class: 'btn sm', href: '#/batch' }, 'Clear filter') : null));
  stage.replaceChildren(h('div', { style: { display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: '100%' } }, h('div', { style: { borderBottom: '1px solid var(--line)', background: 'var(--ground-2)' } }, bar), body));
}

function column(j, ctx, stage) {
  const { state } = ctx;
  const kit = kitFor(j.client, state);
  const g = j.gates?.[view.gate] || {};
  const done = j.status !== (view.gate === 'g1' ? 'gate1' : 'gate2');
  const head = h('div', { class: 'bcol-h' }, h('div', { class: 'face' }, faceKids(kit?.photo, slugName(j.client, state), 120)),
    h('div', { style: { minWidth: 0 } }, h('a', { href: `#/job/${encodeURIComponent(j.id)}`, style: { textDecoration: 'none' } }, h('b', null, slugName(j.client, state))), h('div', { class: 'edge' }, `${j.format || ''} · ${ago(j.updated)} ago`)));
  const items = [head];
  if (done) {
    items.push(h('div', { class: 'decided', style: { padding: '8px 10px' } }, icon('check'), h('span', null, h('b', null, g.decision === 'pick' ? `Picked ${g.choice}` : g.decision === 'approve' ? 'Approved' : g.decision), g.notes ? ` · ${g.notes}` : '')));
  }
  if (view.gate === 'g1') {
    for (const c of j.concepts || []) {
      const on = view.sel[j.id] === c.id || (done && String(g.choice || '').split('+').includes(c.id));
      items.push(h('button', { class: 'bmini', 'aria-pressed': on ? 'true' : 'false', disabled: done ? true : null, onclick: () => { view.sel[j.id] = view.sel[j.id] === c.id ? null : c.id; render(stage, ctx); } },
        thumb(c.preview, { w: 160 }),
        h('div', { style: { minWidth: 0 } }, h('div', { class: 'l' }, c.id, h('span', { style: { fontSize: '12px', fontStretch: '100%', fontWeight: 600, marginLeft: '8px' } }, c.title || '')), h('div', { class: 'h' }, c.hook || ''), h('span', { class: 'edge' }, `${c.engine || ''} · ${c.style || ''}`))));
    }
    if (!(j.concepts || []).length && !done) items.push(h('div', { class: 'faint' }, 'No concepts yet.'));
  } else {
    const v = (j.outputs || []).find((o) => o.kind === 'video');
    const cover = (j.outputs || []).find((o) => o.kind === 'cover' || o.kind === 'image' || o.kind === 'carousel');
    const coverPath = cover ? (Array.isArray(cover.path) ? cover.path[0] : cover.path) : null;
    items.push(h('div', { class: 'bphone', style: { aspectRatio: v ? '9 / 16' : '4 / 5' } }, v ? h('video', { src: fileUrl(v.path), poster: coverPath ? fileUrl(coverPath, 600) : null, controls: true, playsinline: true, preload: 'none' }) : coverPath ? h('img', { src: fileUrl(coverPath, 700), alt: '' }) : null));
    items.push(h('div', null, j.qa?.pass === true ? h('span', { class: 'status done' }, h('i'), 'QA pass') : j.qa?.pass === false ? h('span', { class: 'status fail' }, h('i'), 'QA has failures') : statusChip('qa')));
  }
  if (!done) {
    const notes = h('input', { class: 'input', placeholder: 'Note (optional)', value: view.notes[j.id] || '', oninput: (e) => { view.notes[j.id] = e.target.value; } });
    items.push(notes);
    items.push(h('div', { class: 'acts' },
      view.gate === 'g1'
        ? h('button', { class: 'btn go', disabled: !view.sel[j.id] || view.busy.has(j.id) ? true : null, onclick: () => decide(j, { gate: 'g1', decision: 'pick', choice: view.sel[j.id], notes: view.notes[j.id] || '' }, ctx) }, icon('check'), view.sel[j.id] ? `Pick ${view.sel[j.id]}` : 'Pick')
        : h('button', { class: 'btn go', disabled: view.busy.has(j.id) ? true : null, onclick: () => decide(j, { gate: 'g2', decision: 'approve', notes: view.notes[j.id] || '' }, ctx) }, icon('check'), 'Approve'),
      h('button', { class: 'btn', onclick: () => { if (!(view.notes[j.id] || '').trim()) { ctx.app.toast('Add a note first so the agent knows what to change', 'err', 'Revise'); notes.focus(); return; } decide(j, { gate: view.gate, decision: 'revise', notes: view.notes[j.id] }, ctx); } }, 'Revise'),
      h('a', { class: 'btn ghost', href: `#/job/${encodeURIComponent(j.id)}` }, 'Open')));
  }
  return h('div', { class: `bcol ${done ? 'done' : ''}` }, items);
}

async function decide(j, body, ctx, quiet) {
  view.busy.add(j.id);
  try {
    const res = await api('POST', `/api/job/${encodeURIComponent(j.id)}/gate`, body);
    ctx.app.toast(`${slugName(j.client, ctx.state)}: ${body.decision === 'pick' ? 'picked ' + body.choice : body.decision}${res.sample ? ' (sample)' : ''}`, 'ok', body.gate.toUpperCase());
    delete view.sel[j.id]; delete view.notes[j.id];
  } catch (e) { ctx.app.toast(`${slugName(j.client, ctx.state)}: ${e.message}`, 'err'); }
  finally { view.busy.delete(j.id); }
  if (!quiet) { await ctx.app.refresh(); render(document.getElementById('stage'), ctx); }
}
