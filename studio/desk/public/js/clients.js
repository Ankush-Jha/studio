// CLIENTS: grid of kit cards with confirm/reject toggles, and a full client detail view.
import { faceKids, h, icon, img, fileUrl, thumb, ring, api, copyText, fmtChip, ago, lightbox, PLATFORM_NAME } from './ui.js';
import { clientIgStrip } from './radar.js';

const f = { q: '', group: '', sort: 'name' };
const view = { detail: null, detailSlug: null, brief: '' };

export function title({ state, route }) {
  const slug = route.params[0];
  if (slug) { const k = state?.kits?.items?.find((x) => x.slug === slug); return { title: 'Clients', sub: k?.name || slug }; }
  const src = state?.kits?.source;
  return { title: 'Clients', sub: src === 'sheet' ? 'From the client sheet · kits not built yet' : `${state?.kits?.items?.length || 0} kits` };
}

export function onLive(stage, ctx) {
  if (document.activeElement?.closest?.('.stage input, .stage textarea')) return;
  view.detailSlug = null; render(stage, ctx);
}

export function render(stage, ctx) {
  const slug = ctx.route.params[0];
  if (slug) return renderDetail(stage, ctx, slug);
  const { state } = ctx;
  const items = state.kits?.items || [];
  const prev = stage.scrollTop;
  const groups = [...new Set(items.map((k) => k.group).filter((g) => g !== null && g !== undefined))].sort((a, b) => a - b);
  const q = f.q.trim().toLowerCase();
  let list = items.filter((k) => (!q || `${k.name} ${k.city} ${k.slug} ${k.brokerage?.name || ''}`.toLowerCase().includes(q)) && (f.group === '' || (f.group === 'none' ? (k.group === null || k.group === undefined) : String(k.group) === f.group)));
  if (f.sort === 'name') list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (f.sort === 'complete') list.sort((a, b) => (a.completeness ?? -1) - (b.completeness ?? -1));
  if (f.sort === 'checks') list.sort((a, b) => openChecks(b) - openChecks(a));
  const rer = () => render(stage, ctx);
  const totalChecks = items.reduce((n, k) => n + openChecks(k), 0);
  const bar = h('div', { class: 'cl-bar' },
    h('label', { class: 'field', style: { flex: '1 1 220px' } }, h('span', null, 'Find a client'), h('input', { class: 'input', type: 'search', placeholder: 'Name, city, brokerage', value: f.q, oninput: (e) => { f.q = e.target.value; clearTimeout(view.t); view.t = setTimeout(rer, 140); } })),
    h('label', { class: 'field' }, h('span', null, 'Group'), h('select', { class: 'select', onchange: (e) => { f.group = e.target.value; rer(); } },
      h('option', { value: '' }, 'All groups'), groups.map((g) => h('option', { value: String(g), selected: String(g) === f.group ? true : null }, `Group ${g}`)), h('option', { value: 'none', selected: f.group === 'none' ? true : null }, 'No group'))),
    h('label', { class: 'field' }, h('span', null, 'Sort'), h('select', { class: 'select', onchange: (e) => { f.sort = e.target.value; rer(); } },
      [['name', 'Name'], ['complete', 'Least complete'], ['checks', 'Most to confirm']].map(([v, t]) => h('option', { value: v, selected: v === f.sort ? true : null }, t)))),
    h('div', { class: 'edge', style: { marginLeft: 'auto', alignSelf: 'center' } }, `${list.length} shown · ${totalChecks} items to confirm`));
  const grid = h('div', { class: 'cgrid' }, list.map((k) => card(k, ctx)));
  const body = [bar];
  if (state.kits?.source === 'sheet') body.push(h('div', { class: 'empty', style: { marginBottom: '14px' } }, h('strong', null, 'Kits are not built yet.'), h('span', null, 'These cards come straight from clients.json. Colours, rules and checks appear when kits/<slug>/kit.json exists.')));
  body.push(list.length ? grid : h('div', { class: 'empty' }, h('strong', null, 'No clients match.'), h('button', { class: 'btn sm', onclick: () => { f.q = ''; f.group = ''; rer(); } }, 'Reset')));
  stage.replaceChildren(h('div', { class: 'screen' }, body));
  stage.scrollTop = prev;
}

function openChecks(k) {
  const c = k.confirm || {};
  const assets = (k.check || []).filter((x) => c.assets?.[x.path] === undefined).length;
  const cols = (k.colors || []).filter((x) => x.provisional && c.colors?.[x.role] === undefined).length;
  return assets + cols;
}

async function confirm(slug, body, ctx, msg) {
  try { await api('POST', `/api/kit/${encodeURIComponent(slug)}/confirm`, body); ctx.app.toast(msg, 'ok', 'Saved'); }
  catch (e) { ctx.app.toast(e.message, 'err'); }
}
function yn(cur, onYes, onNo, labels = ['Confirm', 'Reject']) {
  return h('span', { class: 'yn' },
    h('button', { class: 'y', 'aria-pressed': cur === true ? 'true' : 'false', title: labels[0], 'aria-label': labels[0], onclick: (e) => { e.stopPropagation(); onYes(); } }, icon('check')),
    h('button', { class: 'n', 'aria-pressed': cur === false ? 'true' : 'false', title: labels[1], 'aria-label': labels[1], onclick: (e) => { e.stopPropagation(); onNo(); } }, icon('x')));
}

function card(k, ctx) {
  const c = k.confirm || {};
  const href = `#/clients/${encodeURIComponent(k.slug)}`;
  const banner = k.footer ? h('a', { class: 'banner', href, tabindex: -1 }, img(fileUrl(k.footer, 720), { alt: `${k.name} footer` })) : h('a', { class: 'banner none', href, tabindex: -1 }, h('span', null, 'No footer on file'));
  const sw = (k.colors || []).filter((x) => ['accent', 'accent2', 'ink', 'paper'].includes(x.role)).map((x) => {
    const st = c.colors?.[x.role];
    return h('span', { class: `sw ${st === true || typeof st === 'string' ? 'ok' : st === false ? 'no' : x.provisional ? 'prov' : ''}`, style: { background: typeof st === 'string' ? st : x.hex }, title: `${x.role} ${typeof st === 'string' ? st : x.hex}${x.provisional ? ' (provisional)' : ''}${x.source ? ' · from ' + x.source : ''}` });
  });
  const checks = (k.check || []).slice(0, 3);
  const rules = (k.rules || []).slice(0, 3);
  const flags = (k.flags || []).length;
  return h('article', { class: 'ccard' },
    banner,
    h('a', { class: 'c-id', href },
      h('div', { class: 'face' }, faceKids(k.photo, k.name, 160)),
      h('div', { style: { minWidth: 0 } }, h('h3', null, k.name || k.slug), h('div', { class: 'where' }, [k.city, k.province].filter(Boolean).join(', ') || 'City missing', h('span', { class: `grp ${k.group == null ? 'none' : ''}`, title: k.group == null ? 'No group assigned' : `Posting group ${k.group}` }, k.group == null ? 'G?' : `G${k.group}`))),
      ring(k.completeness)),
    h('div', { class: 'c-row' },
      h('div', { class: 'logos' }, (k.logos || []).slice(0, 2).map((l) => h('span', { class: 'logo-plate' }, img(fileUrl(l, 320), { alt: 'logo' })))),
      sw.length ? h('div', { class: 'swatches' }, sw) : h('span', { class: 'chip todo', style: { marginLeft: 'auto' } }, 'No colours yet')),
    rules.length ? h('div', { class: 'c-rules chips' }, rules.map((r) => h('span', { class: 'chip', title: r.text }, h('b', { style: { fontWeight: 650, color: 'var(--edge)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.06em' } }, r.kind), ' ', r.text.length > 34 ? r.text.slice(0, 32) + '…' : r.text)), (k.rules || []).length > 3 ? h('span', { class: 'chip' }, `+${k.rules.length - 3}`) : null) : null,
    checks.length ? h('div', { class: 'c-check' },
      h('div', { class: 'blk-h' }, h('span', null, 'Check these'), h('span', null, `${(k.check || []).length}`)),
      checks.map((x) => h('div', { class: 'chk' },
        h('div', { class: 'thumb' }, /\.(png|jpe?g|webp|gif)$/i.test(x.path) ? img(fileUrl(x.abs, 120)) : null),
        h('span', { title: x.path }, x.path.split('/').slice(-2).join('/')),
        yn(c.assets?.[x.path], () => confirm(k.slug, { assets: { [x.path]: true } }, ctx, `${x.path.split('/').pop()} confirmed`), () => confirm(k.slug, { assets: { [x.path]: false } }, ctx, `${x.path.split('/').pop()} rejected`))))) : null,
    h('div', { class: 'c-foot' },
      h('span', { class: 'edge' }, `${k.slug}${k.brokerage?.name ? ' · ' + k.brokerage.name : ''}`),
      flags ? h('span', { class: 'flagcount', title: (k.flags || []).join('\n') }, `${flags} flag${flags === 1 ? '' : 's'}`) : null,
      k.pending ? h('span', { class: 'chip todo' }, 'kit pending') : null));
}

// ------------------------------------------------------------------ detail
async function renderDetail(stage, ctx, slug) {
  const { state, app } = ctx;
  const sum = state.kits?.items?.find((x) => x.slug === slug);
  if (view.detailSlug !== slug || !view.detail) {
    stage.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'edge' }, 'Loading kit…')));
    try { view.detail = await api('GET', `/api/kit/${encodeURIComponent(slug)}`); view.detailSlug = slug; }
    catch (e) { stage.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'empty' }, h('strong', null, `No kit for ${slug}.`), h('span', null, e.message), h('a', { class: 'btn sm', href: '#/clients' }, 'All clients')))); return; }
  }
  const d = view.detail; const k = d.summary || sum || {}; const kit = d.kit || {}; const web = d.web || null; const conf = d.confirm || k.confirm || {};
  const cards = (state.library?.cards || []).filter((c) => (c.clients || []).includes(slug) || (kit.aliases || []).some((a) => (c.clients || []).includes(a)));
  const jobs = (state.jobs || []).filter((j) => j.client === slug);
  const briefDefault = view.brief || `graphic reel about ${(kit.services || [])[0] || 'renewals'}`.toLowerCase();
  const cmd = h('input', { class: 'input', value: briefDefault, style: { flex: '1 1 220px', minWidth: 0 }, 'aria-label': 'Brief', oninput: (e) => { view.brief = e.target.value; } });

  const hero = [
    k.footer ? h('div', { class: 'cdetail-banner' }, img(fileUrl(k.footer, 1600), { alt: 'footer banner' })) : null,
    h('div', { class: 'cdetail-hero' },
      h('div', { class: 'face' }, faceKids(k.photo, k.name, 320)),
      h('div', { style: { minWidth: 0 } },
        h('div', { class: 'edge' }, `${slug}${kit.sheetId ? ' · ' + kit.sheetId : ''}${kit.updated ? ' · kit updated ' + ago(kit.updated) + ' ago' : ''}`),
        h('h2', null, k.name || slug),
        h('div', { class: 'tag' }, web?.tagline || [kit.agent?.title, [k.city, k.province].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || ''),
        h('div', { class: 'chips', style: { marginTop: '10px' } },
          h('span', { class: `grp ${k.group == null ? 'none' : ''}` }, k.group == null ? 'No group' : `Group ${k.group}`),
          (kit.languages || []).map((l) => h('span', { class: 'chip' }, l.toUpperCase())),
          kit.video === false ? h('span', { class: 'chip flag' }, 'No video') : kit.video ? h('span', { class: 'chip' }, 'Video ok') : null,
          kit.postingMode ? h('span', { class: 'chip' }, `${kit.postingMode}${kit.postingTime ? ' · ' + kit.postingTime : ''} ${kit.timeZone || ''}`) : null)),
      h('div', { class: 'acts' }, ring(k.completeness, 56),
        h('div', { style: { display: 'grid', gap: '6px' } },
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, cmd,
            h('button', { class: 'btn primary', onclick: () => app.newPiece({ client: slug, topic: cmd.value.trim().replace(/^(graphic reel|short reel|carousel|static|story|cover|gif)\s+(about\s+)?/i, '') }) }, icon('plus'), 'New piece for this client'),
            h('button', { class: 'ibtn', title: `Copy /create … for ${slug}`, onclick: async () => { const t = `/create ${cmd.value.trim()} for ${slug}`; const ok = await copyText(t); app.toast(ok ? `Copied: ${t}` : 'Copy failed', ok ? 'ok' : 'err', ok ? 'Copied' : 'Error'); } }, icon('copy'))),
          h('span', { class: 'edge', style: { textAlign: 'right' } }, 'queues /create on the runner · copy for chat')))),
  ];

  // left column
  const left = [];
  const ig = clientIgStrip(slug, ctx);
  if (ig) left.push(sect('Their recent Instagram', state.radar?.clientStatsAsOf ? `as of ${state.radar.clientStatsAsOf}` : null, ig));
  left.push(sect('Identity', null, h('dl', { class: 'kv' },
    h('dt', null, 'Agent'), h('dd', null, [kit.agent?.name, kit.agent?.title].filter(Boolean).join(' · ') || todo('agent')),
    h('dt', null, 'Licence'), h('dd', null, kit.agent?.licence || todo('agent licence')),
    h('dt', null, 'Brokerage'), h('dd', null, kit.brokerage?.name ? `${kit.brokerage.name}${kit.brokerage.licence ? ' · ' + kit.brokerage.licence : ''}` : todo('brokerage')),
    h('dt', null, 'Region'), h('dd', null, [k.city, k.province, kit.region].filter(Boolean).join(' · ') || todo('city')),
    h('dt', null, 'Contact'), h('dd', null, [...(kit.contact?.phones || []), ...(kit.contact?.emails || [])].join(' · ') || todo('contact')),
    h('dt', null, 'Website'), h('dd', null, kit.contact?.website ? h('a', { href: kit.contact.website, target: '_blank', rel: 'noopener' }, kit.contact.website) : todo('website')),
    kit.figma ? [h('dt', null, 'Figma'), h('dd', null, h('a', { href: kit.figma, target: '_blank', rel: 'noopener' }, 'Open file'))] : null),
    kit.complianceLine ? h('div', { style: { marginTop: '12px' } }, h('div', { class: 'field' }, h('span', null, 'Compliance line')), h('div', { class: 'compliance' }, kit.complianceLine)) : h('div', { style: { marginTop: '12px' } }, todo('compliance line'))));

  // colours
  const webCols = web?.brandColors || [];
  left.push(sect('Colours', `${(k.colors || []).filter((c) => c.provisional).length} provisional`,
    h('div', { class: 'colors-big' }, (k.colors || []).map((c) => {
      const st = conf.colors?.[c.role];
      return h('div', { class: `cbig ${c.provisional && st === undefined ? 'prov' : ''}` },
        h('div', { class: 'chipc', style: { background: typeof st === 'string' ? st : c.hex } }),
        h('div', { class: 'info' }, h('b', null, c.role), h('span', null, `${typeof st === 'string' ? st : c.hex} · ${c.source || '—'}`), h('span', null, st === true ? 'confirmed' : st === false ? 'rejected' : typeof st === 'string' ? 'replaced' : c.provisional ? 'needs a look' : 'confirmed')),
        yn(st === undefined ? undefined : st !== false, () => saveDetail({ colors: { [c.role]: true } }, `${c.role} confirmed`), () => saveDetail({ colors: { [c.role]: false } }, `${c.role} rejected`)));
    })),
    webCols.length ? h('div', { style: { marginTop: '12px' } }, h('div', { class: 'field' }, h('span', null, 'Seen on their website')), h('div', { class: 'webcols', style: { marginTop: '6px' } }, webCols.slice(0, 8).map((c) => h('span', { class: 'chip', title: c.where || '' }, h('span', { class: 'sw', style: { width: '14px', height: '14px', background: c.hex } }), c.hex, c.where ? ` · ${String(c.where).slice(0, 20)}` : '')))) : null,
    k.font?.display ? h('div', { class: 'edge', style: { marginTop: '10px' } }, `Display ${k.font.display} · Body ${k.font.body || '—'}`) : null));

  // assets
  const assetList = [
    k.photo ? { label: 'Headshot', path: kit.assets?.photo, abs: k.photo } : null,
    k.footer ? { label: 'Footer', path: kit.assets?.footer, abs: k.footer } : null,
    k.footerAlt ? { label: 'Footer alt', path: kit.assets?.footerAlt, abs: k.footerAlt } : null,
    ...(k.logos || []).map((l, i) => ({ label: `Logo ${i + 1}`, path: (kit.assets?.logos || [])[i], abs: l })),
  ].filter(Boolean);
  const checkSet = new Set((k.check || []).map((x) => x.path));
  const extraChecks = (k.check || []).filter((x) => !assetList.some((a) => a.path === x.path));
  left.push(sect('Assets', `${checkSet.size} to check`, h('div', { class: 'assets-row' }, [...assetList, ...extraChecks.map((x) => ({ label: 'Check', path: x.path, abs: x.abs }))].map((a) => {
    const t = thumb(a.abs, { w: 400 }); t.style.cursor = 'zoom-in'; t.addEventListener('click', () => lightbox(fileUrl(a.abs)));
    const st = conf.assets?.[a.path];
    return h('div', { class: 'asset' }, t, h('div', { class: 'cap' }, h('span', null, a.label, checkSet.has(a.path) && st === undefined ? h('span', { class: 'chip todo', style: { marginLeft: '6px', height: '18px' } }, 'check') : null),
      checkSet.has(a.path) || st !== undefined ? yn(st, () => saveDetail({ assets: { [a.path]: true } }, `${a.label} confirmed`), () => saveDetail({ assets: { [a.path]: false } }, `${a.label} rejected`)) : null));
  }))));

  // history wall
  left.push(sect('History', `${cards.length} pieces · ${jobs.length} jobs`, cards.length || jobs.length ? h('div', { class: 'lwall' },
    jobs.map((j) => h('a', { class: 'lcard', href: `#/job/${encodeURIComponent(j.id)}`, style: { textDecoration: 'none' } }, thumb(j.thumb?.path || j.concepts?.[0]?.preview, { w: 320 }), h('div', { class: 'meta' }, h('b', null, j.topic || j.id), fmtChip(j.format)))),
    cards.map((c) => h('a', { class: 'lcard', href: `#/library?open=${encodeURIComponent(c.id)}`, style: { textDecoration: 'none' } }, thumb(c.files?.thumb || c.files?.poster, { w: 320, cls: /carousel|static/.test(c.format) ? 'r45' : '' }), h('div', { class: 'meta' }, h('b', null, c.title || c.id), fmtChip(c.format))))) : h('div', { class: 'faint' }, 'No pieces for this client yet.')));

  // right column
  const right = [];
  if ((kit.missing || []).length || (kit.flags || []).length) {
    right.push(sect('To do', null,
      (kit.missing || []).length ? h('div', { class: 'chips', style: { marginBottom: '10px' } }, kit.missing.map((m) => h('span', { class: 'chip todo' }, m))) : null,
      (kit.flags || []).length ? h('div', { class: 'rules-list' }, kit.flags.map((fl) => h('div', null, h('span', { class: 'k', style: { color: 'var(--wait)' } }, 'flag'), h('span', null, fl)))) : null));
  }
  if (web) {
    const socials = { ...(kit.socials || {}), ...(web.socials || {}) };
    right.push(sect('From their website', web.url ? new URL(web.url).hostname : null,
      web.bio ? h('p', { class: 'prose', style: { margin: '0 0 12px' } }, web.bio) : null,
      h('dl', { class: 'kv' },
        web.yearsInBusiness ? [h('dt', null, 'In business'), h('dd', null, /^\d+$/.test(String(web.yearsInBusiness)) ? `${web.yearsInBusiness} years` : String(web.yearsInBusiness))] : null,
        web.reviews?.rating ? [h('dt', null, 'Reviews'), h('dd', null, stars(web.reviews.rating), ` ${web.reviews.rating} · ${web.reviews.count || '?'} on ${web.reviews.source || '—'}`)] : null,
        web.bookingUrl ? [h('dt', null, 'Booking'), h('dd', null, h('a', { href: web.bookingUrl, target: '_blank', rel: 'noopener' }, 'Book link'))] : null,
        (web.licences || []).length ? [h('dt', null, 'Licences'), h('dd', null, web.licences.map((l) => (typeof l === 'string' ? l : [l.label, l.value].filter(Boolean).join(' '))).join(' · '))] : null),
      (web.specialties || []).length ? h('div', { style: { marginTop: '12px' } }, h('div', { class: 'field' }, h('span', null, 'Specialties')), h('div', { class: 'chips', style: { marginTop: '5px' } }, web.specialties.map((s) => h('span', { class: 'chip' }, s)))) : null,
      (web.serviceAreas || []).length ? h('div', { style: { marginTop: '10px' } }, h('div', { class: 'field' }, h('span', null, 'Service areas')), h('div', { class: 'chips', style: { marginTop: '5px' } }, web.serviceAreas.map((s) => h('span', { class: 'chip' }, s)))) : null,
      (web.languages || []).length ? h('div', { style: { marginTop: '10px' } }, h('div', { class: 'field' }, h('span', null, 'Languages')), h('div', { class: 'chips', style: { marginTop: '5px' } }, web.languages.map((s) => h('span', { class: 'chip' }, s)))) : null,
      (web.team || []).length ? h('div', { style: { marginTop: '12px' } }, h('div', { class: 'field' }, h('span', null, 'Team')), h('div', { class: 'team' }, web.team.map((t) => h('div', null, h('span', null, h('b', null, t.name), t.title ? ` · ${t.title}` : ''), h('span', { class: 'edge' }, t.licence || ''))))) : null,
      Object.values(socials).some(Boolean) ? h('div', { style: { marginTop: '12px' } }, h('div', { class: 'socials' }, Object.entries(socials).filter(([, u]) => u).map(([p, u]) => h('a', { href: u, target: '_blank', rel: 'noopener', title: PLATFORM_NAME[p] || p }, icon(p === 'x' ? 'x_social' : p))))) : null));
  } else if (kit.socials && Object.values(kit.socials).some(Boolean)) {
    right.push(sect('Socials', null, h('div', { class: 'socials' }, Object.entries(kit.socials).filter(([, u]) => u).map(([p, u]) => h('a', { href: u, target: '_blank', rel: 'noopener', title: p }, icon(p === 'x' ? 'x_social' : p))))));
  }
  right.push(sect('Rules', `${(kit.rules || []).length}`, (kit.rules || []).length ? h('div', { class: 'rules-list' }, kit.rules.map((r) => h('div', null, h('span', { class: 'k' }, r.kind), h('span', null, r.text, r.source ? h('span', { class: 'faint' }, ` · ${r.source}`) : null)))) : h('div', { class: 'faint' }, 'No client-specific rules. House rules from the PLAYBOOK apply.')));
  if ((kit.services || []).length) right.push(sect('Services', null, h('div', { class: 'chips' }, kit.services.map((s) => h('span', { class: 'chip' }, s)))));
  if (kit.stills) right.push(sect('Still styles', null, h('div', { class: 'chips' }, kit.stills.primary ? h('span', { class: 'chip fact' }, `primary · ${kit.stills.primary}`) : null, kit.stills.secondary ? h('span', { class: 'chip' }, `secondary · ${kit.stills.secondary}`) : null)));
  if (d.voice) right.push(sect('Voice', null, h('div', { class: 'voice' }, d.voice.replace(/^#.*\n/, '').trim())));
  right.push(sect('Notes for the kit', null, notesBox(conf.notes || '')));

  stage.replaceChildren(h('div', null, hero, h('div', { class: 'cdetail' }, h('div', null, left), h('div', null, right))));

  async function saveDetail(body, msg) {
    await confirm(slug, body, ctx, msg);
    try { view.detail = await api('GET', `/api/kit/${encodeURIComponent(slug)}`); renderDetail(stage, ctx, slug); } catch { /* */ }
  }
  function notesBox(v) {
    const ta = h('textarea', { class: 'input', rows: 3, placeholder: 'Anything the kit agent should know (saved to confirm.json)', style: { width: '100%' } }); ta.value = v;
    return h('div', { style: { display: 'grid', gap: '6px' } }, ta, h('button', { class: 'btn', style: { justifySelf: 'start' }, onclick: () => saveDetail({ notes: ta.value }, 'Notes saved') }, 'Save notes'));
  }
}
function sect(t, meta, ...kids) { return h('section', null, h('div', { class: 'sect-h' }, h('h2', null, t), meta ? h('span', { class: 'edge' }, meta) : null), ...kids); }
function todo(what) { return h('span', { class: 'chip todo' }, `TODO · ${what}`); }
function stars(r) { const n = Math.round(Number(r) || 0); return h('span', { class: 'stars', 'aria-label': `${r} stars` }, Array.from({ length: 5 }, (_, i) => { const s = icon('star'); if (i >= n) s.style.opacity = '.25'; return s; })); }
