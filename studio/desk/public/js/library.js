// LIBRARY: wall of past pieces; video cards preview muted on hover (Range-served); filters; detail drawer.
import { h, icon, thumb, fileUrl, fmtChip, statusChip, slugName, ago, lightbox } from './ui.js';

const f = { format: '', engine: '', style: '', client: '', status: '', q: '' };

export function title({ state }) {
  const l = state?.library;
  return { title: 'Library', sub: l ? `${l.cards.length} pieces` : '', sample: l?.sample };
}
export function onLive(stage, ctx) { if (document.activeElement?.closest?.('.stage input')) return; render(stage, ctx); }

const isVid = (p) => /\.(mp4|mov|webm|m4v)$/i.test(p || '');
function ratioClass(c) { const s = String(c.size || ''); const m = s.match(/(\d+)\s*x\s*(\d+)/); if (!m) return /carousel|static/.test(c.format) ? 'r45' : ''; const r = m[1] / m[2]; return r > 0.95 ? 'r11' : r > 0.7 ? 'r45' : ''; }

export function render(stage, ctx) {
  const { state, route } = ctx;
  const cards = state.library?.cards || [];
  const prev = stage.scrollTop;
  const opts = (k) => [...new Set(cards.map((c) => c[k]).filter(Boolean))].sort();
  const clients = [...new Set(cards.flatMap((c) => c.clients || []))].sort();
  const q = f.q.trim().toLowerCase();
  const list = cards.filter((c) => (!f.format || c.format === f.format) && (!f.engine || c.engine === f.engine) && (!f.style || c.style === f.style) && (!f.status || c.status === f.status)
    && (!f.client || (f.client === '__generic' ? c.generic || !(c.clients || []).length : (c.clients || []).includes(f.client)))
    && (!q || `${c.title} ${c.hook} ${c.topic} ${(c.tags || []).join(' ')}`.toLowerCase().includes(q)));
  const rer = () => render(stage, ctx);
  const sel = (label, key, values, fmt = (x) => x) => h('label', { class: 'field' }, h('span', null, label), h('select', { class: 'select', onchange: (e) => { f[key] = e.target.value; rer(); } }, h('option', { value: '' }, 'All'), values.map((v) => h('option', { value: v, selected: f[key] === v ? true : null }, fmt(v)))));
  const bar = h('div', { class: 'filters' },
    sel('Format', 'format', opts('format')), sel('Engine', 'engine', opts('engine')), sel('Style', 'style', opts('style')),
    h('label', { class: 'field' }, h('span', null, 'Client'), h('select', { class: 'select', onchange: (e) => { f.client = e.target.value; rer(); } }, h('option', { value: '' }, 'All'), h('option', { value: '__generic', selected: f.client === '__generic' ? true : null }, 'Generic (no client)'), clients.map((v) => h('option', { value: v, selected: f.client === v ? true : null }, slugName(v, state))))),
    sel('Status', 'status', opts('status')),
    h('label', { class: 'field grow' }, h('span', null, 'Search'), h('input', { class: 'input', type: 'search', placeholder: 'Title, hook, topic, tag', value: f.q, oninput: (e) => { f.q = e.target.value; clearTimeout(f.t); f.t = setTimeout(rer, 150); } })));
  const wall = h('div', { class: 'lwall' }, list.map((c) => libCard(c, ctx)));
  stage.replaceChildren(h('div', { class: 'screen' }, bar,
    h('div', { class: 'wall-meta' }, h('span', { class: 'edge' }, `${list.length} of ${cards.length} pieces · newest first`), h('span', { class: 'edge' }, 'hover a video to preview')),
    list.length ? wall : h('div', { class: 'empty' }, h('strong', null, cards.length ? 'Nothing matches.' : 'The library is empty.'), h('span', null, cards.length ? 'Loosen a filter.' : 'The Librarian files every approved piece here.'))));
  stage.scrollTop = prev;
  if (route.query?.open) { const c = cards.find((x) => x.id === route.query.open); if (c) openCard(c, ctx); history.replaceState(null, '', '#/library'); }
}

function libCard(c, ctx) {
  const poster = c.files?.thumb || c.files?.poster || (!isVid(c.files?.final) ? c.files?.final : null) || c.files?.final;
  const t = thumb(poster, { w: 360, cls: ratioClass(c) });
  const vid = isVid(c.files?.final) ? c.files.final : null;
  if (vid) {
    t.append(h('span', { class: 'play' }, icon('play')));
    let v = null, timer = null;
    const start = () => { timer = setTimeout(() => {
      if (!v) { v = h('video', { muted: true, loop: true, playsinline: true, preload: 'none' }); v.muted = true; v.src = fileUrl(vid); t.appendChild(v); v.addEventListener('playing', () => v.classList.add('on')); }
      v.currentTime = Math.min(3, v.duration || 3); v.play().catch(() => {});
    }, 180); };
    const stop = () => { clearTimeout(timer); if (v) { v.pause(); v.classList.remove('on'); } };
    t.addEventListener('pointerenter', start); t.addEventListener('pointerleave', stop);
  }
  const st = c.status && c.status !== 'delivered' ? statusChip(c.status) : null;
  if (st) { st.classList.add('st-dot'); t.append(st); }
  const who = (c.clients || []).length ? c.clients.map((x) => slugName(x, ctx.state)).join(', ') : 'Generic';
  return h('button', { class: 'lcard', onclick: () => openCard(c, ctx) }, t,
    h('div', { class: 'meta' }, h('b', null, c.title || c.id), h('span', { class: 'edge' }, `${c.style || c.engine || ''} · ${c.date || ''}`), h('span', { style: { display: 'flex', justifyContent: 'space-between', gap: '6px', alignItems: 'center' } }, fmtChip(c.format), h('span', { class: 'faint', style: { fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, who))));
}

function openCard(c, ctx) {
  const { app, state } = ctx;
  app.openDrawer(() => {
    const vid = isVid(c.files?.final) ? c.files.final : null;
    const poster = c.files?.poster || c.files?.thumb || c.files?.final;
    const rc = ratioClass(c);
    const hero = h('div', { class: `hero ${rc}` }, vid ? h('video', { src: fileUrl(vid), poster: poster && !isVid(poster) ? fileUrl(poster, 720) : null, controls: true, playsinline: true, preload: 'metadata' }) : poster ? h('img', { src: fileUrl(poster, 900), alt: '', onclick: () => lightbox(fileUrl(poster)), style: { cursor: 'zoom-in' } }) : null);
    const kv = (k, v) => (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) ? null : [h('dt', null, k), h('dd', null, Array.isArray(v) ? h('div', { class: 'chips' }, v.map((x) => h('span', { class: 'chip' }, x))) : String(v))]);
    return [
      h('div', { class: 'dr-h' }, h('div', null, h('h3', null, c.title || c.id), h('div', { class: 'sub' }, [(c.clients || []).map((x) => slugName(x, state)).join(', ') || 'Generic', c.date, c.status].filter(Boolean).join(' · '))),
        h('button', { class: 'ibtn', onclick: () => app.closeDrawer(), title: 'Close (Esc)' }, icon('close'))),
      h('div', { class: 'dr-b ldetail' }, hero,
        c.hook ? h('div', { style: { fontSize: '19px', fontWeight: 700, lineHeight: 1.22 } }, `“${c.hook}”`) : null,
        c.logline ? h('p', { class: 'prose', style: { margin: 0 } }, c.logline) : null,
        h('div', { class: 'dr-sec' }, h('h4', null, 'Treatment'), h('dl', { class: 'kv' },
          kv('Format', c.format), kv('Engine', c.engine), kv('Style', c.style), kv('Size', c.size), kv('Length', c.lengthS ? `${c.lengthS} s @ ${c.fps || '?'} fps` : null),
          kv('Voice', c.voice), kv('Music', c.music), kv('Topic', c.topic), kv('Device', c.device), kv('Hook pattern', c.hookPattern), kv('Structure', c.structure),
          kv('Tags', c.tags), kv('Rejected styles', c.rejectedStyles), kv('Rejected structures', c.rejectedStructures))),
        h('div', { class: 'dr-sec' }, h('h4', null, `Feedback (${(c.feedback || []).length})`), (c.feedback || []).length ? h('div', { class: 'loglist' }, c.feedback.map((fb) => h('div', null, h('span', { class: 't' }, fb.gate || ''), h('span', { class: 'n' }, fb.decision || ''), h('span', null, fb.notes || (typeof fb === 'string' ? fb : ''))))) : h('div', { class: 'faint' }, 'No gate feedback recorded.')),
        (c.lessons || []).length ? h('div', { class: 'dr-sec' }, h('h4', null, 'Lessons'), h('div', { class: 'rules-list' }, c.lessons.map((l) => h('div', null, h('span', { class: 'k' }, 'lesson'), h('span', null, l))))) : null,
        h('div', { class: 'dr-sec' }, h('h4', null, 'Files'), h('div', { class: 'filelist' }, Object.entries(c.files || {}).filter(([, v]) => v && typeof v === 'string').map(([k, v]) => h('a', { href: fileUrl(v), target: '_blank', rel: 'noopener' }, icon(isVid(v) ? 'film' : /\.(png|jpe?g)$/i.test(v) ? 'image' : 'file'), h('span', null, `${k} · ${v.split('/').slice(-2).join('/')}`))))),
        h('div', { class: 'edge' }, `${c.id} · source ${c.source || '—'}${c.sample ? ' · sample' : ''}`)),
    ];
  }, { key: `lib:${c.id}`, wide: false });
}
