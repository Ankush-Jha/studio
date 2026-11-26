// RADAR: dense masonry wall of competitor (and client) posts, account rail, filters, detail + "Make our version".
import { h, icon, thumb, ago, num, PLATFORMS, PLATFORM_NAME, postThumb, api, copyText, fmtChip, slugName, kitFor, faceKids, fileUrl } from './ui.js';

const f = { mode: 'competitors', platforms: new Set(), region: '', format: '', topic: '', minOx: 0, range: 'all', from: '', to: '', sort: 'outlier', q: '', account: null, acctQ: '' };
const view = { ro: null, paste: { url: '', account: '', note: '' }, make: { client: '', format: 'graphic reel' } };

export function title({ state, route }) {
  const r = state?.radar; const sub = route?.params?.[0];
  if (sub === 'patterns') return { title: 'Radar', sub: r?.patterns ? `Patterns · ${r.patterns.window || ''} · as of ${r.patterns.asOf || ''}` : 'Patterns' };
  if (sub === 'clients') return { title: 'Radar', sub: `Our clients on Instagram${r?.clientStatsAsOf ? ' · as of ' + r.clientStatsAsOf : ''}` };
  return { title: 'Radar', sub: r ? `${r.summary.posts} posts · ${r.summary.accounts} accounts` : '', sample: r?.sample };
}
function rtabs(cur, r) {
  const t = (key, label, n) => h('a', { role: 'tab', href: key ? `#/radar/${key}` : '#/radar', 'aria-selected': cur === key ? 'true' : 'false' }, label, n != null ? h('span', { class: 'n' }, String(n)) : null);
  return h('div', { class: 'tabs rtabs', role: 'tablist' }, t('', 'Wall', r.posts?.length || 0), t('patterns', 'Patterns', r.patterns?.patterns?.length ?? null), t('clients', 'Clients', r.clientStats ? Object.keys(r.clientStats).length : null));
}

function acctMap(state) { return Object.fromEntries((state.radar?.accounts || []).map((a) => [a.id, a])); }
function isClientSide(p, A) { return A[p.account]?.source === 'client' || p.source === 'client'; }
function oxClass(o) { if (typeof o !== 'number') return 'low'; if (o >= 5) return 'hot'; if (o >= 2.5) return 'warm'; if (o >= 1.5) return 'mild'; return 'low'; }
function ratio(p) { if (p.format === 'video') return 16 / 9; if (p.format === 'short' || p.format === 'reel') return 9 / 16; if (p.format === 'article') return 4 / 3; return 4 / 5; }
function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }

function filtered(state) {
  const A = acctMap(state);
  const now = Date.now();
  const rangeDays = { '7d': 7, '30d': 30, '90d': 90 }[f.range];
  const q = f.q.trim().toLowerCase();
  let list = (state.radar?.posts || []).filter((p) => {
    const side = isClientSide(p, A);
    if (f.mode === 'competitors' && side) return false;
    if (f.mode === 'clients' && !side) return false;
    if (f.platforms.size && !f.platforms.has(p.platform)) return false;
    if (f.account && p.account !== f.account) return false;
    if (f.region && (A[p.account]?.region || '') !== f.region) return false;
    if (f.format && p.format !== f.format) return false;
    if (f.topic && !(p.topics || []).includes(f.topic)) return false;
    if (f.minOx && !(typeof p.outlier === 'number' && p.outlier >= f.minOx)) return false;
    const t = new Date(p.date || p.seen).getTime();
    if (rangeDays && (!t || now - t > rangeDays * 864e5)) return false;
    if (f.range === 'custom') { if (f.from && p.date < f.from) return false; if (f.to && p.date > f.to) return false; }
    if (q && !`${p.hook || ''} ${p.title || ''} ${p.caption || ''} ${p.account || ''} ${A[p.account]?.name || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const views = (p) => Number(p.metrics?.views ?? p.metrics?.likes ?? -1);
  if (f.sort === 'outlier') list.sort((a, b) => (b.outlier ?? -1) - (a.outlier ?? -1) || String(b.date).localeCompare(String(a.date)));
  else if (f.sort === 'date') list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  else list.sort((a, b) => views(b) - views(a));
  return list;
}

export function render(stage, ctx) {
  const sub = ctx.route.params[0];
  if (sub === 'patterns') return renderPatterns(stage, ctx);
  if (sub === 'clients') return renderClientsIg(stage, ctx);
  const { state } = ctx;
  const r = state.radar || { posts: [], accounts: [], summary: {} };
  const A = acctMap(state);
  const prevScroll = stage.scrollTop;
  const hasClientAccts = (r.accounts || []).some((a) => a.source === 'client') || r.posts.some((p) => p.source === 'client');

  // ---------------- account rail
  const counts = r.summary.byAccount || {};
  const acctsSorted = [...(r.accounts || [])].filter((a) => {
    if (f.mode === 'competitors' && a.source === 'client') return false;
    if (f.mode === 'clients' && a.source !== 'client') return false;
    const q = f.acctQ.trim().toLowerCase();
    return !q || `${a.handle} ${a.name}`.toLowerCase().includes(q);
  }).sort((a, b) => (counts[b.id]?.count || 0) - (counts[a.id]?.count || 0) || String(a.name).localeCompare(String(b.name)));

  const sources = r.summary.sources || [];
  const needKey = sources.filter((s) => s.key && !s.connected);
  const rail = h('aside', { class: 'acct-rail' },
    r.status ? statusBlock(r.status, ctx) : h('div', { class: 'blk' },
      h('div', { class: 'blk-h' }, h('span', null, 'Connect sources'), h('span', null, needKey.length ? `${needKey.length} need keys` : 'all set')),
      h('div', { class: 'sources' }, sources.map((s) => h('div', { class: 'src' }, icon(s.platform),
        h('span', null, s.name),
        h('span', { class: `state ${s.manual ? 'man' : s.connected ? 'ok' : 'key'}` }, h('i'), s.manual ? 'manual' : s.connected ? 'live' : 'key'),
        s.key && !s.connected ? h('span', { class: 'k' }, `studio/.env · ${s.key}`) : null))),
      needKey.length ? h('div', { class: 'edge', style: { whiteSpace: 'normal' } }, 'Run “radar setup” in Claude Code to add keys') : null),
    pasteBlock(ctx),
    h('div', { class: 'blk', style: { paddingBottom: '8px' } },
      h('div', { class: 'blk-h' }, h('span', null, `Accounts · ${acctsSorted.length}`), f.account ? h('button', { class: 'btn sm ghost', onclick: () => { f.account = null; render(stage, ctx); } }, 'Clear') : null),
      h('input', { class: 'input', type: 'search', placeholder: 'Find a handle', value: f.acctQ, oninput: (e) => { f.acctQ = e.target.value; rerenderRail(); } })),
    h('div', { class: 'acct-list' }, acctsSorted.map((a) => acctRow(a, counts[a.id], stage, ctx))),
  );
  function rerenderRail() {
    const list = rail.querySelector('.acct-list');
    const q = f.acctQ.trim().toLowerCase();
    list.replaceChildren(...[...(r.accounts || [])].filter((a) => (f.mode === 'all' || (f.mode === 'clients') === (a.source === 'client')) && (!q || `${a.handle} ${a.name}`.toLowerCase().includes(q)))
      .sort((a, b) => (counts[b.id]?.count || 0) - (counts[a.id]?.count || 0)).map((a) => acctRow(a, counts[a.id], stage, ctx)));
  }

  // ---------------- filters
  const regions = [...new Set((r.accounts || []).map((a) => a.region).filter(Boolean))].sort();
  const formats = [...new Set(r.posts.map((p) => p.format).filter(Boolean))].sort();
  const topics = [...new Set(r.posts.flatMap((p) => p.topics || []))].sort();
  const byPlat = r.summary.byPlatform || {};
  const rer = () => render(stage, ctx);
  const sel = (label, val, opts, on) => h('label', { class: 'field' }, h('span', null, label), h('select', { class: 'select', onchange: (e) => { on(e.target.value); rer(); } }, opts.map(([v, t]) => h('option', { value: v, selected: String(v) === String(val) ? true : null }, t))));
  const filters = h('div', { class: 'filters' },
    h('div', { class: 'field' }, h('span', null, 'Show'), h('div', { class: 'seg' },
      [['competitors', 'Competitors'], ['clients', 'Our clients'], ['all', 'All']].map(([v, t]) => h('button', { 'aria-pressed': f.mode === v ? 'true' : 'false', onclick: () => { f.mode = v; f.account = null; rer(); }, title: v === 'clients' && !hasClientAccts ? 'No client accounts on the radar yet' : null }, t)))),
    h('div', { class: 'field' }, h('span', null, 'Platform'), h('div', { class: 'plat-chips' }, PLATFORMS.map((p) => h('button', { class: 'chip', 'aria-pressed': f.platforms.has(p) ? 'true' : 'false', title: PLATFORM_NAME[p], onclick: () => { f.platforms.has(p) ? f.platforms.delete(p) : f.platforms.add(p); rer(); } }, icon(p), byPlat[p] || 0)))),
    sel('Region', f.region, [['', 'All'], ...regions.map((x) => [x, x === 'national' ? 'National' : x])], (v) => { f.region = v; }),
    sel('Format', f.format, [['', 'All'], ...formats.map((x) => [x, x])], (v) => { f.format = v; }),
    topics.length ? sel('Topic', f.topic, [['', 'All'], ...topics.map((x) => [x, x])], (v) => { f.topic = v; }) : null,
    sel('Outlier ≥', f.minOx, [[0, 'Any'], [1, '1×'], [1.5, '1.5×'], [2, '2×'], [3, '3×'], [5, '5×']], (v) => { f.minOx = Number(v); }),
    sel('Date', f.range, [['all', 'All time'], ['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['custom', 'Custom…']], (v) => { f.range = v; }),
    f.range === 'custom' ? h('label', { class: 'field' }, h('span', null, 'From'), h('input', { class: 'input', type: 'date', value: f.from, onchange: (e) => { f.from = e.target.value; rer(); } })) : null,
    f.range === 'custom' ? h('label', { class: 'field' }, h('span', null, 'To'), h('input', { class: 'input', type: 'date', value: f.to, onchange: (e) => { f.to = e.target.value; rer(); } })) : null,
    sel('Sort', f.sort, [['outlier', 'Outlier'], ['date', 'Newest'], ['views', 'Views']], (v) => { f.sort = v; }),
    h('label', { class: 'field grow' }, h('span', null, 'Search hooks'), h('input', { class: 'input', type: 'search', placeholder: 'renewal, HELOC, 4-plex…', value: f.q, oninput: (e) => { f.q = e.target.value; clearTimeout(view.qt); view.qt = setTimeout(() => { fillWall(); }, 160); } })),
  );

  const meta = h('div', { class: 'wall-meta' });
  const wall = h('div', { class: 'wall' });
  const wrap = h('div', { class: 'wall-wrap' }, filters, meta, wall);
  const root = h('div', { class: 'radar' }, rail, wrap);
  stage.replaceChildren(h('div', { class: 'radar-wrap' }, rtabs('', r), root));

  function fillWall() {
    const list = filtered(state);
    const acc = f.account ? A[f.account] : null;
    meta.replaceChildren(
      h('div', { class: 'edge' }, `${list.length} of ${r.posts.length} posts${acc ? ` · ${acctLabel(acc)}` : ''} · sorted by ${f.sort}`),
      h('div', { class: 'edge' }, 'Outlier = views ÷ the account median (last 15 posts)'));
    if (!list.length) {
      wall.replaceChildren(h('div', { class: 'empty', style: { gridColumn: '1 / -1', gridRow: 'span 20' } }, h('strong', null, f.mode === 'clients' && !hasClientAccts ? 'No client accounts on the radar yet.' : 'No posts match these filters.'), h('span', null, f.mode === 'clients' && !hasClientAccts ? 'Client accounts appear here once the radar collectors add them (source: client).' : 'Loosen a filter, or paste a post URL in the rail.'), h('button', { class: 'btn sm', onclick: () => { Object.assign(f, { platforms: new Set(), region: '', format: '', topic: '', minOx: 0, range: 'all', q: '', account: null }); rer(); } }, 'Reset filters')));
      return;
    }
    const shown = list.slice(0, 400);
    wall.replaceChildren(...shown.map((p) => postCard(p, A, state, ctx)));
    layoutWall();
  }
  function layoutWall() {
    const w = wall.clientWidth; if (!w) return;
    const cols = Math.max(2, Math.floor((w + 12) / 236));
    wall.style.setProperty('--cols', cols);
    const cw = (w - (cols - 1) * 12) / cols;
    for (const card of wall.querySelectorAll('.post')) {
      const ar = Number(card.dataset.ar) || 1;
      const t = card.querySelector('.thumb'); t.style.height = `${Math.round(cw / ar)}px`;
    }
    requestAnimationFrame(() => {
      for (const card of wall.querySelectorAll('.post')) card.style.gridRowEnd = `span ${Math.ceil((card.getBoundingClientRect().height + 12) / 6)}`;
    });
  }
  fillWall();
  stage.scrollTop = prevScroll;
  if (view.ro) view.ro.disconnect();
  let lastW = wall.clientWidth;
  view.ro = new ResizeObserver(() => { if (Math.abs(wall.clientWidth - lastW) > 4) { lastW = wall.clientWidth; layoutWall(); } });
  view.ro.observe(wall);
}

function acctRow(a, c, stage, ctx) {
  return h('button', { class: 'acct', 'aria-pressed': f.account === a.id ? 'true' : 'false', onclick: () => { f.account = f.account === a.id ? null : a.id; render(stage, ctx); } },
    icon(a.platform || 'web'), h('b', null, acctLabel(a)), h('span', { class: 'n' }, c?.count ? String(c.count) : '0'),
    h('span', { class: 'm' }, [a.region, followers(a.followers), c?.last ? `last ${ago(c.last)}` : 'no posts yet'].filter(Boolean).join(' · ')));
}
export function acctLabel(a) { if (!a) return ''; const hd = a.handle; return !hd || hd === 'channel' || hd.startsWith('UC') ? (a.name || hd || a.id || '').replace(/\s*[(–—].*$/, '') : hd; }
function followers(v) { if (!v) return null; const m = String(v).match(/^[\d.,]+\s*[KMk]?/); return m ? `${m[0].replace(/\s/g, '')} fol` : null; }

function postCard(p, A, state, ctx) {
  const a = A[p.account] || {};
  const ar = ratio(p);
  const src = postThumb(p);
  let face;
  if (src) { face = thumb(src, { w: 480 }); }
  else {
    face = h('div', { class: 'thumb' }, h('div', { class: 'article-face' }, h('q', null, p.hook || p.title || p.caption || p.url), h('span', { class: 'dom' }, host(p.url))));
  }
  face.append(h('div', { class: 'ov' },
    h('div', { class: 'ov-top' }, h('span', { class: 'glyph', title: PLATFORM_NAME[p.platform] }, icon(p.platform || 'web')), typeof p.outlier === 'number' ? h('span', { class: `ox ${oxClass(p.outlier)}`, title: 'Outlier vs the account median' }, `${p.outlier}×`) : null),
    h('div', { class: 'ov-bot' }, h('span', { class: 'fchip' }, p.format || 'post'))));
  if (src && (p.hook || p.title)) face.append(h('div', { class: 'hook-ov' }, p.hook || p.title));
  const m = p.metrics || {};
  return h('button', { class: 'post', 'data-ar': ar, onclick: () => openPost(p, a, ctx), title: p.hook || p.title || '' },
    face,
    h('div', { class: 'meta' },
      h('div', { class: 'r1' }, h('b', null, acctLabel(a) || p.account || host(p.url)), h('span', null, ago(p.date))),
      h('div', { class: 'r2' }, m.views != null ? h('span', null, `${num(m.views)} views`) : null, m.likes != null ? h('span', null, `${num(m.likes)} likes`) : null, m.views == null && m.likes == null ? h('span', { class: 'faint' }, p.source === 'manual' ? 'manual · no metrics' : 'no metrics') : null),
      src ? h('div', { class: 't' }, p.hook || p.title || '') : null));
}

function openPost(p, a, ctx) {
  const { app, state } = ctx;
  const kits = state.kits?.items || [];
  if (!view.make.client && kits[0]) view.make.client = kits[0].slug;
  app.openDrawer(() => {
    const src = postThumb(p);
    const m = p.metrics || {};
    const cmdEl = h('code', null);
    const hook = (p.hook || p.title || '').replace(/"/g, "'");
    const update = () => { cmdEl.textContent = `/create ${view.make.format} for ${view.make.client}: our version of "${hook}" (radar ${p.id}, ${p.url})`; };
    update();
    return [
      h('div', { class: 'dr-h' }, h('div', null, h('h3', null, acctLabel(a) || p.account || 'Post'), h('div', { class: 'sub' }, [PLATFORM_NAME[p.platform], a.region, p.date, p.source].filter(Boolean).join(' · '))),
        h('button', { class: 'ibtn', title: 'Close (Esc)', onclick: () => app.closeDrawer() }, icon('close'))),
      h('div', { class: 'dr-b post-detail' },
        src ? thumb(src, { cls: `hero ${p.format === 'short' || p.format === 'reel' ? 'tall' : ''}`, ratio: p.format === 'short' || p.format === 'reel' ? '9 / 16' : '16 / 9', w: 800 }) : null,
        h('div', { style: { fontSize: '20px', fontWeight: 700, lineHeight: 1.2 } }, p.hook || p.title || p.caption || p.url),
        h('div', { class: 'metrics' },
          h('div', null, h('b', null, num(m.views)), h('span', null, 'views')), h('div', null, h('b', null, num(m.likes)), h('span', null, 'likes')),
          h('div', null, h('b', null, num(m.comments)), h('span', null, 'comments')), h('div', null, h('b', { style: { color: typeof p.outlier === 'number' && p.outlier >= 2 ? 'var(--wait)' : null } }, typeof p.outlier === 'number' ? `${p.outlier}×` : '—'), h('span', null, `outlier${p.outlierBasis ? ' · ' + p.outlierBasis : ''}`))),
        p.caption && p.caption !== p.hook ? h('div', { class: 'dr-sec' }, h('h4', null, 'Caption'), h('p', { class: 'prose', style: { margin: 0, whiteSpace: 'pre-wrap' } }, p.caption)) : null,
        h('div', { class: 'dr-sec' }, h('dl', { class: 'kv' }, h('dt', null, 'Format'), h('dd', null, fmtChip(p.format)),
          typeof p.engagementRate === 'number' ? [h('dt', null, 'Engagement'), h('dd', null, `${(p.engagementRate * 100).toFixed(2)}% of ${p.platform === 'youtube' ? 'views' : 'followers'}`)] : null,
          typeof p.outlierRaw === 'number' && p.outlierRaw !== p.outlier ? [h('dt', null, 'Raw outlier'), h('dd', null, `${p.outlierRaw}× (display capped at 50×)`)] : null, h('dt', null, 'Account'), h('dd', null, a.name || p.account || '—'), a.followers ? [h('dt', null, 'Followers'), h('dd', null, a.followers)] : null, h('dt', null, 'Confidence'), h('dd', null, p.confidence || '—'), (p.topics || []).length ? [h('dt', null, 'Topics'), h('dd', null, h('div', { class: 'chips' }, p.topics.map((t) => h('span', { class: 'chip' }, t))))] : null)),
        (a.watchFor || []).length ? h('div', { class: 'dr-sec' }, h('h4', null, 'Watch this account for'), h('div', { class: 'chips' }, a.watchFor.slice(0, 6).map((w) => h('span', { class: 'chip', title: w }, w.length > 48 ? w.slice(0, 46) + '…' : w)))) : null,
        h('a', { class: 'btn', href: p.url, target: '_blank', rel: 'noopener noreferrer' }, icon('ext'), `Open on ${PLATFORM_NAME[p.platform] || 'the web'}`),
        h('div', { class: 'make' },
          h('b', null, 'Make our version'),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' } },
            h('label', { class: 'field' }, h('span', null, 'Client'), h('select', { class: 'select', onchange: (e) => { view.make.client = e.target.value; update(); } }, kits.map((k) => h('option', { value: k.slug, selected: k.slug === view.make.client ? true : null }, k.name || k.slug)), h('option', { value: 'group:1' }, 'Group 1'), h('option', { value: 'group:2' }, 'Group 2'), h('option', { value: 'group:3' }, 'Group 3'), h('option', { value: 'group:4' }, 'Group 4'))),
            h('label', { class: 'field' }, h('span', null, 'Format'), h('select', { class: 'select', onchange: (e) => { view.make.format = e.target.value; update(); } }, ['graphic reel', 'short reel', 'carousel', 'static', 'story'].map((x) => h('option', { value: x, selected: x === view.make.format ? true : null }, x))))),
          cmdEl,
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
            h('button', { class: 'btn primary', onclick: () => { const c = view.make.client; app.newPiece({ ...(String(c).startsWith('group:') ? { group: Number(String(c).slice(6)) } : { client: c }), format: view.make.format, topic: `our version of: ${hook}`.slice(0, 200), notes: `radar ${p.id}` }); } }, icon('plus'), 'Open in New piece'),
            h('button', { class: 'btn', onclick: async () => { const ok = await copyText(cmdEl.textContent); app.toast(ok ? 'Command copied. Paste it into Claude Code.' : 'Copy failed: select the text instead', ok ? 'ok' : 'err', ok ? 'Copied' : 'Error'); } }, icon('copy'), 'Copy /create'))),
      ),
    ];
  }, { key: `post:${p.id}` });
}

function pasteBlock(ctx) {
  const v = view.paste;
  const urlIn = h('input', { class: 'input', type: 'url', placeholder: 'Paste a Facebook, LinkedIn, TikTok or IG post URL', value: v.url, oninput: (e) => { v.url = e.target.value; } });
  const submit = async (e) => {
    e?.preventDefault();
    if (!v.url.trim()) { ctx.app.toast('Paste a post URL first', 'err'); urlIn.focus(); return; }
    try {
      const res = await api('POST', '/api/radar/manual', { url: v.url.trim(), account: v.account.trim() || undefined, note: v.note.trim() || undefined });
      ctx.app.toast(res.duplicate ? 'Already on the radar' : `Added ${res.post.platform} post to the radar`, 'ok', res.duplicate ? 'Radar' : 'Added');
      v.url = ''; v.account = ''; v.note = '';
      urlIn.value = ''; form.querySelectorAll('.more input').forEach((i) => { i.value = ''; });
    } catch (err) { ctx.app.toast(err.message, 'err'); }
  };
  const form = h('form', { class: 'blk', onsubmit: submit },
    h('div', { class: 'blk-h' }, h('span', null, 'Paste a post'), h('span', null, 'no scraping')),
    h('div', { class: 'paste' }, urlIn, h('button', { class: 'btn primary', type: 'submit' }, icon('plus'), 'Add'),
      h('div', { class: 'more' },
        h('input', { class: 'input', placeholder: 'Handle (optional)', value: v.account, oninput: (e) => { v.account = e.target.value; } }),
        h('input', { class: 'input', placeholder: 'Hook or note', value: v.note, oninput: (e) => { v.note = e.target.value; } }))));
  return form;
}

export function onLive(stage, ctx) {
  if (document.activeElement?.closest?.('.radar input, .radar select')) return;
  render(stage, ctx);
}

// ------------------------------------------------------------------ live source status (radar/status.json)
const SRC_NAME = { instagram: 'Instagram · Business Discovery', youtube: 'YouTube Data API', rss: 'Broker blogs (RSS)', manual: 'Manual + pasted' };
const SRC_ICON = { instagram: 'instagram', youtube: 'youtube', rss: 'web', manual: 'link' };
export function sourceState(s) {
  if (!s) return { cls: 'man', label: '—' };
  const exp = s.expiresAt ? Date.parse(s.expiresAt) : NaN;
  if (s.ok === false || (Number.isFinite(exp) && exp <= Date.now())) return { cls: 'bad', label: Number.isFinite(exp) && exp <= Date.now() ? 'expired' : 'error' };
  if (Number.isFinite(exp) && exp - Date.now() < 7 * 864e5) return { cls: 'key', label: 'expiring' };
  return { cls: 'ok', label: 'live' };
}
function expiryText(s) {
  const exp = s.expiresAt ? Date.parse(s.expiresAt) : NaN;
  if (!Number.isFinite(exp)) return null;
  const d = exp - Date.now();
  if (d <= 0) return `token expired ${ago(s.expiresAt)} ago`;
  return d < 864e5 ? `token expires in ${Math.max(1, Math.round(d / 36e5))} h` : `token expires in ${Math.round(d / 864e5)} d`;
}
function statusBlock(st, ctx) {
  const src = st.sources || {};
  const keys = Object.keys(src);
  const bad = keys.filter((k) => ['bad', 'key'].includes(sourceState(src[k]).cls)).length;
  return h('div', { class: 'blk' },
    h('div', { class: 'blk-h' }, h('span', null, 'Sources'), h('span', null, `${ago(st.checked)} ago${bad ? ` · ${bad} to check` : ''}`)),
    h('div', { class: 'sources' }, keys.map((k) => {
      const s = src[k]; const ss = sourceState(s); const exp = expiryText(s);
      return h('div', { class: `src live-src ${ss.cls}` }, icon(SRC_ICON[k] || 'web'),
        h('span', null, SRC_NAME[k] || k),
        h('span', { class: `state ${ss.cls}` }, h('i'), ss.label),
        h('span', { class: 'k' }, [s.accounts != null ? `${s.accounts} accts` : null, s.posts != null ? `${num(s.posts)} posts` : null, s.lastPostSeen ? `seen ${ago(s.lastPostSeen)} ago` : null].filter(Boolean).join(' · ')),
        exp || (s.error && ss.cls !== 'ok') ? h('span', { class: `k ${ss.cls === 'bad' ? 'bad' : ss.cls === 'key' ? 'warn' : ''}`, title: s.error || '' }, [exp, ss.cls !== 'ok' && s.error && !(exp && /expire/i.test(s.error)) ? s.error : null].filter(Boolean).join(' · ')) : null,
        ss.cls === 'bad' || ss.cls === 'key' ? h('button', { class: 'btn sm reconnect', onclick: () => openSetup(ctx, k) }, icon('link'), 'Reconnect') : null);
    })));
}
async function openSetup(ctx, which) {
  const { app } = ctx;
  let txt = '';
  try { const r = await fetch(fileUrl('studio/radar/SETUP.md')); txt = r.ok ? await r.text() : ''; } catch { /* */ }
  const part = which === 'youtube' ? /## Part A[\s\S]*?(?=\n## )/ : /## Part B[\s\S]*?(?=\n## )/;
  const sec = (txt.match(part) || [txt])[0] || 'studio/radar/SETUP.md not found.';
  app.openDrawer(() => [
    h('div', { class: 'dr-h' }, h('div', null, h('h3', null, 'Reconnect'), h('div', { class: 'sub' }, `studio/radar/SETUP.md · ${which === 'youtube' ? 'Part A' : 'Part B'}`)), h('button', { class: 'ibtn', title: 'Close (Esc)', onclick: () => app.closeDrawer() }, icon('close'))),
    h('div', { class: 'dr-b' }, h('div', { class: 'voice setup' }, sec.trim()), h('div', { class: 'edge', style: { whiteSpace: 'normal' } }, 'Tokens go in studio/.env. The Desk only shows whether a key is set, never its value.')),
  ], { wide: true, key: 'setup' });
}

// ------------------------------------------------------------------ PATTERNS (radar/patterns.json)
const PFORMAT = { 'long-video': 'graphic reel', 'short-video': 'short reel', reel: 'graphic reel', image: 'static', carousel: 'carousel', story: 'story' };
const PCHIP = { 'long-video': 'video', 'short-video': 'short' };
function postTile(p, A, ctx, h1 = 150) {
  if (!p) return h('div', { class: 'ptile thumb img-ph', style: { height: h1 + 'px', aspectRatio: '9 / 16' } });
  const ar = ratio(p);
  const src = postThumb(p);
  const t = src ? thumb(src, { w: 320 }) : h('div', { class: 'thumb' }, h('div', { class: 'article-face' }, h('q', null, p.hook || p.title || ''), h('span', { class: 'dom' }, host(p.url))));
  t.style.height = h1 + 'px'; t.style.aspectRatio = String(ar);
  if (h1 >= 100) t.append(h('div', { class: 'ov' }, h('div', { class: 'ov-top' }, h('span', { class: 'glyph' }, icon(p.platform || 'web')), typeof p.outlier === 'number' && p.outlier >= 1 ? h('span', { class: `ox ${oxClass(p.outlier)}` }, `${p.outlier}×`) : null)));
  return h('button', { class: 'ptile', title: p.hook || p.title || '', onclick: () => openPost(p, A[p.account] || {}, ctx) }, t);
}
function renderPatterns(stage, ctx) {
  const { state, app } = ctx;
  const r = state.radar || { posts: [] };
  const P = r.patterns;
  const A = acctMap(state);
  const byId = new Map((r.posts || []).map((p) => [p.id, p]));
  const prev = stage.scrollTop;
  const body = [];
  if (!P) {
    body.push(h('div', { class: 'empty' }, h('strong', null, 'No patterns yet.'), h('span', null, 'radar/patterns.json appears after the radar analysis runs.')));
  } else {
    const rising = (P.rising || []).map((id) => byId.get(id)).filter(Boolean);
    if (rising.length) body.push(h('section', { class: 'rising' }, h('div', { class: 'sect-h', style: { marginTop: 0 } }, h('h2', null, 'Rising'), h('span', { class: 'edge' }, `${rising.length} posts climbing now`)),
      h('div', { class: 'rise-strip' }, rising.map((p) => h('div', { class: 'rise' }, postTile(p, A, ctx, 168), h('div', { class: 'edge' }, acctLabel(A[p.account]) || p.account))))));
    const quiet = P.quietDetail?.length ? P.quietDetail : (P.quiet || []).map((t) => ({ topic: t }));
    if (quiet.length) body.push(h('div', { class: 'quiet' }, h('span', { class: 'lab' }, 'Quiet lanes'), quiet.map((q) => h('span', { class: 'chip', title: q.sharePrior != null ? `share of competitor posts ${q.sharePrior}% → ${q.shareNow}%` : '' }, q.topic, q.sharePrior != null ? h('b', { class: 'qd' }, `${Math.round(q.sharePrior)}→${Math.round(q.shareNow)}%`) : null)),
      h('span', { class: 'edge' }, 'topics competitors went quiet on')));
    const kits = state.kits?.items || [];
    body.push(h('div', { class: 'sect-h' }, h('h2', null, 'Patterns'), h('span', { class: 'edge' }, `${P.patterns.length} · ${P.basis?.postsInWindow ?? '?'} posts in ${P.window || 'window'} · competitors only`)));
    body.push(h('div', { class: 'pgrid' }, [...P.patterns].sort((a, b) => (b.medianOutlier || 0) - (a.medianOutlier || 0)).map((pt) => patternCard(pt, { A, byId, kits, ctx, app, state }))));
    if (P.basis?.note) body.push(h('div', { class: 'edge', style: { marginTop: '14px', whiteSpace: 'normal' } }, P.basis.note));
  }
  stage.replaceChildren(h('div', { class: 'radar-wrap' }, rtabs('patterns', r), h('div', { class: 'screen' }, body)));
  stage.scrollTop = prev;
}
const pmake = {};
function patternCard(pt, { A, byId, kits, ctx, app, state }) {
  const ex = (pt.examples || []).map((id) => byId.get(id)).filter(Boolean).slice(0, 4);
  const fit = (pt.clientFit || []).filter((s) => kitFor(s, state));
  const others = kits.filter((k) => !fit.includes(k.slug)).map((k) => k.slug);
  pmake[pt.id] ||= fit[0] || kits[0]?.slug || '';
  const label = h('span', null, '');
  const btn = h('button', { class: 'btn primary sm', onclick: () => app.newPiece({ client: pmake[pt.id], format: PFORMAT[pt.format] || 'graphic reel', topic: String(pt.angleForUs || pt.title).slice(0, 200), angle: String(pt.mechanism || '').slice(0, 240), notes: `radar pattern ${pt.id}` }) }, icon('plus'), label);
  const select = h('select', { class: 'select', 'aria-label': 'Client for this pattern', onchange: (e) => choose(e.target.value) },
    fit.length ? h('optgroup', { label: 'Good fit' }, fit.map((s) => h('option', { value: s }, slugName(s, state)))) : null,
    h('optgroup', { label: 'Other clients' }, others.map((s) => h('option', { value: s }, slugName(s, state)))));
  const faces = h('div', { class: 'faces' }, fit.slice(0, 9).map((s) => { const k = kitFor(s, state); return h('button', { class: 'face', 'data-s': s, title: k?.name || s, onclick: () => choose(s) }, faceKids(k?.photo, k?.name, 60)); }), fit.length > 9 ? h('span', { class: 'more' }, `+${fit.length - 9}`) : null);
  function choose(s) {
    pmake[pt.id] = s; select.value = s;
    label.textContent = `Make this for ${slugName(s, state).split(' ')[0]}`;
    faces.querySelectorAll('.face').forEach((f) => f.classList.toggle('sel', f.dataset.s === s));
  }
  choose(pmake[pt.id]);
  const mo = pt.medianOutlier;
  return h('article', { class: 'pcard' },
    h('div', { class: 'pstrip' }, ex.length ? ex.map((p) => postTile(p, A, ctx, 132)) : h('div', { class: 'thumb img-ph', style: { height: '132px', flex: 1 } })),
    h('div', { class: 'pbody' },
      h('div', { class: 'ptop' }, typeof mo === 'number' ? h('span', { class: `ox big ${oxClass(mo)}`, title: 'Median outlier of the posts in this pattern' }, `${mo}×`) : null, h('h3', null, pt.title)),
      h('div', { class: 'chips' }, fmtChip(PCHIP[pt.format] || pt.format), pt.hookPattern ? h('span', { class: 'chip fact' }, pt.hookPattern) : null, (pt.platforms || []).map((pl) => h('span', { class: 'chip', title: PLATFORM_NAME[pl] }, icon(pl)))),
      h('div', { class: 'pnum' }, h('div', null, h('b', null, String(pt.count ?? '—')), h('span', null, 'posts')), h('div', null, h('b', null, String(pt.accounts ?? '—')), h('span', null, 'accounts')), h('div', null, h('b', null, pt.hitRate != null ? `${Math.round(pt.hitRate * 100)}%` : '—'), h('span', null, 'hit ≥ 2×')), h('div', null, h('b', null, pt.maxOutlierRaw != null ? `${pt.maxOutlierRaw}×` : '—'), h('span', null, 'best'))),
      pt.mechanism ? h('p', { class: 'pmech', title: pt.mechanism }, pt.mechanism) : null,
      pt.angleForUs ? h('div', { class: 'pangle', title: pt.angleForUs }, h('span', { class: 'lab' }, 'For us'), h('span', null, pt.angleForUs)) : null),
    h('div', { class: 'pfit' }, h('span', { class: 'lab' }, `Fits ${fit.length}`), faces),
    h('div', { class: 'pmake' }, select, btn));
}

// ------------------------------------------------------------------ CLIENTS on Instagram (radar/clients.json)
function clientPosts(slug, st, state) {
  const byId = new Map((state.radar?.posts || []).map((p) => [p.id, p]));
  const fromRecent = (st?.recent || []).map((x) => byId.get(x.id) || { ...x, platform: 'instagram', account: st.account, thumb: null }).filter(Boolean);
  if (fromRecent.length) return fromRecent;
  const hd = String(st?.handle || '').replace(/^@/, '').toLowerCase();
  return (state.radar?.posts || []).filter((p) => p.account === st?.account || p.client === slug || (hd && String(p.account || '').toLowerCase() === hd)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
const pct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(v < 0.01 ? 2 : 1)}%` : '—');
function igUrl(handle) { const hd = String(handle || '').replace(/^@/, ''); return hd ? `https://www.instagram.com/${encodeURIComponent(hd)}/` : null; }

export function clientIgStrip(slug, ctx, { max = 8 } = {}) {
  const { state } = ctx;
  const st = state.radar?.clientStats?.[slug];
  if (!st) return null;
  const A = acctMap(state);
  const posts = clientPosts(slug, st, state).slice(0, max);
  return h('div', { class: 'igstrip' },
    h('div', { class: 'igstats' },
      h('a', { class: 'hd', href: igUrl(st.handle), target: '_blank', rel: 'noopener noreferrer' }, icon('instagram'), st.handle || slug),
      stat(num(st.followers), 'followers'), stat(st.postsLast30 ?? '—', 'posts 30d'), stat(st.medianLikes ?? '—', 'median likes'), stat(pct(st.medianEngagementRate), 'median ER'), stat(st.lastPostDate ? ago(st.lastPostDate) : '—', 'last post'),
      (st.topFormats || []).slice(0, 3).map((f) => h('span', { class: 'chip' }, fmtChip(f.format), h('b', null, String(f.count))))),
    st.discoverable === false ? h('div', { class: 'chip todo' }, st.note || 'not discoverable: personal account or private') : posts.length ? h('div', { class: 'igposts' }, posts.map((p) => postTile(p, A, ctx, 150))) : h('div', { class: 'faint' }, 'No posts collected yet.'));
}
function stat(v, l) { return h('div', { class: 'st' }, h('b', null, String(v)), h('span', null, l)); }

function renderClientsIg(stage, ctx) {
  const { state } = ctx;
  const r = state.radar || { posts: [] };
  const C = r.clientStats;
  const prev = stage.scrollTop;
  let body;
  if (!C || !Object.keys(C).length) body = h('div', { class: 'empty' }, h('strong', null, 'No client Instagram stats yet.'), h('span', null, 'radar/clients.json appears after the radar collects our clients\' own accounts.'));
  else {
    const A = acctMap(state);
    const slugs = Object.keys(C).sort((a, b) => (C[b].discoverable !== false) - (C[a].discoverable !== false) || (C[b].postsLast30 || 0) - (C[a].postsLast30 || 0) || slugName(a, state).localeCompare(slugName(b, state)));
    body = h('div', { class: 'iglist' },
      h('div', { class: 'igrow head' }, h('span', null, 'Client'), h('span', null, 'Followers'), h('span', null, 'Posts 30d'), h('span', null, 'Median likes'), h('span', null, 'Median ER'), h('span', null, 'Last post'), h('span', null, 'Top formats'), h('span', null, 'Recent')),
      slugs.map((s) => {
        const st = C[s]; const k = kitFor(s, state);
        const posts = clientPosts(s, st, state).slice(0, 6);
        const off = st.discoverable === false;
        return h('div', { class: `igrow ${off ? 'off' : ''}` },
          h('a', { class: 'who', href: `#/clients/${encodeURIComponent(s)}` }, h('span', { class: 'face' }, faceKids(k?.photo, k?.name || s, 80)), h('span', null, h('b', null, slugName(s, state)), h('span', { class: 'edge' }, st.handle || ''))),
          h('span', { class: 'n' }, num(st.followers)), h('span', { class: 'n' }, String(st.postsLast30 ?? '—')), h('span', { class: 'n' }, st.medianLikes ?? '—'), h('span', { class: 'n' }, pct(st.medianEngagementRate)), h('span', { class: 'n' }, st.lastPostDate ? `${ago(st.lastPostDate)} ago` : '—'),
          h('span', { class: 'chips' }, (st.topFormats || []).slice(0, 3).map((f) => h('span', { class: 'chip' }, fmtChip(f.format), h('b', null, String(f.count))))),
          off ? h('span', { class: 'chip todo' }, 'not discoverable') : h('span', { class: 'igposts mini' }, posts.map((p) => postTile(p, A, ctx, 72))));
      }));
  }
  stage.replaceChildren(h('div', { class: 'radar-wrap' }, rtabs('clients', r), h('div', { class: 'screen' }, body)));
  stage.scrollTop = prev;
}
