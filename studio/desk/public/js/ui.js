// Shared helpers: element builder, icons, formatting, media URLs, clipboard, lightbox.

export function h(tag, attrs, ...kids) {
  const el = tag.includes(':') ? document.createElementNS('http://www.w3.org/2000/svg', tag.split(':')[1]) : document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.setAttribute('class', v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else if (k instanceof Node) el.appendChild(k);
    else el.appendChild(document.createTextNode(String(k)));
  }
}
export const frag = (...kids) => { const f = document.createDocumentFragment(); append(f, kids); return f; };

// ------------------------------------------------------------ icons (authored, 24 grid, 1.6 stroke)
const P = {
  flow: '<circle cx="5" cy="6" r="2.2"/><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="12" r="2.2"/><path d="M7.2 6c5 0 4.6 6 9.6 6M7.2 18c5 0 4.6-6 9.6-6"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18.4 5.6"/><circle cx="16" cy="9" r="1" fill="currentColor"/>',
  clients: '<rect x="3.5" y="4" width="17" height="16" rx="1"/><circle cx="12" cy="10.2" r="2.8"/><path d="M7 17.5c1-2.4 2.8-3.5 5-3.5s4 1.1 5 3.5"/>',
  library: '<rect x="3.5" y="5" width="5" height="14"/><rect x="9.5" y="5" width="5" height="14"/><path d="m16 5.6 4.6 1.3-3.7 12.9-4.5-1.3"/>',
  gate: '<path d="M5 20V5M19 20V5M5 9h14M5 13h14"/><path d="M8 9l3 4M13 9l3 4" opacity=".6"/>',
  gauge: '<path d="M3.8 17a8.2 8.2 0 1 1 16.4 0"/><path d="M12 17l4.2-5.2"/><circle cx="12" cy="17" r="1.4" fill="currentColor"/><path d="M6.4 11.2l1 .8M12 7.8v1.3M17.6 11.2l-1 .8"/>',
  batch: '<rect x="3.5" y="4" width="5" height="16"/><rect x="9.5" y="4" width="5" height="16"/><rect x="15.5" y="4" width="5" height="16"/>',
  check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4L12 4Z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  dot: '<circle cx="12" cy="12" r="4" fill="currentColor"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  skip: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/>',
  play: '<path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="1"/><path d="M15.5 5.5V4.5h-11v11h1"/>',
  ext: '<path d="M13.5 4.5h6v6M19.5 4.5 11 13M10 6H4.5v13.5H18V14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="1"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7 14h10"/>',
  file: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/>',
  film: '<rect x="3.5" y="4" width="17" height="16"/><path d="M7.5 4v16M16.5 4v16M3.5 8h4M3.5 12h4M3.5 16h4M16.5 8h4M16.5 12h4M16.5 16h4"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 4 4 2.5-2.5L20 19"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z"/>',
  idea: '<path d="M9 17.5h6M10 20.5h4M12 3.5a6 6 0 0 0-3.6 10.8c.6.5 1 1.3 1 2.2h5.2c0-.9.4-1.7 1-2.2A6 6 0 0 0 12 3.5Z"/>',
  terminal: '<path d="m5 7 5 5-5 5M12 17h7"/>',
  inbox: '<path d="M3.5 13.5 6 5h12l2.5 8.5v5h-17z"/><path d="M3.5 13.5h5l1 2h5l1-2h5"/>',
  brain: '<path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1v-12a3 3 0 0 0-3-2ZM15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
  shield: '<path d="M12 3.5 5 6v6c0 4 3 7 7 8.5 4-1.5 7-4.5 7-8.5V6l-7-2.5Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  clap: '<path d="M4 9.5h16v10H4z"/><path d="m4 9.5 1-4.6 15.6 3.3-.6 1.3M8.6 5.7l2 3.8M13.5 6.7l2 3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  archive: '<rect x="3.5" y="4.5" width="17" height="4"/><path d="M5 8.5v11h14v-11M10 12.5h4"/>',
  star: '<path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8z" fill="currentColor"/>',
  mix: '<path d="M4 7h4c4 0 4 10 8 10h4M4 17h4c1.6 0 2.5-1.6 3.3-3.4M13 10.4C13.6 8.6 14.4 7 16 7h4"/><path d="m18 5 2 2-2 2M18 15l2 2-2 2"/>',
  undo: '<path d="M8 8H15a5 5 0 0 1 0 10h-5"/><path d="M11 4.5 7.5 8l3.5 3.5"/>',
  grid34: '<rect x="5" y="3.5" width="14" height="17"/><path d="M5 7.5h14M5 16.5h14" stroke-dasharray="2 2"/>',
  safe: '<rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M6 6.5h12M6 16h12"/>',
  // platform glyphs
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/>',
  facebook: '<path d="M14.5 8.5h2.5V5h-2.6C11.6 5 10.5 6.8 10.5 9.3V11H8v3.4h2.5V21h3.4v-6.6h2.7l.5-3.4h-3.2V9.6c0-.7.3-1.1 1.1-1.1Z" fill="currentColor" stroke="none"/>',
  linkedin: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M8 10.5V17M8 7.3v.2M11.5 17v-6.5M11.5 13.3c0-1.6 1.1-2.9 2.6-2.9s2.4 1 2.4 2.8V17"/>',
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="3.5"/><path d="m10 9 5 3-5 3z" fill="currentColor"/>',
  tiktok: '<path d="M13.5 3.5v11.8a3.2 3.2 0 1 1-3.2-3.2M13.5 3.5c.4 2.6 2 4.2 4.6 4.5"/>',
  web: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.4 5.3 3.4 8.5s-1 6.1-3.4 8.5c-2.4-2.4-3.4-5.3-3.4-8.5s1-6.1 3.4-8.5Z"/>',
  x_social: '<path d="m5 4.5 14 15M19 4.5l-14 15" />',
};
export function icon(name, cls = '') {
  const d = P[name] || P.dot;
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.6'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  if (cls) s.setAttribute('class', cls);
  s.innerHTML = d;
  return s;
}
export const PLATFORMS = ['instagram', 'facebook', 'linkedin', 'youtube', 'tiktok', 'web'];
export const PLATFORM_NAME = { instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', youtube: 'YouTube', tiktok: 'TikTok', web: 'Web' };

// ------------------------------------------------------------ formatting
export function fileUrl(p, w) {
  if (!p) return null;
  if (/^https?:\/\//.test(p)) return p;
  return `/file?p=${encodeURIComponent(p)}${w ? `&w=${w}` : ''}`;
}
export function ago(iso) {
  if (!iso) return '—';
  const t = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).getTime();
  if (Number.isNaN(t)) return '—';
  const s = (Date.now() - t) / 1000;
  if (s < 0) return 'soon';
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 60) return `${Math.floor(s / 86400)}d`;
  if (s < 86400 * 365) return `${Math.floor(s / 86400 / 30)}mo`;
  return `${Math.floor(s / 86400 / 365)}y`;
}
export function clock(iso) {
  if (!iso) return '';
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}
export function dur(a, b) {
  if (!a) return '';
  const s = ((b ? new Date(b) : new Date()) - new Date(a)) / 1000;
  if (!Number.isFinite(s) || s < 0) return '';
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60).toString().padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60).toString().padStart(2, '0')}m`;
}
export function num(n) {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n); if (!Number.isFinite(v)) return String(n);
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (v >= 1e4) return Math.round(v / 1e3) + 'K';
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(v));
}
export const FORMAT_COLOR = { 'graphic-reel': 'var(--f-reel)', reel: 'var(--f-reel)', 'short-reel': 'var(--f-short)', short: 'var(--f-short)', video: 'var(--f-short)', carousel: 'var(--f-carousel)', static: 'var(--f-static)', image: 'var(--f-static)', story: 'var(--f-story)', cover: 'var(--f-cover)', 'footage-reel': 'var(--f-footage)', gif: 'var(--f-gif)', article: 'var(--ink-3)' };
export function fmtChip(f) { return h('span', { class: 'fmt', style: { '--fc': FORMAT_COLOR[f] || 'var(--ink-3)' } }, h('i'), f || '—'); }
const STATUS_CLASS = { running: 'run', producing: 'run', checking: 'run', intake: 'run', concepts: 'run', qa: 'run', waiting: 'wait', gate1: 'wait', gate2: 'wait', failed: 'fail', rejected: 'fail', done: 'done', approved: 'done', delivered: 'done', parked: 'park', idle: 'park', draft: 'park', skipped: 'park' };
const STATUS_LABEL = { gate1: 'Gate 1', gate2: 'Gate 2' };
export function statusChip(s) { return h('span', { class: `status ${STATUS_CLASS[s] || ''}` }, h('i'), STATUS_LABEL[s] || s || 'unknown'); }
export function slugName(slug, state) {
  if (!slug) return '—';
  if (String(slug).startsWith('group:')) return `Group ${String(slug).slice(6)}`;
  const k = state?.kits?.items?.find((x) => x.slug === slug || (x.aliases || []).includes(slug));
  if (k?.name) return k.name;
  const r = state?.roster?.find((x) => x.slug === slug);
  if (r?.name) return r.name;
  return String(slug).split('-').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' ');
}
export function kitFor(slug, state) { return state?.kits?.items?.find((x) => x.slug === slug || (x.aliases || []).includes(slug)) || null; }

// ------------------------------------------------------------ media elements
export function img(src, opts = {}) {
  const el = h('img', { alt: opts.alt || '', loading: opts.eager ? 'eager' : 'lazy', decoding: 'async', draggable: 'false' });
  el.addEventListener('load', () => el.classList.add('ok'));
  el.addEventListener('error', () => { el.remove(); opts.onError?.(); });
  if (src) el.src = src;
  return el;
}
export function thumb(path, { w = 480, cls = '', alt = '', ratio } = {}) {
  const t = h('div', { class: `thumb ${cls}`, style: ratio ? { aspectRatio: ratio } : undefined });
  if (!path) { t.classList.add('img-ph'); return t; }
  const isVid = /\.(mp4|mov|webm|m4v)$/i.test(path);
  const src = /^https?:/.test(path) ? path : fileUrl(path, isVid || !/\.(svg)$/i.test(path) ? w : undefined);
  t.appendChild(img(src, { alt, onError: () => t.classList.add('img-ph') }));
  return t;
}
export function ytId(post) {
  if (post.platform !== 'youtube') return null;
  const m = String(post.id || '').match(/^yt-([\w-]{6,})$/); if (m) return m[1];
  try { const u = new URL(post.url); return u.searchParams.get('v') || (u.pathname.match(/\/shorts\/([\w-]+)/) || [])[1] || (u.hostname.includes('youtu.be') ? u.pathname.slice(1) : null); } catch { return null; }
}
export function postThumb(post) {
  if (post.thumb) return /^https?:/.test(post.thumb) ? post.thumb : post.thumb;
  const id = ytId(post); if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return null;
}

export function lightbox(src, isVideo) {
  const box = h('div', { class: 'lightbox', role: 'dialog', 'aria-label': 'Preview', onclick: () => box.remove() });
  if (isVideo) { const v = h('video', { src, controls: true, autoplay: true, playsinline: true }); v.addEventListener('click', (e) => e.stopPropagation()); box.appendChild(v); }
  else box.appendChild(h('img', { src, alt: '' }));
  const esc = (e) => { if (e.key === 'Escape') { box.remove(); document.removeEventListener('keydown', esc, true); e.stopPropagation(); } };
  document.addEventListener('keydown', esc, true);
  document.body.appendChild(box);
}

export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }); ta.value = t; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* */ } ta.remove(); return ok;
  }
}

export async function api(method, url, body) {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch { /* */ }
  if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export function ring(value, size = 46) {
  const v = typeof value === 'number' ? Math.max(0, Math.min(1, value)) : null;
  const r = 19, c = 2 * Math.PI * r;
  const wrap = h('div', { class: `ring ${v === null ? 'low' : v >= 0.85 ? '' : v >= 0.6 ? 'mid' : 'low'}`, title: v === null ? 'Kit not built' : `Kit ${Math.round(v * 100)}% complete` });
  const svg = h('svg:svg', { viewBox: '0 0 46 46' },
    h('svg:circle', { class: 'bg', cx: 23, cy: 23, r, fill: 'none', 'stroke-width': 3 }),
    h('svg:circle', { class: 'fg', cx: 23, cy: 23, r, fill: 'none', 'stroke-width': 3, 'stroke-dasharray': c, 'stroke-dashoffset': v === null ? c : c * (1 - v), 'stroke-linecap': 'butt' }));
  wrap.append(svg, h('b', null, v === null ? '—' : `${Math.round(v * 100)}`));
  if (size !== 46) { wrap.style.width = wrap.style.height = size + 'px'; svg.style.width = svg.style.height = size + 'px'; }
  return wrap;
}

export function nodeStatusIcon(st) {
  if (st === 'done') return icon('check');
  if (st === 'failed') return icon('x');
  if (st === 'waiting') return icon('alert');
  if (st === 'skipped') return icon('skip');
  if (st === 'running') return h('i');
  return null;
}

export function faceKids(photo, name, w = 160) {
  const ini = String(name || '?').split(/[\s-]+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('');
  return photo ? img(fileUrl(photo, w), { alt: name || '' }) : h('span', { class: 'ini', 'aria-hidden': 'true' }, ini);
}
