// Contact sheets, laid out in HTML and captured with the same Chromium.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { esc } from './markup.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fontURL = (f) => pathToFileURL(path.join(ROOT, 'fonts', f)).href;

const CSS = `
@font-face{font-family:Plex;src:url("${fontURL('IBMPlexSans[wdth,wght].ttf')}");font-weight:100 700}
@font-face{font-family:PlexMono;src:url("${fontURL('IBMPlexMono-Regular.ttf')}")}
*{margin:0;padding:0;box-sizing:border-box}
body{background:#2A2A28;color:#EDEBE5;font-family:Plex,sans-serif;padding:56px 56px 64px}
h1{font-weight:600;font-size:34px;letter-spacing:-.01em}
.sub{font-family:PlexMono,monospace;font-size:17px;color:#A9A69E;margin-top:10px}
section{margin-top:44px}
h2{font-family:PlexMono,monospace;font-weight:400;font-size:17px;color:#CFCBC2;letter-spacing:.06em;text-transform:uppercase;margin-bottom:16px;border-top:1px solid #4A4945;padding-top:14px}
.grid{display:flex;flex-wrap:wrap;gap:22px}
figure{width:var(--w)}
figure img{width:100%;display:block;box-shadow:0 1px 0 rgba(0,0,0,.4)}
figcaption{font-family:PlexMono,monospace;font-size:15px;color:#A9A69E;margin-top:8px}
`;

export async function contactSheet(browser, { title, subtitle, items, sections, out, thumb = 300 }) {
  const secs = sections || [{ heading: null, items }];
  const html = `<!doctype html><meta charset="utf-8"><style>${CSS}</style>
  <body style="--w:${thumb}px">
  <h1>${esc(title)}</h1>${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ''}
  ${secs.map((s) => `<section>${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}<div class="grid">${s.items.map((it) => `<figure><img src="${pathToFileURL(it.src).href}"><figcaption>${esc(it.label || '')}</figcaption></figure>`).join('')}</div></section>`).join('')}
  </body>`;
  const tmp = out.replace(/\.jpe?g$/i, '.sheet.html');
  fs.writeFileSync(tmp, html);
  const perRow = Math.max(...secs.map((s) => s.items.length));
  const width = Math.min(56 * 2 + perRow * thumb + (perRow - 1) * 22, 56 * 2 + 8 * thumb + 7 * 22);
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => null))); });
  await page.screenshot({ path: out, type: 'jpeg', quality: 88, fullPage: true });
  await ctx.close();
  fs.unlinkSync(tmp);
  return out;
}
