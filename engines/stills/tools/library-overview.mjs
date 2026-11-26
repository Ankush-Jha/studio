#!/usr/bin/env node
// Build out/library-overview.jpg: the style library at a glance, from every library manifest under out/.
//   1. Scroll-stop test: slide 1 of every style, at feed size and as the 3:4 profile-grid crop.
//   2. Same idea, two clients: the four group proofs (two clients each, different styles).
//   3. Every style's full carousel strip (first render found per style).
//   4. Formats: story and square covers.
//   5. Legacy families (pushed), if rendered.
//   node tools/library-overview.mjs [--out out/library-overview.jpg] [--thumb 250]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from '../render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const outFile = path.resolve(arg('--out', path.join(OUT, 'library-overview.jpg')));
const THUMB = Number(arg('--thumb', 250));
const roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'library', 'roster.json'), 'utf8'));
const styleMeta = Object.fromEntries(fs.readdirSync(path.join(ROOT, 'library')).filter((d) => fs.existsSync(path.join(ROOT, 'library', d, 'style.json')))
  .map((d) => [d, JSON.parse(fs.readFileSync(path.join(ROOT, 'library', d, 'style.json'), 'utf8'))]));

const manifests = [];
for (const post of fs.readdirSync(OUT)) {
  const pdir = path.join(OUT, post);
  if (!fs.statSync(pdir).isDirectory()) continue;
  for (const client of fs.readdirSync(pdir)) {
    const m = path.join(pdir, client, 'manifest.json');
    if (fs.existsSync(m)) manifests.push({ folder: post, dir: path.join(pdir, client), ...JSON.parse(fs.readFileSync(m, 'utf8')) });
  }
}
const lib = manifests.filter((m) => m.engine === 'library');
const legacy = manifests.filter((m) => m.engine !== 'library' && /-pushed/.test(m.folder));
const groupOrder = Object.entries(roster.groups).flatMap(([g, v]) => v.styles.map((s) => [s, Number(g)]));
const styleGroup = Object.fromEntries(groupOrder);
const jpg = (m, n) => { const s = m.slides.find((x) => x.n === n); return s ? path.join(ROOT, s.jpg) : null; };
const issuesOf = (m) => { const all = m.slides.flatMap((s) => s.issues || []); return { fail: all.filter((x) => (x.sev || 'fail') === 'fail').length, warn: all.filter((x) => x.sev === 'warn').length, todo: all.filter((x) => x.sev === 'todo').length }; };

// Preferred proof render per style: the roster client for the group demo specs, feed format, full carousel.
// Add [specId, group, [clientA, clientB]] pairs to show the same idea for two clients side by side.
const PROOFS = [
  ['dec9-variable', 1, ['northline-mortgages']],
  ['heloc-paul', 1, ['northline-mortgages']],
];
const feedFull = lib.filter((m) => m.format === 'feed' && m.slides.length >= 1 && !/-b$/.test(m.client));
function bestFor(style) {
  const prim = feedFull.filter((m) => m.style === style && roster.clients[m.client]?.primary === style);
  const own = prim.length ? prim : feedFull.filter((m) => m.style === style && roster.clients[m.client]?.secondary === style);
  const pool = own.length ? own : feedFull.filter((m) => m.style === style);
  return pool.sort((a, b) => b.slides.length - a.slides.length || a.client.localeCompare(b.client))[0];
}

const sections = [];
// 1. Scroll-stop test.
const styles = groupOrder.map(([s]) => s).filter((s) => styleMeta[s]);
const covers = styles.map((s) => ({ s, m: bestFor(s) })).filter((x) => x.m);
sections.push({
  heading: 'Scroll-stop test · slide 1 of every style (feed 4:5)',
  items: covers.map(({ s, m }) => ({ src: jpg(m, '01'), label: `G${styleGroup[s]} · ${styleMeta[s].name}`, sub: `${m.clientName}` })),
});
sections.push({
  heading: 'Profile grid · the same covers as Instagram crops them (3:4)',
  crop34: true,
  items: covers.map(({ s, m }) => ({ src: jpg(m, '01'), label: styleMeta[s].name })),
});
// 2. Same idea, two clients.
for (const [id, g, clients] of PROOFS) {
  const pair = clients.map((c) => lib.find((m) => m.id === id && m.client === c && m.format === 'feed')).filter(Boolean);
  if (!pair.length) continue;
  const items = [];
  for (const m of pair) for (const s of m.slides.slice(0, 4)) items.push({ src: path.join(ROOT, s.jpg), label: `${styleMeta[m.style]?.name} · ${s.n} ${s.type}`, sub: m.clientName });
  sections.push({ heading: `Group ${g} · same idea, two clients: “${pair[0].title}” · ${pair.map((m) => `${m.clientName} (${m.city || roster.clients[m.client]?.city || ''}) → ${styleMeta[m.style]?.name}`).join('  vs  ')}`, items });
}
// 3. Full strips.
for (const { s, m } of covers) {
  const q = issuesOf(m);
  sections.push({
    heading: `${styleMeta[s].name} (${s}) · G${styleGroup[s]} · ${m.title} · ${m.clientName} · variant ${m.variant} · QA ${q.fail} fail / ${q.warn} warn / ${q.todo} todo`,
    small: true,
    items: m.slides.map((x) => ({ src: path.join(ROOT, x.jpg), label: `${x.n} · ${x.type}` })),
  });
}
// 4. Formats.
const fm = lib.filter((m) => m.format !== 'feed').sort((a, b) => (styleGroup[a.style] - styleGroup[b.style]) || a.style.localeCompare(b.style) || a.format.localeCompare(b.format));
const seen = new Set();
const fmtItems = [];
for (const m of fm) {
  const k = `${m.style}|${m.format}`;
  if (seen.has(k)) continue;
  seen.add(k);
  fmtItems.push({ src: jpg(m, '01'), label: `${styleMeta[m.style]?.name} · ${m.format}`, tall: m.format === 'story', square: m.format === 'square' });
}
if (fmtItems.length) sections.push({ heading: 'Formats · story / reel cover (9:16, text in y 270–1248) and square (1:1)', items: fmtItems, formats: true });
// 5. Legacy families, pushed.
if (legacy.length) {
  const items = legacy.sort((a, b) => a.group - b.group).flatMap((m) => m.slides.slice(0, 3).map((x) => ({ src: path.join(ROOT, x.jpg), label: `G${m.group} ${m.family} · ${x.n} ${x.type}` })));
  sections.push({ heading: 'Legacy group families (Ledger, Kitchen Table, Riso, Dossier), pushed to the thumb-stop bar', items });
}

const fontURL = (f) => pathToFileURL(path.join(ROOT, 'fonts', f)).href;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const css = `
@font-face{font-family:Plex;src:url("${fontURL('IBMPlexSans[wdth,wght].ttf')}");font-weight:100 700}
@font-face{font-family:PlexMono;src:url("${fontURL('IBMPlexMono-Regular.ttf')}")}
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1F1F1D;color:#EDEBE5;font-family:Plex,sans-serif;padding:64px 64px 80px;width:${64 * 2 + 6 * THUMB + 5 * 22}px}
h1{font-weight:650;font-size:44px;letter-spacing:-.01em}
.sub{font-family:PlexMono,monospace;font-size:18px;color:#A9A69E;margin-top:12px;line-height:1.5}
section{margin-top:52px}
h2{font-family:PlexMono,monospace;font-weight:400;font-size:17px;color:#D6D2C8;letter-spacing:.02em;margin-bottom:18px;border-top:1px solid #45443F;padding-top:16px;line-height:1.45}
.grid{display:flex;flex-wrap:wrap;gap:22px;align-items:flex-start}
figure{width:${THUMB}px}
.small figure{width:${Math.round(THUMB * 0.72)}px}
figure .im{width:100%;aspect-ratio:4/5;background-size:cover;background-position:center}
figure.crop .im{aspect-ratio:3/4}
figure.tall .im{aspect-ratio:9/16}
figure.square .im{aspect-ratio:1/1}
figcaption{font-family:PlexMono,monospace;font-size:14px;color:#B9B5AC;margin-top:8px;line-height:1.35}
figcaption i{display:block;font-style:normal;color:#8D8A82}
`;
const html = `<!doctype html><meta charset="utf-8"><style>${css}</style><body>
<h1>Studio Stills · style library overview</h1>
<p class="sub">Rendered ${new Date().toLocaleDateString('en-CA')} · ${lib.length} renders, ${lib.reduce((n, m) => n + m.slides.length, 0)} slides, ${Object.keys(styleMeta).length} styles · all code-rendered (HTML/CSS/SVG/canvas/three.js), no AI or stock images<br>Red tags are the compliance slot: brokerage name and licence are not on file, so every slide shows the placeholder until the client supplies them.</p>
${sections.map((s) => `<section class="${s.small ? 'small' : ''}"><h2>${esc(s.heading)}</h2><div class="grid">${s.items.filter((it) => it.src).map((it) => `<figure class="${s.crop34 ? 'crop' : ''} ${it.tall ? 'tall' : ''} ${it.square ? 'square' : ''}"><div class="im" style="background-image:url('${pathToFileURL(it.src).href}')"></div><figcaption>${esc(it.label)}${it.sub ? `<i>${esc(it.sub)}</i>` : ''}</figcaption></figure>`).join('')}</div></section>`).join('')}
</body>`;
const tmp = outFile.replace(/\.jpe?g$/i, '.html');
fs.writeFileSync(tmp, html);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 64 * 2 + 6 * THUMB + 5 * 22, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
await page.evaluate(async () => { await document.fonts.ready; });
await page.waitForTimeout(300);
await page.screenshot({ path: outFile, type: 'jpeg', quality: 86, fullPage: true });
await browser.close();
fs.unlinkSync(tmp);
console.log(path.relative(process.cwd(), outFile));
