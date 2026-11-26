#!/usr/bin/env node
// Side-by-side contact sheet of several renders (one row each), frames pulled from the
// DELIVERED MP4s, plus each file's ffprobe summary and its 3:4 profile-grid crop.
//   node tools/overview.mjs out/directions-overview.jpg "A · Bold Pop=out/directions/a-bold-pop/northline-mortgages.mp4" ...
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from '../lib/capture.mjs';
import { extractFrames, probe } from '../lib/encode.mjs';

const [out, ...rows] = process.argv.slice(2);
if (!out || !rows.length) { console.error('usage: overview.mjs out.jpg "Label=file.mp4" ...'); process.exit(64); }
const tmp = path.join(path.dirname(path.resolve(out)), '.overview_tmp');
fs.rmSync(tmp, { recursive: true, force: true });
const FR = [0, 0.12, 0.3, 0.45, 0.62, 0.8, 0.93];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const data = rows.map((r, i) => {
  const [label, file] = r.split('=');
  const p = probe(file);
  const times = FR.map((f) => Math.min(p.duration - 0.1, f * p.duration));
  const frames = extractFrames(file, times, path.join(tmp, `r${i}`), 'f');
  const v = p.video;
  const info = `${p.duration.toFixed(2)} s · ${v.codec} ${v.profile} · ${v.pix_fmt} · ${v.color_space}/${v.color_transfer}/${v.color_primaries} ${v.color_range} · ${v.fps} fps · ${v.width}×${v.height} · ${p.audio?.codec} ${p.audio?.sample_rate / 1000} kHz · ${p.bitrate_mbps} Mbps · faststart ${p.faststart}`;
  return { label, file, frames, info };
});
const TW = 216, TH = 384;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}body{background:#141414;color:#eee;font:15px/1.35 -apple-system,Helvetica,Arial,sans-serif;padding:26px;width:${26 * 2 + 8 * (TW + 14) + 40}px}
h1{font-size:24px;font-weight:650}p.s{color:#9a9a9a;margin:4px 0 22px}
.row{margin-bottom:26px}.row h2{font-size:19px;font-weight:650;margin-bottom:4px}.row .i{color:#9a9a9a;font-size:13px;margin-bottom:10px;font-variant-numeric:tabular-nums}
.g{display:flex;gap:14px}.c{width:${TW}px}.c img{width:${TW}px;height:${TH}px;display:block;border-radius:6px}
.c span{display:block;color:#aaa;font-size:12px;margin-top:5px;font-variant-numeric:tabular-nums}
.grid{width:${TW}px;height:${TH}px;display:grid;place-items:center;background:#202020;border-radius:6px}
.grid div{width:${TW}px;height:${Math.round(TW * 4 / 3)}px;background-size:${TW}px ${TH}px;background-position:0 -${Math.round((TH - TW * 4 / 3) / 2)}px;border-radius:4px}
</style></head><body><h1>${esc(process.env.OVERVIEW_TITLE || 'Directions overview')}</h1>
<p class="s">Frames pulled from the delivered MP4s at 0 / 12 / 30 / 45 / 62 / 80 / 93% of runtime · last column: the 3:4 profile-grid crop of frame 1</p>
${data.map((d) => `<div class="row"><h2>${esc(d.label)}</h2><div class="i">${esc(d.info)}</div><div class="g">${d.frames.map((f) => `<div class="c"><img src="${pathToFileURL(f.file).href}"><span>${f.t.toFixed(2)} s</span></div>`).join('')}<div class="c"><div class="grid"><div style="background-image:url('${pathToFileURL(d.frames[0].file).href}')"></div></div><span>grid crop 3:4</span></div></div></div>`).join('')}
</body></html>`;
const hp = path.join(tmp, 'o.html');
fs.writeFileSync(hp, html);
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 26 * 2 + 8 * (TW + 14) + 40, height: 600 }, deviceScaleFactor: 1 });
const pg = await ctx.newPage();
await pg.goto(pathToFileURL(hp).href, { waitUntil: 'load' });
await pg.evaluate(async () => { await Promise.all([...document.images].map((im) => im.decode().catch(() => null))); });
await pg.screenshot({ path: out, type: 'jpeg', quality: 88, fullPage: true });
await b.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${out}`);
