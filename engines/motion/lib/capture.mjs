// Deterministic frame capture.
// N workers (pages) each take a contiguous range of frames, seek the paused timeline to
// each frame's exact time, grab the compositor frame over CDP, and pipe PNGs into an
// ffmpeg process that stores a lossless FFV1 segment. The final encode concatenates the
// segments once, so rate control and GOP are uniform across the whole file.
// Motion blur: N sub-frames per frame inside a 180-degree shutter, averaged at encode.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { ROOT } from './paths.mjs';

const require = createRequire(path.join(ROOT, 'package.json'));

export async function launch(extraFlags = []) {
  const { chromium } = require('playwright-core');
  return chromium.launch({
    args: ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none', '--disable-gpu-vsync', '--hide-scrollbars', '--mute-audio',
      ...extraFlags,
      ...(process.env.MOTION_CHROME_FLAGS ? process.env.MOTION_CHROME_FLAGS.split(' ').filter(Boolean) : [])],
  });
}

export async function openPage(browser, htmlPath, { width, height, scale = 1, alpha = false }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: 'light' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver Message|GPU stall/.test(m.text())) errors.push(m.text()); });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  let info;
  try {
    info = await page.evaluate(() => window.__ready);
  } catch (e) {
    throw new Error(`Template failed to build: ${e.message}${errors.length ? `\n  ${errors.join('\n  ')}` : ''}`);
  }
  if (errors.length) throw new Error(`Page errors:\n  ${errors.join('\n  ')}`);
  const cdp = await context.newCDPSession(page);
  if (alpha) await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  return { context, page, cdp, info };
}

export async function grab(p, t, { fast = true } = {}) {
  await p.page.evaluate((tt) => window.__seek(tt), t);
  const r = await p.cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: fast, captureBeyondViewport: false, fromSurface: true });
  return Buffer.from(r.data, 'base64');
}

function segmentWriter(file, fps, alpha) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'ffv1', '-level', '3', '-slices', '4', '-g', '1', '-pix_fmt', alpha ? 'bgra' : 'bgr0', file];
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  ff.stderr.on('data', (d) => { err += d; });
  const done = new Promise((res, rej) => ff.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg segment failed (${code}): ${err}`)))));
  return {
    write: (buf) => new Promise((res) => { if (!ff.stdin.write(buf)) ff.stdin.once('drain', res); else res(); }),
    end: () => { ff.stdin.end(); return done; },
  };
}

/* times: array of capture times (seconds), in output order. */
export async function captureSegments(browser, htmlPath, { width, height, scale, alpha, times, fps, workers, workDir, onProgress }) {
  const n = Math.max(1, Math.min(workers, Math.ceil(times.length / 30)));
  const per = Math.ceil(times.length / n);
  let done = 0;
  const segs = [];
  await Promise.all(Array.from({ length: n }, async (_, w) => {
    const slice = times.slice(w * per, (w + 1) * per);
    if (!slice.length) return;
    const file = path.join(workDir, `seg_${String(w).padStart(2, '0')}.mkv`);
    segs[w] = file;
    const p = await openPage(browser, htmlPath, { width, height, scale, alpha });
    const out = segmentWriter(file, fps, alpha);
    for (const t of slice) {
      const buf = await grab(p, t);
      await out.write(buf);
      done++;
      if (onProgress && done % 15 === 0) onProgress(done, times.length);
    }
    await out.end();
    await p.context.close();
  }));
  const list = path.join(workDir, 'segments.txt');
  fs.writeFileSync(list, segs.filter(Boolean).map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  return { list, segments: segs.filter(Boolean) };
}
