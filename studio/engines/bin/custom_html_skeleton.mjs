// Studio custom-html skeleton (tested 19 Nov 2026). Copy to $J/project/build.mjs, then write the slides.
//   SLUG=<slug> node $J/project/build.mjs   -> $J/out/carousel/NN.jpg (1080x1350 sRGB q92 4:4:4), $J/qa/contact.jpg, $J/project/html/
// Optional KIT=<kit dir> (default $R/kits/$SLUG). Footer from kit.assets.footer at the bottom; complianceLine above it.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const LIB = path.join(R, 'studio', 'lib');
const { chromium } = createRequire(`${LIB}/package.json`)('playwright-core');
const sharp = createRequire(`${LIB}/package.json`)('sharp');
const HERE = path.dirname(fileURLToPath(import.meta.url));        // $P
const JOB = path.resolve(HERE, '..');                              // $J
const OUT = path.join(JOB, 'out', 'carousel'), QA = path.join(JOB, 'qa'), HTML = path.join(HERE, 'html');
const SLUG = process.env.SLUG;                                    // client slug
const KIT = process.env.KIT || `${R}/kits/${SLUG}`;
const kit = JSON.parse(fs.readFileSync(`${KIT}/kit.json`, 'utf8'));
const tok = fs.existsSync(`${KIT}/tokens.json`) ? JSON.parse(fs.readFileSync(`${KIT}/tokens.json`, 'utf8')) : {};
const accent = tok.color?.accent?.$value || '#111111';
const FONTS = path.join(R, 'engines', 'stills', 'fonts');
const F = (f) => pathToFileURL(path.join(FONTS, f)).href;
const A = (rel) => pathToFileURL(path.isAbsolute(rel) ? rel : path.join(R, rel)).href;
const W = 1080, H = 1350;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const footer = kit.assets?.footer ? `<img class="footer" src="${A(kit.assets.footer)}" alt="">` : '';

const CSS = `
@font-face{font-family:Archivo;src:url("${F('Archivo[wdth,wght].ttf')}");font-weight:100 900;font-stretch:62% 125%}
*{margin:0;padding:0;box-sizing:border-box}
.slide{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#EFEDE8;color:#111;font-family:Archivo}
.safe{position:absolute;left:64px;top:56px;right:64px;bottom:${56 + 0}px}
h1{font:900 112px/0.95 Archivo;letter-spacing:-0.02em} h1 b{color:${accent}}
.footer{position:absolute;left:0;bottom:0;width:${W}px;height:auto;display:block}
.compliance{position:absolute;left:64px;right:64px;font:500 20px/1.3 Archivo;color:#333}`;

// Slides: put the copy here (from script.json); every number computed in this file, never typed.
const slides = [
  { html: `<div class="safe"><h1>Five years paid. Still <b>$50,000.</b></h1></div>` },
];

const page = (s) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="slide">${s.html}
${footer}<p class="compliance" style="bottom:${footer ? 'calc(var(--fh) + 12px)' : '56px'}">${esc(kit.complianceLine || '[compliance line: TODO]')}</p></div></body></html>`;

fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(QA, { recursive: true }); fs.mkdirSync(HTML, { recursive: true });
const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--font-render-hinting=none', '--allow-file-access-from-files'] });
const pg = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const jpgs = [];
for (let i = 0; i < slides.length; i++) {
  const n = String(i + 1).padStart(2, '0'), h = path.join(HTML, `${n}.html`);
  fs.writeFileSync(h, page(slides[i]));
  await pg.goto(pathToFileURL(h).href); await pg.evaluate(() => document.fonts.ready);
  await pg.evaluate(() => Promise.all([...document.images].map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
  await pg.evaluate(() => { const f = document.querySelector('.footer'); document.documentElement.style.setProperty('--fh', (f ? f.getBoundingClientRect().height : 0) + 'px'); });
  // safe-box check: every text element inside x 64-1016 and above the footer
  const bad = await pg.evaluate(() => { const f = document.querySelector('.footer'); const fy = f ? f.getBoundingClientRect().top : 1294;
    return [...document.querySelectorAll('h1,h2,h3,p,li,span,div.text')].filter((e) => e.textContent.trim()).map((e) => [e, e.getBoundingClientRect()])
      .filter(([e, r]) => r.left < 64 || r.right > 1016 || r.top < 56 || r.bottom > fy).map(([e, r]) => `${e.tagName}:"${e.textContent.trim().slice(0, 24)}" [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`); });
  if (bad.length) console.log(`  ! slide ${n} outside safe box: ${bad.join(' | ')}`);
  const png = path.join(HTML, `${n}@2x.png`); await pg.screenshot({ path: png });
  const jpg = path.join(OUT, `${n}.jpg`);
  await sharp(png).resize(W, H, { kernel: 'lanczos3' }).withIccProfile('srgb').jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true }).toFile(jpg);
  jpgs.push(jpg);
}
await browser.close();
const tw = 360, th = 450, tiles = await Promise.all(jpgs.map((f) => sharp(f).resize(tw, th).toBuffer()));
await sharp({ create: { width: tw * tiles.length + 12 * (tiles.length + 1), height: th + 24, channels: 3, background: '#151515' } })
  .composite(tiles.map((t, k) => ({ input: t, left: 12 + k * (tw + 12), top: 12 }))).jpeg({ quality: 88 }).toFile(path.join(QA, 'contact.jpg'));
console.log('rendered', jpgs.length, '->', OUT);
