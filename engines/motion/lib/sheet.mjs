// Frame strip: the frames extracted from the final MP4, laid out with their timecodes
// and the safe-zone outline, rendered in Chromium (this ffmpeg build has no drawtext).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

export async function frameStrip(browser, { frames, out, title, subtitle, width, height, safe, cols = 6, thumbW = 300 }) {
  const thumbH = Math.round((thumbW * height) / width);
  const k = thumbW / width;
  const rows = Math.ceil(frames.length / cols);
  const pageW = cols * thumbW + (cols + 1) * 18;
  const pageH = 96 + rows * (thumbH + 44) + 24;
  const cells = frames.map((f) => `<figure><div class="im"><img src="${pathToFileURL(f.file).href}"><i style="left:${safe.x0 * k}px;top:${safe.y0 * k}px;width:${(safe.x1 - safe.x0) * k}px;height:${(safe.y1 - safe.y0) * k}px"></i></div><figcaption>${esc(f.label || `${f.t.toFixed(2)} s`)}</figcaption></figure>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}body{width:${pageW}px;background:#1b1b1b;color:#eee;font:14px/1.3 -apple-system,Helvetica,Arial,sans-serif;padding:18px}
  h1{font-size:20px;font-weight:600}p{color:#aaa;margin:4px 0 16px}
  .g{display:grid;grid-template-columns:repeat(${cols},${thumbW}px);gap:18px}
  .im{position:relative;width:${thumbW}px;height:${thumbH}px;overflow:hidden;background:#000}
  img{width:100%;height:100%;display:block}
  i{position:absolute;outline:1px dashed rgba(255,0,140,.75)}
  figcaption{margin-top:6px;color:#ccc;font-variant-numeric:tabular-nums}
  </style></head><body><h1>${esc(title)}</h1><p>${esc(subtitle)} · dashed = text safe zone</p><div class="g">${cells}</div></body></html>`;
  const tmp = out.replace(/\.jpg$/, '.html');
  fs.writeFileSync(tmp, html);
  const ctx = await browser.newContext({ viewport: { width: pageW, height: pageH }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  await page.evaluate(async () => { await Promise.all([...document.images].map((im) => im.decode().catch(() => null))); });
  await page.screenshot({ path: out, type: 'jpeg', quality: 90, fullPage: true });
  await ctx.close();
  fs.unlinkSync(tmp);
  return out;
}
